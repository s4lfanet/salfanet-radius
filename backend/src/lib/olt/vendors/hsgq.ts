/**
 * HSGQ OLT (EPON/GPON).
 *
 * HSGQ SNMP is the least documented of the common brands, and nobody who wrote about it had an
 * offline ONU to compare against. Two table schemes exist and three sources disagree on which
 * column holds the link state. So each candidate column is tried, and the one whose online count
 * matches the OLT's own per-PON counters is used. If nothing matches, the closest one is used and
 * a warning is logged.
 *
 * The system subtrees next to the CPU and memory scalars hold credentials that a read community
 * can fetch, so those two values are read with an exact GET and nothing there is ever walked.
 */
import { snmpWalk, type SNMPConfig } from '../snmp';
import { discoverByProfile, parseEnumInt, readScalar, suffixOf, type Walk } from '../pon-snmp';
import { HSGQ_CPU, HSGQ_MEMORY, HSGQ_PON_ONLINE, HSGQ_PROFILES } from '../profiles';
import * as hioso from './hioso';

// No chassis temperature is documented for HSGQ.
export async function getTemperature(): Promise<number | null> {
  return null;
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, [HSGQ_CPU], [0, 100])) ?? hioso.getCpuUsage(config);
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, [HSGQ_MEMORY], [0, 100])) ?? hioso.getMemoryUsage(config);
}

/** ONUs the OLT says are online, summed over its PON ports. Null when it gives no counters. */
async function ponOnlineTotal(config: SNMPConfig, walkFn: Walk): Promise<number | null> {
  const walk = await walkFn(config, HSGQ_PON_ONLINE);
  if (!walk.success || !walk.results) return null;
  const counts = Object.entries(walk.results)
    .filter(([oid]) => suffixOf(oid, HSGQ_PON_ONLINE))
    .map(([, value]) => parseEnumInt(value))
    .filter((n): n is number => n !== null && n >= 0);
  return counts.length > 0 ? counts.reduce((sum, n) => sum + n, 0) : null;
}

export async function discoverONUsSNMP(config: SNMPConfig, _firmware?: string | null, _telnet?: unknown, walkFn: Walk = snmpWalk): Promise<any[]> {
  const stats: Array<{ index: number; rows: number; online: number }> = [];
  for (const [index, profile] of HSGQ_PROFILES.entries()) {
    const walk = await walkFn(config, profile.columns.status);
    const values = Object.entries(walk.success ? (walk.results ?? {}) : {})
      .filter(([oid]) => suffixOf(oid, profile.columns.status))
      .map(([, value]) => parseEnumInt(value));
    stats.push({ index, rows: values.length, online: values.filter((v) => v !== null && profile.online.includes(v)).length });
  }

  const candidates = stats.filter((s) => s.rows > 0);
  if (candidates.length === 0) return [];

  let chosen = candidates[0];
  const expected = await ponOnlineTotal(config, walkFn);
  if (expected !== null) {
    chosen = candidates.reduce((best, s) => (Math.abs(s.online - expected) < Math.abs(best.online - expected) ? s : best), candidates[0]);
    if (chosen.online !== expected) {
      console.warn(`[HSGQ] ${config.host}: no status column matches the OLT's online count (${expected}); using ${HSGQ_PROFILES[chosen.index].id} with ${chosen.online}`);
    }
  } else {
    console.warn(`[HSGQ] ${config.host}: the OLT gave no per-PON counters, so the status column could not be checked`);
  }
  return discoverByProfile(config, HSGQ_PROFILES[chosen.index], walkFn);
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
