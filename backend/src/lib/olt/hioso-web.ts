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
 */
import { normalizeMac, parsePowerDbm, parseRxDbm } from './pon-snmp';

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
  rxPower: number | null;
  txPower: number | null;
  distance: number | null;
  status: 'online' | 'offline' | 'dying_gasp' | 'los';
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
      name: name && name.toUpperCase() !== 'NA' ? name : null,
      mac: mac && mac !== '00:00:00:00:00:00' ? mac : null,
      up,
      rxPower: up ? parseRxDbm(r[15], 'auto') : null,
      txPower: up ? parsePowerDbm(r[14], 'auto') : null,
      distance: distanceFromRtt(r[10]),
      status,
    });
  }
  return onus;
}

async function fetchText(url: string, authorization: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Authorization: authorization, Connection: 'close' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Every ONU the OLT's web page lists, or an empty list when the page is not there. */
export async function readHiosoWeb(config: HiosoWebConfig): Promise<HiosoWebOnu[]> {
  const base = `http://${config.host}${config.port && config.port !== 80 ? `:${config.port}` : ''}`;
  const authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  const timeout = config.timeoutMs ?? 8000;

  await fetchText(`${base}/`, authorization, timeout);
  return parseOnuTable(await fetchText(`${base}/onuAllPonOnuList.asp`, authorization, timeout));
}
