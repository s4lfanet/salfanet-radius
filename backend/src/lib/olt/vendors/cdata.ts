/**
 * C-Data OLT (FD11xx / FD16xx and relatives).
 *
 * C-Data publishes three MIB trees that firmware mixes freely: the NSCRTV standard
 * (17409), its own FD tree for EPON (34592.1.3) and its own GPON tree (34592.1.5).
 * This module used to be an alias for the Hioso reader. That still runs first, so an
 * OLT that was already being read keeps working; the C-Data trees are only tried when
 * Hioso finds nothing.
 */
import type { SNMPConfig } from '../snmp';
import { discoverFirstWorking, readScalar } from '../pon-snmp';
import { CDATA_PROFILES } from '../profiles';
import * as hioso from './hioso';

// Chassis values: the FD-SYSTEM-MIB object first, then the one in the operator's OID sheet.
const TEMPERATURE = ['1.3.6.1.4.1.34592.1.3.1.3.4', '1.3.6.1.4.1.34592.1.3.100.1.8.6'];
const CPU = ['1.3.6.1.4.1.34592.1.3.1.1.8', '1.3.6.1.4.1.34592.1.3.100.1.8.1'];

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, TEMPERATURE, [1, 120])) ?? hioso.getTemperature(config);
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, CPU, [0, 100])) ?? hioso.getCpuUsage(config);
}

export const getMemoryUsage = hioso.getMemoryUsage;

export async function discoverONUsSNMP(config: SNMPConfig, model?: string | null): Promise<any[]> {
  const legacy = await hioso.discoverONUsSNMP(config, model);
  if (legacy.length > 0) return legacy;
  return discoverFirstWorking(config, CDATA_PROFILES);
}

export async function getOnuOpticalInfo(): Promise<null> {
  return null;
}

export const discoverONUs = hioso.discoverONUs;
export const discoverONUsSSH = hioso.discoverONUsSSH;
