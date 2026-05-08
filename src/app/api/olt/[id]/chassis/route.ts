import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { executeCommand, TelnetConfig } from '@/lib/olt/telnet';
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
  hardVer?: string;
  softVer?: string;
  status: string;
  slotType: SlotType;
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
    if (!trimmed || /Slot\s+CardType|^-/.test(trimmed) || trimmed.startsWith('---')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const slot = parseInt(parts[0]);
    if (isNaN(slot)) continue;
    const cardType = parts[1];
    const hardVer  = parts[2];
    const softVer  = parts[3];
    const status   = parts[4];

    let slotType: SlotType = 'service';
    const ctUpper = cardType.toUpperCase();
    if (ctUpper.startsWith('MCUD') || ctUpper.startsWith('MCUA') || ctUpper === 'MCU') {
      slotType = 'mcud';
    } else if (ctUpper.startsWith('SMXA') || ctUpper.startsWith('GICF') || ctUpper.startsWith('UPLINK')) {
      slotType = 'uplink';
    }
    cards.push({ slot, cardType, hardVer, softVer, status, slotType });
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
  return [`gei_1/${slot}/1`, `gei_1/${slot}/2`];
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

    if ((olt as any).telnetEnabled || (olt as any).sshEnabled) {
      const telnetConfig: TelnetConfig = {
        host:     olt.ipAddress,
        port:     (olt as any).telnetPort ?? 23,
        username: (olt as any).telnetUsername ?? '',
        password: (olt as any).telnetPassword ?? '',
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
        const slotType: SlotType = card ? card.slotType : isMcuSlot ? 'mcud' : dbData ? 'service' : 'empty';

        let portCount = 0;
        let ports: any[] = [];
        let cardType = card?.cardType ?? (isMcuSlot ? 'MCUD1' : 'empty');
        const present = !!card;

        if (slotType === 'service' && dbData) {
          portCount = Math.max(dbData.portCount, 16);
          ports = Array.from({ length: portCount }, (_, pi) => {
            const pe = dbData.ports.find(p => p.port === pi);
            return { port: pi, onuCount: pe?.onuCount ?? 0, onlineCount: pe?.onlineCount ?? 0, hasOnus: (pe?.onuCount ?? 0) > 0 };
          });
        } else if (slotType === 'service' && !dbData) {
          portCount = 16;
        } else if (slotType === 'uplink') {
          const ifaces = uplinkIfacesBySlot.get(i) ?? smxaUplinkPorts(i, cardType);
          portCount = ifaces.length;
          ports = ifaces.map((iface, pi) => ({ port: pi, iface, onuCount: 0, onlineCount: 0, hasOnus: false }));
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
}

/**
 * GET /api/olt/[id]/chassis
 * Returns the physical chassis slot layout with card presence info for ZTE C320.
 * Combines SNMP-detected data with known ONU port data from the DB.
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

    // ── Build slot occupancy from DB ONU data ────────────────────────────────
    // slot (board) → ports → ONU statuses
    const slotData: Record<number, {
      cardType: string;
      portCount: number;
      ports: Array<{ port: number; onuCount: number; onlineCount: number; avgRxPower: number | null }>;
    }> = {};

    for (const onu of olt.onuStatuses) {
      const boardSlot = onu.slot; // slot field = board number in our schema
      if (!slotData[boardSlot]) {
        slotData[boardSlot] = { cardType: 'GTGQ', portCount: 0, ports: [] };
      }
      const portKey = onu.port;
      let portEntry = slotData[boardSlot].ports.find(p => p.port === portKey);
      if (!portEntry) {
        portEntry = { port: portKey, onuCount: 0, onlineCount: 0, avgRxPower: null };
        slotData[boardSlot].ports.push(portEntry);
      }
      portEntry.onuCount++;
      if (onu.status === 'online') portEntry.onlineCount++;
    }

    // Determine port count per slot based on discovered ports
    for (const [slotKey, data] of Object.entries(slotData)) {
      const maxPort = Math.max(...data.ports.map(p => p.port), -1);
      data.portCount = maxPort + 1;

      // Determine card type from port count
      if (data.portCount <= 4)  data.cardType = 'GTGO';   // 4-port GPON
      else if (data.portCount <= 8)  data.cardType = 'GTGH';  // 8-port GPON
      else data.cardType = 'GTGQ';                             // 16-port GPON
    }

    // ── Try SNMP for board presence (optional, may not be accessible) ─────────
    let snmpSlots: Record<number, string> = {};
    if (olt.snmpEnabled) {
      const snmpConfig: SNMPConfig = {
        host: olt.ipAddress,
        community: olt.snmpCommunity,
        port: olt.snmpPort,
      };

      // Try walking PON port table to confirm which boards have GPON cards
      const ponWalk = await snmpWalk(snmpConfig, ZTE_PON_TABLE);
      if (ponWalk.success && ponWalk.results) {
        for (const oid of Object.keys(ponWalk.results)) {
          for (const part of oid.split('.')) {
            const n = parseInt(part, 10);
            if (!isNaN(n) && n > 268000000) {
              const mapped = ponIndexToBoard(n);
              if (mapped) {
                snmpSlots[mapped.board] = 'GPON';
              }
            }
          }
        }
      }

      // Try to detect uplink via ifDescr
      const ifDescrWalk = await snmpWalk(snmpConfig, IF_DESC_OID);
      if (ifDescrWalk.success && ifDescrWalk.results) {
        const hasUplink = Object.values(ifDescrWalk.results).some(v =>
          v.toLowerCase().includes('uplink') || v.toLowerCase().includes('gige') || v.toLowerCase().includes('xge')
        );
        if (hasUplink) {
          snmpSlots[15] = 'GICF'; // Mark uplink slot A as present
        }
      }
    }

    // ── Build final chassis slot layout ──────────────────────────────────────
    const chassis = ZTE_C320_CHASSIS.slots.map(slot => {
      const dbData = slotData[slot.index];
      const snmpType = snmpSlots[slot.index];

      let present = false;
      let cardType = slot.type === 'mcud' ? 'MCUD1' : slot.type === 'uplink' ? 'GICF' : 'empty';
      let portCount = 0;
      let ports: any[] = [];

      if (slot.type === 'mcud') {
        // MCU slots are always present (primary OLT is running if we can reach it)
        present = slot.index === 0; // Assume primary MCU is always present
        cardType = 'MCUD1';
      } else if (slot.type === 'uplink') {
        present = snmpType === 'GICF' || slot.index === 15;
        cardType = 'GICF';
        portCount = 4; // GICF has 4x10GE + 4xGE ports
      } else if (slot.type === 'service') {
        if (dbData) {
          present = true;
          cardType = dbData.cardType;
          portCount = Math.max(dbData.portCount, 16); // at least 16 for GTGQ
          ports = Array.from({ length: portCount }, (_, i) => {
            const portEntry = dbData.ports.find(p => p.port === i);
            return {
              port: i,
              onuCount:    portEntry?.onuCount    ?? 0,
              onlineCount: portEntry?.onlineCount ?? 0,
              hasOnus:     (portEntry?.onuCount   ?? 0) > 0,
            };
          });
        } else if (snmpType === 'GPON') {
          present = true;
          cardType = 'GTGQ';
          portCount = 16;
        }
      }

      return {
        index:       slot.index,
        label:       slot.label,
        type:        slot.type,
        description: slot.description,
        present,
        cardType,
        portCount,
        ports,
      };
    });

    return NextResponse.json({ success: true, chassis, vendor: olt.vendor, model: olt.model });
  } catch (error: any) {
    console.error('[OLT Chassis GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
