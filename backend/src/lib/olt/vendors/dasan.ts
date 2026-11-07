/**
 * Dasan / DZS OLT, read over SNMP from the table in the operator's NMS. No chassis values and no
 * CLI reader are known for this brand.
 */
import type { SNMPConfig } from '../snmp';
import { discoverFirstWorking } from '../pon-snmp';
import { DASAN_NMS } from '../profiles';

export async function getTemperature(): Promise<number | null> {
  return null;
}

export async function getCpuUsage(): Promise<number | null> {
  return null;
}

export async function getMemoryUsage(): Promise<number | null> {
  return null;
}

export async function discoverONUsSNMP(config: SNMPConfig): Promise<any[]> {
  return discoverFirstWorking(config, [DASAN_NMS]);
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
