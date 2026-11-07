/**
 * Port map for an OLT that is not a ZTE chassis: PON ports with their ONU counts, from the ONU rows
 * the poller stored, and uplink ports read live from IF-MIB. Same shape and rules as the rack data
 * of the operator's NMS, except that an uplink whose state could not be read says so instead of
 * being shown as up.
 */
import { snmpWalk, type SNMPConfig } from './snmp';
import { decodeSnmpText } from './pon-snmp';

export interface RackOnu {
  slot: number;
  port: number;
  status: string;
  rxPower: number | null;
}

export interface RackPonPort {
  slot: number;
  port: number;
  label: string;
  total: number;
  online: number;
  offline: number;
  los: number;
  dyingGasp: number;
  unconfigured: number;
  averageRx: number | null;
}

export interface RackUplink {
  index: number;
  name: string;
  /** Null when the state could not be read. */
  adminUp: boolean | null;
  operUp: boolean | null;
}

export interface RackData {
  brand: string;
  model: string | null;
  /** True when the ONU rows of this OLT are spread over several cards. */
  multiSlot: boolean;
  ponPorts: RackPonPort[];
  uplinks: RackUplink[];
  uplinksRead: boolean;
}

/** PON ports of a model. The number in the name decides; otherwise the NMS's rule of thumb. */
export function defaultPonCount(vendor: string | null | undefined, model: string | null | undefined): number {
  const name = (model ?? '').toUpperCase();
  const named =
    name.match(/\bFD\d{2}(\d{2})/) ?? // FD1608S, FD1616GS, FD1104
    name.match(/\bV1600[DG](\d{1,2})/) ?? // V1600D8, V1600G1
    name.match(/\bHA7[34]0(\d)/) ?? // HA7304C, HA7302CS, HA7408
    name.match(/(?:^|[-\s])[EG]-?(\d{2})\b/); // HSGQ-E04, HSGQ-G08
  const count = named ? Number(named[1]) : 0;
  if (count > 0) return count;

  if (name.includes('16')) return 16;
  if (name.includes('8')) return 8;
  if (name.includes('2P')) return 2;
  return vendor?.toLowerCase() === 'cdata' && name.includes('GPON') ? 8 : 4;
}

function emptyPort(slot: number, port: number, multiSlot: boolean): RackPonPort {
  return { slot, port, label: multiSlot ? `PON ${slot}/${port}` : `PON ${port}`, total: 0, online: 0, offline: 0, los: 0, dyingGasp: 0, unconfigured: 0, averageRx: null };
}

/**
 * Every PON port, also the ones without an ONU. An OLT on one card shows the ports of its model;
 * one with several cards shows each card up to the highest port seen, since its size is not known.
 */
export function buildPonPorts(vendor: string | null | undefined, model: string | null | undefined, onus: RackOnu[]): { ponPorts: RackPonPort[]; multiSlot: boolean } {
  // The Hioso reader repeats the PON number in the slot column.
  const slotOf = (onu: RackOnu) => (vendor?.toLowerCase() === 'hioso' ? 1 : onu.slot);
  const slots = [...new Set(onus.map(slotOf))].sort((a, b) => a - b);
  const multiSlot = slots.length > 1;

  const ports = new Map<string, RackPonPort>();
  const rx = new Map<string, number[]>();
  const keyOf = (slot: number, port: number) => `${slot}/${port}`;

  for (const onu of onus) {
    const slot = slotOf(onu);
    const key = keyOf(slot, onu.port);
    const entry = ports.get(key) ?? emptyPort(slot, onu.port, multiSlot);
    ports.set(key, entry);

    entry.total += 1;
    if (onu.status === 'online') entry.online += 1;
    else if (onu.status === 'los') entry.los += 1;
    else if (onu.status === 'dying_gasp') entry.dyingGasp += 1;
    else if (onu.status === 'auth_failed') entry.unconfigured += 1;
    else entry.offline += 1;

    if (onu.rxPower !== null) rx.set(key, [...(rx.get(key) ?? []), onu.rxPower]);
  }

  for (const [key, values] of rx) {
    ports.get(key)!.averageRx = Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
  }

  for (const slot of slots.length > 0 ? slots : [1]) {
    const seen = onus.filter((onu) => slotOf(onu) === slot).map((onu) => onu.port);
    const first = seen.length > 0 && Math.min(...seen) === 0 ? 0 : 1;
    const expected = multiSlot ? 0 : first + defaultPonCount(vendor, model) - 1;
    const last = Math.max(expected, ...seen);
    for (let port = first; port <= last; port++) {
      const key = keyOf(slot, port);
      if (!ports.has(key)) ports.set(key, emptyPort(slot, port, multiSlot));
    }
  }

  const ponPorts = [...ports.values()].sort((a, b) => a.slot - b.slot || a.port - b.port);
  return { ponPorts, multiSlot };
}

