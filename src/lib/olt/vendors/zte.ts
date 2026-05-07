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
const V21 = {
  base: '1.3.6.1.4.1.3902.1012',
  onuName:     '.3.13.3.1.5',    // Device SN used as name (STRING)
  onuSerial:   '.3.13.3.1.2',    // Serial number (Hex-STRING bytes)
  onuModel:    '.3.13.3.1.10',   // ONU model string
  onuFirmware: '.3.13.3.1.11',   // Firmware version
  onuStatus:   '.3.31.4.1.100',  // Online status (INTEGER: 1=online)
  board1Base:  268500992,         // pon1 = 268501248
  board2Base:  268509184,         // pon1 = 268509440
  ponIncrement: 256,
};

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

// ── ZTE Performance OIDs (tried in order) ───────────────────────────────────
// C320 V2.1 board-level OIDs (instance = board base index, e.g. 268500992)
const C320_TEMP_V21     = '1.3.6.1.4.1.3902.1012.3.50.12.1.1.4';  // walk → first value
const C320_CPU_V21      = '1.3.6.1.4.1.3902.1012.3.50.11.1.1.4';  // walk → first value
const C320_MEM_V21      = '1.3.6.1.4.1.3902.1012.3.50.11.1.1.3';  // walk → first value
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

function hexBytesToSerial(val: string): string {
  if (!val) return val;
  if (/^[A-Z0-9]{4,}$/i.test(val)) return val;
  try {
    return val.split(/\s+/).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
  } catch { return val; }
}

// ── SNMP Performance Metrics ─────────────────────────────────────────────────

/** Walk a table OID and return the first numeric value found */
async function walkFirstNumber(config: SNMPConfig, baseOid: string): Promise<number | null> {
  const res = await snmpWalk(config, baseOid);
  if (res.success && res.results) {
    for (const val of Object.values(res.results)) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  // 1) C320 V2.1
  const t21 = await walkFirstNumber(config, C320_TEMP_V21);
  if (t21 !== null) return t21;
  // 2) C320 V2.2
  const t22 = await walkFirstNumber(config, C320_TEMP_V22);
  if (t22 !== null) return t22;
  // 3) C300/C600 generic
  const res = await snmpGet(config, ZTE_OIDS.temperature);
  if (res.success && res.value) return parseFloat(res.value);
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

// ── SNMP ONU Discovery — V2.1 ────────────────────────────────────────────────

async function discoverPonV21(config: SNMPConfig, board: number, pon: number): Promise<any[]> {
  const ponIndex = ponIndexV21(board, pon);
  const base = V21.base;

  const nameWalk = await snmpWalk(config, `${base}${V21.onuName}.${ponIndex}`);
  if (!nameWalk.success || !nameWalk.results) return [];

  const onus: any[] = [];
  for (const [oid, nameVal] of Object.entries(nameWalk.results)) {
    const onuId = extractLastId(oid);
    if (onuId === null || onuId <= 0 || onuId > 128) continue;

    const statusR = await snmpGet(config, `${base}${V21.onuStatus}.${ponIndex}.${onuId}`);
    const typeR   = await snmpGet(config, `${base}${V21.onuModel}.${ponIndex}.${onuId}`);
    const serialR = await snmpGet(config, `${base}${V21.onuSerial}.${ponIndex}.${onuId}`);

    const statusVal = statusR.success && statusR.value ? parseInt(statusR.value) : 0;

    onus.push({
      frame: 1, slot: board, port: pon, onuId,
      serialNumber: hexBytesToSerial(serialR.value ?? nameVal ?? ''),
      macAddress: null,
      status: statusVal === 1 ? 'online' : 'offline',
      onuType: typeR.value ?? null,
      rxPower: null,
    });
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
 * C320 has 2 GCOB boards, each with 8 GPON ports.
 */
export async function discoverONUsSNMP(
  config: SNMPConfig,
  firmwareVersion?: string | null
): Promise<any[]> {
  const useV22 = isV22(firmwareVersion);
  const onus: any[] = [];

  for (let board = 1; board <= 2; board++) {
    for (let pon = 1; pon <= 8; pon++) {
      try {
        const ponOnus = useV22
          ? await discoverPonV22(config, board, pon)
          : await discoverPonV21(config, board, pon);
        onus.push(...ponOnus);
      } catch { /* empty/unprovisioned PON — skip */ }
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

