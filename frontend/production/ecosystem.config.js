/**
 * PM2 Ecosystem Configuration — Salfanet Radius (Two Next.js Apps)
 *
 * Four managed processes:
 *   1. salfanet-frontend  — Next.js standalone (port 3000) — UI + NextAuth
 *   2. salfanet-backend   — Next.js standalone (port 3001) — API + Prisma + services
 *   3. salfanet-cron      — Cron runner (tsx, calls backend APIs on schedule)
 *   4. salfanet-wa        — Baileys WhatsApp native service (port 4000, internal only)
 *
 * This file is copied by install-pm2.sh and updater.sh to APP_DIR/ecosystem.config.js
 */

const APP_DIR = process.env.APP_DIR || '/var/www/salfanet-radius';

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. Next.js Frontend (standalone server.js, port 3000)
    //    UI pages + NextAuth authentication routes
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-frontend',
      script: 'frontend/.next/standalone/frontend/server.js',
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
        // Backend API URL for server-side fetch (SSR/generateMetadata)
        BACKEND_URL: 'http://127.0.0.1:3001',
        // Client-side: empty = relative path (nginx routes /api/* → backend)
        NEXT_PUBLIC_API_URL: '',
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 */6 * * *',
    },

    // ─────────────────────────────────────────────────────────────────────
    // 2. Next.js Backend (standalone server.js, port 3001)
    //    API routes + Prisma + MikroTik/RADIUS services
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-backend',
      script: 'backend/.next/standalone/backend/server.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '400M',
      node_args: [
        '--max-old-space-size=350',
        '--max-semi-space-size=8',
        '--optimize-for-size',
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=350',
        PORT: 3001,
        HOSTNAME: '127.0.0.1',
        TZ: 'Asia/Jakarta',
        CRON_SECRET: process.env.CRON_SECRET || '',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
    },

    // ─────────────────────────────────────────────────────────────────────
    // 3. Cron Runner (calls backend APIs on schedule)
    //    Standalone tsx process — no HTTP server, just scheduled API calls
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-cron',
      script: 'backend/node_modules/.bin/tsx',
      args: ['backend/cron-runner.ts'],
      interpreter: 'none',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '150M',
      node_args: [
        '--max-old-space-size=120',
        '--max-semi-space-size=4',
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=120',
        TZ: 'Asia/Jakarta',
        CRON_API_URL: 'http://127.0.0.1:3001',
        CRON_SECRET: process.env.CRON_SECRET || '',
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
    // 4. Baileys WhatsApp Native Service
    //    Listens on 127.0.0.1:4000 (internal only, proxied via /api/whatsapp)
    //    Auth files: /var/data/salfanet/baileys_auth/
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-wa',
      script: './backend/wa-service.js',
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
