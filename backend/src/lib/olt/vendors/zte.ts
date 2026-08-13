/**
 * ZTE OLT SNMP/Telnet/SSH Integration
 * Supports: C320 (V2.1 + V2.2 firmware), C300, C600 series
 *
 * ZTE C320 V2.1: base OID 1.3.6.1.4.1.3902.1012
 * ZTE C320 V2.2: base OID 1.3.6.1.4.1.3902.1082
 *
 * Reference: github.com/s4lfanet/go-api-c320
 */

import { SNMPConfig, snmpGet, snmpWalk } from '../snmp';
import { TelnetConfig, executeCommand } from '../telnet';
import { SSHConfig, executeCommand as sshExecute } from '../ssh';

// ── ZTE C320 V2.1.0 OID Profile (base: 1.3.6.1.4.1.3902.1012) ──────────────
// OIDs verified against real ZTE C320 V2.1.0 via live SNMP walk.
// Uses zxAnGponOnuCfgTable (3.28.1.1) and zxAnGponOnuRegTable (3.50.12.1.1).
const V21 = {
  base: '1.3.6.1.4.1.3902.1012',
  // zxAnGponOnuCfgTable (3.28.1.1) — indexed by .{col}.{ponIndex}.{onuId}
  // VERIFIED WORKING on ZTE C320 V2.1.0 via live SNMP walk
  onuDescription: '.3.28.1.1.2',    // ONU name/description string (e.g. "test-customer")
  onuSerial:      '.3.28.1.1.5',    // Serial (Hex-STRING: 8 bytes = 4 ASCII vendor + 4 hex id)
  // zxAnGponOnuRegTable (3.50.12.1.1) — indexed by .{col}.{ponIndex}.{onuSlot}.{onuId}
  // VERIFIED WORKING on ZTE C320 V2.1.0 via live SNMP walk
  onuRegStatus: '.3.50.12.1.1.1',   // Registration status: 1=registered/active
  onuOperState: '.3.50.12.1.1.6',   // Oper state: 5=working/online, others=offline
  onuRxPower:   '.3.50.12.1.1.10',  // ONU RX power (raw positive int, dBm = -(raw/1000))
  onuDistance:  '.3.50.12.1.1.21',  // ONU distance from OLT in meters (VERIFIED: 328m on test site)
  board1Base:  268500992,            // pon1 index = board1Base + 1*256 = 268501248
  board2Base:  268509184,            // pon1 index = board2Base + 1*256 = 268509440
  ponIncrement: 256,
};
// Seen-ONU table: zxAnGponOnuDiscoveredInfoTable (3.27.4.1.1)
// Contains ALL ONUs seen on a PON port including unregistered ones.
// Indexed by .{ponIndex}.{onuSlot}.{onuId} — only col 1 accessible.
// VERIFIED: returns INTEGER: 2 for both registered (onuId=1) and unregistered (onuId=2).
const ZTE_V21_SEEN_ONU_TABLE = '1.3.6.1.4.1.3902.1012.3.27.4.1.1';

// ── ZTE C320 V2.2+ OID Profile (base: 1.3.6.1.4.1.3902.1082) ───────────────
const V22 = {
  base: '1.3.6.1.4.1.3902.1082',
  onuName:    '.500.10.2.3.3.1.2',  // ONU name
  onuSerial:  '.500.10.2.3.3.1.18', // Serial number
  onuStatus:  '.500.10.2.3.8.1.4',  // Online status (1=online)
  onuRxPower: '.500.20.2.2.2.1.10', // RX Power (×0.01 dBm), suffix .{x}.{id}.1
  onuModel:   '.3.50.11.2.1.17',    // ONU model (uses typeSuffix)
  board1IdBase:   285278464,   board2IdBase:   285278720,
  board1TypeBase: 268500992,   board2TypeBase: 268566528,
  idIncrement: 1,              typeIncrement: 256,
};

// ── PON Port Discovery Table (V2.1) ─────────────────────────────────────────
// Walking this OID returns one entry per provisioned PON port (indexed by ponIndex).
// Allows dynamic port count discovery instead of hardcoding 2 boards × 8 ports.
const ZTE_V21_PON_TABLE = '1.3.6.1.4.1.3902.1012.3.11.3.1.1';

