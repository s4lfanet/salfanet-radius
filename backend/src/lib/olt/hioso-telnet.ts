/**
 * Hioso EPON OLT over Telnet, read-only.
 *
 * Written from field notes of working installs (HA7304, HA7304C, HA7304V, HA7302):
 *  - lines end with CRLF; a bare LF is echoed but never submitted
 *  - the OLT sends Telnet option negotiation before "Username:" and some models (HA7302) hold the
 *    banner until it is answered
 *  - login can ask for a second and third password (access, enable); all answered with the same one
 *  - the prompt is EPON> in user mode and EPON# once enabled
 *  - long output pages with "--- Enter Key To Continue ----"
 *  - PON ports are numbered from 0 on newer firmware ("epon 0/1") and from 1 on older "V" firmware
 *
 * The shared Telnet client drives `expect` and `telnet`, sends no `enable`, and does not know this
 * pager, so it cannot read a Hioso OLT.
 */
import net from 'node:net';

export interface HiosoTelnetConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  timeout?: number;
}

export interface HiosoCliOnu {
  pon: number;
  onuId: number;
  mac: string;
  up: boolean;
  firmware: string | null;
  chip: string | null;
  ge: number | null;
  fe: number | null;
  pots: number | null;
  name: string | null;
}

// ─── Parsing (pure) ──────────────────────────────────────────────────────────

const IAC = 255;
const DO = 253;
const DONT = 254;
const WILL = 251;
const WONT = 252;
const SB = 250;
const SE = 240;

const PAGER = /-+\s*Enter Key To Continue\s*-*|--More--/i;
const CLI_ERROR = /(^|\n)\s*%|unknown command|invalid input|incomplete command|ambiguous command|not support/i;

/**
 * "0/1:1  f8:53:29:fc:97:84 Up  3230  6301  4 0 1  CtcNegDone  30  Yes  0H36M1S  [Name]"
 * Columns: OnuId MacAddress Status Firmware ChipId Ge Fe Pots CtcStatus CtcVer Activate Uptime Name.
 * The first four are all that is needed, so a firmware with extra or missing columns still parses.
 */
export function parseOnuInfo(output: string): HiosoCliOnu[] {
  const onus: HiosoCliOnu[] = [];
  for (const line of output.split(/\r?\n/)) {
    const head = line.match(/^\s*\d+\/(\d+):(\d+)\s+((?:[0-9a-fA-F]{2}[:.-]){5}[0-9a-fA-F]{2})\s+(Up|Down)\b(.*)$/i);
    if (!head) continue;

    const rest = head[5].trim().split(/\s+/);
    // Firmware, ChipId, then Ge, Fe, Pots as numbers, then CtcStatus, CtcVer, Activate, Uptime.
    const hasColumns = rest.length >= 9 && /^\d+$/.test(rest[2]) && /^\d+$/.test(rest[3]) && /^\d+$/.test(rest[4]);
    onus.push({
      pon: Number(head[1]),
      onuId: Number(head[2]),
      mac: head[3].replace(/[.-]/g, ':').toUpperCase(),
      up: head[4].toLowerCase() === 'up',
      firmware: hasColumns ? rest[0] : null,
      chip: hasColumns ? rest[1] : null,
      ge: hasColumns ? Number(rest[2]) : null,
      fe: hasColumns ? Number(rest[3]) : null,
      pots: hasColumns ? Number(rest[4]) : null,
      // After Uptime comes the ONU name; it may contain spaces, or be absent or "NA".
      name: hasColumns && !isUnsetOnuName(rest.slice(9).join(' ')) ? rest.slice(9).join(' ').trim() : null,
    });
  }
  return onus;
}

export function isCliError(output: string): boolean {
  return CLI_ERROR.test(output);
}

/** PON numbering: "epon 0/1" on HA7304C-era firmware, "epon 1/1" on older "V" firmware such as HA7304V. */
export function hiosoPonBase(model: string | null | undefined): number {
  return /VX?$/i.test((model ?? '').trim()) ? 1 : 0;
}

/** "show epon optical-ddm": the temperature of the OLT's PON module. */
export function parseDdmTemperature(output: string): number | null {
  if (isCliError(output)) return null;
  const match = output.match(/Temperature\s*:\s*([-+]?\d+(?:\.\d+)?)/i);
  return match ? Math.round(Number(match[1])) : null;
}

