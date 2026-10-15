import { existsSync, readFileSync } from 'fs';
import path from 'path';

/** Nearest folder at or above `from` that holds pnpm-workspace.yaml. */
function findWorkspaceRoot(from: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Root of the installed app (the folder holding pnpm-workspace.yaml).
 * The standalone server changes cwd to its build folder inside the app, so
 * the root is found by walking up from there. The legacy
 * /var/www/salfanet-frontend folder comes last: when it was checked first,
 * a leftover copy of an old install there was read instead of the running
 * code and the version never changed.
 */
export function getAppDir(): string {
  const candidates = [
    process.env.SALFANET_APP_DIR,
    findWorkspaceRoot(process.cwd()),
    '/var/www/salfanet-radius',
    '/var/www/salfanet-frontend',
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
  }
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return '/var/www/salfanet-radius';
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * Release version, e.g. "5.22.0". A release ZIP install writes a VERSION
 * file; a git install only has package.json. The newer of the two wins, so
 * a VERSION file left over from the original ZIP no longer pins a server
 * that has since been updated with git.
 */
export function getAppVersion(appDir: string = getAppDir()): string {
  let pkgVersion = '0.0.0';
  try {
    pkgVersion = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf-8')).version || pkgVersion;
  } catch { /* fall through to VERSION */ }

  const versionFile = path.join(appDir, 'VERSION');
  if (!existsSync(versionFile)) return pkgVersion;
  const fileVersion = readFileSync(versionFile, 'utf-8').trim().replace(/^v/, '');
  return compareSemver(fileVersion, pkgVersion) > 0 ? fileVersion : pkgVersion;
}
