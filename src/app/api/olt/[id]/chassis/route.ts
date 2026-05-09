import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';
import { snmpWalk, SNMPConfig } from '@/lib/olt/snmp';

// ── ZTE C320 Board/Shelf MIB OIDs ─────────────────────────────────────────────
const ZTE_BASE        = '1.3.6.1.4.1.3902.1012';
const ZTE_PON_TABLE   = `${ZTE_BASE}.3.11.3.1.1`;   // ponIndex walk → which boards have GPON cards

/**
 * Card type classification:
 *  mcud    — Management Control Unit (slot 0 / 17)
 *  service — GPON service card (slots 1-14 typical)
 *  uplink  — Uplink card (SMXA, GICF etc.)
 */
type SlotType = 'mcud' | 'service' | 'uplink' | 'empty';

interface CardInfo {
  slot: number;
  cardType: string;
  cfgType?: string;
  hardVer?: string;
  softVer?: string;
  status: string;
  slotType: SlotType;
  portCount?: number;
}

interface UplinkPortState {
  iface: string;
  adminStatus: string;
  linkStatus: string;
  speed?: string;
  physicalType?: string;
  description?: string;
  isEnabled: boolean;
  isLinked: boolean;
}

function classifyCard(cardType: string): SlotType {
  const ctUpper = cardType.toUpperCase();
  if (ctUpper.startsWith('MCUD') || ctUpper.startsWith('MCUA') || ctUpper === 'MCU') return 'mcud';
  if (ctUpper.startsWith('SMXA') || ctUpper.startsWith('GICF') || ctUpper.startsWith('GISF') || ctUpper.startsWith('UPLINK')) return 'uplink';
  return 'service';
}

function isOperationalCard(status?: string): boolean {
  if (!status) return true;
  return !/(?:not\s*install|not\s*present|absent|empty)/i.test(status);
}


/**
 * Parse ZTE C320 "show card" output.
 * Sample output:
 *   ---Slot information---
 *   Slot   CardType     HardVer     SoftVer    Status
 *   0      MCUD1        V3.0        V2.1.0     Normal
 *   1      GTGHG        V1.0        V2.1.0     Normal
 *   3      SMXA-B       V1.0        V2.1.0     Normal
 *   4      SMXA-B       V1.0        V2.1.0     Normal
 *   17     MCUD1        V3.0        V2.1.0     Normal
 */
function parseShowCard(output: string): CardInfo[] {
  const cards: CardInfo[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || /Slot\s+CardType|Rack\s+Shelf\s+Slot|^-/.test(trimmed) || trimmed.startsWith('---')) continue;
    const parts = trimmed.split(/\s+/);

    // Firmware V2.1 format:
    // Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status
    // 1    1     1    GTGH    GTGHG    16   V1.0.0 V2.1.0 INSERVICE
    // 1    1     4    SMXA             3                   OFFLINE
    const isRackShelfFormat = parts.length >= 6
      && /^\d+$/.test(parts[0])
      && /^\d+$/.test(parts[1])
      && /^\d+$/.test(parts[2]);

    if (isRackShelfFormat) {
      const slot = parseInt(parts[2], 10);
      const cfgType = parts[3];
      let cardType = cfgType;
      let portCount = 0;
      let hardVer: string | undefined;
      let softVer: string | undefined;
      let status = parts[parts.length - 1] ?? 'UNKNOWN';

      if (/^\d+$/.test(parts[4])) {
        // RealType column is blank, so Port shifted into parts[4].
        portCount = parseInt(parts[4], 10);
      } else {
        cardType = parts[4] || cfgType;
        portCount = /^\d+$/.test(parts[5]) ? parseInt(parts[5], 10) : 0;
        hardVer = parts[6];
        softVer = parts[7];
        status = parts.slice(8).join(' ') || status;
      }

      cards.push({ slot, cardType, cfgType, hardVer, softVer, status, slotType: classifyCard(cardType), portCount });
      continue;
    }

    // Older/common format:
    // Slot CardType HardVer SoftVer Status
    if (parts.length < 5) continue;
    const slot = parseInt(parts[0], 10);
    if (isNaN(slot)) continue;
    const cardType = parts[1];
    cards.push({
      slot,
      cardType,
      hardVer: parts[2],
      softVer: parts[3],
      status: parts.slice(4).join(' ') || 'UNKNOWN',
      slotType: classifyCard(cardType),
    });
  }
  return cards;
}