// ── ZTE Performance OIDs (tried in order) ───────────────────────────────────
// C320 V2.1: temperature/CPU/memory not accessible via SNMP community "public".
// All known OIDs return "No Such Object" on ZTE C320 V2.1.0 firmware.
// getTemperature/getCpuUsage/getMemoryUsage will return null → UI shows N/A.
const C320_TEMP_V21     = '1.3.6.1.4.1.3902.1012.3.36.1.1.4';  // board temp table (likely unavailable)
const C320_CPU_V21      = '1.3.6.1.4.1.3902.1012.3.38.1.1.4';  // board CPU table (likely unavailable)
const C320_MEM_V21      = '1.3.6.1.4.1.3902.1012.3.38.1.1.3';  // board memory table (likely unavailable)
// C320 V2.2 board OIDs
const C320_TEMP_V22     = '1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.4';
const C320_CPU_V22      = '1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.2';
const C320_MEM_V22      = '1.3.6.1.4.1.3902.1082.500.20.2.1.2.1.3';
// Generic ZTE C300/C600 fallback
const ZTE_OIDS = {
  temperature: '1.3.6.1.4.1.3902.1015.1015.6.1.3.1.2.0',
  cpuUsage:    '1.3.6.1.4.1.3902.1015.1015.6.1.1.1.5.0',
  memoryUsage: '1.3.6.1.4.1.3902.1015.1015.6.1.1.1.6.0',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isV22(fw?: string | null): boolean {
  return !!fw && /v?2\.2/i.test(fw);
}

function ponIndexV21(board: number, pon: number): number {
  return (board === 1 ? V21.board1Base : V21.board2Base) + pon * V21.ponIncrement;
}

function ponSuffixV22(board: number, pon: number): { idSuffix: number; typeSuffix: number } {
  return {
    idSuffix:   (board === 1 ? V22.board1IdBase   : V22.board2IdBase)   + pon * V22.idIncrement,
    typeSuffix: (board === 1 ? V22.board1TypeBase  : V22.board2TypeBase) + pon * V22.typeIncrement,
  };
}

function extractLastId(oid: string): number | null {
  const parts = oid.split('.');
  const n = parseInt(parts[parts.length - 1], 10);
  return isNaN(n) ? null : n;
}

/**
 * Convert ZTE ONU serial from raw SNMP value to printable form.
 * ZTE GPON serial format: 8 bytes where first 4 are ASCII vendor code
 * (e.g. "ZTEG", "HWTC", "FHTT") and last 4 are hex serial digits.
 * Input: "5A 54 45 47 DA 59 18 AC"  Output: "ZTEGDA5918AC"
 */
function hexBytesToSerial(val: string): string {
  if (!val) return '';
  // Already a clean serial string (4 ASCII + 8 hex, no spaces)
  if (/^[A-Z]{4}[0-9A-F]{8}$/i.test(val)) return val.toUpperCase();
  // Space-separated hex bytes (8 bytes = ZTE format)
  const parts = val.trim().split(/\s+/);
  if (parts.length === 8 && parts.every(p => /^[0-9A-Fa-f]{2}$/.test(p))) {
    try {
      const prefix = parts.slice(0, 4).map(h => String.fromCharCode(parseInt(h, 16))).join('');
      // Verify prefix is printable ASCII letters/digits
      if (/^[A-Za-z0-9]{4}$/.test(prefix)) {
        const suffix = parts.slice(4).map(h => h.toUpperCase()).join('');
        return (prefix + suffix).toUpperCase();
      }
    } catch { /* fall through */ }
  }
  // Other hex-string: convert all bytes to ASCII
  if (parts.length >= 4 && parts.every(p => /^[0-9A-Fa-f]{1,2}$/.test(p))) {
    try {
      return parts.map(h => String.fromCharCode(parseInt(h, 16))).join('');
    } catch { /* fall through */ }
  }
  return val;
}

function normalizeSerialNumber(val: string | null | undefined): string | null {
  const serial = (val ?? '').trim().toUpperCase();
  if (!serial || serial === 'N/A' || serial === 'NA' || serial === 'NULL' || serial === 'NONE') return null;
  if (!/^[A-Z0-9_-]{4,32}$/.test(serial)) return null;
  return serial;
}

function parseSerialFromDetail(output: string): string | null {
  const match = output.match(/Serial\s+number\s*:\s*([A-Z0-9_-]+)/i);
  return normalizeSerialNumber(match?.[1]);
}

// ── SNMP Performance Metrics ─────────────────────────────────────────────────

/** Walk a table OID and return the first numeric value found, optionally filtered */
async function walkFirstNumber(
  config: SNMPConfig,
  baseOid: string,
  isValid?: (n: number) => boolean
): Promise<number | null> {
  const res = await snmpWalk(config, baseOid);
  if (res.success && res.results) {
    for (const val of Object.values(res.results)) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0 && (!isValid || isValid(n))) return n;
    }
  }
  return null;
}

