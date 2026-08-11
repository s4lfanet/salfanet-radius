/**
 * PM2 Ecosystem Configuration — Salfanet Radius ISP
 *
 * Three managed processes:
 *   1. salfanet-radius  — Next.js app (standalone server.js, port 3000)
 *   2. salfanet-cron    — Background billing/expiry cron jobs
 *   3. salfanet-wa      — Baileys WhatsApp native service (port 4000, internal only)
 *
 * This file is copied by install-pm2.sh and updater.sh to APP_DIR/ecosystem.config.js
 */

const APP_DIR = process.env.APP_DIR || '/var/www/salfanet-radius';

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. Main Next.js Application
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-radius',
      script: '.next/standalone/server.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '450M',
      node_args: [
        '--max-old-space-size=400',
        '--max-semi-space-size=8',
        '--optimize-for-size',
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=400',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
        TZ: 'Asia/Jakarta',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 */6 * * *',
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. Background Cron Service (billing, expiry, notifications)
    //    Runs jobs directly via src/server/jobs/* (no HTTP round-trip to
    //    Next.js, no /api/cron auth dependency). See src/cron/runner.ts.
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-cron',
      // Use the tsx CLI binary directly (not runner-wrapper.cjs's `require('tsx/cjs')`
      // hook) — the CJS require-hook does NOT apply tsconfig `paths` aliases (@/*),
      // causing ERR_MODULE_NOT_FOUND for every @/server/* import. The tsx CLI itself
      // resolves aliases correctly. preload.cjs still mocks 'server-only' for Next.js
      // server-only guards.
      script: 'node_modules/.bin/tsx',
      args: ['-r', './src/cron/preload.cjs', 'src/cron/runner.ts'],
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '150M',
      node_args: [
        '--max-old-space-size=120',
        '--max-semi-space-size=4',
        '--optimize-for-size',
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=120',
        TZ: 'Asia/Jakarta',
      },
      error_file: './logs/cron-error.log',
      out_file: './logs/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 5000,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. Baileys WhatsApp Native Service
    //    Listens on 127.0.0.1:4000 (internal only, proxied via /api/whatsapp)
    //    Auth files: /var/data/salfanet/baileys_auth/
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-wa',
      script: './wa-service.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      node_args: [
        '--max-old-space-size=180',
        '--max-semi-space-size=4',
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=180',
        WA_SERVICE_PORT: 4000,
        WA_AUTH_DIR: '/var/data/salfanet/baileys_auth',
        TZ: 'Asia/Jakarta',
      },
      error_file: './logs/wa-error.log',
      out_file: './logs/wa-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 3000,
    },
  ],
};
