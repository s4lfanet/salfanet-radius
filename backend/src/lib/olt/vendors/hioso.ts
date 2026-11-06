/**
 * Hioso / C-Data OLT SNMP/Telnet Integration
 *
 * Supports 5 profiles verified from production OIDs (April–May 2026):
 *
 *   HIOSO_C  — HA7304V,  community: public,   EPON, PON2/3/4 merged in SNMP
 *   HIOSO_B2 — HA7304C,  community: SNMPREAD, EPON, 4 PON ports exposed correctly
 *   HIOSO_VX — HA7304VX, community: public,   EPON, identical MIB to HIOSO_C
 *   HIOSO_B  — BDCOM/Huawei clone,            EPON, different MIB tree (.3320.101.10)
 *   HIOSO_GPON — C-Data GPON,                 GPON, MIB tree .25355.3.3
 *
 * OID Reference: OLT_OID_REFERENCE.md
 * Enterprise OID roots:
 *   Hioso / C-Data : .1.3.6.1.4.1.25355
 *   BDCOM clone    : .1.3.6.1.4.1.3320
 */

import { SNMPConfig, snmpGet, snmpWalk } from '../snmp';
import { TelnetConfig } from '../telnet';
import { decodeSnmpText, normalizeMac, parsePowerDbm, parseRxDbm } from '../pon-snmp';
import { readHiosoOnus } from '../hioso-telnet';
import { readHiosoWeb, type HiosoWebOnu } from '../hioso-web';

// ─── OID Definitions ─────────────────────────────────────────────────────────

// Shared across HIOSO_C, HIOSO_B2, HIOSO_VX (all use .25355.3.2.6)
const HIOSO_EPON_OIDS = {
  // Per-ONU fields (index format: board.pon.onu_id)
  onuName:      '1.3.6.1.4.1.25355.3.2.6.3.2.1.37', // String, custom name or "NA"
  onuSn:        '1.3.6.1.4.1.25355.3.2.6.3.2.1.11', // Hex serial number
  onuMac:       '1.3.6.1.4.1.25355.3.2.6.3.2.1.12', // MAC address (alt SN candidate)
  onuStatus:    '1.3.6.1.4.1.25355.3.2.6.3.2.1.39', // 1=online, 2=offline
  onuDyingGasp: '1.3.6.1.4.1.25355.3.2.6.3.2.1.41', // 1 = powered off (only on firmware that has the table)
  onuDistance:  '1.3.6.1.4.1.25355.3.2.6.3.2.1.25', // Integer, meters
  // Optical readings (index format: board.pon.onu_id)
  onuTxPower:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.4', // Float string dBm (already in dBm, divider=1)
  onuRxPower:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.8', // Float string dBm (already in dBm, divider=1)
  onuOptTemp:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.7', // Integer, °C
};

// Chassis temperature, as read by a working NMS on HA7304C and GPON models. The second is in hundredths of a degree.
const CHASSIS_TEMP_OIDS = [
  '1.3.6.1.4.1.25355.3.2.1.1.1.2.0',
  '1.3.6.1.4.1.25355.3.1.8.1.1.9',
  '1.3.6.1.4.1.25355.3.3.1.2.1.1.2.0',
];

// HIOSO_B profile — BDCOM/Huawei clone MIB (.3320.101.10)
const HIOSO_B_OIDS = {
  onuName:    '1.3.6.1.4.1.3320.101.10.1.1.79', // String
  onuSn:      '1.3.6.1.4.1.3320.101.10.1.1.3',  // Serial number
  onuStatus:  '1.3.6.1.4.1.3320.101.10.1.1.26', // Status
  onuTxPower: '1.3.6.1.4.1.3320.101.10.5.1.5',  // Integer raw — auto-scale
  onuRxPower: '1.3.6.1.4.1.3320.101.10.5.1.6',  // Integer raw — auto-scale
};

