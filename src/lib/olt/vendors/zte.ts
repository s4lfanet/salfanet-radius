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
): Promise<any[]> {
  const ponIndex = ponIndexV21(board, pon);
  const base = V21.base;

  // Walk zxAnGponOnuRegTable col 1 (registration status) for this PON port.
  // OID index format: .{col}.{ponIndex}.{onuSlot}.{onuId}
  // VERIFIED WORKING: 3.50.12.1.1.1.268501248.1.1 = INTEGER: 1 on ZTE C320 V2.1.0
  const regWalk = await snmpWalk(config, `${base}${V21.onuRegStatus}.${ponIndex}`);

  const onus: any[] = [];
  const registeredIds = new Set<number>();

  if (regWalk.success && regWalk.results) {
    for (const [oid, regVal] of Object.entries(regWalk.results)) {
      // OID ends in .{ponIndex}.{onuSlot}.{onuId}
      const parts = oid.split('.');
      const onuId   = parseInt(parts[parts.length - 1], 10);
      const onuSlot = parseInt(parts[parts.length - 2], 10);
      if (isNaN(onuId) || isNaN(onuSlot) || onuId <= 0 || onuId > 128) continue;
      if (parseInt(regVal) !== 1) continue; // skip non-registered ONUs
      registeredIds.add(onuId);

      // Fetch all ONU details in parallel for better performance
      const [operR, serialR, rxR, descR, distR] = await Promise.all([
        // reg table (indexed by .{col}.{ponIndex}.{onuSlot}.{onuId})
        snmpGet(config, `${base}${V21.onuOperState}.${ponIndex}.${onuSlot}.${onuId}`),
        // cfg table (indexed by .{col}.{ponIndex}.{onuId} — no onuSlot component)
        snmpGet(config, `${base}${V21.onuSerial}.${ponIndex}.${onuId}`),
        snmpGet(config, `${base}${V21.onuRxPower}.${ponIndex}.${onuSlot}.${onuId}`),
        snmpGet(config, `${base}${V21.onuDescription}.${ponIndex}.${onuId}`),
        snmpGet(config, `${base}${V21.onuDistance}.${ponIndex}.${onuSlot}.${onuId}`),
      ]);

      const operVal = operR.success && operR.value ? parseInt(operR.value) : 0;
      // ZTE C320 reg table col 6: 5=working/online, 1=init, 2=registered, 3=auth, 4=working(alt)
      const onuStatus = operVal === 5 || operVal === 4 ? 'online'
                      : operVal === 0                   ? 'unknown'
                      : 'offline';

      let rxPower: number | null = null;
      if (rxR.success && rxR.value) {
        const raw = parseInt(rxR.value);
        // Stored as positive integer in 0.001 dBm; negate to get actual received power in dBm.
        // Valid GPON RX range: -8 to -30 dBm → raw 8000–30000
        if (!isNaN(raw) && raw > 0 && raw < 50000) rxPower = -(raw / 1000);
      }

      let distance: number | null = null;
      if (distR.success && distR.value) {
        const d = parseInt(distR.value);
        // VERIFIED: 328m on test site; valid GPON range: 0–20km
        if (!isNaN(d) && d > 0 && d < 100000) distance = d;
      }

      onus.push({
        frame: 1, slot: board,
        // ZTE SNMP pon=1 maps to CLI/display port 0 (0-based).
        port: pon - 1,
        onuId,
        serialNumber: hexBytesToSerial(serialR.value ?? ''),
        macAddress: null,
        status: onuStatus,
        description: descR.success && descR.value ? descR.value.trim() : null,
        onuType: null,
        rxPower,
        distance,
      });
    }
  }

  // Discover unregistered ONUs via the seen-ONU table (zxAnGponOnuDiscoveredInfoTable).
  // This table contains ALL ONUs the OLT has seen, including unauthorized/unregistered ones.
  // Walk returns both registered (onuId=1) and unregistered (onuId=2) entries.
  const seenWalk = await snmpWalk(config, `${ZTE_V21_SEEN_ONU_TABLE}.${ponIndex}`);
  if (seenWalk.success && seenWalk.results) {
    const unregisteredIds: number[] = [];
    for (const oid of Object.keys(seenWalk.results)) {
      // OID format: {base}.{ponIndex}.{onuSlot}.{onuId} — last component is onuId
      const parts = oid.split('.');
      const onuId = parseInt(parts[parts.length - 1], 10);
      if (isNaN(onuId) || onuId <= 0 || onuId > 128) continue;
      if (registeredIds.has(onuId)) continue; // already discovered as registered
      unregisteredIds.push(onuId);
    }

    // Try to get serial numbers of unregistered ONUs via Telnet.
    // SNMP cfg table has no entry for unregistered ONUs so serial = null there.
    // ZTE C320 CLI: show pon onu uncfg gpon-olt_1/{board}/{pon}
    // Output: "gpon-onu_1/1/1:2  ZTEGDA5918AC  ..." or "  2  ZTEGDA5918AC"
    const uncfgSerials = new Map<number, string>();
    if (unregisteredIds.length > 0 && telnetConfig) {
      try {
        const telnetResult = await executeCommand(
          telnetConfig,
          `show pon onu uncfg gpon-olt_1/${board}/${pon}`,
        );
        if (telnetResult.success && telnetResult.output) {
          for (const line of telnetResult.output.split('\n')) {
            // Format A: "gpon-onu_1/1/1:2  ZTEGDA5918AC  ..."
            const mA = line.match(/gpon-onu_\d+\/\d+\/\d+:(\d+)\s+([A-Z0-9]{8,16})/i);
            if (mA) {
              uncfgSerials.set(parseInt(mA[1]), mA[2].toUpperCase());
              continue;
            }
            // Format B: "  2    ZTEGDA5918AC" (numeric ONU-ID followed by SN)
            const mB = line.match(/^\s*(\d{1,3})\s+([A-Z0-9]{8,16})\s/);
            if (mB) {
              const id = parseInt(mB[1]);
              if (id > 0 && id <= 128) uncfgSerials.set(id, mB[2].toUpperCase());
            }
          }
        }
      } catch { /* Telnet unavailable — continue without serial */ }
    }

    for (const onuId of unregisteredIds) {
      onus.push({
        frame: 1, slot: board, port: pon - 1, onuId,
        serialNumber: uncfgSerials.get(onuId) ?? null,
        macAddress: null,
        status: 'unregistered',
        description: null, onuType: null, rxPower: null, distance: null,
      });
    }
  }

  return onus;
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
    // V2.1: walk PON port table to discover actual port count dynamically
    const ponPorts = await discoverPONPortsV21(config);
    for (const { board, pon } of ponPorts) {
      try {
        const ponOnus = await discoverPonV21(config, board, pon, telnetConfig);
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
  const txMatch = output.match(/tx\s*power[^:]*:\s*([-\d.]+)/i);
  if (txMatch) info.txPower = parseFloat(txMatch[1]);
  const distMatch = output.match(/distance[^:]*:\s*(\d+)/i);
  if (distMatch) info.distance = parseInt(distMatch[1]);
  return info;
}

export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  // C320: 2 boards (GCOB cards), 8 GPON ports each
  for (let slot = 1; slot <= 2; slot++) {
    for (let port = 0; port <= 7; port++) {
      // Registered ONUs
      const r = await executeCommand(config, `show gpon onu state gpon-olt_1/${slot}/${port}`);
      if (r.success && r.output) {
        onus.push(...parseOnuInfo(r.output, 1, slot, port));
      }
      // Unregistered ONUs
      const u = await executeCommand(config, `show gpon onu uncfg gpon-olt_1/${slot}/${port}`);
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
      // Registered ONUs
      const r = await sshExecute(config, `show gpon onu state gpon-olt_1/${slot}/${port}`);
      if (r.success && r.output) {
        onus.push(...parseOnuInfo(r.output, 1, slot, port));
      }
      // Unregistered ONUs
      const u = await sshExecute(config, `show gpon onu uncfg gpon-olt_1/${slot}/${port}`);
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
  const result = await executeCommand(
    config, `show gpon onu detail-info gpon-olt_${frame}/${slot}/${port} ${onuId}`
  );
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getOnuOpticalInfoSSH(
  config: SSHConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await sshExecute(
    config, `show gpon onu detail-info gpon-olt_${frame}/${slot}/${port} ${onuId}`
  );
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getTrafficStats(config: SNMPConfig): Promise<{
  rxBytes?: bigint; txBytes?: bigint;
}> {
  return {};
}

