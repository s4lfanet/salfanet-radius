/**
 * V-SOL OLT (V1600D and relatives).
 *
 * The V1600D MIB keeps the ONU list (auth table, one row per ONU) and the optical
 * readings (diag table, indexed PON.ONU) in different tables, so they are joined on
 * PON and ONU number. Newer models reported under 37950.1.1.6 use the generic reader.
 */
import { snmpWalk, type SNMPConfig } from '../snmp';
import { discoverFirstWorking, normalizeMac, parsePowerDbm, readScalar, suffixOf, type DiscoveredOnu, type Walk } from '../pon-snmp';
import { VSOL_G, VSOL_NMS, VSOL_V1600D } from '../profiles';
import * as hioso from './hioso';

// Chassis values as listed in the Observium V-SOL ticket; units are not documented, so ranges are checked.
const TEMPERATURE = ['1.3.6.1.4.1.37950.1.1.5.10.12.5.9'];
const CPU = ['1.3.6.1.4.1.37950.1.1.5.10.12.3'];
const MEMORY = ['1.3.6.1.4.1.37950.1.1.5.10.12.4'];

export async function getTemperature(config: SNMPConfig): Promise<number | null> {
  return readScalar(config, TEMPERATURE, [1, 120]);
}

export async function getCpuUsage(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, CPU, [0, 100])) ?? hioso.getCpuUsage(config);
}

export async function getMemoryUsage(config: SNMPConfig): Promise<number | null> {
  return (await readScalar(config, MEMORY, [0, 100])) ?? hioso.getMemoryUsage(config);
}

function column(result: Awaited<ReturnType<Walk>>, base: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const [oid, value] of Object.entries(result.results ?? {})) {
    const suffix = suffixOf(oid, base);
    if (suffix) rows.set(suffix, value);
  }
  return rows;
}

/** Joins the V1600D auth table with its diag table. Exported for tests. */
export async function discoverV1600D(config: SNMPConfig, walk: Walk = snmpWalk): Promise<DiscoveredOnu[]> {
  const auth = (n: number) => `${VSOL_V1600D.auth}.${n}`;
  const diag = (n: number) => `${VSOL_V1600D.diag}.${n}`;

  const status = column(await walk(config, auth(5)), auth(5));
  if (status.size === 0) return [];

  const [pon, onu, mac, name, rx, tx] = await Promise.all([
    walk(config, auth(2)),
    walk(config, auth(3)),
    walk(config, auth(6)),
    walk(config, auth(10)),
    walk(config, diag(7)),
    walk(config, diag(6)),
  ]);
  const ponOf = column(pon, auth(2));
  const onuOf = column(onu, auth(3));
  const macOf = column(mac, auth(6));
  const nameOf = column(name, auth(10));
  const rxOf = column(rx, diag(7));
  const txOf = column(tx, diag(6));

  const onus: DiscoveredOnu[] = [];
  for (const [index, rawStatus] of status) {
    const port = Number(ponOf.get(index));
    const onuId = Number(onuOf.get(index));
    if (!Number.isInteger(port) || !Number.isInteger(onuId)) continue;

    const online = Number(rawStatus) === 1;
    const key = `${port}.${onuId}`;
    const description = (nameOf.get(index) ?? '').trim();
    const macAddress = normalizeMac(macOf.get(index));
    const rxPower = online ? parsePowerDbm(rxOf.get(key), 'auto') : null;
    onus.push({
      frame: 0,
      slot: 0,
      port,
      onuId,
      status: online ? 'online' : 'offline',
      description: description || null,
      serialNumber: macAddress,
      macAddress,
      rxPower,
      rxSource: rxPower !== null ? 'onu' : null,
      txPower: online ? parsePowerDbm(txOf.get(key), 'auto') : null,
      distance: null,
      profile: 'vsol-v1600d',
    });
  }
  return onus;
}

export async function discoverONUsSNMP(config: SNMPConfig): Promise<any[]> {
  const epon = await discoverV1600D(config);
  if (epon.length > 0) return epon;
  return discoverFirstWorking(config, [VSOL_G, VSOL_NMS]);
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
