/**
 * "Otomatis": works out the brand from the OLT itself, then uses that brand's reader.
 *
 * The answer is kept for an hour per OLT. Several reads start at once in a poll, so a
 * lookup in progress is shared instead of repeated.
 */
import { snmpGet, type SNMPConfig } from '../snmp';
import { detectVendor, PROBE_ORDER, type OltVendorKey } from '../detect';
import { getVendorModule } from './modules';

const TTL_MS = 60 * 60 * 1000;
const known = new Map<string, { vendor: OltVendorKey; at: number }>();
const pending = new Map<string, Promise<OltVendorKey>>();

const keyOf = (config: { host: string; port?: number }) => `${config.host}:${config.port ?? 161}`;

export async function identify(config: SNMPConfig): Promise<{ sysObjectId: string | null; sysDescr: string | null }> {
  const [objectId, descr] = await Promise.all([snmpGet(config, '1.3.6.1.2.1.1.2.0'), snmpGet(config, '1.3.6.1.2.1.1.1.0')]);
  return { sysObjectId: objectId.success ? (objectId.value ?? null) : null, sysDescr: descr.success ? (descr.value ?? null) : null };
}

async function lookup(config: SNMPConfig): Promise<OltVendorKey> {
  const detected = detectVendor(await identify(config));
  if (detected) return detected;

  // Nothing identifies it: the first brand whose tables answer with ONUs.
  for (const vendor of PROBE_ORDER) {
    const reader: any = getVendorModule(vendor);
    const onus = await reader.discoverONUsSNMP?.(config).catch(() => []);
    if (onus?.length > 0) return vendor;
  }
  return 'huawei';
}

export async function resolveVendor(config: SNMPConfig): Promise<OltVendorKey> {
  const key = keyOf(config);
  const cached = known.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.vendor;

  let running = pending.get(key);
  if (!running) {
    running = lookup(config)
      .then((vendor) => {
        known.set(key, { vendor, at: Date.now() });
        return vendor;
      })
      .finally(() => pending.delete(key));
    pending.set(key, running);
  }
  return running;
}

export function forgetVendor(config: { host: string; port?: number }): void {
  known.delete(keyOf(config));
}

/** For telnet/ssh steps that only know the host: the brand found over SNMP, else Huawei as before. */
function knownFor(host: string): OltVendorKey {
  for (const [key, entry] of known) if (key.startsWith(`${host}:`)) return entry.vendor;
  return 'huawei';
}

const readerFor = async (config: SNMPConfig): Promise<any> => getVendorModule(await resolveVendor(config));

export async function getTemperature(config: SNMPConfig) {
  return (await readerFor(config)).getTemperature(config);
}

export async function getCpuUsage(config: SNMPConfig) {
  return (await readerFor(config)).getCpuUsage(config);
}

export async function getMemoryUsage(config: SNMPConfig) {
  return (await readerFor(config)).getMemoryUsage(config);
}

export async function discoverONUsSNMP(config: SNMPConfig, firmwareVersion?: string | null, telnetConfig?: unknown): Promise<any[]> {
  const reader = await readerFor(config);
  return typeof reader.discoverONUsSNMP === 'function' ? reader.discoverONUsSNMP(config, firmwareVersion, telnetConfig) : [];
}

export async function discoverONUs(config: { host: string }): Promise<any[]> {
  return (getVendorModule(knownFor(config.host)) as any).discoverONUs(config);
}

export async function discoverONUsSSH(config: { host: string }): Promise<any[]> {
  return (getVendorModule(knownFor(config.host)) as any).discoverONUsSSH(config);
}

export async function getOnuOpticalInfo(config: { host: string }, ...rest: unknown[]): Promise<any> {
  const reader: any = getVendorModule(knownFor(config.host));
  return typeof reader.getOnuOpticalInfo === 'function' ? reader.getOnuOpticalInfo(config, ...rest) : null;
}