// Temperatures must be in plausible range for network equipment (10–85°C)
const isValidTemp = (n: number) => n >= 10 && n <= 85;

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  // 1) C320 V2.1
  const t21 = await walkFirstNumber(config, C320_TEMP_V21, isValidTemp);
  if (t21 !== null) return t21;
  // 2) C320 V2.2
  const t22 = await walkFirstNumber(config, C320_TEMP_V22, isValidTemp);
  if (t22 !== null) return t22;
  // 3) C300/C600 generic
  const res = await snmpGet(config, ZTE_OIDS.temperature);
  if (res.success && res.value) {
    const n = parseFloat(res.value);
    if (isValidTemp(n)) return n;
  }
  return null;
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  const c21 = await walkFirstNumber(config, C320_CPU_V21);
  if (c21 !== null) return c21;
  const c22 = await walkFirstNumber(config, C320_CPU_V22);
  if (c22 !== null) return c22;
  const res = await snmpGet(config, ZTE_OIDS.cpuUsage);
  if (res.success && res.value) return parseInt(res.value);
  return null;
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  const m21 = await walkFirstNumber(config, C320_MEM_V21);
  if (m21 !== null) return m21;
  const m22 = await walkFirstNumber(config, C320_MEM_V22);
  if (m22 !== null) return m22;
  const res = await snmpGet(config, ZTE_OIDS.memoryUsage);
  if (res.success && res.value) return parseInt(res.value);
  return null;
}

// ── Telnet-based System Metrics (best-effort) ─────────────────────────────────
// ZTE C320 V2.1 does NOT expose CPU/memory/temp via Telnet CLI either
// (confirmed by oltc320_v2.1.1_linux CHANGELOG: "Removed unsupported monitoring").
// This function tries common ZTE CLI commands and parses what is available.
// On C320 V2.1 these will all return null; newer models (C600/C300) may respond.
export async function getSystemMetricsTelnet(
  telnetConfig: TelnetConfig
): Promise<{ temperature: number | null; cpuUsage: number | null; memoryUsage: number | null }> {
  const result = { temperature: null as number | null, cpuUsage: null as number | null, memoryUsage: null as number | null };
  try {
    // Try "show card" — some ZTE models show board temp here
    const cardResult = await executeCommand(telnetConfig, 'show card');
    if (cardResult.success && cardResult.output) {
      const tempMatch = cardResult.output.match(/temp(?:erature)?\s*[:\s]+(\d+)/i);
      if (tempMatch) {
        const t = parseInt(tempMatch[1]);
        if (t >= 10 && t <= 85) result.temperature = t;
      }
      const cpuMatch = cardResult.output.match(/cpu\s*(?:usage|utilization)?\s*[:\s]+(\d+)/i);
      if (cpuMatch) {
        const c = parseInt(cpuMatch[1]);
        if (c >= 0 && c <= 100) result.cpuUsage = c;
      }
      const memMatch = cardResult.output.match(/mem(?:ory)?\s*(?:usage|util)?\s*[:\s]+(\d+)/i);
      if (memMatch) {
        const m = parseInt(memMatch[1]);
        if (m >= 0 && m <= 100) result.memoryUsage = m;
      }
    }
    // Try "show environment" as fallback for temperature
    if (result.temperature === null) {
      const envResult = await executeCommand(telnetConfig, 'show environment');
      if (envResult.success && envResult.output) {
        const tempMatch = envResult.output.match(/temp(?:erature)?\s*[:\s]+(\d+)/i);
        if (tempMatch) {
          const t = parseInt(tempMatch[1]);
          if (t >= 10 && t <= 85) result.temperature = t;
        }
      }
    }
  } catch {
    // Silently ignore — Telnet may not be configured or supported
  }
  return result;
}

// ── Dynamic PON Port Discovery (V2.1) ───────────────────────────────────────

/**
 * Walk the ZTE C320 V2.1 PON port table to discover all provisioned PON ports.
 * Converts each ponIndex back to (board, pon) using the V21 base constants.
 * Falls back to the traditional 2 boards × 8 ports if the walk fails.
 */
