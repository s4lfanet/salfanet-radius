/**
 * Huawei OLT SNMP/Telnet/SSH Integration
 * Supports: MA5608T, MA5680T, MA5683T, MA5800 series
 */

import { SNMPConfig, snmpGet, snmpWalk } from '../snmp';
import { TelnetConfig, executeCommand } from '../telnet';
import { SSHConfig, executeCommand as sshExecute } from '../ssh';

const HUAWEI_OIDS = {
  temperature:   '1.3.6.1.4.1.2011.6.3.3.2.1.6',
  onuAuthStatus: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
  onuRunStatus:  '1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15',
  onuRxPower:    '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.6',
  onuTxPower:    '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.5',
  onuTemperature:'1.3.6.1.4.1.2011.6.128.1.1.2.51.1.1',
  onuVoltage:    '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.3',
  onuDistance:   '1.3.6.1.4.1.2011.6.128.1.1.2.53.1.1',
  cpuUsage:      '1.3.6.1.4.1.2011.6.3.5.1.1.2',
  memoryUsage:   '1.3.6.1.4.1.2011.6.3.5.1.1.3',
};

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, HUAWEI_OIDS.temperature);
  if (result.success && result.value) return parseFloat(result.value) / 1000;
  return null;
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, `${HUAWEI_OIDS.cpuUsage}.0`);
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  const result = await snmpGet(config, `${HUAWEI_OIDS.memoryUsage}.0`);
  if (result.success && result.value) return parseInt(result.value);
  return null;
}

function parseOnuInfo(output: string, frame: number, slot: number, port: number): any[] {
  const onus: any[] = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(online|offline|dying-gasp)/i);
    if (match) {
      const [, onuId, serialNumber, status] = match;
      onus.push({
        frame, slot, port,
        onuId: parseInt(onuId),
        serialNumber: serialNumber.trim(),
        status: status.toLowerCase().replace('-', '_'),
      });
    }
  }
  return onus;
}

function parseOpticalInfo(output: string): any {
  const info: any = {};
  const rxMatch = output.match(/Rx optical power.*?:\s*([-\d.]+)/i);
  if (rxMatch) info.rxPower = parseFloat(rxMatch[1]);
  const txMatch = output.match(/Tx optical power.*?:\s*([-\d.]+)/i);
  if (txMatch) info.txPower = parseFloat(txMatch[1]);
  const tempMatch = output.match(/Temperature.*?:\s*([\d.]+)/i);
  if (tempMatch) info.temperature = parseFloat(tempMatch[1]);
  const voltMatch = output.match(/Voltage.*?:\s*([\d.]+)/i);
  if (voltMatch) info.voltage = parseFloat(voltMatch[1]);
  const distMatch = output.match(/Distance.*?:\s*(\d+)/i);
  if (distMatch) info.distance = parseInt(distMatch[1]);
  return info;
}

export async function discoverONUs(config: TelnetConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let slot = 0; slot <= 1; slot++) {
    for (let port = 0; port <= 15; port++) {
      const result = await executeCommand(config, `display ont info 0/${slot}/${port} all`);
      if (result.success && result.output) {
        onus.push(...parseOnuInfo(result.output, 0, slot, port));
      }
    }
  }
  return onus;
}

export async function discoverONUsSSH(config: SSHConfig): Promise<any[]> {
  const onus: any[] = [];
  for (let slot = 0; slot <= 1; slot++) {
    for (let port = 0; port <= 15; port++) {
      const result = await sshExecute(config, `display ont info 0/${slot}/${port} all`);
      if (result.success && result.output) {
        onus.push(...parseOnuInfo(result.output, 0, slot, port));
      }
    }
  }
  return onus;
}

export async function getOnuOpticalInfo(
  config: TelnetConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await executeCommand(config, `display ont optical-info ${frame}/${slot}/${port} ${onuId}`);
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getOnuOpticalInfoSSH(
  config: SSHConfig, frame: number, slot: number, port: number, onuId: number
): Promise<any> {
  const result = await sshExecute(config, `display ont optical-info ${frame}/${slot}/${port} ${onuId}`);
  if (result.success && result.output) return parseOpticalInfo(result.output);
  return null;
}

export async function getTrafficStats(config: SNMPConfig): Promise<{
  rxBytes?: bigint; txBytes?: bigint; rxErrors?: bigint; txErrors?: bigint;
}> {
  const ifIndex = '1'; // port index — adapt as needed
  const [rxResult, txResult] = await Promise.all([
    snmpGet(config, `1.3.6.1.2.1.2.2.1.10.${ifIndex}`), // ifInOctets
    snmpGet(config, `1.3.6.1.2.1.2.2.1.16.${ifIndex}`), // ifOutOctets
  ]);
  return {
    rxBytes: rxResult.success && rxResult.value ? BigInt(rxResult.value) : undefined,
    txBytes: txResult.success && txResult.value ? BigInt(txResult.value) : undefined,
  };
}