/**
 * Derive uplink interface names for an SMXA slot.
 *
 * ZTE C320 SMXA (plain): 1 GE port + 2 XGE ports per slot.
 *   GE interface name: gei_1/{slot}       (no port suffix — only 1 GE per card)
 *   XGE interface names: xgei_1/{slot}/1, xgei_1/{slot}/2
 *
 * SMXA-B: 3 GE + 2 XGE per slot (uses /port suffix for all).
 */
function smxaUplinkPorts(slot: number, cardType: string): string[] {
  const ct = cardType.toUpperCase();
  if (ct === 'SMXA-B') {
    return [
      `gei_1/${slot}/1`, `gei_1/${slot}/2`, `gei_1/${slot}/3`,
      `xgei_1/${slot}/1`, `xgei_1/${slot}/2`,
    ];
  }
  if (ct === 'SMXA-A') {
    return [`xgei_1/${slot}/1`, `xgei_1/${slot}/2`];
  }
  if (ct.startsWith('GICF')) {
    return [
      `gei_1/${slot}/1`, `gei_1/${slot}/2`,
      `xgei_1/${slot}/1`, `xgei_1/${slot}/2`,
    ];
  }
  if (ct === 'SMXA') {
    // ZTE C320: SMXA has exactly 1 GE port (no /port suffix) + 2 XGE ports.
    // Verified from `show interface ?` output: gei_1/3, xgei_1/3 etc.
    return [`gei_1/${slot}`, `xgei_1/${slot}/1`, `xgei_1/${slot}/2`];
  }
  // Generic fallback
  return [`gei_1/${slot}`, `xgei_1/${slot}/1`, `xgei_1/${slot}/2`];
}

function parseUplinkPortStatusTable(output: string, ifaces: string[]): Map<string, UplinkPortState> {
  const stateMap = new Map<string, UplinkPortState>();
  const wanted = new Set(ifaces.map((iface) => iface.toLowerCase()));

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^-+$/.test(line) || /^Port\s+/i.test(line) || /^Status\s+/i.test(line)) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 8) continue;

    const iface = parts[0];
    if (!wanted.has(iface.toLowerCase())) continue;

    const adminRaw = parts[7] ?? 'unknown';
    const linkRaw = parts[8] ?? 'unknown';
    const adminStatus = /^activate$/i.test(adminRaw) ? 'Up' : /^deactivate$/i.test(adminRaw) ? 'Down' : adminRaw;
    const linkStatus = /^up$/i.test(linkRaw) ? 'Up' : /^down$/i.test(linkRaw) ? 'Down' : linkRaw;

    stateMap.set(iface, {
      iface,
      adminStatus,
      linkStatus,
      speed: parts[4] && parts[4] !== 'N/A' ? `${parts[4]}M` : undefined,
      physicalType: parts[1],
      isEnabled: /^up|enable|activate$/i.test(adminStatus),
      isLinked: /^up|online$/i.test(linkStatus),
    });
  }

  return stateMap;
}

// ── IF-MIB bulk data (pre-walked) ──────────────────────────────────────────
interface IfMibData {
  descr:  Record<string, string>;
  admin:  Record<string, string>;
  oper:   Record<string, string>;
  speed:  Record<string, string>;
  alias:  Record<string, string>;
}

interface SNMPChassisData {
  ponWalk: Record<string, string> | null;
  ifMib:   IfMibData | null;
}

