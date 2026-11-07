/**
 * Hioso EPON OLT through its own web interface (GoAhead), read-only.
 *
 * The page /onuAllPonOnuList.asp lists every ONU of every PON in one request, with name, MAC,
 * link state, firmware, chip, ports, round-trip time, Tx and Rx power, the reason it went offline
 * and a dying-gasp flag. A working NMS uses it as its main source on HA7304 and HA7304C. SNMP on
 * some firmware merges PON ports (HA7304V: PON 2 to 4), which this page does not.
 *
 * The page defines a JavaScript array of single-quoted strings, 22 per ONU. Basic authentication
 * with the OLT's own login is sent on every request; the first request to "/" opens the session.
 * /system.asp gives the model, firmware and CPU and memory load the same way.
 */
import { normalizeMac, parsePowerDbm, parseRxDbm } from './pon-snmp';
import { isUnsetOnuName } from './hioso-telnet';

export interface HiosoWebConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  timeoutMs?: number;
}

export interface HiosoWebOnu {
  pon: number;
  onuId: number;
  name: string | null;
  mac: string | null;
  up: boolean;
  chip: string | null;
  ports: string | null;
  rxPower: number | null;
  txPower: number | null;
  distance: number | null;
  status: 'online' | 'offline' | 'dying_gasp' | 'los';
}

export interface HiosoSystemInfo {
  model: string | null;
  firmware: string | null;
  cpu: number | null;
  memory: number | null;
}

const FIELDS_PER_ONU = 22;

/**
 * The OLT's own page converts the round-trip counter to metres like this. It is the formula of
 * the firmware's JavaScript as copied by a working NMS; compare one ONU with the OLT's page.
 */
export function distanceFromRtt(raw: string | null | undefined): number | null {
  const rtt = parseFloat(String(raw ?? '').trim().split(/\s+/)[0]);
  if (!Number.isFinite(rtt) || rtt <= 0) return null;
  let metres = rtt * 1.6393 - 157;
  metres = metres > 157 ? metres - 157 : 1;
  return Math.max(1, Math.round(metres));
}

/** Parses the `var onutable = new Array('...', ...)` block of /onuAllPonOnuList.asp. */
export function parseOnuTable(html: string): HiosoWebOnu[] {
  const block = html.match(/var\s+onutable\s*=\s*new\s+Array\(([\s\S]*?)\)\s*;/);
  if (!block) return [];

  const items = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  const onus: HiosoWebOnu[] = [];
  for (let i = 0; i + FIELDS_PER_ONU <= items.length; i += FIELDS_PER_ONU) {
    const r = items.slice(i, i + FIELDS_PER_ONU);
    // r: 0 id "0/1:1", 1 name, 2 MAC, 3 Up/Down, 10 RTT, 14 Tx, 15 Rx, 18 offline reason, 21 dying gasp
    const id = r[0].trim().match(/^(\d+)\/(\d+):(\d+)$/);
    if (!id) continue;

    const up = r[3].trim().toLowerCase() === 'up';
    const mac = normalizeMac(r[2]);
    // An unregistered slot is listed with an all-zero MAC.
    if (!up && mac === '00:00:00:00:00:00') continue;

    const name = r[1].trim();
    const status = up ? 'online' : r[21].trim() === '1' ? 'dying_gasp' : ['0', '1'].includes(r[18].trim()) ? 'los' : 'offline';
    onus.push({
      pon: Number(id[2]),
      onuId: Number(id[3]),
      name: isUnsetOnuName(name) ? null : name,
      mac: mac && mac !== '00:00:00:00:00:00' ? mac : null,
      up,
      chip: r[5].trim() || null,
      ports: r[6].trim() || null,
      rxPower: up ? parseRxDbm(r[15], 'auto') : null,
      txPower: up ? parsePowerDbm(r[14], 'auto') : null,
      distance: distanceFromRtt(r[10]),
      status,
    });
  }
  return onus;
}

/** "6301 (4GE+1POTS)" from the chip id and port counts, or null when none of them is known. */
export function formatHiosoOnuType(chip: string | null | undefined, counts: { ge?: number | null; fe?: number | null; pots?: number | null; total?: string | null } = {}): string | null {
  const id = (chip ?? '').trim();
  const usableChip = ['', '0', '0000', '--'].includes(id) ? '' : id;
  const parts = [
    counts.ge ? `${counts.ge}GE` : null,
    counts.fe ? `${counts.fe}FE` : null,
    counts.pots ? `${counts.pots}POTS` : null,
  ].filter(Boolean);
  const total = Number(counts.total);
  const ports = parts.join('+') || (Number.isInteger(total) && total > 0 ? `${total}P` : '');
  if (usableChip && ports) return `${usableChip} (${ports})`;
  return usableChip || ports || null;
}

const percent = (raw: string | undefined): number | null => {
  const value = parseFloat(raw ?? '');
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null;
};

/** Parses `var sysInfo = new Array("...", ...)` of /system.asp: 3 model, 4 firmware, 11 CPU %, 12 memory %. */
export function parseSystemInfo(html: string): HiosoSystemInfo | null {
  const block = html.match(/var\s+sysInfo\s*=\s*new\s+Array\(([\s\S]*?)\)\s*;/);
  if (!block) return null;
  const items = [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (items.length < 13) return null;
  return {
    model: items[3].trim() || null,
    firmware: items[4].trim() || null,
    cpu: percent(items[11]),
    memory: percent(items[12]),
  };
}

async function fetchText(url: string, authorization: string, timeoutMs: number, form?: URLSearchParams): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: form ? 'POST' : 'GET',
      headers: { Authorization: authorization, Connection: 'close', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: form?.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function endpoint(config: HiosoWebConfig) {
  return {
    base: `http://${config.host}${config.port && config.port !== 80 ? `:${config.port}` : ''}`,
    authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
    timeout: config.timeoutMs ?? 8000,
  };
}

/** Sets an ONU's name through the form the OLT's own page uses. Spaces are not accepted there. */
export async function setHiosoWebName(config: HiosoWebConfig, onuAddress: string, name: string): Promise<void> {
  const { base, authorization, timeout } = endpoint(config);
  await fetchText(`${base}/`, authorization, timeout);
  await fetchText(`${base}/goform/setOnu`, authorization, timeout, new URLSearchParams({ onuId: onuAddress, onuName: name, onuOperation: 'nonOp' }));
}

/** Every ONU the OLT's web page lists, plus its system page when that one answers too. */
export async function readHiosoWeb(config: HiosoWebConfig): Promise<{ onus: HiosoWebOnu[]; system: HiosoSystemInfo | null }> {
  const { base, authorization, timeout } = endpoint(config);

  await fetchText(`${base}/`, authorization, timeout);
  const onus = parseOnuTable(await fetchText(`${base}/onuAllPonOnuList.asp`, authorization, timeout));
  const system = await fetchText(`${base}/system.asp`, authorization, timeout).then(parseSystemInfo, () => null);
  return { onus, system };
}
