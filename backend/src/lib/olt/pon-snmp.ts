/**
 * Generic SNMP reader for PON OLTs that keep ONU data in column tables.
 *
 * An OLT family is described by a profile (which column holds status, Rx power,
 * name...). The reading, index decoding and unit handling here is shared, so a new
 * brand is mostly a new profile, and the part that can silently go wrong (units,
 * index layout, joining tables) exists once and is tested once.
 *
 * Column numbers are NOT stable across firmware: the C-Data FD-ONU-MIB moved its
 * Rx column from .35 to .36 between revisions. So a vendor lists several candidate
 * profiles and the first one that returns plausible data wins (discoverFirstWorking).
 */
import { snmpGet, snmpWalk, type SNMPConfig, type SNMPWalkResult } from './snmp';

export type Walk = (config: SNMPConfig, oid: string) => Promise<SNMPWalkResult>;

/** nscrtv: one Unsigned32 = OLT device | card | PON port | ONU, a byte each. dotted: parts in the OID. */
export type IndexLayout = 'nscrtv' | 'dotted';
/** centi: integers are hundredths of a dBm. auto: guess from magnitude. */
export type PowerScale = 'centi' | 'auto';

export interface PonProfile {
  id: string;
  label: string;
  tech: 'EPON' | 'GPON';
  index: IndexLayout;
  /** Status values that mean the ONU is online. */
  online: number[];
  scale: PowerScale;
  columns: {
    status: string;
    rx: string;
    tx?: string;
    name?: string;
    serial?: string;
    mac?: string;
    distance?: string;
  };
}

export interface DiscoveredOnu {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  status: 'online' | 'offline';
  description: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  rxPower: number | null;
  txPower: number | null;
  distance: number | null;
  /** Which profile produced this row, for diagnostics. */
  profile: string;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const stripDot = (oid: string) => oid.replace(/^\./, '');

/** The part of `oid` after `base.`, or null when it is not under `base`. */
export function suffixOf(oid: string, base: string): string | null {
  const prefix = stripDot(base) + '.';
  const full = stripDot(oid);
  return full.startsWith(prefix) ? full.slice(prefix.length) : null;
}

function rowsOf(result: SNMPWalkResult, base: string): Map<string, string> {
  const rows = new Map<string, string>();
  if (!result.success || !result.results) return rows;
  for (const [oid, value] of Object.entries(result.results)) {
    const suffix = suffixOf(oid, base);
    if (suffix) rows.set(suffix, value);
  }
  return rows;
}

/**
 * A table with more index parts than the status table is the same ONU: NSCRTV's
 * optical table is indexed device.card.port, the ONU table by device alone. Cut it
 * to the status table's width. Never the other way: guessing would hand one ONU's
 * power to another.
 */
function alignTo(rows: Map<string, string>, width: number): Map<string, string> {
  const aligned = new Map<string, string>();
  for (const [suffix, value] of rows) {
    const parts = suffix.split('.');
    const key = parts.length > width ? parts.slice(0, width).join('.') : suffix;
    if (!aligned.has(key)) aligned.set(key, value);
  }
  return aligned;
}

/** "-1234" -> -12.34. Out-of-range readings (no signal sentinels) become null. */
export function parsePowerDbm(raw: string | null | undefined, scale: PowerScale): number | null {
  if (raw === null || raw === undefined) return null;
  const match = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number === 0) return null;

  let dbm = number;
  if (!match[0].includes('.')) {
    if (scale === 'centi') dbm = number / 100;
    else {
      const size = Math.abs(number);
      dbm = size > 500 ? number / 100 : size > 50 ? number / 10 : number;
    }
  }
  dbm = Math.round(dbm * 100) / 100;
  return dbm >= -50 && dbm <= 10 ? dbm : null;
}

/** Works for a bare "3" and for MIB-resolved "online(3)". */
export function parseEnumInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).trim();
  const named = text.match(/\((-?\d+)\)\s*$/);
  if (named) return Number(named[1]);
  const plain = text.match(/^-?\d+/);
  return plain ? Number(plain[0]) : null;
}

export interface OnuAddress {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
}

/**
 * Where an index suffix puts the ONU. Every layout is injective, so two ONUs never
 * share an address and overwrite each other in the database.
 */