/** Extract __COPILOT_CMD_N_START__ ... __COPILOT_CMD_N_END__ block from multi-cmd output */
function extractCmdOutput(multiOutput: string, index: number): string {
  const startTag = `__COPILOT_CMD_${index}_START__`;
  const endTag   = `__COPILOT_CMD_${index}_END__`;
  const s = multiOutput.indexOf(startTag);
  const e = multiOutput.indexOf(endTag);
  if (s === -1 || e === -1 || e <= s) return '';
  return multiOutput.slice(s + startTag.length, e);
}

/**
 * Fetch board presence (ZTE_PON_TABLE walk) + IF-MIB status walks in parallel.
 * Returns pre-parsed data for both, avoiding N×4 individual snmpGet calls.
 */
async function fetchSNMPChassisData(snmpConfig: SNMPConfig): Promise<SNMPChassisData> {
  const [ponResult, descrResult, adminResult, operResult, speedResult, aliasResult] =
    await Promise.all([
      snmpWalk(snmpConfig, ZTE_PON_TABLE),
      snmpWalk(snmpConfig, '1.3.6.1.2.1.2.2.1.2'),    // ifDescr
      snmpWalk(snmpConfig, '1.3.6.1.2.1.2.2.1.7'),    // ifAdminStatus
      snmpWalk(snmpConfig, '1.3.6.1.2.1.2.2.1.8'),    // ifOperStatus
      snmpWalk(snmpConfig, '1.3.6.1.2.1.31.1.1.1.15'), // ifHighSpeed
      snmpWalk(snmpConfig, '1.3.6.1.2.1.31.1.1.1.18'), // ifAlias
    ]);

  return {
    ponWalk: ponResult.success ? (ponResult.results ?? null) : null,
    ifMib: descrResult.success ? {
      descr:  descrResult.results ?? {},
      admin:  adminResult.results ?? {},
      oper:   operResult.results  ?? {},
      speed:  speedResult.results ?? {},
      alias:  aliasResult.results ?? {},
    } : null,
  };
}

/** Build ifIndex → value lookup map from a walked OID table */
function buildIdxValueMap(results: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [oid, val] of Object.entries(results)) {
    m.set(oid.split('.').pop() ?? '', val);
  }
  return m;
}

/**
 * Build uplink port states from pre-walked IF-MIB data.
 * O(n) lookup — no additional SNMP calls required.
 */
function buildUplinkStatesFromSNMP(
  ifMib: IfMibData,
  ifaces: string[]
): Map<string, UplinkPortState> {
  const stateMap = new Map<string, UplinkPortState>();
  const normalizeIface = (s: string) => s.toLowerCase().replace(/[-_]/g, '_');

  // Build normalizedName → ifIndex from ifDescr walk
  const nameToIdx = new Map<string, string>();
  for (const [oid, name] of Object.entries(ifMib.descr)) {
    nameToIdx.set(normalizeIface(name), oid.split('.').pop() ?? '');
  }

  const adminMap = buildIdxValueMap(ifMib.admin);
  const operMap  = buildIdxValueMap(ifMib.oper);
  const speedMap = buildIdxValueMap(ifMib.speed);
  const aliasMap = buildIdxValueMap(ifMib.alias);

  for (const iface of ifaces) {
    const idx = nameToIdx.get(normalizeIface(iface));
    if (!idx) continue;

    const adminVal = parseInt(adminMap.get(idx) ?? '2', 10);
    const operVal  = parseInt(operMap.get(idx)  ?? '2', 10);
    const speedVal = speedMap.get(idx);
    const aliasVal = aliasMap.get(idx);

    stateMap.set(iface, {
      iface,
      adminStatus:  adminVal === 1 ? 'Up' : 'Down',
      linkStatus:   operVal  === 1 ? 'Up' : 'Down',
      speed:        speedVal ? `${speedVal}M` : undefined,
      physicalType: undefined,
      description:  aliasVal || undefined,
      isEnabled:    adminVal === 1,
      isLinked:     operVal  === 1,
    });
  }

  return stateMap;
}

