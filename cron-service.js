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

console.log('[CRON SERVICE] Starting cron service...');
console.log('[CRON SERVICE] API URL:', API_URL);
console.log('[CRON SERVICE] Node version:', process.version);

/**
 * Execute cron job via API endpoint.
 * @param {string} jobType
 * @param {string} description
 * @param {{ lockTtl?: number }} [options] - lockTtl: detik lock (0 = no lock)
 */
async function runCronJob(jobType, description, options = {}) {
  const maxRetries = 3;
  let lastError = null;

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
  }
}

// ==================== CRON SCHEDULES ====================

// Startup: run FreeRADIUS health check immediately so radgroupreply (isolir) and
// pool-isolir VPS route are initialized before the first scheduled run (5 min).
setTimeout(async () => {
  console.log('[CRON SERVICE] Startup: running freeradius_health to seed isolir radgroupreply...');
  await runCronJob('freeradius_health', 'FreeRADIUS Health Check (startup)');
}, 10000); // 10s delay so Next.js app is fully up before we call the API

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

// Keep the process running
process.on('SIGINT', () => {
  console.log('[CRON SERVICE] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[CRON SERVICE] Received SIGTERM, shutting down...');
  process.exit(0);
});
