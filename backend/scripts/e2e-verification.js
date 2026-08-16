const { PrismaClient } = require('@prisma/client');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const p = new PrismaClient();

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  E2E PRODUCTION VERIFICATION — SalfaNet Radius');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─── 1. Routers (MikroTik) ────────────────────────────────────────
  console.log('━━━ 1. MIKROTIK ROUTERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const routers = await p.router.findMany({
    select: { id: true, name: true, ipAddress: true, mikrotikEnabled: true, apiPort: true, status: true, username: true }
  });
  console.log(`Total routers: ${routers.length}`);
  for (const r of routers) {
    console.log(`  - ${r.name}: ${r.ipAddress}:${r.apiPort || 8728} enabled=${r.mikrotikEnabled} status=${r.status} user=${r.username}`);
  }

  // ─── 2. GenieACS ──────────────────────────────────────────────────
  console.log('\n━━━ 2. GENIEACS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const genieacsSettings = await p.setting.findMany({
    where: { OR: [{ key: { contains: 'genieacs' } }, { key: { contains: 'acs' } }] }
  });
  console.log(`GenieACS settings in DB: ${genieacsSettings.length}`);
  for (const s of genieacsSettings) {
    const val = s.value || '';
    // Mask sensitive values
    const display = val.length > 80 ? val.substring(0, 80) + '...' : val;
    console.log(`  - ${s.key}: ${display}`);
  }

  // Try to connect to GenieACS API
  const genieacsUrl = genieacsSettings.find(s => s.key.includes('url'))?.value;
  if (genieacsUrl) {
    try {
      console.log(`\n  Testing GenieACS connection: ${genieacsUrl}`);
      const res = await fetch(genieacsUrl.replace(/\/$/, ''));
      console.log(`  GenieACS HTTP status: ${res.status}`);
      if (res.body) console.log(`  Response: ${res.body.substring(0, 200)}`);
    } catch (e) {
      console.log(`  GenieACS connection FAILED: ${e.message}`);
    }
  } else {
    // Check if GenieACS is running locally
    try {
      const res = await fetch('http://localhost:7557');
      console.log(`  GenieACS on localhost:7557 — HTTP ${res.status}`);
    } catch (e) {
      console.log(`  GenieACS on localhost:7557 — NOT reachable: ${e.message}`);
    }
    try {
      const res = await fetch('http://localhost:7547');
      console.log(`  GenieACS UI on localhost:7547 — HTTP ${res.status}`);
    } catch (e) {
      console.log(`  GenieACS UI on localhost:7547 — NOT reachable: ${e.message}`);
    }
  }

  // ─── 3. Telegram ──────────────────────────────────────────────────
  console.log('\n━━━ 3. TELEGRAM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const telegramSettings = await p.setting.findMany({
    where: { OR: [{ key: { contains: 'telegram' } }, { key: { contains: 'notif' } }] }
  });
  console.log(`Telegram settings in DB: ${telegramSettings.length}`);
  for (const s of telegramSettings) {
    const val = s.value || '';
    const masked = (s.key.includes('token') || s.key.includes('chat'))
      ? val.substring(0, 10) + '***'
      : val;
    console.log(`  - ${s.key}: ${masked}`);
  }

  // ─── 4. WhatsApp ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 4. WHATSAPP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const waProviders = await p.whatsappProvider.findMany({
    select: { id: true, name: true, phoneNumber: true, status: true, provider: true }
  });
  console.log(`WhatsApp providers: ${waProviders.length}`);
  for (const w of waProviders) {
    console.log(`  - ${w.name}: phone=${w.phoneNumber} status=${w.status} provider=${w.provider}`);
  }

  // ─── 5. FreeRADIUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 5. FREERADIUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const freeradiusStatus = execSync('systemctl is-active freeradius 2>&1').toString().trim();
    console.log(`  Service status: ${freeradiusStatus}`);
  } catch (e) {
    console.log(`  Service status check failed: ${e.message}`);
  }
  try {
    const radcheckCount = await p.radcheck.count();
    const radreplyCount = await p.radreply.count();
    const radusergroupCount = await p.radusergroup.count();
    const radacctCount = await p.radacct.count();
    console.log(`  radcheck: ${radcheckCount} records`);
    console.log(`  radreply: ${radreplyCount} records`);
    console.log(`  radusergroup: ${radusergroupCount} records`);
    console.log(`  radacct: ${radacctCount} records`);
  } catch (e) {
    console.log(`  RADIUS tables query failed: ${e.message}`);
  }

  // ─── 6. PPPoE Users ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 6. PPPOE USERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const pppoeUsers = await p.pppoeUser.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('PPPoE users by status:');
  for (const g of pppoeUsers) {
    console.log(`  ${g.status}: ${g._count}`);
  }

  // ─── 7. External Tasks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 7. EXTERNAL TASKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const taskStats = await p.externalTask.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('External tasks by status:');
  for (const g of taskStats) {
    console.log(`  ${g.status}: ${g._count}`);
  }

  const recentTasks = await p.externalTask.findMany({
    orderBy: { lastAttemptAt: 'desc' },
    take: 5,
    select: { id: true, operation: true, status: true, retryCount: true, lastError: true, lastAttemptAt: true }
  });
  console.log('\nRecent tasks:');
  for (const t of recentTasks) {
    console.log(`  ${t.id} | op=${t.operation} status=${t.status} retries=${t.retryCount} lastAttempt=${t.lastAttemptAt}`);
    if (t.lastError) console.log(`    error: ${t.lastError.substring(0, 100)}`);
  }

  // ─── 8. RADIUS Sync Queue ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 8. RADIUS SYNC QUEUE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const radiusQueueStats = await p.radiusSyncQueue.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('RADIUS sync queue by status:');
  for (const g of radiusQueueStats) {
    console.log(`  ${g.status}: ${g._count}`);
  }

  // ─── 9. Cron History (recent) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 9. CRON HISTORY (last 24h) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCron = await p.cronHistory.findMany({
    where: { startedAt: { gte: yesterday } },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: { jobType: true, status: true, startedAt: true, duration: true, error: true }
  });
  console.log(`Recent cron runs (last 24h): ${recentCron.length}`);
  for (const c of recentCron) {
    console.log(`  ${c.startedAt.toISOString()} | ${c.jobType} | ${c.status} | ${c.duration}ms`);
    if (c.error) console.log(`    error: ${c.error.substring(0, 100)}`);
  }

  // ─── 10. Invoices/Payments summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 10. INVOICES & PAYMENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const invoiceStats = await p.invoice.groupBy({
    by: ['status'],
    _count: true,
    _sum: { amount: true }
  });
  console.log('Invoices by status:');
  for (const g of invoiceStats) {
    console.log(`  ${g.status}: ${g._count} invoices, total ${g._sum.amount}`);
  }

  const paymentCount = await p.payment.count();
  const paymentSum = await p.payment.aggregate({ _sum: { amount: true } });
  console.log(`\nPayments: ${paymentCount} total, sum: ${paymentSum._sum.amount}`);

  // ─── 11. PM2 processes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 11. PM2 PROCESSES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const pm2Status = execSync('pm2 jlist 2>/dev/null').toString();
    const procs = JSON.parse(pm2Status);
    for (const proc of procs) {
      console.log(`  ${proc.name}: ${proc.pm2_env.status} (pid=${proc.pid}, restarts=${proc.pm2_env.restart_time}, uptime=${Math.round((Date.now() - proc.pm2_env.pm_uptime) / 1000)}s)`);
    }
  } catch (e) {
    console.log(`  PM2 check failed: ${e.message}`);
  }

  // ─── 12. Nginx ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 12. NGINX ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const nginxStatus = execSync('systemctl is-active nginx 2>&1').toString().trim();
    console.log(`  Service status: ${nginxStatus}`);
  } catch (e) {
    console.log(`  Service check failed: ${e.message}`);
  }

  // ─── 13. Backend health ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 13. BACKEND HEALTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const res = await fetch('http://localhost:3001/api/health');
    console.log(`  Backend /api/health: ${res.status}`);
    console.log(`  Response: ${res.body.substring(0, 200)}`);
  } catch (e) {
    console.log(`  Backend health check FAILED: ${e.message}`);
  }

  try {
    const res = await fetch('http://localhost:3000');
    console.log(`  Frontend (port 3000): ${res.status}`);
  } catch (e) {
    console.log(`  Frontend check FAILED: ${e.message}`);
  }

  // ─── 14. GenieACS devices in DB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 14. GENIEACS DEVICES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const genieacsDevices = await p.genieacsDevice.count();
    console.log(`  GenieACS devices in DB: ${genieacsDevices}`);
    const sampleDevices = await p.genieacsDevice.findMany({
      take: 3,
      select: { id: true, deviceId: true, status: true, lastContact: true }
    });
    for (const d of sampleDevices) {
      console.log(`  - id=${d.id} deviceId=${d.deviceId} status=${d.status} lastContact=${d.lastContact}`);
    }
  } catch (e) {
    console.log(`  GenieACS devices query failed: ${e.message}`);
  }

  await p.$disconnect();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  E2E VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
})().catch(e => {
  console.error('FATAL ERROR:', e.message);
  process.exit(1);
});
