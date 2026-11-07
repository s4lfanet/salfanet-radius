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
import { decodeSnmpText, normalizeMac, parseEnumInt, parsePowerDbm, parseRxDbm } from '../pon-snmp';
import { cleanHiosoName, isUnsetOnuName, hiosoNameCommands, hiosoPonBase, hiosoRebootCommands, readHiosoCli, readHiosoOnus, runHiosoCommands, type HiosoCliOnu, type HiosoCliReport } from '../hioso-telnet';
import { distanceFromRtt, formatHiosoOnuType, readHiosoWeb, setHiosoWebName, type HiosoSystemInfo, type HiosoWebOnu } from '../hioso-web';
import { defaultPonCount } from '../rack';

// ─── OID Definitions ─────────────────────────────────────────────────────────

// Shared across HIOSO_C, HIOSO_B2, HIOSO_VX (all use .25355.3.2.6)
const HIOSO_EPON_OIDS = {
  // Per-ONU fields (index format: board.pon.onu_id)
  onuName:      '1.3.6.1.4.1.25355.3.2.6.3.2.1.37', // String, custom name or "NA"
  onuSn:        '1.3.6.1.4.1.25355.3.2.6.3.2.1.11', // Hex serial number
  onuMac:       '1.3.6.1.4.1.25355.3.2.6.3.2.1.12', // MAC address (alt SN candidate)
  onuStatus:    '1.3.6.1.4.1.25355.3.2.6.3.2.1.39', // 1=online, 2=LOS
  onuDyingGasp: '1.3.6.1.4.1.25355.3.2.6.3.2.1.41', // 1 = powered off (only on firmware that has the table)
  onuDistance:  '1.3.6.1.4.1.25355.3.2.6.3.2.1.25', // Round-trip counter, see distanceFromRtt
  onuChip:      '1.3.6.1.4.1.25355.3.2.6.3.2.1.15', // Chip id
  onuPorts:     '1.3.6.1.4.1.25355.3.2.6.3.2.1.13', // LAN port count or type code, not a down reason
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
  onuDistance: '1.3.6.1.4.1.3320.101.10.1.1.38', // Round-trip counter
};

// HIOSO_GPON profile — C-Data GPON MIB (.25355.3.3)
const HIOSO_GPON_OIDS = {
  onuName:    '1.3.6.1.4.1.25355.3.3.1.1.1.2',  // String
  onuSn:      '1.3.6.1.4.1.25355.3.3.1.1.1.5',  // Serial number
  onuStatus:  '1.3.6.1.4.1.25355.3.3.1.1.1.11', // Status
  onuTxPower: '1.3.6.1.4.1.25355.3.3.1.1.4.1.2',// Integer raw — auto-scale (divider=100)
  onuRxPower: '1.3.6.1.4.1.25355.3.3.1.1.4.1.1',// Integer raw — auto-scale (divider=100)
  onuDistance: '1.3.6.1.4.1.25355.3.3.1.1.1.9',  // Round-trip counter
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
  if (desc.includes('gpon') || desc.includes('3.3') || /\b(?:ha)?74\d\d/.test(desc)) return 'HIOSO_GPON';
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
): Array<{ board: number; pon: number; onuId: number; rawStatus: number }> {
  const onus: Array<{ board: number; pon: number; onuId: number; rawStatus: number }> = [];

  for (const [fullOid, rawValue] of Object.entries(walkResults)) {
    // Strip base OID prefix to get the index suffix
    const suffix = fullOid.startsWith(baseOid + '.')
      ? fullOid.slice(baseOid.length + 1)
      : fullOid.replace(/^.*?(\d+\.\d+\.\d+)$/, '$1');

    const parts = suffix.split('.').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) continue;

    const [board, pon, onuId] = parts;
    onus.push({ board, pon, onuId, rawStatus: parseEnumInt(rawValue) ?? 0 });
  }

  return onus;
}

/**
 * 1 is online on every family, and 3 too on the BDCOM clone. A set dying-gasp flag means the ONU lost
 * power; otherwise 2 is a lost optical link. The dying-gasp flag exists only on some firmware.
 */
export function hiosoStatus(rawStatus: number, dyingGasp: boolean, bdcom: boolean): 'online' | 'dying_gasp' | 'los' | 'offline' {
  if (rawStatus === 1 || (bdcom && rawStatus === 3)) return 'online';
  if (dyingGasp) return 'dying_gasp';
  return rawStatus === 2 ? 'los' : 'offline';
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
  webPort?: number | null;
}

async function tryWeb(credentials: OltCredentials | null | undefined): Promise<{ onus: HiosoWebOnu[]; system: HiosoSystemInfo | null } | null> {
  if (!credentials?.username) return null;
  try {
    return await readHiosoWeb({ host: credentials.host, port: credentials.webPort ?? 80, username: credentials.username, password: credentials.password });
  } catch (error: any) {
    console.warn(`[Hioso] web page not read for ${credentials.host}: ${error?.message ?? error}`);
    return null;
  }
}

