/**
 * BDCOM OLT SNMP/Telnet/SSH Integration
 */

import { SNMPConfig, snmpGet } from '../snmp';
import { TelnetConfig, executeCommand } from '../telnet';
import { SSHConfig, executeCommand as sshExecute } from '../ssh';

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, '1.3.6.1.4.1.3320.9.48.1.5.0');
  if (result.success && result.value) return parseFloat(result.value) / 10;
  return null;
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, '1.3.6.1.4.1.3320.9.48.1.1.0');
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, '1.3.6.1.4.1.3320.9.48.1.2.0');
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

function parseOnuInfo(output: string, frame: number, slot: number, port: number): any[] {
  const onus: any[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(online|offline|dying-gasp)/i);
    if (match) {
      const [, onuId, id, status] = match;
      onus.push({ frame, slot, port, onuId: parseInt(onuId), serialNumber: id.trim(), status: status.toLowerCase().replace('-', '_') });
    }
  }
  return onus;
}

export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let port = 0; port <= 7; port++) {
    const result = await executeCommand(config, `show interface gpon 0/${port} onu`);
    if (result.success && result.output) {
      onus.push(...parseOnuInfo(result.output, 0, 0, port));
    }
  }
  return onus;
}

export async function discoverONUsSSH(config: SSHConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let port = 0; port <= 7; port++) {
    const result = await sshExecute(config, `show interface gpon 0/${port} onu`);
    if (result.success && result.output) {
      onus.push(...parseOnuInfo(result.output, 0, 0, port));
    }
  }
  return onus;
}

export async function getOnuOpticalInfo(
  config: TelnetConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await executeCommand(config, `show interface gpon 0/${port} onu ${onuId} optical`);
  if (result.success && result.output) {
    const info: any = {};
    const rxMatch = result.output.match(/receive.*?power.*?:\s*([-\d.]+)/i);
    if (rxMatch) info.rxPower = parseFloat(rxMatch[1]);
    return info;
  }
  return null;
}

export async function getOnuOpticalInfoSSH(
  config: SSHConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await sshExecute(config, `show interface gpon 0/${port} onu ${onuId} optical`);
  if (result.success && result.output) {
    const info: any = {};
    const rxMatch = result.output.match(/receive.*?power.*?:\s*([-\d.]+)/i);
    if (rxMatch) info.rxPower = parseFloat(rxMatch[1]);
    return info;
  }
  return null;
}

export async function getTrafficStats(config: SNMPConfig): Promise<{ rxBytes?: bigint; txBytes?: bigint }> {
  return {};
}
