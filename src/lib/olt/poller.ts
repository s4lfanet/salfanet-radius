/**
 * OLT Poller Service
 * Polls all enabled OLTs and updates database with monitoring data
 */

import { prisma } from '@/server/db/client';
import { getSystemInfo } from './snmp';
import { evaluateCustomRules, createRuleContext, type RuleCondition, type RuleAction, type RuleSchedule } from './rule-engine';

// Vendor modules
import * as huawei from './vendors/huawei';
import * as zte from './vendors/zte';
import * as fiberhome from './vendors/fiberhome';
import * as bdcom from './vendors/bdcom';
import * as raisecom from './vendors/raisecom';
import * as hioso from './vendors/hioso';

type VendorModule = typeof huawei;

function getVendorModule(vendor: string | null | undefined): VendorModule {
  switch (vendor?.toLowerCase()) {
    case 'zte':       return zte as any as VendorModule;
    case 'fiberhome': return fiberhome as any as VendorModule;
    case 'bdcom':     return bdcom as any as VendorModule;
    case 'raisecom':  return raisecom as any as VendorModule;
    case 'hioso':
    case 'cdata':
    case 'c-data':    return hioso as any as VendorModule;
    default:          return huawei;
  }
}

/**
 * Poll a single OLT and update monitoring data
 */
export async function pollOLT(oltId: string): Promise<{ success: boolean; error?: string }> {
  const olt = await prisma.networkOLT.findUnique({ where: { id: oltId } });
  if (!olt) return { success: false, error: 'OLT not found' };
  if (!olt.monitoringEnabled) return { success: false, error: 'Monitoring not enabled' };

  const now = new Date();
  let isOnline = false;
  let temperature: number | null = null;
  let cpuUsage: number | null = null;
  let memoryUsage: number | null = null;
  let uptime: bigint = BigInt(0);
  let discoveredOnus: any[] = [];

  try {
    const vendor = getVendorModule(olt.vendor);
    const snmpConfig = olt.snmpEnabled ? {
      host: olt.ipAddress,
      community: olt.snmpCommunity,
      port: olt.snmpPort,
    } : null;

    const sshConfig = olt.sshEnabled && olt.username ? {
      host: olt.ipAddress,
      port: olt.sshPort,
      username: olt.username,
      password: olt.password ?? undefined,
    } : null;

    const telnetConfig = olt.telnetEnabled && olt.username ? {
      host: olt.ipAddress,
      port: olt.telnetPort,
      username: olt.username,
      password: olt.password ?? '',
    } : null;

    // Test connectivity
    if (snmpConfig) {
      const sysInfo = await getSystemInfo(snmpConfig);
      if (sysInfo) {
        isOnline = true;
        uptime = BigInt(sysInfo.uptime ?? 0);
      }
    }

    if (!isOnline && (sshConfig || telnetConfig)) {
      // Fallback: if SNMP fails, try SSH/Telnet
      isOnline = true;
    }

    // Get performance metrics
    if (snmpConfig && isOnline) {
      [temperature, cpuUsage, memoryUsage] = await Promise.all([
        vendor.getTemperature(snmpConfig),
        vendor.getCpuUsage(snmpConfig),
        vendor.getMemoryUsage(snmpConfig),
      ]);
    }

    // Discover ONUs — try SNMP first (ZTE C320 supports SNMP-based ONU discovery)
    if (snmpConfig && isOnline && typeof (vendor as any).discoverONUsSNMP === 'function') {
      try {
        discoveredOnus = await (vendor as any).discoverONUsSNMP(snmpConfig, olt.firmwareVersion, telnetConfig);
      } catch { /* fallback to SSH/Telnet */ }
    }
    if (discoveredOnus.length === 0 && sshConfig && isOnline) {
      discoveredOnus = await vendor.discoverONUsSSH(sshConfig);
    } else if (discoveredOnus.length === 0 && telnetConfig && isOnline) {
      discoveredOnus = await vendor.discoverONUs(telnetConfig);
    }

    // Upsert ONU statuses
    for (const onu of discoveredOnus) {
      await upsertONU(oltId, onu, sshConfig, telnetConfig, vendor);
    }

    // Count ONU statuses
    const [totalOnu, onlineOnu, offlineOnu] = await Promise.all([
      prisma.oltOnuStatus.count({ where: { oltId } }),
      prisma.oltOnuStatus.count({ where: { oltId, status: 'online' } }),
      prisma.oltOnuStatus.count({ where: { oltId, status: 'offline' } }),
    ]);

    // Update OLT record
    await prisma.networkOLT.update({
      where: { id: oltId },
      data: {
        isOnline,
        uptime,
        temperature,
        totalOnu,
        onlineOnu,
        offlineOnu,
        lastPollAt: now,
        updatedAt: now,
      },
    });

    // Save performance metric snapshot
    await prisma.oltPerformanceMetric.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        cpuUsage,
        memoryUsage,
        temperature,
        uptime,
        totalOnu,
        onlineOnu,
        offlineOnu,
        recordedAt: now,
      },
    });

    // Run alert checks
    const onus = await prisma.oltOnuStatus.findMany({ where: { oltId } });
    await checkAlerts(olt, onus, temperature, cpuUsage, memoryUsage);

    // Save success log
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        logType: 'poll',
        severity: 'info',
        message: `Poll successful. Online: ${onlineOnu}/${totalOnu} ONUs.`,
        data: { isOnline, temperature, cpuUsage, memoryUsage, totalOnu, onlineOnu, offlineOnu },
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error(`[OLT Poller] Error polling OLT ${oltId}:`, err);

    // Update OLT as offline on error
    await prisma.networkOLT.update({
      where: { id: oltId },
      data: { isOnline: false, lastPollAt: now, updatedAt: now },
    }).catch(() => {});

    // Save error log
    await prisma.oltMonitoringLog.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        logType: 'error',
        severity: 'error',
        message: err.message,
        data: { stack: err.stack },
      },
    }).catch(() => {});

    return { success: false, error: err.message };
  }
}

