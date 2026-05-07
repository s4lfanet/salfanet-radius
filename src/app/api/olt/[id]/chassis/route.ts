import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { unauthorized } from '@/lib/api-response';
import { snmpWalk, snmpGet, SNMPConfig } from '@/lib/olt/snmp';

// ── ZTE C320 Board/Shelf MIB OIDs ─────────────────────────────────────────────
const ZTE_BASE = '1.3.6.1.4.1.3902.1012';
// Board table (zxAnBoardTable) — indexed by .{shelf}.{slot}
const ZTE_BOARD_TABLE     = `${ZTE_BASE}.3.10.2.1`;     // may not be accessible
const ZTE_BOARD_TYPE      = `${ZTE_BASE}.3.10.2.1.2`;   // board type string
const ZTE_BOARD_STATUS    = `${ZTE_BASE}.3.10.2.1.4`;   // board status (1=present)
// PON port table for board detection
const ZTE_PON_TABLE       = `${ZTE_BASE}.3.11.3.1.1`;   // ponIndex walk → which boards have GPON cards
// Uplink interface
const IF_DESC_OID         = '1.3.6.1.2.1.2.2.1.2';     // ifDescr

/**
 * ZTE C320 physical chassis definition.
 * Slot 0 = MCUD (Management), slots 1-14 = service boards, slots 15-16 = uplink, slot 17 = MCUD-B
 */
const ZTE_C320_CHASSIS = {
  totalSlots: 18,
  slots: [
    { index: 0,  label: 'MCU-A',   type: 'mcud',    description: 'Management Control Unit (Primary)' },
    ...Array.from({ length: 14 }, (_, i) => ({
      index: i + 1, label: `S${i + 1}`, type: 'service', description: `Service Card Slot ${i + 1}`,
    })),
    { index: 15, label: 'UPL-A',  type: 'uplink',   description: 'Uplink Card A (GICF)' },
    { index: 16, label: 'UPL-B',  type: 'uplink',   description: 'Uplink Card B (GICF)' },
    { index: 17, label: 'MCU-B',  type: 'mcud',     description: 'Management Control Unit (Redundant)' },
  ],
};

/**
 * Map ponIndex back to (board, pon) for ZTE C320 V2.1
 * board1Base = 268500992, board2Base = 268509184, increment = 256
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