/**
 * The OLT's web page when it answers, SNMP otherwise, in the order of the NMS that runs on this
 * hardware: the page lists every PON, which SNMP does not on firmware that merges them.
 */
export async function discoverONUsSNMP(
  config: SNMPConfig,
  model?: string | null,
  _telnet?: unknown,
  credentials?: OltCredentials | null,
): Promise<any[]> {
  const web = await tryWeb(credentials);
  if (web && web.onus.length > 0) return web.onus.map(fromWeb);
  return discoverViaSnmp(config, model);
}

export interface HiosoPollContext {
  /** Null when the OLT did not answer SNMP. */
  snmp: SNMPConfig | null;
  telnet: TelnetConfig | null;
  credentials: OltCredentials | null;
  model: string | null;
}

/**
 * The whole poll, as the NMS does it: Telnet for the ONU details and health, the web page for the
 * ONU list, then SNMP for whatever is still missing. The OLT counts as reachable when any of the
 * three answers, so a blocked SNMP community no longer makes a working OLT look offline.
 */
export async function pollDevice(context: HiosoPollContext) {
  const { snmp, telnet, credentials, model } = context;

  let cli: HiosoCliReport | null = null;
  if (telnet) {
    try {
      cli = await readHiosoCli(
        { host: telnet.host, port: telnet.port ?? 23, username: telnet.username, password: telnet.password },
        { model, maxPon: defaultPonCount('hioso', model) },
      );
    } catch (error: any) {
      console.warn(`[Hioso] Telnet not read for ${telnet.host}: ${error?.message ?? error}`);
    }
  }
  const web = await tryWeb(credentials);

  let onus: any[] = web?.onus.map(fromWeb) ?? [];
  if (onus.length === 0 && snmp) onus = await discoverViaSnmp(snmp, model);
  if (onus.length === 0 && cli) onus = cli.onus.map(fromCli);

  const [snmpTemperature, snmpCpu, snmpMemory] = snmp
    ? await Promise.all([
        cli?.temperature != null ? null : getTemperature(snmp),
        web?.system?.cpu != null || cli?.cpu != null ? null : getCpuUsage(snmp),
        web?.system?.memory != null || cli?.memory != null ? null : getMemoryUsage(snmp),
      ])
    : [null, null, null];

  return {
    reachable: cli !== null || web !== null,
    onus: fillFromCli(onus, cli?.onus ?? []),
    temperature: cli?.temperature ?? snmpTemperature,
    cpuUsage: web?.system?.cpu ?? cli?.cpu ?? snmpCpu,
    memoryUsage: web?.system?.memory ?? cli?.memory ?? snmpMemory,
    firmware: web?.system?.firmware ?? null,
    model: web?.system?.model ?? null,
  };
}

const cliType = (row: HiosoCliOnu) => formatHiosoOnuType(row.chip, { ge: row.ge, fe: row.fe, pots: row.pots });

function fromCli(row: HiosoCliOnu): any {
  return {
    frame:        1,
    slot:         row.pon,
    port:         row.pon,
    onuId:        row.onuId,
    serialNumber: row.mac,
    macAddress:   row.mac,
    description:  isUnsetOnuName(row.name) ? null : row.name,
    onuType:      cliType(row),
    status:       row.up ? 'online' : 'offline',
  };
}

/** The CLI fills the name and MAC that the other source left empty, never its status or power. Its port counts make the better type. */
export function fillFromCli(onus: any[], cli: HiosoCliOnu[]): any[] {
  if (cli.length === 0) return onus;
  const byPosition = new Map(cli.map((row) => [`${row.pon}:${row.onuId}`, fromCli(row)]));
  return onus.map((onu) => {
    const row = byPosition.get(`${onu.port}:${onu.onuId}`);
    if (!row) return onu;
    return {
      ...onu,
      description:  onu.description ?? row.description,
      macAddress:   onu.macAddress ?? row.macAddress,
      serialNumber: onu.serialNumber ?? row.serialNumber,
      onuType:      row.onuType ?? onu.onuType,
    };
  });
}

export interface HiosoAccess {
  host: string;
  username: string;
  password: string;
  webPort?: number | null;
  telnetPort?: number | null;
  telnetEnabled: boolean;
  model?: string | null;
}

/**
 * Sets an ONU's name: the web form first, then the CLI. The form answers the same whether or not it
 * took the name, so the page is read back. Null when it is set, else why not.
 */