/**
 * Poll all OLTs with monitoring enabled
 */
export async function pollAllOLTs(): Promise<void> {
  const olts = await prisma.networkOLT.findMany({
    where: { monitoringEnabled: true },
    select: { id: true, name: true, ipAddress: true },
  });

  console.log(`[OLT Poller] Starting poll for ${olts.length} OLTs`);

  // Poll sequentially to avoid overwhelming the server
  for (const olt of olts) {
    try {
      const result = await pollOLT(olt.id);
      console.log(`[OLT Poller] ${olt.name} (${olt.ipAddress}): ${result.success ? 'OK' : result.error}`);
    } catch (err) {
      console.error(`[OLT Poller] Failed for ${olt.name}:`, err);
    }
  }
}

/**
 * Upsert a single ONU's status record
 */
async function upsertONU(
  oltId: string,
  onu: any,
  sshConfig: any,
  telnetConfig: any,
  vendor: VendorModule
): Promise<void> {
  try {
    let opticalInfo: any = null;

    // Get optical info if connection is available (SSH/Telnet)
    if (sshConfig) {
      opticalInfo = await vendor.getOnuOpticalInfoSSH(sshConfig, onu.frame, onu.slot, onu.port, onu.onuId).catch(() => null);
    } else if (telnetConfig) {
      opticalInfo = await vendor.getOnuOpticalInfo(telnetConfig, onu.frame, onu.slot, onu.port, onu.onuId).catch(() => null);
    }

    const status = mapOnuStatus(onu.status);
    const now = new Date();
    const serialNumber = onu.serialNumber ?? opticalInfo?.serialNumber ?? null;
    // Use SNMP-discovered rxPower/distance as fallback if optical info not available
    const rxPower = opticalInfo?.rxPower ?? onu.rxPower ?? null;
    const txPower = opticalInfo?.txPower ?? onu.txPower ?? null;
    const distance = opticalInfo?.distance ?? onu.distance ?? null;

    await prisma.oltOnuStatus.upsert({
      where: {
        oltId_frame_slot_port_onuId: {
          oltId,
          frame: onu.frame ?? 0,
          slot: onu.slot ?? 0,
          port: onu.port,
          onuId: onu.onuId,
        },
      },
      create: {
        id: crypto.randomUUID(),
        oltId,
        frame: onu.frame ?? 0,
        slot: onu.slot ?? 0,
        port: onu.port,
        onuId: onu.onuId,
        serialNumber,
        macAddress: onu.macAddress ?? null,
        status,
        description: onu.description ?? null,
        rxPower,
        txPower,
        distance,
        temperature: opticalInfo?.temperature ?? null,
        voltage: opticalInfo?.voltage ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      },
      update: {
        ...(serialNumber != null ? { serialNumber } : {}),
        status,
        description: onu.description ?? undefined,
        rxPower,
        txPower,
        distance,
        temperature: opticalInfo?.temperature ?? null,
        voltage: opticalInfo?.voltage ?? null,
        lastSeenAt: now,
        lastOfflineAt: status !== 'online' ? now : undefined,
        updatedAt: now,
      },
    });
  } catch (err) {
    console.error(`[OLT Poller] Error upserting ONU ${onu.onuId}:`, err);
  }
}

