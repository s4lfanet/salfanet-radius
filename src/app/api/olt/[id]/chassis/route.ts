import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, executeMultipleCommands, TelnetConfig } from '@/lib/olt/telnet';
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
  return !/(?:offline|not\s*install|not\s*present|absent|empty)/i.test(status);
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
 * SMXA-B has: gei_1/{slot}/1..N + xgei_1/{slot}/1..M
 * Default for ZTE C320 SMXA-B: 3x GE + 2x 10GE per slot.
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
    // ZTE C320 SMXA card spans two slot addresses: ports 1-3 on slot N, ports 1-3 on slot N+1
    return [
      `gei_1/${slot}/1`, `gei_1/${slot}/2`, `gei_1/${slot}/3`,
      `gei_1/${slot + 1}/1`, `gei_1/${slot + 1}/2`, `gei_1/${slot + 1}/3`,
    ];
  }
  return [`gei_1/${slot}/1`, `gei_1/${slot}/2`];
}

function parseUplinkInterfaceStatus(output: string, fallbackIface: string): UplinkPortState {
  const parsed: Record<string, string> = {};

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const kvMatch = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (kvMatch) {
      parsed[kvMatch[1].trim()] = kvMatch[2].trim();
      continue;
    }

    const stateMatch = line.match(/^(\S+)\s+is\s+(activate|deactivate)\s*,\s*line protocol is\s+(up|down)\.?$/i);
    if (stateMatch) {
      parsed.Interface = stateMatch[1].trim();
      parsed['Admin Status'] = stateMatch[2].toLowerCase() === 'activate' ? 'Up' : 'Down';
      parsed['Link Status'] = stateMatch[3].toLowerCase() === 'up' ? 'Up' : 'Down';
      continue;
    }

    const descriptionMatch = line.match(/^Description is\s+(.+?)\.?$/i);
    if (descriptionMatch) {
      parsed.Description = descriptionMatch[1].trim();
    }
  }

  const adminStatus = parsed['Admin Status'] ?? parsed.Admin ?? 'Unknown';
  const linkStatus = parsed['Link Status'] ?? parsed.Link ?? 'Unknown';

  return {
    iface: parsed.Interface ?? fallbackIface,
    adminStatus,
    linkStatus,
    speed: parsed.Speed,
    physicalType: parsed['Physical Type'],
    description: parsed.Description,
    isEnabled: /^up|enable|activate$/i.test(adminStatus),
    isLinked: /^up|online$/i.test(linkStatus),
  };
}

async function loadUplinkPortStates(
  telnetConfig: TelnetConfig,
  ifaces: string[]
): Promise<Map<string, UplinkPortState>> {
  const stateMap = new Map<string, UplinkPortState>();
  if (ifaces.length === 0) return stateMap;

  // Run all show-interface commands in ONE Telnet session to avoid multiple
  // parallel connections that the OLT may reject or throttle.
  try {
    const commands = ifaces.map(iface => `show interface ${iface}`);
    const result = await executeMultipleCommands(telnetConfig, commands, { sendEnd: false });
    if (!result.success || !result.output) return stateMap;

    for (let i = 0; i < ifaces.length; i++) {
      const startMarker = `__COPILOT_CMD_${i}_START__`;
      const endMarker   = `__COPILOT_CMD_${i}_END__`;
      const startIdx = result.output.indexOf(startMarker);
      const endIdx   = result.output.indexOf(endMarker);
      if (startIdx === -1 || endIdx === -1) continue;
      const cmdOutput = result.output.slice(startIdx + startMarker.length, endIdx).trim();
      if (cmdOutput) {
        stateMap.set(ifaces[i], parseUplinkInterfaceStatus(cmdOutput, ifaces[i]));
      }
    }
  } catch {
    // Telnet unavailable — return empty map, ports will show as unknown.
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

    // ── Step 1: Try Telnet "show card" for real card topology ─────────────────
    let telnetCards: CardInfo[] | null = null;
    let uplinkIfacesBySlot: Map<number, string[]> = new Map();
    let uplinkStatesByIface: Map<string, UplinkPortState> = new Map();

    if (olt.telnetEnabled || olt.sshEnabled) {
      const telnetConfig: TelnetConfig = {
        host:     olt.ipAddress,
        port:     olt.telnetPort ?? 23,
        username: olt.username ?? '',
        password: olt.password ?? '',
        timeout:  15,
      };
      try {
        const result = await executeCommand(telnetConfig, 'show card');
        if (result.success && result.output && result.output.length > 20) {
          telnetCards = parseShowCard(result.output);
          // Pre-compute uplink interfaces per SMXA slot
          for (const card of telnetCards) {
            if (card.slotType === 'uplink') {
              uplinkIfacesBySlot.set(card.slot, smxaUplinkPorts(card.slot, card.cardType));
            }
          }

          const allUplinkIfaces = [...uplinkIfacesBySlot.values()].flat();
          if (allUplinkIfaces.length > 0) {
            uplinkStatesByIface = await loadUplinkPortStates(telnetConfig, allUplinkIfaces);
          }
        }
      } catch { /* Telnet unavailable — use SNMP fallback */ }
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

    // ── Step 3: Try SNMP for board presence ───────────────────────────────────
    let snmpBoardSlots: Set<number> = new Set();
    if (olt.snmpEnabled) {
      const snmpConfig: SNMPConfig = { host: olt.ipAddress, community: olt.snmpCommunity, port: olt.snmpPort };
      try {
        const ponWalk = await snmpWalk(snmpConfig, ZTE_PON_TABLE);
        if (ponWalk.success && ponWalk.results) {
          for (const oid of Object.keys(ponWalk.results)) {
            for (const part of oid.split('.')) {
              const n = parseInt(part, 10);
              if (!isNaN(n) && n > 268000000) {
                const mapped = ponIndexToBoard(n);
                if (mapped) snmpBoardSlots.add(mapped.board);
              }
            }
          }
        }
      } catch { /* SNMP unavailable */ }
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