// HIOSO_GPON profile — C-Data GPON MIB (.25355.3.3)
const HIOSO_GPON_OIDS = {
  onuName:    '1.3.6.1.4.1.25355.3.3.1.1.1.2',  // String
  onuSn:      '1.3.6.1.4.1.25355.3.3.1.1.1.5',  // Serial number
  onuStatus:  '1.3.6.1.4.1.25355.3.3.1.1.1.11', // Status
  onuTxPower: '1.3.6.1.4.1.25355.3.3.1.1.4.1.2',// Integer raw — auto-scale (divider=100)
  onuRxPower: '1.3.6.1.4.1.25355.3.3.1.1.4.1.1',// Integer raw — auto-scale (divider=100)
};

// Standard MIBs — common to all profiles
const STD_OIDS = {
  sysDescr:        '1.3.6.1.2.1.1.1.0',
  sysUpTime:       '1.3.6.1.2.1.1.3.0',
  sysName:         '1.3.6.1.2.1.1.5.0',
  ifOperStatus:    '1.3.6.1.2.1.2.2.1.8',
  ifInOctets:      '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets:     '1.3.6.1.2.1.2.2.1.16',
  ifHCInOctets:    '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets:   '1.3.6.1.2.1.31.1.1.1.10',
  // HOST-RESOURCES-MIB (available on HIOSO_B2)
  cpuLoad:         '1.3.6.1.2.1.25.3.3.1.2.768',
  ramTotal:        '1.3.6.1.2.1.25.2.3.1.5.1',
  ramUsed:         '1.3.6.1.2.1.25.2.3.1.6.1',
};

// ─── Profile Detection ───────────────────────────────────────────────────────

export type HiosoProfile = 'HIOSO_C' | 'HIOSO_B2' | 'HIOSO_VX' | 'HIOSO_B' | 'HIOSO_GPON';

/**
 * Auto-detect Hioso profile from sysDescr and model string.
 * Falls back to HIOSO_B2 (most common production profile).
 */
function detectProfile(sysDescr: string, model?: string | null): HiosoProfile {
  const desc = (sysDescr + ' ' + (model ?? '')).toLowerCase();
  if (desc.includes('gpon') || desc.includes('3.3'))     return 'HIOSO_GPON';
  if (desc.includes('bdcom') || desc.includes('3320'))   return 'HIOSO_B';
  if (desc.includes('ha7304vx') || desc.includes('vx'))  return 'HIOSO_VX';
  if (desc.includes('hioso b') || desc.includes('b2') || desc.includes('ha7304c')) return 'HIOSO_B2';
  if (desc.includes('ha7304v'))                          return 'HIOSO_C';
  // Default: HIOSO_B2 (most capable SNMP expose)
  return 'HIOSO_B2';
}

function getProfileOids(profile: HiosoProfile) {
  if (profile === 'HIOSO_B')    return HIOSO_B_OIDS;
  if (profile === 'HIOSO_GPON') return HIOSO_GPON_OIDS;
  return HIOSO_EPON_OIDS; // HIOSO_C, HIOSO_B2, HIOSO_VX all use same OIDs
}

// ─── Signal / Power Parsing ───────────────────────────────────────────────────

/**
 * Parse optical power value from SNMP.
 * - HIOSO_C/B2/VX: SNMP already returns float dBm string (e.g. "-12.22")
 * - HIOSO_B/GPON:  SNMP returns raw integer, auto-scale by magnitude
 */
function parsePower(rawValue: string, _profile: HiosoProfile, kind: 'rx' | 'tx' = 'rx'): number | null {
  // EPON returns a float string in dBm ("-20.36", or "na" when the ONU reports no DDM); the others
  // return scaled integers. Both go through the shared reader, which also drops 0 and the -1 / 65535
  // sentinels and keeps an Rx reading above -1 dBm out.
  return kind === 'rx' ? parseRxDbm(rawValue, 'auto') : parsePowerDbm(rawValue, 'auto');
}