const NOT_AN_UPLINK = /^(?:x?pon|e?pon|gpon|onu|loop|lo\b|null|vlan|inband|outband|host)/i;

const ifIndexOf = (oid: string) => oid.split('.').pop() ?? '';

function byIfIndex(results: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(results).map(([oid, value]) => [ifIndexOf(oid), value]));
}

/** Uplink ports out of ifDescr, ifOperStatus and ifAdminStatus: every interface that is not a PON, ONU or virtual one. */
export function parseUplinks(descr: Record<string, string>, oper: Record<string, string>, admin: Record<string, string>): RackUplink[] {
  const operOf = byIfIndex(oper);
  const adminOf = byIfIndex(admin);
  const state = (value: string | undefined): boolean | null => (value === undefined ? null : /^(?:up\()?1\)?$/i.test(value.trim()));

  const named: Array<Omit<RackUplink, 'index'>> = [];
  for (const [oid, raw] of Object.entries(descr)) {
    const name = decodeSnmpText(raw);
    if (!name || NOT_AN_UPLINK.test(name)) continue;
    const ifIndex = ifIndexOf(oid);
    named.push({ name, adminUp: state(adminOf.get(ifIndex)), operUp: state(operOf.get(ifIndex)) });
  }
  return named
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((uplink, position) => ({ ...uplink, index: position + 1 }));
}

async function readUplinks(config: SNMPConfig): Promise<RackUplink[]> {
  const fast = { ...config, timeout: 3 };
  const descr = await snmpWalk(fast, '1.3.6.1.2.1.2.2.1.2');
  if (!descr.success || !descr.results) return [];
  const oper = await snmpWalk(fast, '1.3.6.1.2.1.2.2.1.8');
  const admin = await snmpWalk(fast, '1.3.6.1.2.1.2.2.1.7');
  return parseUplinks(descr.results, oper.results ?? {}, admin.results ?? {});
}

const UPLINK_DEADLINE_MS = 12_000;

const unknownUplinks = (): RackUplink[] => [1, 2, 3, 4].map((index) => ({ index, name: `G${index}`, adminUp: null, operUp: null }));

export async function readRack(
  olt: { vendor: string | null; model: string | null; ipAddress: string; snmpEnabled: boolean; snmpCommunity: string | null; snmpPort: number | null },
  onus: RackOnu[],
): Promise<RackData> {
  let uplinks: RackUplink[] = [];
  if (olt.snmpEnabled) {
    const config: SNMPConfig = { host: olt.ipAddress, community: olt.snmpCommunity ?? 'public', port: olt.snmpPort ?? 161 };
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<RackUplink[]>((resolve) => {
      timer = setTimeout(() => resolve([]), UPLINK_DEADLINE_MS);
    });
    uplinks = await Promise.race([readUplinks(config).catch(() => []), deadline]);
    clearTimeout(timer);
  }

  const vendor = olt.vendor?.toLowerCase();
  return {
    brand: !vendor || vendor === 'auto' ? 'OLT' : vendor.toUpperCase(),
    model: olt.model,
    ...buildPonPorts(olt.vendor, olt.model, onus),
    uplinks: uplinks.length > 0 ? uplinks : unknownUplinks(),
    uplinksRead: uplinks.length > 0,
  };
}