async function discoverPONPortsV21(config: SNMPConfig): Promise<Array<{board: number, pon: number}>> {
  const res = await snmpWalk(config, ZTE_V21_PON_TABLE);

  const seenPonIndexes = new Set<number>();
  if (res.success && res.results && Object.keys(res.results).length > 0) {
    // ponIndexes are very large numbers (> 268 million) — scan all OID components
    // to handle any MIB column layout (e.g. .col.ponIndex or .ponIndex directly)
    for (const oid of Object.keys(res.results)) {
      for (const part of oid.split('.')) {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n > 268000000) seenPonIndexes.add(n);
      }
    }
  }

  const ports: Array<{board: number, pon: number}> = [];
  const maxPonsPerBoard = 128; // safety cap

  for (const ponIndex of seenPonIndexes) {
    if (ponIndex > V21.board1Base && ponIndex < V21.board1Base + maxPonsPerBoard * V21.ponIncrement) {
      const pon = (ponIndex - V21.board1Base) / V21.ponIncrement;
      if (Number.isInteger(pon) && pon >= 1) ports.push({ board: 1, pon });
    } else if (ponIndex > V21.board2Base && ponIndex < V21.board2Base + maxPonsPerBoard * V21.ponIncrement) {
      const pon = (ponIndex - V21.board2Base) / V21.ponIncrement;
      if (Number.isInteger(pon) && pon >= 1) ports.push({ board: 2, pon });
    }
  }

  if (ports.length > 0) {
    return ports.sort((a, b) => a.board !== b.board ? a.board - b.board : a.pon - b.pon);
  }

  // Fallback: traditional 2 boards × 8 ports
  const fallback: Array<{board: number, pon: number}> = [];
  for (let b = 1; b <= 2; b++) for (let p = 1; p <= 8; p++) fallback.push({ board: b, pon: p });
  return fallback;
}

// ── SNMP ONU Discovery — V2.1 ────────────────────────────────────────────────

