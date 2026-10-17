import 'server-only';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAppDir } from '@/server/app-version';

/**
 * The Android apps customers and staff download from the login pages.
 * nginx serves them from frontend/public/downloads (location /downloads/).
 */
export const APK_RELEASES = {
  customer: { file: 'salfanet-customer.apk', label: 'Aplikasi Pelanggan' },
  admin: { file: 'salfanet-admin.apk', label: 'Aplikasi Admin' },
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
  };
}

/**
 * Replaces the downloadable APK. Written to a temporary name first and
 * renamed, so a download in progress never gets a half-written file.
 */
export function saveApkRelease(target: ApkTarget, bytes: Buffer, uploadedBy?: string, note?: string): ApkReleaseInfo {
  // An APK is a ZIP archive: it starts with the local file header PK\x03\x04.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error('File ini bukan APK Android yang valid.');
  }
  if (bytes.length > APK_MAX_BYTES) throw new Error('Ukuran APK melebihi 50 MB.');

  const dir = downloadsDir();
  mkdirSync(dir, { recursive: true });
  const { file } = APK_RELEASES[target];
  const tmp = join(dir, `.${file}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, join(dir, file));

  const manifest = readManifest();
  manifest[target] = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    note: note?.trim() || undefined,
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