/** "Key : value" lines of a module readout, for showing as they are. */
export function parseKeyValues(output: string): Array<{ label: string; value: string }> {
  if (isCliError(output)) return [];
  const fields: Array<{ label: string; value: string }> = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*([A-Za-z][\w ()/-]*?)\s*:\s*(\S.*?)\s*$/);
    if (match) fields.push({ label: match[1], value: match[2] });
  }
  return fields;
}

/** An ONU name the OLT never set: empty, "NA", "N/A", "NULL", "-" and the like. */
export function isUnsetOnuName(name: string | null | undefined): boolean {
  const value = (name ?? '').replace(/\0/g, '').trim();
  return !value || /^(n\/?a|null|none|-+|unknown)$/i.test(value);
}

/** Only what the OLT's name field takes; spaces become underscores. */
export function cleanHiosoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim().slice(0, 30).replace(/ /g, '_');
}

export function hiosoNameCommands(base: number, pon: number, onuId: number, name: string): string[] {
  return ['configure terminal', `interface epon ${base}/${pon}`, `onu ${onuId} name ${name}`];
}

export function hiosoRebootCommands(base: number, pon: number, onuId: number): string[] {
  return ['configure terminal', `interface epon ${base}/${pon}`, `epon onu ${onuId} reset`];
}

/** "show memory": "Used 28800 / Total 127616". */
export function parseMemoryPercent(output: string): number | null {
  const match = output.match(/Used\s+(\d+)\s*\/\s*Total\s+(\d+)/i);
  if (!match || Number(match[2]) <= 0) return null;
  return Math.round((Number(match[1]) / Number(match[2])) * 100);
}

/** "show process cpu", which not every firmware has. */
export function parseCpuPercent(output: string): number | null {
  if (isCliError(output)) return null;
  const match = output.match(/(\d{1,3})\s*%/);
  const value = match ? Number(match[1]) : null;
  return value !== null && value <= 100 ? value : null;
}

