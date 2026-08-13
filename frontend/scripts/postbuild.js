/**
 * Postbuild script — copy static assets to standalone output.
 * In pnpm monorepo, standalone server.js is at .next/standalone/frontend/server.js
 * so static files must go to .next/standalone/frontend/.next/static/
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const sp = path.join(src, f);
    const dp = path.join(dst, f);
    if (fs.statSync(sp).isDirectory() && f !== 'uploads') {
      copyDir(sp, dp);
    } else if (!fs.statSync(sp).isDirectory()) {
      fs.copyFileSync(sp, dp);
    }
  }
}

// In monorepo, standalone output is .next/standalone/frontend/
const standaloneDir = '.next/standalone/frontend';

// 1. Copy public/ → standalone/frontend/public/
if (fs.existsSync('public')) {
  copyDir('public', `${standaloneDir}/public`);
  console.log('[postbuild] public/ copied to standalone/frontend/public/');
}

// 2. Copy .next/static → standalone/frontend/.next/static/
if (fs.existsSync('.next/static')) {
  copyDir('.next/static', `${standaloneDir}/.next/static`);
  console.log('[postbuild] .next/static copied to standalone/frontend/.next/static/');
}

// 3. Copy .env → standalone/frontend/.env
if (fs.existsSync('.env')) {
  fs.copyFileSync('.env', `${standaloneDir}/.env`);
  console.log('[postbuild] .env copied to standalone/frontend/.env');
}

// 4. Copy prisma client if exists
if (fs.existsSync('node_modules/.prisma') && fs.existsSync(`${standaloneDir}/node_modules`)) {
  copyDir('node_modules/.prisma', `${standaloneDir}/node_modules/.prisma`);
  console.log('[postbuild] node_modules/.prisma copied to standalone/frontend/');
}