async function discoverPonV21(
  config: SNMPConfig,
  board: number,
  pon: number,
  telnetConfig?: TelnetConfig | null,
  globalUncfgMap?: Map<string, Array<{ serial: string; onuId?: number }>> | null,
): Promise<any[]> {
  const ponIndex = ponIndexV21(board, pon);
  const base = V21.base;

  // Walk ALL OID subtrees for this PON port in PARALLEL (7 concurrent SNMP walks).
  // This replaces N_onu × 5 sequential snmpGet calls with a single bulk walk pass.
  const [regWalk, operWalk, serialWalk, rxWalk, descWalk, distWalk, seenWalk] = await Promise.all([
    snmpWalk(config, `${base}${V21.onuRegStatus}.${ponIndex}`),    // reg status  (.ponIndex.slot.onuId)
    snmpWalk(config, `${base}${V21.onuOperState}.${ponIndex}`),    // oper state  (.ponIndex.slot.onuId)
    snmpWalk(config, `${base}${V21.onuSerial}.${ponIndex}`),       // serial      (.ponIndex.onuId)
    snmpWalk(config, `${base}${V21.onuRxPower}.${ponIndex}`),      // rx power    (.ponIndex.slot.onuId)
    snmpWalk(config, `${base}${V21.onuDescription}.${ponIndex}`),  // description (.ponIndex.onuId)
    snmpWalk(config, `${base}${V21.onuDistance}.${ponIndex}`),     // distance    (.ponIndex.slot.onuId)
    snmpWalk(config, `${ZTE_V21_SEEN_ONU_TABLE}.${ponIndex}`),     // seen/uncfg  (.ponIndex.slot.onuId)
  ]);

  // Build O(1) lookup maps keyed by "onuSlot.onuId" (3-component OIDs) or "onuId" (2-component OIDs)
  const lastTwoKey   = (oid: string) => oid.split('.').slice(-2).join('.');  // slot.onuId
  const lastOneKey   = (oid: string) => oid.split('.').slice(-1)[0];         // onuId

  const operMap   = new Map<string, string>();
  const rxMap     = new Map<string, string>();
  const distMap   = new Map<string, string>();
  const serialMap = new Map<string, string>();
  const descMap   = new Map<string, string>();

  if (operWalk.success && operWalk.results)   for (const [k,v] of Object.entries(operWalk.results))   operMap.set(lastTwoKey(k), v);
  if (rxWalk.success && rxWalk.results)       for (const [k,v] of Object.entries(rxWalk.results))     rxMap.set(lastTwoKey(k), v);
  if (distWalk.success && distWalk.results)   for (const [k,v] of Object.entries(distWalk.results))   distMap.set(lastTwoKey(k), v);
  if (serialWalk.success && serialWalk.results) for (const [k,v] of Object.entries(serialWalk.results)) serialMap.set(lastOneKey(k), v);
  if (descWalk.success && descWalk.results)   for (const [k,v] of Object.entries(descWalk.results))   descMap.set(lastOneKey(k), v);

  const onus: any[] = [];
  const registeredIds = new Set<number>();

  if (regWalk.success && regWalk.results) {
    for (const [oid, regVal] of Object.entries(regWalk.results)) {
      const parts = oid.split('.');
      const onuId   = parseInt(parts[parts.length - 1], 10);
      const onuSlot = parseInt(parts[parts.length - 2], 10);
      if (isNaN(onuId) || isNaN(onuSlot) || onuId <= 0 || onuId > 128) continue;
      if (parseInt(regVal) !== 1) continue; // skip non-registered ONUs
      registeredIds.add(onuId);

      const slotIdKey = `${onuSlot}.${onuId}`;
      const idKey     = `${onuId}`;

      // Oper state
      const operVal = parseInt(operMap.get(slotIdKey) ?? '0', 10);
      const onuStatus = operVal === 5 || operVal === 4 ? 'online'
                      : operVal === 0                   ? 'unknown'
                      : 'offline';

      // Rx Power
      let rxPower: number | null = null;
      const rxRaw = parseInt(rxMap.get(slotIdKey) ?? '0', 10);
      if (!isNaN(rxRaw) && rxRaw > 0 && rxRaw < 50000) rxPower = -(rxRaw / 1000);

      // Distance
      let distance: number | null = null;
      const distRaw = parseInt(distMap.get(slotIdKey) ?? '0', 10);
      if (!isNaN(distRaw) && distRaw > 0 && distRaw < 100000) distance = distRaw;

      // Serial (hex bytes → ASCII). If SNMP hex can't be parsed, leave null.
      // Do NOT fallback to per-ONU Telnet `show gpon onu detail-info` during polling —
      // that would spawn N concurrent Telnet sessions (one per ONU with bad serial),
      // which saturates the OLT's concurrent session limit and is the root cause of
      // slow polling. Serial can be null; DB still tracks ONU status via onuId.
      const serialNumber = normalizeSerialNumber(hexBytesToSerial(serialMap.get(idKey) ?? ''));

      onus.push({
        frame: 1, slot: board,
        port: pon - 1,
        onuId,
        serialNumber,
        macAddress: null,
        status: onuStatus,
        description: descMap.get(idKey)?.trim() ?? null,
        onuType: null,
        rxPower,
        distance,
      });
    }
  }

  // Discover unregistered ONUs from seenWalk (already fetched above in parallel)
  const unregisteredIds: number[] = [];
  if (seenWalk.success && seenWalk.results) {
    for (const oid of Object.keys(seenWalk.results)) {
      const parts = oid.split('.');
      const onuId = parseInt(parts[parts.length - 1], 10);
      if (isNaN(onuId) || onuId <= 0 || onuId > 128) continue;
      if (registeredIds.has(onuId)) continue;
      unregisteredIds.push(onuId);
    }
  }

  const uncfgSerials = new Map<number, string>();
  const existingSerials = new Set<string>();
  const displayPort = pon - 1; // DB/display port is 0-based
  const cliPon = pon;          // ZTE C320 CLI PON port is 1-based
  const portKey = `${board}/${displayPort}`;
  let hadTelnetData = false;   // true if Telnet was available and returned results

  const addSerial = (serial: string, fallbackIndex: number, preferredId?: number) => {
    const normalizedSerial = serial.toUpperCase();
    if (existingSerials.has(normalizedSerial)) return;

    let id = preferredId && preferredId > 0 && !registeredIds.has(preferredId)
      ? preferredId
      : buildVirtualUncfgOnuId(normalizedSerial, fallbackIndex);
    while (uncfgSerials.has(id) || registeredIds.has(id)) id++;

    uncfgSerials.set(id, normalizedSerial);
    existingSerials.add(normalizedSerial);
  };

  // Method 1: pre-fetched global CLI output (fastest, one Telnet session for all ports)
  // When globalUncfgMap is present (even with 0 entries for this port), Telnet was available.
  // Trust Telnet as authoritative for unregistered ONU serials.
  if (globalUncfgMap !== null && globalUncfgMap !== undefined) {
    hadTelnetData = true; // global Telnet call succeeded (map built)
    if (globalUncfgMap.has(portKey)) {
      const entries = globalUncfgMap.get(portKey)!;
      entries.forEach((entry, index) => addSerial(entry.serial, index, entry.onuId));
    }
  } else if (telnetConfig) {
    // Method 2: per-port CLI fallback (when global map unavailable)
    try {
      const result = await executeCommand(telnetConfig, `show gpon onu uncfg gpon-olt_1/${board}/${cliPon}`);
      if (result.success && result.output) {
        hadTelnetData = true;
        const serialList: string[] = [];
        for (const line of result.output.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || /OnuIndex|OnuType|^-/.test(trimmed)) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length < 2) continue;

          const onuMatch = parts[0].match(/gpon-onu_\d+\/\d+\/\d+:(\d+)/i);
          if (onuMatch) {
            const id = parseInt(onuMatch[1], 10);
            const sn = parts.length >= 4 ? parts[2] : parts[1];
            if (sn && sn !== 'N/A' && /^[A-Z0-9]{8,16}$/i.test(sn)) addSerial(sn, serialList.length, id);
            continue;
          }

          if (/gpon[_-]olt/i.test(parts[0]) && parts.length >= 3) {
            const sn = parts[2];
            if (sn && sn !== 'N/A' && /^[A-Z0-9]{8,16}$/i.test(sn)) serialList.push(sn);
          }
        }

        serialList.forEach((serial, index) => addSerial(serial, index));
      }
    } catch { /* Telnet unavailable */ }
  }

  // SNMP seenWalk fallback: only use when Telnet was completely unavailable.
  // The OLT's seen table can contain stale entries (ONUs previously connected),
  // so if Telnet data is present (authoritative), we must NOT add ghost entries
  // from the seen table — doing so creates phantom "N/A" unregistered ONUs.
  if (!hadTelnetData) {
    for (const id of unregisteredIds) {
      if (!uncfgSerials.has(id)) uncfgSerials.set(id, '');
    }
  }

  for (const [onuId, serialNumber] of uncfgSerials) {
    onus.push({
      frame: 1, slot: board, port: pon - 1, onuId,
      serialNumber: serialNumber || null,
      macAddress: null,
      status: 'unregistered',
      description: null, onuType: null, rxPower: null, distance: null,
    });
  }

  return onus;
}

