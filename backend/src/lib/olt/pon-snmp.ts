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
 *
 * What the field notes of two C-Data GPON OLTs (FD1608S, FD1601S) and an EPON one
 * (258 ONUs) added: the ONU's position is written in its NAME ("gpon 0/0/3 onu 5 label"),
 * not derivable from the index; Rx -1 means offline; names arrive NUL-padded as hex.
 */
import { snmpGet, snmpWalk, type SNMPConfig, type SNMPWalkResult } from './snmp';

export type Walk = (config: SNMPConfig, oid: string) => Promise<SNMPWalkResult>;

/**
 * epon-device: one Unsigned32 = OLT device | card | encoded PON | ONU. The PON sits in the
 *   high nibble of the third byte (port = nibble + 1), as seen on live C-Data EPON.
 * gpon-sequence: a global sequence starting at 0x480001; the position is in the name.
 * hsgq: 0x01000000 | PON << 8 | ONU.
 * dotted: the parts of the OID itself.
 */
export type IndexLayout = 'epon-device' | 'gpon-sequence' | 'hsgq' | 'dotted';
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
  /** Read frame/slot/port/ONU and the customer label from the name column, falling back to the index. */
  positionFromName?: boolean;
  /** Believed unreliable on current firmware: used only when nothing else lists any ONU. */
  lastResort?: boolean;
  columns: {
    status: string;
    rx: string;
    tx?: string;
    name?: string;
    serial?: string;
    mac?: string;
    distance?: string;
    /** Power the OLT measures from this ONU (upstream). Used only when the ONU reports none. */
    oltRx?: string;
    /** Text such as "LOS" or "dying-gasp" for an ONU that is down. */
    downCause?: string;
    /** 1 when the ONU powered off (dying gasp). */
    dyingGasp?: string;
  };
}

export type OnuStatus = 'online' | 'offline' | 'dying_gasp' | 'los';

export interface DiscoveredOnu {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  status: OnuStatus;
  description: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  rxPower: number | null;
  txPower: number | null;
  distance: number | null;
  /** Where rxPower came from: the ONU's own reading, or the OLT's measurement of it. */
  rxSource: 'onu' | 'olt' | null;
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
      dbm = size > 5000 ? number / 1000 : size > 500 ? number / 100 : size > 50 ? number / 10 : number;
    }
  }
  dbm = Math.round(dbm * 100) / 100;
  return dbm >= -60 && dbm <= 10 ? dbm : null;
}

/**
 * Rx of an ONU. Always below about -3 dBm in practice, so anything above -1 is not a
 * reading: C-Data reports -1 for an offline ONU, which would otherwise pass as -0.01 dBm.
 */