/**
 * Classify signal quality from Rx power dBm.
 *   critical : rxDbm < -27.0
 *   warn     : -27.0 ≤ rxDbm < -25.0
 *   ok       : rxDbm ≥ -25.0
 */
export function signalLevel(rxDbm: number | null): 'ok' | 'warn' | 'critical' | 'unknown' {
  if (rxDbm === null) return 'unknown';
  if (rxDbm < -27.0)  return 'critical';
  if (rxDbm < -25.0)  return 'warn';
  return 'ok';
}

// ─── ONU Index Parsing ────────────────────────────────────────────────────────

/**
 * Extract ONU list from snmpwalk results of the status OID.
 * Index format: {board}.{pon}.{onu_id}
 * Returns parsed ONU objects with status mapped to 'online'|'offline'.
 */
function parseOnuStatusWalk(
  walkResults: Record<string, string>,
  baseOid: string,
  _profile: HiosoProfile,
): Array<{ board: number; pon: number; onuId: number; status: string }> {
  const onus: Array<{ board: number; pon: number; onuId: number; status: string }> = [];

  for (const [fullOid, rawValue] of Object.entries(walkResults)) {
    // Strip base OID prefix to get the index suffix
    const suffix = fullOid.startsWith(baseOid + '.')
      ? fullOid.slice(baseOid.length + 1)
      : fullOid.replace(/^.*?(\d+\.\d+\.\d+)$/, '$1');

    const parts = suffix.split('.').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) continue;

    const [board, pon, onuId] = parts;
    const statusInt = parseInt(rawValue);
    // 1 = online, 2 = offline (all Hioso profiles)
    const status = statusInt === 1 ? 'online' : 'offline';

    onus.push({ board, pon, onuId, status });
  }

  return onus;
}

// ─── Temperature ─────────────────────────────────────────────────────────────

/**
 * Get OLT chassis temperature.
 * For HIOSO_B2: read from onuOptTemp OID of the first ONU (optical module temp as proxy).
 * Hioso does not expose a dedicated chassis temp OID in standard MIBs.
 * Falls back to null if unavailable.
 */
export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  for (const oid of CHASSIS_TEMP_OIDS) {
    const direct = await snmpGet(config, oid);
    let raw = direct.success ? direct.value : undefined;
    if (raw === undefined) {
      const walked = await snmpWalk(config, oid);
      raw = walked.success && walked.results ? Object.values(walked.results)[0] : undefined;
    }
    const match = raw?.match(/-?\d+(?:\.\d+)?/);
    if (!match) continue;
    let value = Number(match[0]);
    if (value > 200) value /= 100;
    // 85 is the power-on constant of a temperature sensor that is not fitted.
    if (value >= 5 && value <= 110 && Math.round(value) !== 85) return Math.round(value);
  }

  // No chassis reading: the optical module of the first ONU, as before.
  const eponTempOid = `${HIOSO_EPON_OIDS.onuOptTemp}.1.1.1`;
  const result = await snmpGet(config, eponTempOid);
  if (result.success && result.value) {
    const t = parseInt(result.value);
    if (!isNaN(t) && t > 0 && t < 100) return t;
  }
  return null;
}

// ─── CPU / Memory ─────────────────────────────────────────────────────────────

/**
 * Get CPU load % — only available on HIOSO_B2 via HOST-RESOURCES-MIB.
 */
export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, STD_OIDS.cpuLoad);
  if (result.success && result.value) {
    const v = parseInt(result.value);
    return isNaN(v) ? null : v;
  }
  return null;
}

/**
 * Get memory usage % — only available on HIOSO_B2 via HOST-RESOURCES-MIB.
 */
export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  const [totalRes, usedRes] = await Promise.all([
    snmpGet(config, STD_OIDS.ramTotal),
    snmpGet(config, STD_OIDS.ramUsed),
  ]);
  if (totalRes.success && usedRes.success && totalRes.value && usedRes.value) {
    const total = parseInt(totalRes.value);
    const used  = parseInt(usedRes.value);
    if (!isNaN(total) && !isNaN(used) && total > 0) {
      return Math.round((used / total) * 100);
    }
  }
  return null;
}

