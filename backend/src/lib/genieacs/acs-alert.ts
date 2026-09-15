/**
 * ACS Alert — automated Telegram notification for TR-069/GenieACS device issues.
 *
 * Two kinds of alerts:
 *   1. RX degradation  — device online but optical RX power below threshold
 *      (early warning before a real disconnect).
 *   2. ACS offline      — device has not sent Inform for longer than the
 *      offline threshold (likely powered off / fiber cut). Real LOS can't
 *      be detected from ACS alone (device can't Inform when the fiber is
 *      down) — OLT-side alerts (see lib/olt/poller.ts) remain the primary
 *      source for that. This complements it with early RX warning.
 *
 * Dedup: uses `oltAlert` (oltId=null, onuId=null) with `details.serialNumber`
 * to avoid re-notifying for the same device while the alert stays unresolved.
 * When the device recovers, the alert is auto-resolved.
 */
import 'server-only';
import { prisma } from '@/server/db/client';
import { getDevices } from './api-client';
import { sendTelegramMessage } from '@/server/services/notifications/telegram.service';
import type { GenieDevice } from './types';

const RX_WARN = -30; // dBm
const RX_CRIT = -32; // dBm
const OFFLINE_MS = 15 * 60 * 1000; // 15 minutes without Inform = offline

function safeString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val || null;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.length > 0 ? safeString(val[0]) : null;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('_value' in obj) return safeString(obj._value);
    if ('value' in obj) return safeString(obj.value);
    return null;
  }
  return String(val);
}

function getParam(device: GenieDevice, paths: string[]): string | null {
  for (const path of paths) {
    const parts = path.split('.');
    let value: unknown = device;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in (value as object)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    const result = safeString(value);
    if (result !== null) return result;
  }
  return null;
}

const RX_PATHS = [
  'VirtualParameters.redaman',
  'VirtualParameters.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.WANEponInterfaceConfig.RXPower',
];
const PPP_USERNAME_PATHS = [
  'VirtualParameters.pppUsername',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
  'Device.PPP.Interface.1.Username',
];
const SERIAL_PATHS = [
  'InternetGatewayDevice.DeviceInfo.SerialNumber',
  'Device.DeviceInfo.SerialNumber',
];

interface DeviceSummary {
  id: string;
  serialNumber: string;
  pppUsername: string | null;
  rxPower: number | null;
  lastInform: Date | null;
  manufacturer: string | null;
  productClass: string | null;
}

function summarize(device: GenieDevice): DeviceSummary {
  const rxRaw = getParam(device, RX_PATHS);
  const rx = rxRaw !== null ? parseFloat(rxRaw) : null;
  const serial = getParam(device, SERIAL_PATHS) ?? device._deviceId?._SerialNumber ?? device._id;
  return {
    id: device._id,
    serialNumber: serial ?? device._id,
    pppUsername: getParam(device, PPP_USERNAME_PATHS),
    rxPower: rx !== null && !isNaN(rx) ? rx : null,
    lastInform: device._lastInform ? new Date(device._lastInform) : null,
    manufacturer: device._deviceId?._Manufacturer ?? null,
    productClass: device._deviceId?._ProductClass ?? null,
  };
}

async function resolveCustomerName(pppUsername: string | null): Promise<string | null> {
  if (!pppUsername) return null;
  const user = await prisma.pppoeUser.findFirst({
    where: { username: { equals: pppUsername } },
    select: { name: true },
  });
  return user?.name ?? null;
}

interface TelegramTarget {
  botToken: string;
  chatId: string;
  topicId?: string;
}

async function getAlertTarget(): Promise<TelegramTarget | null> {
  const cfg = await prisma.telegramBackupSettings.findFirst();
  if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.chatId) return null;
  return { botToken: cfg.botToken, chatId: cfg.chatId, topicId: cfg.healthTopicId ?? undefined };
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function findUnresolvedAlert(alertType: 'low_signal' | 'onu_offline', serialNumber: string) {
  const candidates = await prisma.oltAlert.findMany({
    where: { oltId: null, onuId: null, alertType, isResolved: false },
  });
  return candidates.find((a) => {
    const details = a.details as { serialNumber?: string } | null;
    return details?.serialNumber === serialNumber;
  }) ?? null;
}

async function createAcsAlert(
  alertType: 'low_signal' | 'onu_offline',
  severity: 'warning' | 'critical',
  message: string,
  serialNumber: string,
  extra: Record<string, unknown> = {}
) {
  const existing = await findUnresolvedAlert(alertType, serialNumber);
  if (existing) return { created: false, alert: existing };

  const alert = await prisma.oltAlert.create({
    data: {
      id: crypto.randomUUID(),
      oltId: null,
      onuId: null,
      alertType: alertType as never,
      severity: severity as never,
      message,
      details: { serialNumber, source: 'acs', ...extra } as never,
    },
  });
  return { created: true, alert };
}