export async function renameOnu(access: HiosoAccess, pon: number, onuId: number, rawName: string): Promise<string | null> {
  const name = cleanHiosoName(rawName);
  if (!name) return 'Nama hanya boleh huruf, angka, spasi, titik, garis bawah, dan tanda hubung';
  const base = hiosoPonBase(access.model);
  const web = { host: access.host, port: access.webPort ?? 80, username: access.username, password: access.password };

  try {
    await setHiosoWebName(web, `${base}/${pon}:${onuId}`, name);
    const { onus } = await readHiosoWeb(web);
    if (onus.find((onu) => onu.pon === pon && onu.onuId === onuId)?.name === name) return null;
  } catch (error: any) {
    console.warn(`[Hioso] web rename failed for ${access.host}: ${error?.message ?? error}`);
  }

  if (!access.telnetEnabled) return 'Halaman web OLT tidak menerima nama itu, dan Telnet tidak aktif';
  return runHiosoCommands(
    { host: access.host, port: access.telnetPort ?? 23, username: access.username, password: access.password },
    hiosoNameCommands(base, pon, onuId, name),
  );
}

/** Null when the OLT accepted the reset, else what it said. */
export function rebootOnu(access: HiosoAccess, pon: number, onuId: number): Promise<string | null> {
  return runHiosoCommands(
    { host: access.host, port: access.telnetPort ?? 23, username: access.username, password: access.password },
    hiosoRebootCommands(hiosoPonBase(access.model), pon, onuId),
  );
}

function fromWeb(onu: HiosoWebOnu): any {
  return {
    onuType:      formatHiosoOnuType(onu.chip, { total: onu.ports }),
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
  const isBdcom = oids === HIOSO_B_OIDS;

  // Walk ONU status OID to enumerate all ONUs
  const statusWalk = await walk(config, oids.onuStatus);
  if (!statusWalk.success || !statusWalk.results) return [];

  const baseOnus = parseOnuStatusWalk(statusWalk.results, oids.onuStatus, profile);
  if (baseOnus.length === 0) return [];

  // Walk serial numbers, names, power and (on EPON) the MAC and dying-gasp tables in parallel
  const none = Promise.resolve({ success: false } as { success: boolean; results?: Record<string, string> });
  const [snWalk, nameWalk, rxWalk, txWalk, distanceWalk, macWalk, dygWalk, chipWalk, portsWalk] = await Promise.all([
    walk(config, oids.onuSn),
    walk(config, oids.onuName),
    walk(config, oids.onuRxPower),
    walk(config, oids.onuTxPower),
    walk(config, oids.onuDistance),
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuMac) : none,
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuDyingGasp) : none,
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuChip) : none,
    isEpon ? walk(config, HIOSO_EPON_OIDS.onuPorts) : none,
  ]);

  const snMap    = snWalk.results    ?? {};
  const nameMap  = nameWalk.results  ?? {};
  const rxMap    = rxWalk.results    ?? {};
  const txMap    = txWalk.results    ?? {};
  const distanceMap = distanceWalk.results ?? {};
  const macMap   = macWalk.results   ?? {};
  const dygMap   = dygWalk.results   ?? {};
  const chipMap  = chipWalk.results  ?? {};
  const portsMap = portsWalk.results ?? {};

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
    const distanceRaw = distanceMap[`${oids.onuDistance}.${suffix}`] ?? findBySuffix(distanceMap, suffix);

    const status = hiosoStatus(onu.rawStatus, dygRaw != null && parseEnumInt(dygRaw) === 1, isBdcom);
    const online = status === 'online';

    // The MAC is the ONU's identity on EPON; the second column is the fallback.
    const mac = normalizeMac(snRaw) ?? normalizeMac(macRaw);
    // An unregistered slot shows up as a row with an all-zero MAC.
    if (isEpon && !online && mac === ZERO_MAC) continue;

    // Unset names arrive as zero-filled octet strings; "NA" is the OLT's own placeholder.
    const label = decodeSnmpText(namRaw);
    const description = isUnsetOnuName(label) ? null : label;

    const rxPower = online && rxRaw != null ? parsePower(rxRaw, profile, 'rx') : null;
    const txPower = online && txRaw != null ? parsePower(txRaw, profile, 'tx') : null;
    const usableMac = mac && mac !== ZERO_MAC ? mac : null;

    onus.push({
      frame:        Math.max(onu.board, 1),
      slot:         onu.pon,
      port:         onu.pon,    // PON port = slot for Hioso
      onuId:        onu.onuId,
      serialNumber: usableMac ?? ((snRaw ?? '').trim() || (macRaw ?? '').trim() || null),
      macAddress:   usableMac,
      onuType:      formatHiosoOnuType(decodeSnmpText(findBySuffix(chipMap, suffix)), { total: findBySuffix(portsMap, suffix) }),
      name:         description,
      description,
      status,
      rxPower,
      txPower,
      distance:     distanceFromRtt(distanceRaw),
      signalLevel:  signalLevel(rxPower),
    });
  }

  return onus;
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
    return rows.map(fromCli);
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