function buildVirtualUncfgOnuId(serial: string, fallbackIndex: number): number {
  let hash = 0;
  for (const ch of serial.toUpperCase()) {
    hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  }
  return 1000 + ((hash + fallbackIndex) % 1000000);
}

function mergePonPortsFromUncfgMap(
  ports: Array<{ board: number; pon: number }>,
  globalUncfgMap: Map<string, Array<{ serial: string; onuId?: number }>> | null,
): Array<{ board: number; pon: number }> {
  if (!globalUncfgMap || globalUncfgMap.size === 0) return ports;

  const seen = new Set(ports.map(({ board, pon }) => `${board}/${pon}`));
  for (const key of globalUncfgMap.keys()) {
    const [boardText, displayPortText] = key.split('/');
    const board = parseInt(boardText, 10);
    const displayPort = parseInt(displayPortText, 10);
    if (!Number.isInteger(board) || !Number.isInteger(displayPort)) continue;

    const pon = displayPort + 1;
    const ponKey = `${board}/${pon}`;
    if (seen.has(ponKey)) continue;

    ports.push({ board, pon });
    seen.add(ponKey);
  }

  return ports.sort((a, b) => a.board !== b.board ? a.board - b.board : a.pon - b.pon);
}

// ── SNMP ONU Discovery — V2.2 ────────────────────────────────────────────────

async function discoverPonV22(config: SNMPConfig, board: number, pon: number): Promise<any[]> {
  const { idSuffix, typeSuffix } = ponSuffixV22(board, pon);
  const base = V22.base;

  const nameWalk = await snmpWalk(config, `${base}${V22.onuName}.${idSuffix}`);
  if (!nameWalk.success || !nameWalk.results) return [];

  const onus: any[] = [];
  for (const [oid, nameVal] of Object.entries(nameWalk.results)) {
    const onuId = extractLastId(oid);
    if (onuId === null || onuId <= 0 || onuId > 128) continue;

    const statusR = await snmpGet(config, `${base}${V22.onuStatus}.${idSuffix}.${onuId}`);
    const serialR = await snmpGet(config, `${base}${V22.onuSerial}.${idSuffix}.${onuId}`);
    const typeR   = await snmpGet(config, `${base}${V22.onuModel}.${typeSuffix}.${onuId}`);
    const rxR     = await snmpGet(config, `${base}${V22.onuRxPower}.${idSuffix}.${onuId}.1`);

    const statusVal = statusR.success && statusR.value ? parseInt(statusR.value) : 0;
    let rxPower: number | null = null;
    if (rxR.success && rxR.value) {
      const raw = parseInt(rxR.value);
      if (!isNaN(raw) && raw !== 0) rxPower = raw * 0.01;
    }

    onus.push({
      frame: 1, slot: board, port: pon, onuId,
      serialNumber: serialR.value ?? nameVal ?? '',
      macAddress: null,
      status: statusVal === 1 ? 'online' : 'offline',
      onuType: typeR.value ?? null,
      rxPower,
    });
  }
  return onus;
}

// ── Public: SNMP-based ONU Discovery ─────────────────────────────────────────