async function resolveAcsAlert(alertType: 'low_signal' | 'onu_offline', serialNumber: string) {
  const existing = await findUnresolvedAlert(alertType, serialNumber);
  if (!existing) return;
  await prisma.oltAlert.update({
    where: { id: existing.id },
    data: { isResolved: true, resolvedAt: new Date(), resolvedBy: 'acs-alert-cron' },
  });
}

/**
 * Run one ACS alert check cycle: fetch devices from GenieACS, detect RX
 * degradation and offline devices, create/resolve alerts, and notify Telegram
 * for newly created alerts only (dedup via unresolved oltAlert).
 */
export async function runAcsAlert(): Promise<{
  success: boolean;
  checked: number;
  newAlerts: number;
  resolved: number;
  error?: string;
}> {
  let devices: GenieDevice[];
  try {
    devices = await getDevices({}, undefined);
  } catch (err) {
    return { success: false, checked: 0, newAlerts: 0, resolved: 0, error: (err as Error).message };
  }

  const target = await getAlertTarget();

  let newAlerts = 0;
  let resolved = 0;

  for (const device of devices) {
    // Skip probe/discovery pseudo-devices
    const pc = (device._deviceId?._ProductClass ?? '').toLowerCase();
    if (pc.includes('probe') || pc.includes('discovery')) continue;

    const d = summarize(device);
    const informAge = d.lastInform ? Date.now() - d.lastInform.getTime() : Infinity;
    const isOffline = informAge > OFFLINE_MS;

    if (isOffline) {
      const { created } = await createAcsAlert(
        'onu_offline',
        'critical',
        `ONU ACS offline: ${d.serialNumber}${d.pppUsername ? ` (${d.pppUsername})` : ''} — no Inform for ${Math.round(informAge / 60000)}m`,
        d.serialNumber,
        { pppUsername: d.pppUsername, lastInform: d.lastInform?.toISOString() ?? null }
      );
      if (created) {
        newAlerts++;
        if (target) {
          const name = await resolveCustomerName(d.pppUsername);
          const msg = [
            '🔴 <b>ONU TIDAK TERPANTAU (ACS)</b>',
            `👤 ${esc(name || d.pppUsername || d.serialNumber)}`,
            `📡 SN: ${esc(d.serialNumber)} · ${esc(d.manufacturer)} ${esc(d.productClass)}`,
            `⚠️ Tidak Inform ke ACS &gt; 15 menit — kemungkinan mati/putus.`,
          ].join('\n');
          await sendTelegramMessage({ botToken: target.botToken, chatId: target.chatId, topicId: target.topicId }, msg).catch(() => {});
        }
      }
      continue; // if offline, RX is stale — don't double-alert
    }

    // Recovered from offline
    await resolveAcsAlert('onu_offline', d.serialNumber);

    // RX degradation (only while online)
    if (d.rxPower !== null && d.rxPower <= RX_WARN) {
      const severity = d.rxPower <= RX_CRIT ? 'critical' : 'warning';
      const { created } = await createAcsAlert(
        'low_signal',
        severity,
        `ONU RX power ${severity}: ${d.serialNumber}${d.pppUsername ? ` (${d.pppUsername})` : ''} — ${d.rxPower} dBm`,
        d.serialNumber,
        { pppUsername: d.pppUsername, rxPower: d.rxPower }
      );
      if (created) {
        newAlerts++;
        if (target) {
          const name = await resolveCustomerName(d.pppUsername);
          const tingkat = severity === 'critical' ? '🚨 KRITIS' : '⚠️ MEMBURUK';
          const msg = [
            `${tingkat} — <b>REDAMAN ONU TINGGI</b>`,
            `👤 ${esc(name || d.pppUsername || d.serialNumber)}`,
            `📡 SN: ${esc(d.serialNumber)} · ${esc(d.manufacturer)} ${esc(d.productClass)}`,
            `⬇️ RX Power: <b>${d.rxPower} dBm</b> (ambang ${RX_WARN} dBm)`,
          ].join('\n');
          await sendTelegramMessage({ botToken: target.botToken, chatId: target.chatId, topicId: target.topicId }, msg).catch(() => {});
        }
      }
    } else {
      await resolveAcsAlert('low_signal', d.serialNumber);
      resolved++;
    }
  }

  return { success: true, checked: devices.length, newAlerts, resolved };
}