export function decodeIndex(suffix: string, layout: IndexLayout): OnuAddress | null {
  const parts = suffix.split('.').map(Number);
  if (parts.length === 0 || parts.some((p) => !Number.isInteger(p) || p < 0)) return null;

  if (layout === 'nscrtv' && parts.length === 1) {
    const value = parts[0];
    return {
      frame: Math.floor(value / 16777216) % 256,
      slot: Math.floor(value / 65536) % 256,
      port: Math.floor(value / 256) % 256,
      onuId: value % 256,
    };
  }

  const last = parts.slice(-4);
  switch (last.length) {
    case 4:
      return { frame: last[0], slot: last[1], port: last[2], onuId: last[3] };
    case 3:
      return { frame: 0, slot: last[0], port: last[1], onuId: last[2] };
    case 2:
      return { frame: 0, slot: 0, port: last[0], onuId: last[1] };
    default:
      return { frame: 0, slot: 0, port: 0, onuId: last[0] };
  }
}

/** "00 11 22 aa bb cc" or "0011.22aa.bbcc" -> "00:11:22:AA:BB:CC", else null. */
export function normalizeMac(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = String(raw).replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g)!.join(':');
}

/**
 * A GPON serial is 4 ASCII vendor letters plus 4 bytes. SNMP prints it as hex when any
 * byte is not printable ("43 44 41 54 12 34 56 78"); the rest of the panel knows it as
 * "CDAT12345678".
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text.toUpperCase() === 'NA') return null;
  const bytes = text.match(/^(?:[0-9a-fA-F]{2}[ :-]){7}[0-9a-fA-F]{2}$/) ? text.split(/[ :-]/) : null;
  if (!bytes) return text;
  const vendor = bytes.slice(0, 4).map((b) => parseInt(b, 16));
  if (!vendor.every((c) => c >= 0x20 && c <= 0x7e)) return bytes.join('').toUpperCase();
  return String.fromCharCode(...vendor) + bytes.slice(4).join('').toUpperCase();
}

function cleanText(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  return text && text.toUpperCase() !== 'NA' ? text : null;
}

const toDistance = (raw: string | undefined): number | null => {
  const value = parseEnumInt(raw);
  return value !== null && value >= 0 && value < 200000 ? value : null;
};

export interface ProfileRows {
  status: Map<string, string>;
  rx: Map<string, string>;
  tx: Map<string, string>;
  name: Map<string, string>;
  serial: Map<string, string>;
  mac: Map<string, string>;
  distance: Map<string, string>;
}

/** Builds the ONU list from already-read columns. No network, so it can be tested. */
export function assembleOnus(profile: PonProfile, rows: ProfileRows): DiscoveredOnu[] {
  const first = rows.status.keys().next().value as string | undefined;
  if (first === undefined) return [];
  const width = first.split('.').length;

  const rx = alignTo(rows.rx, width);
  const tx = alignTo(rows.tx, width);
  const name = alignTo(rows.name, width);
  const serial = alignTo(rows.serial, width);
  const mac = alignTo(rows.mac, width);
  const distance = alignTo(rows.distance, width);

  const onus: DiscoveredOnu[] = [];
  for (const [suffix, rawStatus] of rows.status) {
    const address = decodeIndex(suffix, profile.index);
    if (!address) continue;

    const code = parseEnumInt(rawStatus);
    const online = code !== null && profile.online.includes(code);
    const macAddress = normalizeMac(mac.get(suffix));

    onus.push({
      ...address,
      status: online ? 'online' : 'offline',
      description: cleanText(name.get(suffix)),
      serialNumber: normalizeSerial(serial.get(suffix)) ?? macAddress,
      macAddress,
      // An offline ONU keeps its last reading on some firmware; that is not a signal.
      rxPower: online ? parsePowerDbm(rx.get(suffix), profile.scale) : null,
      txPower: online ? parsePowerDbm(tx.get(suffix), profile.scale) : null,
      distance: toDistance(distance.get(suffix)),
      profile: profile.id,
    });
  }
  return onus;
}

