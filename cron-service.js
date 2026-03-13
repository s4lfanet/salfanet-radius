#!/usr/bin/env node

/**
 * Standalone Cron Service for SALFANET RADIUS
 *
 * This script runs independently from Next.js server
 * Start with: pm2 start cron-service.js --name salfanet-cron
 */

const cron = require('node-cron');
const { execSync } = require('child_process');

// Use node-fetch for Node.js versions without built-in fetch
let fetch;
try {
  fetch = globalThis.fetch;
} catch (e) {
  fetch = require('node-fetch');
}

const API_URL = process.env.API_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || null;

console.log('[CRON SERVICE] Starting cron service...');
console.log('[CRON SERVICE] API URL:', API_URL);
console.log('[CRON SERVICE] Node version:', process.version);
console.log('[CRON SERVICE] Redis:', REDIS_URL ? 'Enabled (' + REDIS_URL.replace(/:\/\/.*@/, '://***@') + ')' : 'Disabled (in-process mode)');

// ==================== REDIS DISTRIBUTED LOCK ====================

let redisClient = null;

if (REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      commandTimeout: 2000,
      retryStrategy: (times) => times >= 3 ? null : Math.min(times * 500, 2000),
    });
    redisClient.on('connect', () => console.log('[CRON] Redis connected'));
    redisClient.on('error', (err) => {
      if (redisClient) console.warn('[CRON] Redis error (fallback mode):', err.message);
    });
  } catch (err) {
    console.warn('[CRON] ioredis not available, running without distributed lock:', err.message);
    redisClient = null;
  }
}

/**
 * Acquire distributed lock via Redis SET NX.
 * Mencegah 2 proses PM2 menjalankan job yang sama bersamaan.
 * @param {string} lockKey - Unique key untuk job
 * @param {number} ttlSeconds - Berapa lama lock valid (timeout)
 * @returns {Promise<boolean>} true jika berhasil acquire lock
 */
async function acquireLock(lockKey, ttlSeconds) {
  if (!redisClient) return true; // Tidak ada Redis, anggap lock selalu berhasil
  try {
    const result = await redisClient.set(
      `lock:cron:${lockKey}`,
      process.pid.toString(),
      'EX', ttlSeconds,
      'NX'
    );
    return result === 'OK';
  } catch {
    return true; // Redis error — allow execution
  }
}

async function releaseLock(lockKey) {
  if (!redisClient) return;
  try {
    await redisClient.del(`lock:cron:${lockKey}`);
  } catch { /* ignore */ }
}

/**
 * Sync online users ke Redis dari radacct DB.
 * Dipanggil via API endpoint agar bisa menggunakan Prisma.
 */
async function syncOnlineUsers() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${API_URL}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'SALFANET-CRON-SERVICE' },
      body: JSON.stringify({ type: 'sync_online_users' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    console.log('[CRON] Online users sync:', data.success ? '✓' : '✗', data.message || '');
  } catch (err) {
    console.warn('[CRON] Online users sync failed (non-critical):', err.message);
  }
}

/**
 * Execute cron job via API endpoint.
 * @param {string} jobType
 * @param {string} description
 * @param {{ lockTtl?: number }} [options] - lockTtl: detik lock (0 = no lock)
 */
async function runCronJob(jobType, description, options = {}) {
  const { lockTtl = 0 } = options;
  const maxRetries = 3;
  let lastError = null;

  // Distributed lock — hanya untuk job yang TIDAK boleh double-run
  if (lockTtl > 0 && redisClient) {
    const locked = await acquireLock(jobType, lockTtl);
    if (!locked) {
      console.log(`[CRON] ${description} — skipped (already running on another process)`);
      return { success: true, skipped: true };
    }
  }

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[CRON] Running ${description} (attempt ${attempt}/${maxRetries})...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${API_URL}/api/cron`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SALFANET-CRON-SERVICE',
          },
          body: JSON.stringify({ type: jobType }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`[CRON] ${description} completed:`, result.success ? '✓' : '✗', result.message || '');
        return result;
      } catch (error) {
        lastError = error;
        console.error(`[CRON] ${description} failed (attempt ${attempt}):`, error.message);

        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`[CRON] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error(`[CRON] ${description} failed after ${maxRetries} attempts`);
    return { success: false, error: lastError?.message || 'Unknown error' };
  } finally {
    // Release lock setelah selesai (atau setelah semua retry gagal)
    if (lockTtl > 0 && redisClient) {
      await releaseLock(jobType);
    }
  }
}

// ==================== CRON SCHEDULES ====================

// 1. Hotspot Voucher Sync - Every minute
cron.schedule('* * * * *', async () => {
  await runCronJob('hotspot_sync', 'Hotspot Voucher Sync');
});

