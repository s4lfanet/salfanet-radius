/**
 * ZTE OLT SNMP/Telnet/SSH Integration
 * Supports: C300, C320, C600 series
 */

import { SNMPConfig, snmpGet, snmpWalk } from '../snmp';
import { TelnetConfig, executeCommand } from '../telnet';
import { SSHConfig, executeCommand as sshExecute } from '../ssh';

const ZTE_OIDS = {
  temperature:    '1.3.6.1.4.1.3902.1015.1015.6.1.3.1.2',
  cpuUsage:       '1.3.6.1.4.1.3902.1015.1015.6.1.1.1.5',
  memoryUsage:    '1.3.6.1.4.1.3902.1015.1015.6.1.1.1.6',
  onuOperStatus:  '1.3.6.1.4.1.3902.1082.500.10.2.2.2.1.1',
  onuRxPower:     '1.3.6.1.4.1.3902.1082.500.10.2.2.2.1.15',
};

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, `${ZTE_OIDS.temperature}.0`);
  if (result.success && result.value) return parseFloat(result.value);
  return null;
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, `${ZTE_OIDS.cpuUsage}.0`);
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, `${ZTE_OIDS.memoryUsage}.0`);
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

function parseOnuInfo(output: string, frame: number, slot: number, port: number): any[] {
  const onus: any[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+([0-9a-fA-F:]+)\s+(online|offline|dying-gasp)/i);
    if (match) {
      const [, onuId, mac, status] = match;
      onus.push({
        frame, slot, port,
        onuId: parseInt(onuId),
        macAddress: mac.trim(),
        status: status.toLowerCase().replace('-', '_'),
      });
    }
  }
  return onus;
}

function parseOpticalInfo(output: string): any {
  const info: any = {};
  const rxMatch = output.match(/rx\s+power[^:]*:\s*([-\d.]+)/i);
  if (rxMatch) info.rxPower = parseFloat(rxMatch[1]);
  const txMatch = output.match(/tx\s+power[^:]*:\s*([-\d.]+)/i);
  if (txMatch) info.txPower = parseFloat(txMatch[1]);
  return info;
}

export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let slot = 1; slot <= 4; slot++) {
    for (let port = 1; port <= 8; port++) {
      const result = await executeCommand(config, `show gpon onu state gpon-olt_1/${slot}/${port}`);
      if (result.success && result.output) {
        onus.push(...parseOnuInfo(result.output, 1, slot, port));
      }
    }
  }
  return onus;
}

export async function discoverONUsSSH(config: SSHConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let slot = 1; slot <= 4; slot++) {
    for (let port = 1; port <= 8; port++) {
      const result = await sshExecute(config, `show gpon onu state gpon-olt_1/${slot}/${port}`);
      if (result.success && result.output) {
        onus.push(...parseOnuInfo(result.output, 1, slot, port));
      }
    }
  }
  return onus;
}

export async function getOnuOpticalInfo(
  config: TelnetConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await executeCommand(config, `show gpon onu detail-info gpon-olt_${frame}/${slot}/${port} ${onuId}`);
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getOnuOpticalInfoSSH(
  config: SSHConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await sshExecute(config, `show gpon onu detail-info gpon-olt_${frame}/${slot}/${port} ${onuId}`);
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getTrafficStats(config: SNMPConfig): Promise<{
  rxBytes?: bigint; txBytes?: bigint;
}> {
  return {};
}
