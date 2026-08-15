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
// Copying the full package ensures module resolution works.
const iconvSrc = 'node_modules/iconv-lite';
const iconvDst = `${standaloneDir}/node_modules/iconv-lite`;
if (fs.existsSync(iconvSrc) && !fs.existsSync(iconvDst)) {
  copyDir(iconvSrc, iconvDst);
  console.log('[postbuild] iconv-lite copied to standalone/backend/node_modules/');
} else if (fs.existsSync(iconvSrc) && fs.existsSync(iconvDst)) {
  // Re-copy to ensure encodings directory is present
  copyDir(iconvSrc, iconvDst);
  console.log('[postbuild] iconv-lite updated in standalone/backend/node_modules/');
}