/**
 * A column that "works" but holds the wrong quantity is the real risk: a neighbouring
 * column can be Tx power, which is a plausible number too. An ONU's Rx is always
 * negative in practice and Tx positive, so a table whose online ONUs mostly read
 * positive was read from the wrong column.
 *
 * good: readings that look like Rx, or nothing online to judge by.
 * weak: ONUs are listed but not one reading survived. Right for an OLT that gives no
 *       power over SNMP, wrong for a column that is off by one, so it only wins when
 *       nothing better exists.
 * none: no ONUs, or readings that are not Rx.
 */
export type ProfileQuality = 'good' | 'weak' | 'none';

export function profileQuality(onus: DiscoveredOnu[]): ProfileQuality {
  if (onus.length === 0) return 'none';
  const online = onus.filter((o) => o.status === 'online');
  if (online.length === 0) return 'good';
  const readings = online.filter((o) => o.rxPower !== null).map((o) => o.rxPower as number);
  if (readings.length === 0) return 'weak';
  return readings.filter((dbm) => dbm < 0).length / readings.length >= 0.5 ? 'good' : 'none';
}

export const looksValid = (onus: DiscoveredOnu[]): boolean => profileQuality(onus) === 'good';

// ─── Network ─────────────────────────────────────────────────────────────────

export async function discoverByProfile(config: SNMPConfig, profile: PonProfile, walk: Walk = snmpWalk): Promise<DiscoveredOnu[]> {
  const { columns } = profile;
  const status = await walk(config, columns.status);
  const statusRows = rowsOf(status, columns.status);
  if (statusRows.size === 0) return [];

  const optional = async (oid: string | undefined) => (oid ? rowsOf(await walk(config, oid), oid) : new Map<string, string>());
  const [rx, tx, name, serial, mac, distance] = await Promise.all([
    optional(columns.rx),
    optional(columns.tx),
    optional(columns.name),
    optional(columns.serial),
    optional(columns.mac),
    optional(columns.distance),
  ]);

  return assembleOnus(profile, { status: statusRows, rx, tx, name, serial, mac, distance });
}

/** Which profile answered last, per OLT, so a poll does not probe every candidate again. */
const workingProfile = new Map<string, { id: string; weak: boolean; at: number }>();
const WEAK_RECHECK_MS = 60 * 60 * 1000;
const cacheKey = (config: SNMPConfig) => `${config.host}:${config.port ?? 161}`;

export function forgetWorkingProfile(config: SNMPConfig): void {
  workingProfile.delete(cacheKey(config));
}

export async function discoverFirstWorking(config: SNMPConfig, profiles: PonProfile[], walk: Walk = snmpWalk): Promise<DiscoveredOnu[]> {
  const key = cacheKey(config);
  const remembered = workingProfile.get(key);
  const known = profiles.find((p) => p.id === remembered?.id);
  const ordered = known ? [known, ...profiles.filter((p) => p !== known)] : profiles;

  let fallback: { profile: PonProfile; onus: DiscoveredOnu[] } | null = null;
  for (const profile of ordered) {
    const onus = await discoverByProfile(config, profile, walk);
    const quality = profileQuality(onus);
    if (quality === 'good') {
      workingProfile.set(key, { id: profile.id, weak: false, at: Date.now() });
      return onus;
    }
    if (quality === 'weak' && !fallback) fallback = { profile, onus };
    // A profile settled on as the best available is not probed against the rest on every poll.
    if (quality === 'weak' && remembered?.weak && profile.id === remembered.id && Date.now() - remembered.at < WEAK_RECHECK_MS) return onus;
  }
  if (fallback) {
    workingProfile.set(key, { id: fallback.profile.id, weak: true, at: Date.now() });
    return fallback.onus;
  }
  workingProfile.delete(key);
  return [];
}

/** First numeric scalar among candidate OIDs, trying the .0 instance and the bare OID. */
export async function readScalar(config: SNMPConfig, oids: string[], range: [number, number]): Promise<number | null> {
  for (const oid of oids) {
    for (const candidate of [`${oid}.0`, oid]) {
      const result = await snmpGet(config, candidate);
      const value = result.success ? parseEnumInt(result.value) : null;
      if (value !== null && value >= range[0] && value <= range[1]) return value;
    }
  }
  return null;
}
