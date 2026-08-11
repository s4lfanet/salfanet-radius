/**
 * PM2 Ecosystem Configuration — Salfanet Radius (NestJS Migration)
 *
 * Three managed processes:
 *   1. salfanet-frontend  — Next.js standalone (port 3000)
 *   2. salfanet-backend   — NestJS API server + cron jobs (port 3001)
 *   3. salfanet-wa        — Baileys WhatsApp service (port 4000, internal)
 *
 * Deployment:
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save
 *
 * The backend process handles both API requests AND cron jobs via
 * @nestjs/schedule. Legacy cron runner has been removed.
 */

const APP_DIR = process.env.APP_DIR || '/var/www/salfanet-radius';

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────
    // 1. Next.js Frontend (standalone server.js, port 3000)
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-frontend',
      script: 'frontend/.next/standalone/server.js',
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
        // Point frontend to NestJS backend
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
        // Legacy fallback: if backend is down, frontend can still use /api/*
        // (legacy Next.js routes still active during migration)
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
    // 2. NestJS Backend API Server (port 3001)
    //    Handles all /api/v1/* requests + cron jobs via @nestjs/schedule
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'salfanet-backend',
      script: 'backend/dist/main.js',
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
        TZ: 'Asia/Jakarta',
        CORS_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000',
        // Database, auth, and external service vars are read from backend/.env
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
    // 3. Baileys WhatsApp Native Service (port 4000, internal only)
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