/** Strips Telnet negotiation from received bytes and returns the replies to send back. */
export function filterTelnet(data: Buffer): { text: string; replies: Buffer[] } {
  const replies: Buffer[] = [];
  const kept: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (byte !== IAC) {
      kept.push(byte);
      continue;
    }
    const command = data[i + 1];
    if (command === IAC) {
      kept.push(IAC);
      i += 1;
    } else if (command === DO || command === DONT) {
      replies.push(Buffer.from([IAC, WONT, data[i + 2]]));
      i += 2;
    } else if (command === WILL || command === WONT) {
      replies.push(Buffer.from([IAC, DONT, data[i + 2]]));
      i += 2;
    } else if (command === SB) {
      let end = i + 2;
      while (end < data.length - 1 && !(data[end] === IAC && data[end + 1] === SE)) end += 1;
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return { text: Buffer.from(kept).toString('latin1'), replies };
}

// ─── Session ─────────────────────────────────────────────────────────────────

const PROMPT_AT_END = /(?:^|\n)[^\n]*[>#]\s*$/;
const USER_PROMPT = /(?:^|\n)[^\n]*>\s*$/;
const PRIVILEGED_PROMPT = /(?:^|\n)[^\n]*#\s*$/;
const QUIET_MS = 150;

class Session {
  private buffer = '';
  private lastData = Date.now();
  private closedError: Error | null = null;
  private waiter: (() => void) | null = null;

  constructor(private readonly socket: net.Socket) {
    socket.on('data', (data: Buffer) => {
      const { text, replies } = filterTelnet(data);
      for (const reply of replies) socket.write(reply);
      this.buffer += text.replace(/[\r\x00\x08]/g, '');
      this.lastData = Date.now();
      this.waiter?.();
    });
    socket.on('error', (error) => {
      this.closedError = error;
      this.waiter?.();
    });
    socket.on('close', () => {
      this.closedError ??= new Error('Koneksi Telnet ditutup oleh OLT');
      this.waiter?.();
    });
  }

  send(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  /** Waits until `done(buffer)` is true, answering the pager on the way. Resolves with the text read. */
  async until(done: (buffer: string) => boolean, timeoutMs: number, what: string): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const pager = this.buffer.match(PAGER);
      if (pager && this.buffer.trimEnd().endsWith(pager[0].trimEnd())) {
        this.buffer = this.buffer.slice(0, this.buffer.lastIndexOf(pager[0]));
        this.socket.write(pager[0].includes('More') ? ' ' : '\r\n');
        this.collected += this.consumeAll();
        continue;
      }
      if (done(this.buffer) && Date.now() - this.lastData >= QUIET_MS) {
        const text = this.collected + this.buffer;
        this.collected = '';
        this.buffer = '';
        return text;
      }
      if (this.closedError) throw this.closedError;
      if (Date.now() > deadline) throw new Error(`Telnet: tidak ada ${what} dalam ${Math.round(timeoutMs / 1000)} detik`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 60);
        this.waiter = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiter = null;
    }
  }

  private collected = '';

  /** Output read before a pager prompt; kept so a long listing is returned whole. */
  private consumeAll(): string {
    const text = this.buffer;
    this.buffer = '';
    return text;
  }

  close(): void {
    this.socket.destroy();
  }
}

function connect(config: HiosoTelnetConfig): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.host, port: config.port || 23 });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Telnet: tidak bisa tersambung ke ${config.host}:${config.port || 23}`));
    }, 8000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Logs in and reaches the privileged prompt. Up to three password prompts are answered. */
async function login(session: Session, config: HiosoTelnetConfig): Promise<void> {
  await session.until((b) => /(username|login)\s*:\s*$/i.test(b), 15000, 'prompt Username');
  session.send(config.username);

  for (let step = 0; step < 6; step++) {
    const text = await session.until((b) => /password\s*:\s*$/i.test(b) || PROMPT_AT_END.test(b) || /(username|login)\s*:\s*$/i.test(b), 20000, 'prompt setelah login');
    if (/(username|login)\s*:\s*$/i.test(text)) throw new Error('Telnet: username atau password ditolak OLT');
    if (/password\s*:\s*$/i.test(text)) {
      session.send(config.password);
      continue;
    }
    if (PRIVILEGED_PROMPT.test(text)) return;
    if (USER_PROMPT.test(text)) session.send('enable');
  }
  throw new Error('Telnet: login tidak sampai ke mode privileged');
}

async function run(session: Session, command: string, timeoutMs = 20000): Promise<string> {
  session.send(command);
  const raw = await session.until((b) => PRIVILEGED_PROMPT.test(b) || USER_PROMPT.test(b), timeoutMs, `hasil "${command}"`);
  // Drop the echoed command and the prompt line.
  const lines = raw.split('\n');
  if (lines[0] && lines[0].includes(command.slice(0, 12))) lines.shift();
  if (lines.length && PROMPT_AT_END.test(lines[lines.length - 1])) lines.pop();
  return lines.join('\n');
}

/**
 * Whether the login works, for the connection test: null when it does, else why it did not.
 * The shared expect-based test sends a bare CR and gives up after 15 seconds in total, which this
 * kind of OLT does not accept; here the Telnet options are answered and lines end with CRLF.
 */
export async function checkHiosoLogin(config: HiosoTelnetConfig): Promise<string | null> {
  let socket: net.Socket;
  try {
    socket = await connect(config);
  } catch (error: any) {
    return error?.message ?? 'tidak bisa tersambung';
  }
  const session = new Session(socket);
  const deadline = setTimeout(() => session.close(), 60_000);
  try {
    await login(session, config);
    session.send('exit');
    return null;
  } catch (error: any) {
    return error?.message ?? 'login gagal';
  } finally {
    clearTimeout(deadline);
    session.close();
  }
}

/**
 * ONUs of every PON. The numbering is probed once, the expected base first, and the scan stops at
 * the first port the OLT rejects. Null when neither base is accepted: HA7304V has no "show onu info".
 */
async function readPonPages(session: Session, firstBase: number, maxPon: number): Promise<{ onus: HiosoCliOnu[]; base: number } | null> {
  let base = firstBase;
  let first = await run(session, `show onu info epon ${base}/1 all`);
  if (isCliError(first)) {
    base = 1 - firstBase;
    first = await run(session, `show onu info epon ${base}/1 all`);
    if (isCliError(first)) return null;
  }

  const onus = parseOnuInfo(first);
  for (let pon = 2; pon <= maxPon; pon++) {
    const output = await run(session, `show onu info epon ${base}/${pon} all`);
    if (isCliError(output)) break;
    onus.push(...parseOnuInfo(output));
  }
  return { onus, base };
}

function logout(session: Session): void {
  try {
    session.send('exit');
  } catch {
    /* the session is closed by the caller anyway */
  }
}

/** Every ONU the OLT lists. */
export async function readHiosoOnus(config: HiosoTelnetConfig, maxPon = 16): Promise<HiosoCliOnu[]> {
  const socket = await connect(config);
  const session = new Session(socket);
  const deadline = setTimeout(() => session.close(), (config.timeout ?? 90) * 1000);
  try {
    await login(session, config);
    const pages = await readPonPages(session, 0, maxPon);
    if (!pages) throw new Error('Telnet: perintah "show onu info epon" tidak dikenali OLT ini');
    logout(session);
    return pages.onus;
  } finally {
    clearTimeout(deadline);
    session.close();
  }
}

/** One PON port's optical module; the two command orders are the two firmware generations. */
export async function readHiosoPonOptical(config: HiosoTelnetConfig, model: string | null | undefined, pon: number): Promise<Array<{ label: string; value: string }>> {
  const socket = await connect(config);
  const session = new Session(socket);
  const deadline = setTimeout(() => session.close(), 30_000);
  try {
    await login(session, config);
    const base = hiosoPonBase(model);
    for (const command of [`show epon optical-ddm ${base}/${pon}`, `show epon ${Math.max(base, 1)}/${pon} optical-ddm`]) {
      const fields = parseKeyValues(await run(session, command, 8000));
      if (fields.length > 0) {
        logout(session);
        return fields;
      }
    }
    logout(session);
    return [];
  } finally {
    clearTimeout(deadline);
    session.close();
  }
}

/**
 * Runs configuration commands in order and stops at the first the OLT rejects, so a command never
 * lands in the wrong context. Null when all went through, else what the OLT said. A yes/no question
 * is answered with yes.
 */
export async function runHiosoCommands(config: HiosoTelnetConfig, commands: string[]): Promise<string | null> {
  let socket: net.Socket;
  try {
    socket = await connect(config);
  } catch (error: any) {
    return error?.message ?? 'tidak bisa tersambung';
  }
  const session = new Session(socket);
  const deadline = setTimeout(() => session.close(), 40_000);
  const question = /\[?\(?y(?:es)?\/n(?:o)?\)?\]?\s*:?\s*$/i;
  try {
    await login(session, config);
    for (const command of commands) {
      session.send(command);
      let output = await session.until((b) => PROMPT_AT_END.test(b) || question.test(b), 10000, `hasil "${command}"`);
      if (question.test(output)) {
        session.send('yes');
        output = await session.until((b) => PROMPT_AT_END.test(b), 10000, `hasil "${command}"`);
      }
      if (isCliError(output)) return `OLT menolak "${command}": ${output.split('\n').slice(1, -1).join(' ').trim().slice(0, 120)}`;
    }
    logout(session);
    return null;
  } catch (error: any) {
    return error?.message ?? 'perintah gagal';
  } finally {
    clearTimeout(deadline);
    session.close();
  }
}

export interface HiosoCliReport {
  onus: HiosoCliOnu[];
  temperature: number | null;
  memory: number | null;
  cpu: number | null;
}

/**
 * One Telnet session for everything the CLI offers: the ONU list and the OLT's temperature, memory
 * and CPU. A command this firmware lacks leaves its value null instead of ending the session.
 */
export async function readHiosoCli(config: HiosoTelnetConfig, options: { model?: string | null; maxPon?: number } = {}): Promise<HiosoCliReport> {
  const socket = await connect(config);
  const session = new Session(socket);
  const deadline = setTimeout(() => session.close(), (config.timeout ?? 90) * 1000);
  const attempt = (command: string) => run(session, command, 8000).catch(() => '');
  try {
    await login(session, config);
    const firstBase = hiosoPonBase(options.model);
    const pages = await readPonPages(session, firstBase, options.maxPon ?? 16);
    const base = pages?.base ?? firstBase;

    let temperature: number | null = null;
    for (const command of [`show epon optical-ddm ${base}/1`, `show epon ${Math.max(base, 1)}/1 optical-ddm`]) {
      temperature = parseDdmTemperature(await attempt(command));
      if (temperature !== null) break;
    }
    const memory = parseMemoryPercent(await attempt('show memory'));
    const cpu = parseCpuPercent(await attempt('show process cpu'));

    logout(session);
    return { onus: pages?.onus ?? [], temperature, memory, cpu };
  } finally {
    clearTimeout(deadline);
    session.close();
  }
}
