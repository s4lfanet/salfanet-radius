import 'server-only';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAppDir } from '@/server/app-version';
import { readApkMeta, type ApkMeta } from '@/server/services/apk-meta';

/**
 * The Android apps customers and staff download from the login pages.
 * nginx serves them from frontend/public/downloads (location /downloads/).
 */
export const APK_RELEASES = {
  customer: { file: 'salfanet-customer.apk', label: 'Aplikasi Pelanggan' },
  admin: { file: 'salfanet-admin.apk', label: 'Aplikasi Admin' },
  collector: { file: 'salfanet-collector.apk', label: 'Aplikasi Kolektor' },
} as const;
export type ApkTarget = keyof typeof APK_RELEASES;

export const APK_MAX_BYTES = 50 * 1024 * 1024; // under the strictest nginx client_max_body_size

// Upload records live with the server's other APK data, not in the public
// downloads folder, where anyone could read them.
const DATA_DIR = process.env.SALFANET_APK_DIR || '/var/data/salfanet/apk';
const MANIFEST_PATH = join(DATA_DIR, 'releases.json');

interface ManifestEntry {
  sha256: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
  note?: string;
  /** Installed versions below this one must update before the app can be used. */
  minVersionCode?: number;
}

export interface ApkReleaseInfo {
  target: ApkTarget;
  label: string;
  available: boolean;
  size?: number;
  updatedAt?: string;
  /** Short content id, used as ?v= on download links so Cloudflare serves each new file. */
  version?: string;
  uploadedBy?: string;
  note?: string;
  url?: string;
  packageName?: string;
  versionCode?: number;
  versionName?: string;
  signerSha256?: string;
  minVersionCode?: number;
}

// Reading the APK means loading the whole file; keep the result until the file changes.
const metaCache = new Map<string, ApkMeta | null>();
function cachedMeta(path: string, size: number, mtimeMs: number): ApkMeta | null {
  const key = `${path}:${size}:${mtimeMs}`;
  if (!metaCache.has(key)) {
    for (const k of metaCache.keys()) if (k.startsWith(`${path}:`)) metaCache.delete(k);
    metaCache.set(key, readApkMeta(readFileSync(path)));
  }
  return metaCache.get(key) ?? null;
}

export function downloadsDir(): string {
  return join(getAppDir(), 'frontend', 'public', 'downloads');
}

function readManifest(): Record<string, ManifestEntry> {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function apkReleaseInfo(target: ApkTarget): ApkReleaseInfo {
  const { file, label } = APK_RELEASES[target];
  const path = join(downloadsDir(), file);
  if (!existsSync(path)) return { target, label, available: false };
  const st = statSync(path);
  const entry = readManifest()[target];
  // A file copied in by hand (scp) has no manifest entry, or a stale one;
  // then size + modification time identify the file.
  const fromManifest = entry && entry.size === st.size;
  const meta = cachedMeta(path, st.size, st.mtimeMs);
  const version = fromManifest
    ? entry.sha256.slice(0, 12)
    : createHash('sha256').update(`${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 12);
  return {
    target,
    label,
    available: true,
    size: st.size,
    updatedAt: fromManifest ? entry.uploadedAt : st.mtime.toISOString(),
    version,
    uploadedBy: fromManifest ? entry.uploadedBy : undefined,
    note: fromManifest ? entry.note : undefined,
    url: `/downloads/${file}?v=${version}`,
    packageName: meta?.packageName,
    versionCode: meta?.versionCode,
    versionName: meta?.versionName,
    signerSha256: meta?.signerSha256,
    minVersionCode: fromManifest ? entry.minVersionCode : undefined,
  };
}

/**
 * Why this APK cannot replace the published one, or null when it can.
 * Every check protects phones that update from inside the app: Android
 * refuses an update with another package name, another signing key or a
 * lower version, and the app would keep offering an update it cannot
 * install.
 */
function rejectReason(target: ApkTarget, meta: ApkMeta, sha256: string): string | null {
  const { label } = APK_RELEASES[target];
  for (const other of Object.keys(APK_RELEASES) as ApkTarget[]) {
    if (other === target) continue;
    const o = apkReleaseInfo(other);
    if (o.packageName === meta.packageName) return `APK ini adalah ${o.label}, bukan ${label}.`;
  }
  const cur = apkReleaseInfo(target);
  if (!cur.available || cur.versionCode === undefined) return null;
  if (cur.packageName && cur.packageName !== meta.packageName) {
    return `Nama paket APK (${meta.packageName}) berbeda dengan ${label} yang sudah terpasang di HP pengguna (${cur.packageName}).`;
  }
  if (cur.signerSha256 && meta.signerSha256 && cur.signerSha256 !== meta.signerSha256) {
    return 'APK ini ditandatangani dengan kunci berbeda dari versi sebelumnya, jadi HP pengguna akan menolak update-nya. Build ulang dengan keystore yang sama.';
  }
  if (meta.versionCode < cur.versionCode) {
    return `Versi APK ini (${meta.versionName ?? meta.versionCode}, build ${meta.versionCode}) lebih lama dari yang sudah ada (build ${cur.versionCode}).`;
  }
  if (meta.versionCode === cur.versionCode) {
    const curSha = createHash('sha256').update(readFileSync(join(downloadsDir(), APK_RELEASES[target].file))).digest('hex');
    if (curSha !== sha256) {
      return `Nomor build sama dengan yang sudah ada (build ${cur.versionCode}). Naikkan versi di pubspec.yaml lalu build ulang, supaya HP pengguna mengenalinya sebagai update.`;
    }
  }
  return null;
}

/**
 * Replaces the downloadable APK. Written to a temporary name first and
 * renamed, so a download in progress never gets a half-written file.
 */
export function saveApkRelease(target: ApkTarget, bytes: Buffer, uploadedBy?: string, note?: string, mandatory = false): ApkReleaseInfo {
  // An APK is a ZIP archive: it starts with the local file header PK\x03\x04.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('File ini bukan APK Android yang valid.');
  }
  if (bytes.length > APK_MAX_BYTES) throw new Error('Ukuran APK melebihi 50 MB.');
  const meta = readApkMeta(bytes);
  if (!meta) throw new Error('Isi APK tidak bisa dibaca (AndroidManifest.xml tidak ditemukan).');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reason = rejectReason(target, meta, sha256);
  if (reason) throw new Error(reason);
  const previous = readManifest()[target];

  const dir = downloadsDir();
  mkdirSync(dir, { recursive: true });
  const { file } = APK_RELEASES[target];
  const tmp = join(dir, `.${file}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, join(dir, file));

  const manifest = readManifest();
  manifest[target] = {
    sha256,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    note: note?.trim() || undefined,
    // A mandatory release raises the floor; an ordinary one keeps the last floor.
    minVersionCode: mandatory ? meta.versionCode : previous?.minVersionCode,
  };
  // The record only makes the version id exact; without it, size and time
  // still identify the file, so a failure here does not fail the upload.
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const manifestTmp = `${MANIFEST_PATH}.${process.pid}.tmp`;
    writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2));
    renameSync(manifestTmp, MANIFEST_PATH);
  } catch (e) {
    console.warn('[APK release] could not write the upload record:', e);
  }

  return apkReleaseInfo(target);
}