export function parseRxDbm(raw: string | null | undefined, scale: PowerScale): number | null {
  const match = String(raw ?? '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  if (!match[0].includes('.') && Number(match[0]) >= -1) return null;
  const dbm = parsePowerDbm(raw, scale);
  return dbm !== null && dbm <= -1 ? dbm : null;
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

/**
 * Text from an SNMP value. Unset names arrive zero-filled and NUL-padded names arrive as hex
 * ("67 70 6F 6E ..."): decode printable bytes up to the first NUL, and an all-zero value is no text.
 */
export function decodeSnmpText(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  if (/^(?:[0-9A-Fa-f]{2}\s+)+[0-9A-Fa-f]{2}$/.test(text)) {
    const bytes = text.split(/\s+/).map((h) => parseInt(h, 16));
    if (bytes.every((b) => b === 0)) return '';
    const nul = bytes.indexOf(0);
    const used = nul === -1 ? bytes : bytes.slice(0, nul);
    if (used.length > 0 && used.every((b) => b >= 32 && b <= 126)) return String.fromCharCode(...used).trim();
    return text;
  }
  return text.replace(/\0+/g, '').trim();
}

export interface NamedPosition {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  label: string | null;
}

/** "gpon 0/0/3 onu 5 Budi" or "epon 0/1/2 onu 7" -> where it is and what it is called. */
export function parseOnuName(raw: string | null | undefined): NamedPosition | null {
  const match = decodeSnmpText(raw).match(/(?:epon|gpon)\s+(\d+)\/(\d+)\/(\d+)\s+onu\s+(\d+)\s*(.*)$/i);
  if (!match) return null;
  const label = match[5].trim();
  return { frame: Number(match[1]), slot: Number(match[2]), port: Number(match[3]), onuId: Number(match[4]), label: label || null };
}

export interface OnuAddress {
  frame: number;
  slot: number;
  port: number;
  onuId: number;
}

const GPON_SEQUENCE_BASE = 0x480000;

/**
 * Where an index suffix puts the ONU. Every layout is injective enough that two ONUs do not
 * share an address and overwrite each other in the database.
 */
export function decodeIndex(suffix: string, layout: IndexLayout): OnuAddress | null {
  const parts = suffix.split('.').map(Number);
  if (parts.length === 0 || parts.some((p) => !Number.isInteger(p) || p < 0)) return null;

  if (parts.length === 1) {
    const value = parts[0];
    if (layout === 'epon-device') {
      return {
        frame: 0,
        slot: Math.floor(value / 16777216) % 256,
        port: Math.floor((Math.floor(value / 256) % 256) / 16) + 1,
        onuId: value % 256,
      };
    }
    if (layout === 'gpon-sequence') {
      return { frame: 0, slot: 0, port: 0, onuId: value > GPON_SEQUENCE_BASE ? value - GPON_SEQUENCE_BASE : value };
    }
    if (layout === 'hsgq' && Math.floor(value / 16777216) === 1) {
      return { frame: 0, slot: 0, port: Math.floor(value / 256) % 256, onuId: value % 256 };
    }
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

const ZERO_MAC = '00:00:00:00:00:00';

/**
 * A GPON serial is 4 ASCII vendor letters plus 4 bytes. SNMP prints it as hex when any
 * byte is not printable ("43 44 41 54 12 34 56 78"); the rest of the panel knows it as
 * "CDAT12345678".
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text.toUpperCase() === 'NA' || text === '--') return null;
  const bytes = text.match(/^(?:[0-9a-fA-F]{2}[ :-]){7}[0-9a-fA-F]{2}$/) ? text.split(/[ :-]/) : null;
  if (!bytes) return text;
  const vendor = bytes.slice(0, 4).map((b) => parseInt(b, 16));
  if (!vendor.every((c) => c >= 0x20 && c <= 0x7e)) return bytes.join('').toUpperCase();
  return String.fromCharCode(...vendor) + bytes.slice(4).join('').toUpperCase();
}

function cleanLabel(raw: string): string | null {
  return raw && raw.toUpperCase() !== 'NA' && raw !== '--' ? raw : null;
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
  oltRx?: Map<string, string>;
  downCause?: Map<string, string>;
  dyingGasp?: Map<string, string>;
}

/** Why an ONU that is not online is down, from the cause text or the dying-gasp flag. */
function downStatus(cause: string | undefined, dyingGasp: string | undefined): 'offline' | 'dying_gasp' | 'los' {
  if (parseEnumInt(dyingGasp) === 1) return 'dying_gasp';
  const text = decodeSnmpText(cause).toLowerCase();
  if (text.includes('dying')) return 'dying_gasp';
  if (/\blos\b/.test(text)) return 'los';
  return 'offline';
}

/** Builds the ONU list from already-read columns. No network, so it can be tested. */
export function assembleOnus(profile: PonProfile, rows: ProfileRows): DiscoveredOnu[] {
  const first = rows.status.keys().next().value as string | undefined;
  if (first === undefined) return [];
  const width = first.split('.').length;
  const empty = new Map<string, string>();

  const rx = alignTo(rows.rx, width);
  const tx = alignTo(rows.tx, width);
  const name = alignTo(rows.name, width);
  const serial = alignTo(rows.serial, width);
  const mac = alignTo(rows.mac, width);
  const distance = alignTo(rows.distance, width);
  const oltRx = alignTo(rows.oltRx ?? empty, width);
  const downCause = alignTo(rows.downCause ?? empty, width);
  const dyingGasp = alignTo(rows.dyingGasp ?? empty, width);

  const seen = new Set<string>();
  const onus: DiscoveredOnu[] = [];
  for (const [suffix, rawStatus] of rows.status) {
    const text = decodeSnmpText(name.get(suffix));
    const named = profile.positionFromName ? parseOnuName(text) : null;
    const address = named ? { frame: named.frame, slot: named.slot, port: named.port, onuId: named.onuId } : decodeIndex(suffix, profile.index);
    if (!address) continue;

    const code = parseEnumInt(rawStatus);
    const online = code !== null && profile.online.includes(code);
    const macAddress = normalizeMac(mac.get(suffix));
    // An unregistered slot shows up as an offline row with an all-zero MAC.
    if (!online && macAddress === ZERO_MAC) continue;

    const key = `${address.frame}:${address.slot}:${address.port}:${address.onuId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // An offline ONU keeps its last reading on some firmware; that is not a signal.
    const onuRx = online ? parseRxDbm(rx.get(suffix), profile.scale) : null;
    const oltSide = online && onuRx === null ? parseRxDbm(oltRx.get(suffix), 'centi') : null;

    onus.push({
      ...address,
      status: online ? 'online' : downStatus(downCause.get(suffix), dyingGasp.get(suffix)),
      description: named ? named.label : cleanLabel(text),
      serialNumber: normalizeSerial(serial.get(suffix)) ?? (macAddress === ZERO_MAC ? null : macAddress),
      macAddress: macAddress === ZERO_MAC ? null : macAddress,
      rxPower: onuRx ?? oltSide,
      rxSource: onuRx !== null ? 'onu' : oltSide !== null ? 'olt' : null,
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
  const [rx, tx, name, serial, mac, distance, oltRx, downCause, dyingGasp] = await Promise.all([
    optional(columns.rx),
    optional(columns.tx),
    optional(columns.name),
    optional(columns.serial),
    optional(columns.mac),
    optional(columns.distance),
    optional(columns.oltRx),
    optional(columns.downCause),
    optional(columns.dyingGasp),
  ]);

  return assembleOnus(profile, { status: statusRows, rx, tx, name, serial, mac, distance, oltRx, downCause, dyingGasp });
}

/** Which profile answered last, per OLT, so a poll does not probe every candidate again. */
const workingProfile = new Map<string, { id: string; weak: boolean; at: number }>();
const WEAK_RECHECK_MS = 60 * 60 * 1000;
const cacheKey = (config: SNMPConfig, group: string) => `${config.host}:${config.port ?? 161}:${group}`;

export function forgetWorkingProfile(config: SNMPConfig): void {
  for (const key of [...workingProfile.keys()]) if (key.startsWith(`${config.host}:${config.port ?? 161}:`)) workingProfile.delete(key);
}

export async function discoverFirstWorking(
  config: SNMPConfig,
  profiles: PonProfile[],
  walk: Walk = snmpWalk,
  group = 'default',
): Promise<DiscoveredOnu[]> {
  const key = cacheKey(config, group);
  const remembered = workingProfile.get(key);
  const known = profiles.find((p) => p.id === remembered?.id);
  const ordered = known ? [known, ...profiles.filter((p) => p !== known)] : profiles;

  // Profiles marked lastResort are tried only after every other one came back empty.
  const stages = [ordered.filter((p) => !p.lastResort), ordered.filter((p) => p.lastResort)];
  for (const stage of stages) {
    let fallback: { profile: PonProfile; onus: DiscoveredOnu[] } | null = null;
    for (const profile of stage) {
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
  }
  workingProfile.delete(key);
  return [];
}

/**
 * One OLT can carry EPON and GPON cards (XPON chassis), and each technology answers on
 * its own tree. So the first working profile is chosen per technology and the results are
 * joined; stopping at the first technology that answers would hide the other one.
 */
export async function discoverGroups(config: SNMPConfig, profiles: PonProfile[], walk: Walk = snmpWalk): Promise<DiscoveredOnu[]> {
  const seen = new Set<string>();
  const merged: DiscoveredOnu[] = [];
  for (const tech of [...new Set(profiles.map((p) => p.tech))]) {
    const onus = await discoverFirstWorking(config, profiles.filter((p) => p.tech === tech), walk, tech);
    for (const onu of onus) {
      const address = `${onu.frame}:${onu.slot}:${onu.port}:${onu.onuId}`;
      if (seen.has(address)) continue;
      seen.add(address);
      merged.push(onu);
    }
  }
  return merged;
}

export interface ProfileCoverage {
  profile: string;
  tech: string;
  /** Rows each column returned, by column name. A 0 next to a full status column is the gap to look at. */
  counts: Record<string, number>;
}

/** How many rows every column of a profile returns, or null when the profile's tree does not answer. */
export async function profileCoverage(config: SNMPConfig, profile: PonProfile, walk: Walk = snmpWalk): Promise<ProfileCoverage | null> {
  const entries = Object.entries(profile.columns).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const counts: Record<string, number> = {};
  const sizes = await Promise.all(entries.map(async ([name, oid]) => [name, rowsOf(await walk(config, oid), oid).size] as const));
  for (const [name, size] of sizes) counts[name] = size;
  return counts.status > 0 ? { profile: profile.id, tech: profile.tech, counts } : null;
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
