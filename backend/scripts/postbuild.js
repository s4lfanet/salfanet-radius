/**
 * Postbuild script for backend — copy .env to standalone.
 * In pnpm monorepo, standalone server.js is at .next/standalone/backend/server.js
 */
const fs = require('fs');
const path = require('path');

const standaloneDir = '.next/standalone/backend';

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const sp = path.join(src, f);
    const dp = path.join(dst, f);
    if (fs.statSync(sp).isDirectory()) {
      copyDir(sp, dp);
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}

// 1. Copy .env → standalone/backend/.env
if (fs.existsSync('.env')) {
  fs.copyFileSync('.env', `${standaloneDir}/.env`);
  console.log('[postbuild] .env copied to standalone/backend/.env');
}

// 2. Copy prisma client if exists
if (fs.existsSync('node_modules/.prisma') && fs.existsSync(`${standaloneDir}/node_modules`)) {
  copyDir('node_modules/.prisma', `${standaloneDir}/node_modules/.prisma`);
  console.log('[postbuild] node_modules/.prisma copied to standalone/backend/');
}

// 3. Copy iconv-lite to standalone node_modules
// node-routeros depends on iconv-lite, but Next.js standalone build
// doesn't properly link iconv-lite's internal ../encodings requires.
// iconv-lite is a transitive dep (via node-routeros), so it's only in
// the pnpm store, not in backend/node_modules/ directly.
// We copy it to standalone/backend/node_modules/ so Node.js can resolve it.
const iconvDirs = [
  'node_modules/iconv-lite',
  'node_modules/.pnpm/iconv-lite@0.7.3/node_modules/iconv-lite',
];
const standaloneNodeModules = `${standaloneDir}/node_modules`;
let iconvCopied = false;
for (const src of iconvDirs) {
  if (fs.existsSync(src)) {
    copyDir(src, `${standaloneNodeModules}/iconv-lite`);
    console.log(`[postbuild] iconv-lite copied from ${src} to standalone/`);
    iconvCopied = true;
    break;
  }
}
if (!iconvCopied) {
  // Try pnpm store in standalone build
  const pnpmIconv = '.next/standalone/node_modules/.pnpm/iconv-lite@0.7.3/node_modules/iconv-lite';
  if (fs.existsSync(pnpmIconv)) {
    copyDir(pnpmIconv, `${standaloneNodeModules}/iconv-lite`);
    console.log('[postbuild] iconv-lite copied from standalone pnpm store');
    iconvCopied = true;
  }
}
if (!iconvCopied) {
  console.warn('[postbuild] WARNING: iconv-lite not found — node-routeros may fail');
}
