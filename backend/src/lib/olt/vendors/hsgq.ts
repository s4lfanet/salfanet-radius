/**
 * HSGQ OLT (EPON/GPON).
 *
 * HSGQ SNMP is the least documented of the common brands. The OIDs come from the
 * OLT_MGMT open source project; other community tools skip SNMP and read the OLT's web
 * API instead, which suggests some models or firmware expose little over SNMP. If ONUs
 * do not show up, "Uji koneksi" on the OLT shows what was found.
 */
import type { SNMPConfig } from '../snmp';
import { discoverFirstWorking } from '../pon-snmp';
import { HSGQ_PROFILES } from '../profiles';
import * as hioso from './hioso';

// No chassis temperature is documented for HSGQ; CPU and memory use the standard host MIB.
export async function getTemperature(): Promise<number | null> {
  return null;
}

export const getCpuUsage = hioso.getCpuUsage;
export const getMemoryUsage = hioso.getMemoryUsage;

export async function discoverONUsSNMP(config: SNMPConfig): Promise<any[]> {
  return discoverFirstWorking(config, HSGQ_PROFILES);
}

export async function getOnuOpticalInfo(): Promise<null> {
  return null;
}

export async function discoverONUs(): Promise<any[]> {
  return [];
}

export async function discoverONUsSSH(): Promise<any[]> {
  return [];
}