// ─── ONU Discovery via SNMP ───────────────────────────────────────────────────

/**
 * Discover all ONUs via SNMP walk.
 * Returns array of ONU objects with status, serial, and optical data if available.
 */
export interface OltCredentials {
  host: string;
  username: string;
  password: string;
}

/**
 * SNMP first, then the OLT's web page when the login is known. The page lists every PON, which
 * SNMP does not on firmware that merges them, and adds distance and the reason an ONU is down.
 * See mergeWithWeb for how the two are combined.
 */
export async function discoverONUsSNMP(
  config: SNMPConfig,
  model?: string | null,
  _telnet?: unknown,
  credentials?: OltCredentials | null,
): Promise<any[]> {
  const snmp = await discoverViaSnmp(config, model);
  if (!credentials?.username) return snmp;
  try {
    const web = await readHiosoWeb({ host: credentials.host, username: credentials.username, password: credentials.password });
    return mergeWithWeb(snmp, web);
  } catch (error: any) {
    console.warn(`[Hioso] web page not read for ${credentials.host}: ${error?.message ?? error}`);
    return snmp;
  }
}

function fromWeb(onu: HiosoWebOnu): any {
  return {
    frame:        1,
    slot:         onu.pon,
    port:         onu.pon,
    onuId:        onu.onuId,
    serialNumber: onu.mac,
    macAddress:   onu.mac,
    name:         onu.name,
    description:  onu.name,
    status:       onu.status,
    rxPower:      onu.rxPower,
    txPower:      onu.txPower,
    distance:     onu.distance,
    signalLevel:  signalLevel(onu.rxPower),
  };
}

/**
 * When the web page lists more ONUs than SNMP, SNMP is partial (some firmware folds PON 2 to 4
 * together) and the page is used whole. Otherwise SNMP stays the base, since its link state is the
 * reference, and the page only fills what SNMP left empty: name, MAC, power and distance.
 */
export function mergeWithWeb(snmp: any[], web: HiosoWebOnu[]): any[] {
  if (web.length === 0) return snmp;
  if (snmp.length === 0 || web.length > snmp.length) return web.map(fromWeb);

  const byPosition = new Map(web.map((onu) => [`${onu.pon}:${onu.onuId}`, onu]));
  return snmp.map((onu) => {
    const page = byPosition.get(`${onu.slot}:${onu.onuId}`);
    if (!page) return onu;
    const online = onu.status === 'online';
    const rxPower = onu.rxPower ?? (online ? page.rxPower : null);
    return {
      ...onu,
      description:  onu.description ?? page.name,
      name:         onu.name ?? page.name,
      macAddress:   onu.macAddress ?? page.mac,
      serialNumber: onu.serialNumber ?? page.mac,
      rxPower,
      txPower:      onu.txPower ?? (online ? page.txPower : null),
      distance:     onu.distance ?? page.distance,
      signalLevel:  signalLevel(rxPower),
    };
  });
}

async function discoverViaSnmp(
  config: SNMPConfig,
  model?: string | null,
): Promise<any[]> {
  // sysDescr is often blank on these OLTs, so a wrong guess at the family must not end the search:
  // the detected profile goes first, then the others (EPON, GPON, BDCOM clone), as a working NMS does.
  const descResult = await snmpGet(config, STD_OIDS.sysDescr);
  const sysDescr = descResult.success ? (descResult.value ?? '') : '';
  const detected = detectProfile(sysDescr, model);

  const tried = new Set<unknown>();
  for (const profile of [detected, 'HIOSO_B2', 'HIOSO_GPON', 'HIOSO_B'] as HiosoProfile[]) {
    const oids = getProfileOids(profile);
    if (tried.has(oids)) continue;
    tried.add(oids);
    const onus = await readProfile(config, profile);
    if (onus.length > 0) return onus;
  }
  return [];
}

