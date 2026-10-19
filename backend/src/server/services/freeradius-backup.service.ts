import 'server-only';
import { execFileSync } from 'child_process';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { getAppDir } from '@/server/app-version';

/**
 * Backup and restore of the FreeRADIUS configuration (/etc/freeradius/3.0).
 *
 * Archives live outside the app directory: deploy.sh can rsync --delete
 * the app directory, which would take the backups with it.
 *
 * Restore never runs a shell with archive content: an uploaded archive is
 * untrusted, and the backend runs as root. Before anything is overwritten
 * the current config is archived, the restored config is checked with
 * `freeradius -C`, and on failure the previous files are put back, so a
 * bad archive cannot leave RADIUS (and every customer login) down.
 */

export const FR_DIR = process.env.SALFANET_FR_DIR || '/etc/freeradius/3.0';
export const BACKUP_DIR = process.env.SALFANET_FR_BACKUP_DIR || '/var/data/salfanet/backups/freeradius';
export const LOG_FILE = '/tmp/salfanet-fr-backup.log';
export const SAFE_BACKUP_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9_\-.]*\.tar\.gz$/;
const KEEP_BACKUPS = 15;

/** The files Salfanet's installer writes; the rest of FreeRADIUS stays as the package installed it. */
const FILES_TO_RESTORE = [
  'clients.conf',
  'clients.d/nas-from-db.conf',
  'mods-available/sql',
  'mods-available/rest',
  'mods-available/mschap',
  'mods-enabled/sql',
  'mods-enabled/rest',
  'policy.d/filter',
  'sites-available/default',
  'sites-available/coa',
  'sites-enabled/default',
  'sites-enabled/coa',
];

/**
 * Settings that belong to this server, not to the config being restored.
 * A backup from another server carries that server's database login and
 * API address; restoring them here would cut RADIUS off from its database.
 */
const LOCAL_SETTINGS: Record<string, string[]> = {
  'mods-available/sql': ['server', 'port', 'login', 'password', 'radius_db'],
  'mods-available/rest': ['connect_uri'],
};

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
}

export function backupDir(): string {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  // Archives made before the move lived in <app>/backups/freeradius.
  const legacy = path.join(getAppDir(), 'backups', 'freeradius');
  if (existsSync(legacy)) {
    for (const f of readdirSync(legacy)) {
      if (!SAFE_BACKUP_FILENAME.test(f) || existsSync(path.join(BACKUP_DIR, f))) continue;
      try {
        renameSync(path.join(legacy, f), path.join(BACKUP_DIR, f));
      } catch {
        copyFileSync(path.join(legacy, f), path.join(BACKUP_DIR, f));
      }
    }
  }
  return BACKUP_DIR;
}

/** Absolute path of a backup by name, or null for a name that is not a plain backup file name. */
export function backupPath(name: string): string | null {
  if (!SAFE_BACKUP_FILENAME.test(name)) return null;
  const dir = path.resolve(backupDir());
  const p = path.resolve(dir, name);
  return p.startsWith(dir + path.sep) ? p : null;
}

