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
import { TelnetConfig, executeCommand } from '../telnet';

// ─── OID Definitions ─────────────────────────────────────────────────────────

// Shared across HIOSO_C, HIOSO_B2, HIOSO_VX (all use .25355.3.2.6)
const HIOSO_EPON_OIDS = {
  // Per-ONU fields (index format: board.pon.onu_id)
  onuName:      '1.3.6.1.4.1.25355.3.2.6.3.2.1.37', // String, custom name or "NA"
  onuSn:        '1.3.6.1.4.1.25355.3.2.6.3.2.1.11', // Hex serial number
  onuMac:       '1.3.6.1.4.1.25355.3.2.6.3.2.1.12', // MAC address (alt SN candidate)
  onuStatus:    '1.3.6.1.4.1.25355.3.2.6.3.2.1.39', // 1=online, 2=offline
  onuDistance:  '1.3.6.1.4.1.25355.3.2.6.3.2.1.25', // Integer, meters
  // Optical readings (index format: board.pon.onu_id)
  onuTxPower:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.4', // Float string dBm (already in dBm, divider=1)
  onuRxPower:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.8', // Float string dBm (already in dBm, divider=1)
  onuOptTemp:   '1.3.6.1.4.1.25355.3.2.6.14.2.1.7', // Integer, °C
};

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

type HiosoProfile = 'HIOSO_C' | 'HIOSO_B2' | 'HIOSO_VX' | 'HIOSO_B' | 'HIOSO_GPON';

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
function parsePower(rawValue: string, profile: HiosoProfile): number | null {
  const num = parseFloat(rawValue);
  if (isNaN(num)) return null;

  if (profile === 'HIOSO_C' || profile === 'HIOSO_B2' || profile === 'HIOSO_VX') {
    // Already in dBm — just round to 2 dp
    return Math.round(num * 100) / 100;
  }

  // Auto-scale by magnitude (HIOSO_B, HIOSO_GPON)
  const abs = Math.abs(num);
  if (abs > 500) return Math.round(num / 100 * 100) / 100; // e.g. -1227 → -12.27
  if (abs > 50)  return Math.round(num / 10  * 100) / 100; // e.g. -122  → -12.20
  return Math.round(num * 100) / 100;                       // e.g. -12   → -12.00
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
  profile: HiosoProfile,
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
  // Try EPON optical temperature for first ONU on board 1, PON 1, ONU 1
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
export async function discoverONUsSNMP(
  config: SNMPConfig,
  model?: string | null,
): Promise<any[]> {
  // First get sysDescr to detect profile
  const descResult = await snmpGet(config, STD_OIDS.sysDescr);
  const sysDescr = descResult.success ? (descResult.value ?? '') : '';
  const profile = detectProfile(sysDescr, model);
  const oids = getProfileOids(profile);

  // Walk ONU status OID to enumerate all ONUs
  const statusWalk = await snmpWalk(config, oids.onuStatus);
  if (!statusWalk.success || !statusWalk.results) return [];

  const baseOnus = parseOnuStatusWalk(statusWalk.results, oids.onuStatus, profile);
  if (baseOnus.length === 0) return [];

  // Walk serial numbers and names in parallel
  const [snWalk, nameWalk, rxWalk, txWalk] = await Promise.all([
    snmpWalk(config, oids.onuSn),
    snmpWalk(config, oids.onuName),
    snmpWalk(config, oids.onuRxPower),
    snmpWalk(config, oids.onuTxPower),
  ]);

  const snMap    = snWalk.results    ?? {};
  const nameMap  = nameWalk.results  ?? {};
  const rxMap    = rxWalk.results    ?? {};
  const txMap    = txWalk.results    ?? {};

  const onus: any[] = [];

  for (const onu of baseOnus) {
    const suffix = `${onu.board}.${onu.pon}.${onu.onuId}`;

    // Find matching SN — try both full OID and suffix match
    const snRaw  = snMap[`${oids.onuSn}.${suffix}`]    ?? findBySuffix(snMap, suffix);
    const namRaw = nameMap[`${oids.onuName}.${suffix}`] ?? findBySuffix(nameMap, suffix);
    const rxRaw  = rxMap[`${oids.onuRxPower}.${suffix}`]  ?? findBySuffix(rxMap, suffix);
    const txRaw  = txMap[`${oids.onuTxPower}.${suffix}`]  ?? findBySuffix(txMap, suffix);

    const rxPower = rxRaw != null ? parsePower(rxRaw, profile) : null;
    const txPower = txRaw != null ? parsePower(txRaw, profile) : null;

    onus.push({
      frame:        onu.board,
      slot:         onu.pon,
      port:         onu.pon,    // PON port = slot for Hioso
      onuId:        onu.onuId,
      serialNumber: snRaw  ? snRaw.trim()  : null,
      name:         namRaw ? namRaw.trim() : null,
      status:       onu.status,
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

function parseOnuTelnet(output: string, board: number, pon: number): any[] {
  const onus: any[] = [];
  for (const line of output.split('\n')) {
    // Hioso Telnet format: "  1   CDATA123456   online   -18.50  ..."
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(online|offline|dying.gasp)/i);
    if (m) {
      const [, onuId, sn, status] = m;
      onus.push({
        frame:        board,
        slot:         pon,
        port:         pon,
        onuId:        parseInt(onuId),
        serialNumber: sn.trim(),
        status:       status.toLowerCase().replace(/[-_]gasp/, '_gasp'),
      });
    }
  }
  return onus;
}

/**
 * Discover ONUs via Telnet — used as fallback when SNMP is insufficient
 * (e.g. HIOSO_C PON3/PON4 which are merged in SNMP).
 */
export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let pon = 1; pon <= 4; pon++) {
    const result = await executeCommand(config, `show epon onu state pon ${pon}`);
    if (result.success && result.output) {
      onus.push(...parseOnuTelnet(result.output, 1, pon));
    }
  }
  return onus;
}

// Telnet SSH stub — Hioso uses Telnet CLI, no SSH in practice
export async function discoverONUsSSH(config: any): Promise<any[]> {
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