const ZERO_MAC = '00:00:00:00:00:00';

export async function readProfile(config: SNMPConfig, profile: HiosoProfile, walk: typeof snmpWalk = snmpWalk): Promise<any[]> {
  const oids = getProfileOids(profile);
  const isEpon = oids === HIOSO_EPON_OIDS;

  // Walk ONU status OID to enumerate all ONUs
  const statusWalk = await walk(config, oids.onuStatus);
  if (!statusWalk.success || !statusWalk.results) return [];

  const baseOnus = parseOnuStatusWalk(statusWalk.results, oids.onuStatus, profile);
  if (baseOnus.length === 0) return [];

  // Walk serial numbers, names, power and (on EPON) the MAC and dying-gasp tables in parallel
  const none = Promise.resolve({ success: false } as { success: boolean; results?: Record<string, string> });
  const [snWalk, nameWalk, rxWalk, txWalk, macWalk, dygWalk] = await Promise.all([
    walk(config, oids.onuSn),
    walk(config, oids.onuName),
    walk(config, oids.onuRxPower),
    walk(config, oids.onuTxPower),
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuMac) : none,
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuDyingGasp) : none,
  ]);

  const snMap    = snWalk.results    ?? {};
  const nameMap  = nameWalk.results  ?? {};
  const rxMap    = rxWalk.results    ?? {};
  const txMap    = txWalk.results    ?? {};
  const macMap   = macWalk.results   ?? {};
  const dygMap   = dygWalk.results   ?? {};

  const onus: any[] = [];

  for (const onu of baseOnus) {
    const suffix = `${onu.board}.${onu.pon}.${onu.onuId}`;

    // Find matching SN — try both full OID and suffix match
    const snRaw  = snMap[`${oids.onuSn}.${suffix}`]    ?? findBySuffix(snMap, suffix);
    const namRaw = nameMap[`${oids.onuName}.${suffix}`] ?? findBySuffix(nameMap, suffix);
    const rxRaw  = rxMap[`${oids.onuRxPower}.${suffix}`]  ?? findBySuffix(rxMap, suffix);
    const txRaw  = txMap[`${oids.onuTxPower}.${suffix}`]  ?? findBySuffix(txMap, suffix);
    const macRaw = macMap[`${HIOSO_EPON_OIDS.onuMac}.${suffix}`] ?? findBySuffix(macMap, suffix);
    const dygRaw = dygMap[`${HIOSO_EPON_OIDS.onuDyingGasp}.${suffix}`] ?? findBySuffix(dygMap, suffix);

    // The MAC is the ONU's identity on EPON; the second column is the fallback.
    const mac = normalizeMac(snRaw) ?? normalizeMac(macRaw);
    // An unregistered slot shows up as a row with an all-zero MAC.
    if (isEpon && onu.status !== 'online' && mac === ZERO_MAC) continue;

    // Unset names arrive as zero-filled octet strings; "NA" is the OLT's own placeholder.
    const label = decodeSnmpText(namRaw);
    const description = label && label.toUpperCase() !== 'NA' ? label : null;

    const rxPower = onu.status === 'online' && rxRaw != null ? parsePower(rxRaw, profile, 'rx') : null;
    const txPower = onu.status === 'online' && txRaw != null ? parsePower(txRaw, profile, 'tx') : null;

    // Down because it lost power, if the OLT says so. Not inferred from missing Rx.
    const status = onu.status !== 'online' && dygRaw != null && parseInt(dygRaw) === 1 ? 'dying_gasp' : onu.status;

    onus.push({
      frame:        onu.board,
      slot:         onu.pon,
      port:         onu.pon,    // PON port = slot for Hioso
      onuId:        onu.onuId,
      serialNumber: (snRaw ?? '').trim() || (macRaw ?? '').trim() || null,
      macAddress:   mac && mac !== ZERO_MAC ? mac : null,
      name:         description,
      description,
      status,
      rxPower,
      txPower,
      signalLevel:  signalLevel(rxPower),
    });
  }

  return onus;
}