/**
 * Discover all ONUs via SNMP — primary method for ZTE C320.
 * Supports V2.1.0 (base 1012) and V2.2+ (base 1082).
 * For V2.1: dynamically discovers PON ports from the PON table (supports 8, 16, or more ports).
 * For V2.2: falls back to scanning 2 boards × 8 ports.
 */
export async function discoverONUsSNMP(
  config: SNMPConfig,
  firmwareVersion?: string | null,
  telnetConfig?: TelnetConfig | null,
): Promise<any[]> {
  const useV22 = isV22(firmwareVersion);
  const onus: any[] = [];

  if (!useV22) {
    // Pre-fetch ALL unregistered ONU serials via ONE global Telnet call.
    // "show pon onu uncfg" output format:
    //   OnuIndex                       OnuType     OnuSn           State
    //   gpon-olt_1/1/1                 N/A         ZTEGDA5918AC    unknown
    let globalUncfgMap: Map<string, Array<{ serial: string; onuId?: number }>> | null = null;
    if (telnetConfig) {
      try {
        // ZTE C320 V2.1 uses "show gpon onu uncfg".
        // Output format: "gpon-onu_F/S/P:ID  SN  State"
        // (3 columns: OnuIndex Sn State — SN is at index 1, NOT 2)
        const result = await executeCommand(telnetConfig, 'show gpon onu uncfg');
        if (result.success && result.output) {
          globalUncfgMap = new Map();
          for (const line of result.output.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || /OnuIndex|OnuType|^-/.test(trimmed)) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
              // Matches both:
              //   "gpon-onu_1/1/1:2" (V2.1 show gpon onu uncfg)
              //   "gpon-olt_1/1/1"   (older per-port format)
              const portMatch = parts[0].match(/gpon[_-](?:olt|onu)[_-](\d+)\/(\d+)\/(\d+)(?::(\d+))?/i);
              if (portMatch) {
                const b = parseInt(portMatch[2]);
                const cliPort = parseInt(portMatch[3]);
                const displayPort = cliPort > 0 ? cliPort - 1 : cliPort;
                const onuId = portMatch[4] ? parseInt(portMatch[4], 10) : undefined;
                // gpon-onu_ format: "Index  SN  State" → SN at parts[1]
                // gpon-olt_ format: "Index  Type  SN  State" → SN at parts[2]
                const isOnuFmt = /gpon[_-]onu[_-]/i.test(parts[0]);
                const sn = isOnuFmt ? parts[1] : parts[2];
                if (sn && sn !== 'N/A' && /^[A-Z0-9]{8,16}$/i.test(sn)) {
                  const key = `${b}/${displayPort}`;
                  if (!globalUncfgMap.has(key)) globalUncfgMap.set(key, []);
                  globalUncfgMap.get(key)!.push({ serial: sn.toUpperCase(), onuId });
                }
              }
            }
          }
        }
      } catch { /* Telnet unavailable — global map stays null, per-port fallback used */ }
    }

    // V2.1: walk PON port table to discover actual port count dynamically
    const ponPorts = mergePonPortsFromUncfgMap(await discoverPONPortsV21(config), globalUncfgMap);
    for (const { board, pon } of ponPorts) {
      try {
        const ponOnus = await discoverPonV21(config, board, pon, telnetConfig, globalUncfgMap);
        onus.push(...ponOnus);
      } catch { /* empty/unprovisioned PON — skip */ }
    }
  } else {
    // V2.2: scan 2 boards × 8 ports (V2.2 port table OID not yet mapped)
    for (let board = 1; board <= 2; board++) {
      for (let pon = 1; pon <= 8; pon++) {
        try {
          const ponOnus = await discoverPonV22(config, board, pon);
          onus.push(...ponOnus);
        } catch { /* empty/unprovisioned PON — skip */ }
      }
    }
  }
  return onus;
}

// ── Telnet/SSH ONU Discovery (fallback) ──────────────────────────────────────

function parseOnuInfo(output: string, frame: number, slot: number, port: number): any[] {
  const onus: any[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+([0-9a-fA-F]{4,})\s+(online|offline|dying-gasp|dyinggasp)/i);
    if (match) {
      const [, onuId, serial, status] = match;
      onus.push({
        frame, slot, port,
        onuId: parseInt(onuId),
        serialNumber: serial.trim(),
        macAddress: null,
        status: status.toLowerCase().replace('-', '_'),
        rxPower: null,
      });
      continue;
    }

    // ZTE C320 V2.1 state output has no serial:
    //   1/1/1:1 enable enable working 1(GPON)
    const stateMatch = line.match(/^\s*\d+\/\d+\/\d+:(\d+)\s+\S+\s+\S+\s+(working|online|los|offline|dying-gasp|dyinggasp)/i);
    if (stateMatch) {
      const [, onuId, status] = stateMatch;
      onus.push({
        frame, slot, port,
        onuId: parseInt(onuId, 10),
        serialNumber: null,
        macAddress: null,
        status: /working|online/i.test(status) ? 'online' : status.toLowerCase().replace('-', '_'),
        rxPower: null,
      });
    }
  }
  return onus;
}