// 2. PPPoE Auto Isolir - Every hour (with lock, max 5 min run time)
cron.schedule('0 * * * *', async () => {
  await runCronJob('pppoe_auto_isolir', 'PPPoE Auto Isolir', { lockTtl: 300 });
});

// 3. Agent Sales Recording - Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await runCronJob('agent_sales', 'Agent Sales Recording');
});

// 4. Invoice Generation - Daily at 7 AM (with lock — KRITIS: jangan double billing)
// PREPAID: uses H+invoiceGenerateDays to H+30 expiredAt window.
// POSTPAID (tagihan tetap): generates only when today == user.billingDay (default: 1st of month).
cron.schedule('0 7 * * *', async () => {
  await runCronJob('invoice_generate', 'Invoice Generation', { lockTtl: 600 });
});

// 5. Invoice Reminder - Every hour
cron.schedule('0 * * * *', async () => {
  await runCronJob('invoice_reminder', 'Invoice Reminder');
});

// 6. Invoice Status Update - Every hour
cron.schedule('0 * * * *', async () => {
  await runCronJob('invoice_status_update', 'Invoice Status Update');
});

// 7. Notification Check - Every 6 hours
cron.schedule('0 */6 * * *', async () => {
  await runCronJob('notification_check', 'Notification Check');
});

// 8. Session Monitoring - Every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  await runCronJob('session_monitor', 'Session Security Monitoring');
});

// 9. Disconnect Expired Sessions - Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await runCronJob('disconnect_sessions', 'Disconnect Expired Sessions');
});

// 10. Activity Log Cleanup - Daily at 2 AM (with lock)
cron.schedule('0 2 * * *', async () => {
  await runCronJob('activity_log_cleanup', 'Activity Log Cleanup', { lockTtl: 300 });
});

// 11. Auto Renewal - Daily at 8 AM (with lock — KRITIS: jangan double charge)
cron.schedule('0 8 * * *', async () => {
  await runCronJob('auto_renewal', 'Auto Renewal', { lockTtl: 600 });
});

// 12. Webhook Log Cleanup - Daily at 3 AM (with lock)
cron.schedule('0 3 * * *', async () => {
  await runCronJob('webhook_log_cleanup', 'Webhook Log Cleanup', { lockTtl: 300 });
});

// 13. FreeRADIUS Health Check - Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await runCronJob('freeradius_health', 'FreeRADIUS Health Check');
});

// 16. PPPoE Session Sync - Every 5 minutes (sync MikroTik ↔ radacct)
cron.schedule('*/5 * * * *', async () => {
  await runCronJob('pppoe_session_sync', 'PPPoE Session Sync', { lockTtl: 120 });
});

// 14. Sync Online Users ke Redis - Every 5 minutes (jika Redis tersedia)
if (REDIS_URL) {
  cron.schedule('*/5 * * * *', async () => {
    await syncOnlineUsers();
  });
}

// 15. Suspend Check - Every hour (activate/restore suspended users)
cron.schedule('0 * * * *', async () => {
  await runCronJob('suspend_check', 'Suspend Check');
});

// 16. Cron History Cleanup - Daily at 4 AM (keep table size small)
cron.schedule('0 4 * * *', async () => {
  await runCronJob('cron_history_cleanup', 'Cron History Cleanup', { lockTtl: 120 });
});

console.log('[CRON SERVICE] All cron jobs initialized successfully!');
console.log('[CRON SERVICE] Schedules:');
console.log('  - Hotspot Sync: Every minute');
console.log('  - PPPoE Auto Isolir: Every hour [LOCKED]');
console.log('  - Agent Sales: Every 5 minutes');
console.log('  - Invoice Generation: Daily at 7 AM [LOCKED]');
console.log('  - Invoice Reminder: Every hour');
console.log('  - Invoice Status Update: Every hour');
console.log('  - Notification Check: Every 6 hours');
console.log('  - Session Monitoring: Every 15 minutes');
console.log('  - Disconnect Sessions: Every 5 minutes');
console.log('  - Activity Log Cleanup: Daily at 2 AM [LOCKED]');
console.log('  - Auto Renewal: Daily at 8 AM [LOCKED]');
console.log('  - Webhook Log Cleanup: Daily at 3 AM [LOCKED]');
console.log('  - FreeRADIUS Health Check: Every 5 minutes')
console.log('  - PPPoE Session Sync: Every 5 minutes [LOCKED]');
console.log('  - Suspend Check: Every hour');
if (REDIS_URL) {
  console.log('  - Sync Online Users (Redis): Every 5 minutes');
}

// Keep the process running
process.on('SIGINT', () => {
  console.log('[CRON SERVICE] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[CRON SERVICE] Received SIGTERM, shutting down...');
  process.exit(0);
});