/** Walk distance OID and return map of suffix → distance (meters) */
export async function getOnuDistances(
  config: SNMPConfig,
  model?: string | null,
): Promise<Record<string, number>> {
  const descResult = await snmpGet(config, STD_OIDS.sysDescr);
  const profile = detectProfile(descResult.value ?? '', model);
  if (profile === 'HIOSO_B' || profile === 'HIOSO_GPON') return {}; // No distance OID

  const walk = await snmpWalk(config, HIOSO_EPON_OIDS.onuDistance);
  if (!walk.success || !walk.results) return {};

  const result: Record<string, number> = {};
  for (const [oid, val] of Object.entries(walk.results)) {
    const suffix = oid.split('.').slice(-3).join('.');
    const dist = parseInt(val);
    if (!isNaN(dist)) result[suffix] = dist;
  }
  return result;
}

// ─── ONU Discovery via Telnet ─────────────────────────────────────────────────

/**
 * Discover ONUs via Telnet — the fallback when SNMP lists none (or on firmware where SNMP merges
 * PON ports). Reads `show onu info epon <base>/<pon> all`; the session is in hioso-telnet.ts.
 * Telnet gives identity and link state but no optical power.
 */
export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  try {
    const rows = await readHiosoOnus({ host: config.host, port: config.port, username: config.username, password: config.password });
    return rows.map((row) => ({
      frame:        1,
      slot:         row.pon,
      port:         row.pon,
      onuId:        row.onuId,
      serialNumber: row.mac,
      macAddress:   row.mac,
      description:  row.name && row.name.toUpperCase() !== 'NA' ? row.name : null,
      status:       row.up ? 'online' : 'offline',
    }));
  } catch (error: any) {
    console.warn(`[Hioso] Telnet discovery failed for ${config.host}: ${error?.message ?? error}`);
    return [];
  }
}

/** Per-ONU optical detail is not available from the Hioso CLI; power comes from SNMP. */
export async function getOnuOpticalInfo(): Promise<null> {
  return null;
}

// Telnet SSH stub — Hioso uses Telnet CLI, no SSH in practice
export async function discoverONUsSSH(_config: any): Promise<any[]> {
  return []; // Hioso does not support SSH polling in standard config
}

// ─── Traffic Stats ────────────────────────────────────────────────────────────

export async function getTrafficStats(config: SNMPConfig): Promise<{
  rxBytes?: bigint; txBytes?: bigint;
}> {
  // Try 64-bit counters first (ifHCInOctets)
  const [rxHC, txHC] = await Promise.all([
    snmpGet(config, `${STD_OIDS.ifHCInOctets}.1`),
    snmpGet(config, `${STD_OIDS.ifHCOutOctets}.1`),
  ]);
  if (rxHC.success && rxHC.value && txHC.success && txHC.value) {
    return {
      rxBytes: BigInt(rxHC.value.replace(/\D/g, '')),
      txBytes: BigInt(txHC.value.replace(/\D/g, '')),
    };
  }
  // Fallback to 32-bit ifInOctets
  const [rx, tx] = await Promise.all([
    snmpGet(config, `${STD_OIDS.ifInOctets}.1`),
    snmpGet(config, `${STD_OIDS.ifOutOctets}.1`),
  ]);
  return {
    rxBytes: rx.success && rx.value ? BigInt(rx.value.replace(/\D/g, '')) : undefined,
    txBytes: tx.success && tx.value ? BigInt(tx.value.replace(/\D/g, '')) : undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Find a value from a walk result map where the OID ends with the given suffix */
function findBySuffix(map: Record<string, string>, suffix: string): string | undefined {
  for (const [oid, val] of Object.entries(map)) {
    if (oid.endsWith('.' + suffix)) return val;
  }
  return undefined;
}