export function listBackups(): BackupFile[] {
  try {
    const dir = backupDir();
    return readdirSync(dir)
      .filter((f) => SAFE_BACKUP_FILENAME.test(f))
      .map((f) => {
        const st = statSync(path.join(dir, f));
        return { name: f, size: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function errText(e: unknown): string {
  const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
  const out = `${err.stderr?.toString() ?? ''}\n${err.stdout?.toString() ?? ''}`.trim();
  return out || err.message || String(e);
}

/** Archives /etc/freeradius/3.0 as <dir>/3.0/... and returns the file name. */
export function createBackup(suffix = ''): string {
  if (!existsSync(FR_DIR)) throw new Error(`Direktori FreeRADIUS tidak ditemukan: ${FR_DIR}`);
  const name = `freeradius-config-${stamp()}${suffix ? `-${suffix}` : ''}.tar.gz`;
  const dir = backupDir();
  const tmp = path.join(dir, `.${name}.tmp`);
  try {
    execFileSync('tar', ['-czf', tmp, '-C', path.dirname(FR_DIR), path.basename(FR_DIR)], { stdio: 'pipe' });
    renameSync(tmp, path.join(dir, name));
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new Error(`Gagal membuat arsip: ${errText(e)}`);
  }
  // Keep the newest ones.
  for (const old of listBackups().slice(KEEP_BACKUPS)) rmSync(path.join(dir, old.name), { force: true });
  return name;
}

/** Runs a backup and writes the log the backup page polls. */
export function runBackupWithLog(): { ok: boolean; file?: string; log: string } {
  const lines = [
    '=== FreeRADIUS Backup ===',
    `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: process.env.TZ || 'Asia/Jakarta' })}`,
    `Sumber: ${FR_DIR}`,
    `Tujuan: ${BACKUP_DIR}`,
    '',
  ];
  let result: { ok: boolean; file?: string };
  try {
    const file = createBackup();
    const size = statSync(path.join(BACKUP_DIR, file)).size;
    lines.push('✔ Backup selesai', `✔ Ukuran: ${(size / 1024).toFixed(1)} KB`, '', `BACKUP_FILE: ${file}`);
    result = { ok: true, file };
  } catch (e) {
    lines.push(`✘ ERROR: ${e instanceof Error ? e.message : String(e)}`);
    result = { ok: false };
  }
  const log = lines.join('\n');
  try {
    writeFileSync(LOG_FILE, log);
  } catch {
    // The page also gets the log in the response.
  }
  return { ...result, log };
}

export function readBackupLog(): string {
  try {
    return existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf-8') : '';
  } catch {
    return '';
  }
}

/**
 * Checks an archive before it is kept: readable gzip tar, no absolute
 * paths or "..", and FreeRADIUS config inside.
 */
export function validateArchive(archive: string): string | null {
  let listing: string;
  try {
    listing = execFileSync('tar', ['-tzf', archive], { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 }).toString();
  } catch {
    return 'File tidak valid atau bukan arsip .tar.gz.';
  }
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) return 'Arsip kosong.';
  if (entries.length > 5000) return 'Arsip berisi terlalu banyak file untuk sebuah config FreeRADIUS.';
  if (entries.some((e) => e.startsWith('/') || e.split('/').includes('..'))) return 'Arsip berisi path yang tidak aman.';
  if (!entries.some((e) => /(^|\/)clients\.conf$/.test(e))) return 'Arsip ini bukan backup config FreeRADIUS (clients.conf tidak ada).';
  return null;
}

/** Where clients.conf is in an extracted archive: the root or one folder down (3.0/). */
function configRoot(extracted: string): string | null {
  if (existsSync(path.join(extracted, 'clients.conf'))) return extracted;
  for (const entry of readdirSync(extracted, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(extracted, entry.name, 'clients.conf'))) {
      return path.join(extracted, entry.name);
    }
  }
  return null;
}

function settingValue(content: string, key: string): string | null {
  const m = content.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

/** Puts this server's own values for [keys] into [content]. */
function keepLocalSettings(content: string, current: string, keys: string[], log: string[], file: string): string {
  let out = content;
  for (const key of keys) {
    const local = settingValue(current, key);
    if (local === null) continue;
    const re = new RegExp(`^([ \\t]*${key}[ \\t]*=[ \\t]*).+$`, 'm');
    if (re.test(out) && settingValue(out, key) !== local) {
      out = out.replace(re, (_m, lead: string) => `${lead}${local}`);
      log.push(`  ${file}: ${key} dipertahankan dari server ini`);
    }
  }
  return out;
}

/**
 * Copies the restorable files from [srcRoot] into FR_DIR.
 * Symlinks are recreated only when they point inside FR_DIR.
 */
function copyConfig(srcRoot: string, log: string[], keepLocal: boolean): number {
  let restored = 0;
  for (const f of FILES_TO_RESTORE) {
    const src = path.join(srcRoot, f);
    const dest = path.join(FR_DIR, f);
    let st;
    try {
      st = lstatSync(src);
    } catch {
      log.push(`  lewati (tidak ada di backup): ${f}`);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    if (st.isSymbolicLink()) {
      const target = readlinkSync(src);
      const resolved = path.resolve(path.dirname(dest), target);
      if (!resolved.startsWith(FR_DIR + path.sep)) {
        log.push(`  lewati (symlink keluar dari ${FR_DIR}): ${f} → ${target}`);
        continue;
      }
      rmSync(dest, { force: true });
      symlinkSync(target, dest);
      log.push(`✔ ${f} → ${target}`);
    } else if (st.isFile()) {
      const local = keepLocal ? LOCAL_SETTINGS[f] : undefined;
      if (local && existsSync(dest) && !lstatSync(dest).isSymbolicLink()) {
        const content = keepLocalSettings(readFileSync(src, 'utf-8'), readFileSync(dest, 'utf-8'), local, log, f);
        rmSync(dest, { force: true });
        writeFileSync(dest, content);
      } else {
        // Remove first: a symlink at dest would make the copy write through to its target.
        rmSync(dest, { force: true });
        copyFileSync(src, dest);
      }
      log.push(`✔ ${f}`);
    } else {
      log.push(`  lewati (bukan file): ${f}`);
      continue;
    }
    restored++;
  }
  return restored;
}

function extract(archive: string): { dir: string; root: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'fr-restore-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', dir, '--no-same-owner', '--no-same-permissions'], { stdio: 'pipe' });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`Arsip tidak bisa dibuka: ${errText(e)}`);
  }
  const root = configRoot(dir);
  if (!root) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error('Arsip ini bukan backup config FreeRADIUS (clients.conf tidak ada).');
  }
  return { dir, root };
}