/**
 * Map ponIndex back to (board, pon) for ZTE C320 V2.1
 */
function ponIndexToBoard(ponIndex: number): { board: number; pon: number } | null {
  const b1Base = 268500992, b2Base = 268509184, inc = 256;
  if (ponIndex > b1Base && ponIndex < b1Base + 128 * inc) {
    const pon = (ponIndex - b1Base) / inc;
    if (Number.isInteger(pon)) return { board: 1, pon };
  }
  if (ponIndex > b2Base && ponIndex < b2Base + 128 * inc) {
    const pon = (ponIndex - b2Base) / inc;
    if (Number.isInteger(pon)) return { board: 2, pon };
  }
  return null;
}

/**
 * GET /api/olt/[id]/chassis
 * Returns the physical chassis slot layout with real card data from "show card".
 * Falls back to SNMP + DB-inferred types when Telnet is unavailable.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;

    const olt = await prisma.networkOLT.findUnique({
      where: { id },
      include: {
        onuStatuses: {
          select: { frame: true, slot: true, port: true, onuId: true, status: true, rxPower: true },
        },
      },
    });
    if (!olt) return NextResponse.json({ error: 'OLT not found' }, { status: 404 });

    // ── Step 1: Fire Telnet (single multi-cmd session) + SNMP in PARALLEL ─────
    const snmpConfig: SNMPConfig | null = olt.snmpEnabled
      ? { host: olt.ipAddress, community: olt.snmpCommunity ?? 'public', port: olt.snmpPort ?? 161 }
      : null;

    let telnetConfig: TelnetConfig | null = null;
    if (olt.telnetEnabled || olt.sshEnabled) {
      telnetConfig = {
        host:     olt.ipAddress,
        port:     olt.telnetPort ?? 23,
        username: olt.username ?? '',
        password: olt.password ?? '',
        timeout:  15,
      };
    }

    // Run Telnet (single session, 2 commands) + all SNMP walks in parallel.
    // This cuts total wait time roughly in half vs. sequential execution.
    const [telnetMultiOut, snmpData] = await Promise.all([
      telnetConfig
        ? executeMultipleCommands(
            telnetConfig,
            ['show card', 'show interface port-status'],
            { sendEnd: false }
          ).catch(() => null)
        : Promise.resolve(null),
      snmpConfig ? fetchSNMPChassisData(snmpConfig).catch(() => null) : Promise.resolve(null),
    ]);

    // ── Step 2: Parse Telnet multi-command output ──────────────────────────────
    let telnetCards: CardInfo[] | null = null;
    let uplinkIfacesBySlot: Map<number, string[]> = new Map();
    let uplinkStatesByIface: Map<string, UplinkPortState> = new Map();

    if (telnetMultiOut?.success && telnetMultiOut.output) {
      const showCardOut   = extractCmdOutput(telnetMultiOut.output, 0);
      const portStatusOut = extractCmdOutput(telnetMultiOut.output, 1);

      if (showCardOut.length > 20) {
        telnetCards = parseShowCard(showCardOut);
        for (const card of telnetCards) {
          if (card.slotType === 'uplink') {
            uplinkIfacesBySlot.set(card.slot, smxaUplinkPorts(card.slot, card.cardType));
          }
        }

        const allUplinkIfaces = [...uplinkIfacesBySlot.values()].flat();
        if (portStatusOut && allUplinkIfaces.length > 0) {
          uplinkStatesByIface = parseUplinkPortStatusTable(portStatusOut, allUplinkIfaces);
        }
        // SNMP IF-MIB fallback (already pre-fetched in parallel — zero extra wait)
        if (uplinkStatesByIface.size === 0 && allUplinkIfaces.length > 0 && snmpData?.ifMib) {
          uplinkStatesByIface = buildUplinkStatesFromSNMP(snmpData.ifMib, allUplinkIfaces);
        }
      }
    }

    // ── Step 2: Build slot occupancy from DB ONU data ─────────────────────────
    const slotData: Record<number, {
      cardType: string;
      portCount: number;
      ports: Array<{ port: number; onuCount: number; onlineCount: number }>;
    }> = {};

    for (const onu of olt.onuStatuses) {
      const boardSlot = onu.slot;
      if (!slotData[boardSlot]) {
        slotData[boardSlot] = { cardType: 'GTGQ', portCount: 0, ports: [] };
      }
      const portKey = onu.port;
      let portEntry = slotData[boardSlot].ports.find(p => p.port === portKey);
      if (!portEntry) {
        portEntry = { port: portKey, onuCount: 0, onlineCount: 0 };
        slotData[boardSlot].ports.push(portEntry);
      }
      portEntry.onuCount++;
      if (onu.status === 'online') portEntry.onlineCount++;
    }

    for (const data of Object.values(slotData)) {
      const maxPort = Math.max(...data.ports.map(p => p.port), -1);
      data.portCount = maxPort + 1;
      if (data.portCount <= 4)       data.cardType = 'GTGO';
      else if (data.portCount <= 8)  data.cardType = 'GTGH';
      else                           data.cardType = 'GTGQ';
    }

    // ── Step 3: Extract SNMP board presence (already fetched in parallel) ──────
    let snmpBoardSlots: Set<number> = new Set();
    if (snmpData?.ponWalk) {
      for (const oid of Object.keys(snmpData.ponWalk)) {
        for (const part of oid.split('.')) {
          const n = parseInt(part, 10);
          if (!isNaN(n) && n > 268000000) {
            const mapped = ponIndexToBoard(n);
            if (mapped) snmpBoardSlots.add(mapped.board);
          }
        }
      }
    }

    // ── Step 4: Build chassis output ─────────────────────────────────────────
    //
    // If Telnet data is available, use it as the authoritative source.
    // Otherwise, reconstruct from SNMP + DB data.

    if (telnetCards && telnetCards.length > 0) {
      // Build from real "show card" data
      const maxSlot = Math.max(...telnetCards.map(c => c.slot), 17);
      const chassis: any[] = [];

      // Collect all used slots from cards
      const cardMap = new Map<number, CardInfo>(telnetCards.map(c => [c.slot, c]));

      // ZTE C320 has slots 0-17; include all present slots
      const allSlots = new Set<number>([0, 17, ...cardMap.keys()]);
      for (let i = 0; i <= maxSlot; i++) {
        if (!allSlots.has(i) && !cardMap.has(i)) continue; // skip empty slots
        const card = cardMap.get(i);
        const dbData = slotData[i];
        const isMcuSlot = (i === 0 || i === 17);
        const cardOperational = isOperationalCard(card?.status);
        const slotType: SlotType = card && cardOperational
          ? card.slotType
          : isMcuSlot
            ? 'mcud'
            : dbData
              ? 'service'
              : 'empty';

        let portCount = 0;
        let ports: any[] = [];
        let cardType = card && cardOperational ? card.cardType : (isMcuSlot ? 'MCUD1' : 'empty');
        const present = !!card && cardOperational;

        if (slotType === 'service' && dbData) {
          portCount = Math.max(dbData.portCount, 16);
          ports = Array.from({ length: portCount }, (_, pi) => {
            const pe = dbData.ports.find(p => p.port === pi);
            return { port: pi, onuCount: pe?.onuCount ?? 0, onlineCount: pe?.onlineCount ?? 0, hasOnus: (pe?.onuCount ?? 0) > 0 };
          });
        } else if (slotType === 'service' && !dbData) {
          portCount = card?.portCount && card.portCount > 0 ? card.portCount : 16;
        } else if (slotType === 'uplink') {
          const ifaces = uplinkIfacesBySlot.get(i) ?? smxaUplinkPorts(i, cardType);
          portCount = ifaces.length;
          ports = ifaces.map((iface, pi) => {
            const ifaceState = uplinkStatesByIface.get(iface);
            return {
              port: pi,
              iface,
              onuCount: 0,
              onlineCount: 0,
              hasOnus: false,
              adminStatus: ifaceState?.adminStatus ?? 'Unknown',
              linkStatus: ifaceState?.linkStatus ?? 'Unknown',
              speed: ifaceState?.speed,
              physicalType: ifaceState?.physicalType,
              description: ifaceState?.description,
              isEnabled: ifaceState?.isEnabled ?? false,
              isLinked: ifaceState?.isLinked ?? false,
            };
          });
        }

        chassis.push({
          index: i,
          label: isMcuSlot ? (i === 0 ? 'MCU-A' : 'MCU-B') : slotType === 'uplink' ? `UPL-${i}` : `S${i}`,
          type: slotType,
          description: card ? `${card.cardType} (${card.status})` : 'Empty',
          present,
          cardType,
          hardVer: card?.hardVer,
          softVer: card?.softVer,
          cardStatus: card?.status,
          portCount,
          ports,
          uplinkIfaces: slotType === 'uplink' ? (uplinkIfacesBySlot.get(i) ?? smxaUplinkPorts(i, cardType)) : undefined,
        });
      }

      // Sort by slot index
      chassis.sort((a, b) => a.index - b.index);

      return NextResponse.json({ success: true, chassis, vendor: olt.vendor, model: olt.model, source: 'telnet' });
    }

    // ── Fallback: reconstruct from SNMP + DB (no Telnet) ─────────────────────
    // Build a dynamic chassis from DB-discovered boards
    const usedSlots = new Set<number>([0, 17, ...Object.keys(slotData).map(Number), ...snmpBoardSlots]);
    const chassis = [...usedSlots].sort((a, b) => a - b).map(slotIdx => {
      const dbData = slotData[slotIdx];
      const isMcuSlot = (slotIdx === 0 || slotIdx === 17);
      const isUplinkSlot = slotIdx === 15 || slotIdx === 16;

      let slotType: SlotType = isMcuSlot ? 'mcud' : isUplinkSlot ? 'uplink' : 'service';
      let cardType = isMcuSlot ? 'MCUD1' : isUplinkSlot ? 'GICF' : (dbData?.cardType ?? 'GTGQ');
      let portCount = 0;
      let ports: any[] = [];
      const present = isMcuSlot ? slotIdx === 0 : (!!dbData || snmpBoardSlots.has(slotIdx) || isUplinkSlot);

      if (slotType === 'service' && dbData) {
        portCount = Math.max(dbData.portCount, 16);
        ports = Array.from({ length: portCount }, (_, pi) => {
          const pe = dbData.ports.find(p => p.port === pi);
          return { port: pi, onuCount: pe?.onuCount ?? 0, onlineCount: pe?.onlineCount ?? 0, hasOnus: (pe?.onuCount ?? 0) > 0 };
        });
      } else if (slotType === 'uplink') {
        portCount = 4;
        ports = Array.from({ length: 4 }, (_, pi) => ({ port: pi, onuCount: 0, onlineCount: 0, hasOnus: false }));
      }

      return {
        index: slotIdx,
        label: isMcuSlot ? (slotIdx === 0 ? 'MCU-A' : 'MCU-B') : isUplinkSlot ? `UPL-${slotIdx}` : `S${slotIdx}`,
        type: slotType,
        description: cardType,
        present,
        cardType,
        portCount,
        ports,
      };
    });

    return NextResponse.json({ success: true, chassis, vendor: olt.vendor, model: olt.model, source: 'snmp' });
  } catch (error: any) {
    console.error('[OLT Chassis GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}