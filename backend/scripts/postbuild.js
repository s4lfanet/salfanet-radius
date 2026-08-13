/**
 * Postbuild script for backend — copy .env to standalone.
 * In pnpm monorepo, standalone server.js is at .next/standalone/backend/server.js
 */
const fs = require('fs');
const path = require('path');

const standaloneDir = '.next/standalone/backend';

// 1. Copy .env → standalone/backend/.env
if (fs.existsSync('.env')) {
  fs.copyFileSync('.env', `${standaloneDir}/.env`);
  console.log('[postbuild] .env copied to standalone/backend/.env');
}

// 2. Copy prisma client if exists
if (fs.existsSync('node_modules/.prisma') && fs.existsSync(`${standaloneDir}/node_modules`)) {
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
  copyDir('node_modules/.prisma', `${standaloneDir}/node_modules/.prisma`);
  console.log('[postbuild] node_modules/.prisma copied to standalone/backend/');
}