function fixOwnership() {
  try {
    execFileSync('chown', ['-R', 'freerad:freerad', FR_DIR], { stdio: 'pipe' });
  } catch {
    // Not fatal: the files keep root ownership, which FreeRADIUS can still read.
  }
}

/** `freeradius -C`: null when the config loads, else the end of its output. */
function checkConfig(): string | null {
  // Debian/Ubuntu name the binary freeradius; other distros radiusd.
  for (const bin of ['freeradius', 'radiusd']) {
    try {
      execFileSync(bin, ['-Cxm', '-lstdout'], { stdio: 'pipe', timeout: 30000 });
      return null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return errText(e).split('\n').slice(-12).join('\n');
    }
  }
  return 'Program freeradius tidak ditemukan, config tidak bisa diperiksa.';
}

export interface RestoreResult {
  success: boolean;
  restored: number;
  log: string;
  error?: string;
  safetyBackup?: string;
}

export function restoreBackup(file: string, { keepLocal = true } = {}): RestoreResult {
  const archive = backupPath(file);
  if (!archive || !existsSync(archive)) return { success: false, restored: 0, log: '', error: 'File backup tidak ditemukan.' };

  const log: string[] = [];
  const invalid = validateArchive(archive);
  if (invalid) return { success: false, restored: 0, log: `✘ ${invalid}`, error: invalid };

  let work: { dir: string; root: string } | null = null;
  let safety: string | undefined;
  try {
    work = extract(archive);
    log.push('✔ Arsip dibuka');

    safety = createBackup('sebelum-restore');
    log.push(`✔ Config saat ini disimpan dulu: ${safety}`);

    const restored = copyConfig(work.root, log, keepLocal);
    fixOwnership();

    const problem = checkConfig();
    if (problem) {
      log.push('✘ Config hasil restore ditolak FreeRADIUS:', problem);
      // Put the previous files back.
      const back = extract(path.join(BACKUP_DIR, safety));
      try {
        copyConfig(back.root, [], false);
      } finally {
        rmSync(back.dir, { recursive: true, force: true });
      }
      fixOwnership();
      log.push('↺ Config sebelumnya dikembalikan. FreeRADIUS tidak di-restart.');
      return { success: false, restored: 0, log: log.join('\n'), error: 'Config hasil restore tidak valid, dibatalkan.', safetyBackup: safety };
    }
    log.push('✔ Config lolos pemeriksaan freeradius -C');

    // A HUP reloads modules only; clients.conf and sites need a restart.
    try {
      execFileSync('systemctl', ['restart', 'freeradius'], { stdio: 'pipe', timeout: 30000 });
      const state = execFileSync('systemctl', ['is-active', 'freeradius'], { stdio: 'pipe' }).toString().trim();
      log.push(state === 'active' ? '✔ FreeRADIUS di-restart' : `⚠ FreeRADIUS berstatus ${state} setelah restart`);
    } catch (e) {
      log.push(`⚠ Restart FreeRADIUS gagal: ${errText(e).split('\n').slice(-3).join(' ')}`);
    }
    return { success: true, restored, log: log.join('\n'), safetyBackup: safety };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`✘ ERROR: ${msg}`);
    return { success: false, restored: 0, log: log.join('\n'), error: msg, safetyBackup: safety };
  } finally {
    if (work) rmSync(work.dir, { recursive: true, force: true });
  }
}

/** Saves an uploaded archive under a unique name after checking it. */
export function saveUploadedBackup(originalName: string, bytes: Buffer): string {
  const base = originalName.replace(/\.tar\.gz$/i, '').replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/^[^a-zA-Z0-9]+/, '') || 'backup';
  const name = `${base.slice(0, 80)}_upload-${stamp()}.tar.gz`;
  const dest = path.join(backupDir(), name);
  writeFileSync(dest, bytes);
  const invalid = validateArchive(dest);
  if (invalid) {
    rmSync(dest, { force: true });
    throw new Error(invalid);
  }
  return name;
}