function mapOnuStatus(status: string): 'online' | 'offline' | 'dying_gasp' | 'los' | 'auth_failed' {
  switch (status?.toLowerCase()) {
    case 'online':        return 'online';
    case 'dying_gasp':    return 'dying_gasp';
    case 'los':           return 'los';
    case 'auth_failed':   return 'auth_failed';
    case 'unregistered':  return 'auth_failed';  // map to auth_failed (closest match)
    default:              return 'offline';
  }
}

/**
 * Check built-in alert rules
 */
async function checkAlerts(
  olt: any,
  onus: any[],
  temperature: number | null,
  cpuUsage: number | null,
  memoryUsage: number | null
): Promise<void> {
  const oltId = olt.id;

  // Alert: OLT offline
  if (!olt.isOnline) {
    await createAlertIfNotExists(oltId, null, 'olt_offline', 'critical', `OLT ${olt.name} (${olt.ipAddress}) is offline`);
  }

  // Alert: High temperature
  if (temperature !== null && temperature > 65) {
    await createAlertIfNotExists(oltId, null, 'olt_high_temp', 'warning', `OLT ${olt.name} temperature is ${temperature}°C`);
  }

  // Alert: Dying gasp ONUs
  const dyingGaspOnus = onus.filter((o) => o.status === 'dying_gasp');
  for (const onu of dyingGaspOnus) {
    await createAlertIfNotExists(oltId, onu.id, 'dying_gasp', 'critical', `ONU ${onu.serialNumber ?? onu.onuId} is sending dying gasp`);
  }

  // Run custom rules
  const customRules = await prisma.oltCustomAlertRule.findMany({
    where: { isEnabled: true, OR: [{ oltId }, { oltId: null }] },
  });

  if (customRules.length > 0) {
    const ctx = createRuleContext(oltId, olt.name, onus, { temperature, cpuUsage, memoryUsage });
    const triggered = await evaluateCustomRules(
      customRules.map((r) => ({
        id: r.id,
        name: r.name,
        conditions: r.conditions as unknown as RuleCondition[],
        actions: r.actions as unknown as RuleAction[],
        schedule: r.schedule as unknown as RuleSchedule | null,
        cooldownSeconds: r.cooldownSeconds,
        lastTriggeredAt: r.lastTriggeredAt,
      })),
      ctx
    );

    for (const t of triggered) {
      // Update lastTriggeredAt
      await prisma.oltCustomAlertRule.update({
        where: { id: t.ruleId },
        data: { lastTriggeredAt: new Date(), triggerCount: { increment: 1 } },
      });

      // Log the trigger
      await prisma.oltMonitoringLog.create({
        data: {
          id: crypto.randomUUID(),
          oltId,
          logType: 'alert',
          severity: 'warning',
          message: `Custom rule triggered: ${t.ruleName}`,
          data: { ruleId: t.ruleId, actions: t.actions as unknown as import('@prisma/client').Prisma.InputJsonValue },
        },
      });
    }
  }
}

/**
 * Create alert if no unresolved alert of same type exists
 */
async function createAlertIfNotExists(
  oltId: string,
  onuId: string | null,
  alertType: string,
  severity: string,
  message: string
): Promise<void> {
  const existing = await prisma.oltAlert.findFirst({
    where: {
      oltId,
      onuId: onuId ?? undefined,
      alertType: alertType as any,
      isResolved: false,
    },
  });

  if (!existing) {
    await prisma.oltAlert.create({
      data: {
        id: crypto.randomUUID(),
        oltId,
        onuId,
        alertType: alertType as any,
        severity: severity as any,
        message,
      },
    });
  }
}