/** Parse output of `show gpon onu uncfg gpon-olt_x/y/z` */
function parseUncfgOnuInfo(output: string, frame: number, slot: number, port: number): any[] {
  const onus: any[] = [];
  const lines = output.split('\n');
  let onuIdCounter = 0;
  for (const line of lines) {
    // ZTE: "  SN: ZTEG12345678" or "  SN:ZTEG12345678"
    const snMatch = line.match(/SN:\s*([0-9A-Za-z]{8,})/i);
    if (snMatch) {
      onuIdCounter++;
      onus.push({
        frame, slot, port,
        onuId: 200 + onuIdCounter,  // virtual ID for unregistered (>128 to separate from registered)
        serialNumber: snMatch[1].trim(),
        macAddress: null,
        status: 'unregistered',
        rxPower: null,
      });
    }
  }
  return onus;
}

function parseOpticalInfo(output: string): any {
  const info: any = {};
  const rxMatch = output.match(/rx\s*power[^:]*:\s*([-\d.]+)/i);
  if (rxMatch) info.rxPower = parseFloat(rxMatch[1]);
  const rxTableMatch = output.match(/gpon-onu_\d+\/\d+\/\d+:\d+\s+([-\d.]+)\s*\(?dbm\)?/i);
  if (!info.rxPower && rxTableMatch) info.rxPower = parseFloat(rxTableMatch[1]);
  const txMatch = output.match(/tx\s*power[^:]*:\s*([-\d.]+)/i);
  if (txMatch) info.txPower = parseFloat(txMatch[1]);
  const distMatch = output.match(/distance[^:]*:\s*(\d+)/i);
  if (distMatch) info.distance = parseInt(distMatch[1]);
  const serial = parseSerialFromDetail(output);
  if (serial) info.serialNumber = serial;
  return info;
}

export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  // C320: 2 boards (GCOB cards), 8 GPON ports each
  for (let slot = 1; slot <= 2; slot++) {
    for (let port = 0; port <= 7; port++) {
      const cliPon = port + 1;
      // Registered ONUs
      const r = await executeCommand(config, `show gpon onu state gpon-olt_1/${slot}/${cliPon}`);
      if (r.success && r.output) {
        onus.push(...parseOnuInfo(r.output, 1, slot, port));
      }
      // Unregistered ONUs
      const u = await executeCommand(config, `show pon onu uncfg gpon-olt_1/${slot}/${cliPon}`);
      if (u.success && u.output) {
        onus.push(...parseUncfgOnuInfo(u.output, 1, slot, port));
      }
    }
  }
  return onus;
}

export async function discoverONUsSSH(config: SSHConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let slot = 1; slot <= 2; slot++) {
    for (let port = 0; port <= 7; port++) {
      const cliPon = port + 1;
      // Registered ONUs
      const r = await sshExecute(config, `show gpon onu state gpon-olt_1/${slot}/${cliPon}`);
      if (r.success && r.output) {
        onus.push(...parseOnuInfo(r.output, 1, slot, port));
      }
      // Unregistered ONUs
      const u = await sshExecute(config, `show pon onu uncfg gpon-olt_1/${slot}/${cliPon}`);
      if (u.success && u.output) {
        onus.push(...parseUncfgOnuInfo(u.output, 1, slot, port));
      }
    }
  }
  return onus;
}

export async function getOnuOpticalInfo(
  config: TelnetConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const iface = `gpon-onu_${frame}/${slot}/${port + 1}:${onuId}`;
  const [detail, power] = await Promise.all([
    executeCommand(config, `show gpon onu detail-info ${iface}`),
    executeCommand(config, `show pon power onu-rx ${iface}`),
  ]);
  const output = `${detail.output ?? ''}\n${power.output ?? ''}`;
  return output.trim() ? parseOpticalInfo(output) : null;
}

export async function getOnuOpticalInfoSSH(
  config: SSHConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const iface = `gpon-onu_${frame}/${slot}/${port + 1}:${onuId}`;
  const result = await sshExecute(
    config, `show gpon onu detail-info ${iface}`
  );
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getTrafficStats(config: SNMPConfig): Promise<{
  rxBytes?: bigint; txBytes?: bigint;
}> {
  return {};
}

