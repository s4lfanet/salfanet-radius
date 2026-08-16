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

function mask(val) {
  if (!val) return '(empty)';
  if (val.length <= 15) return val.substring(0, 5) + '***';
  return val.substring(0, 10) + '***' + val.substring(val.length - 4);
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  E2E PRODUCTION VERIFICATION — SalfaNet Radius');
  console.log('  Date: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─── 1. MikroTik Routers ──────────────────────────────────────────
  console.log('━━━ 1. MIKROTIK ROUTERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const routers = await p.router.findMany({
      select: { id: true, name: true, ipAddress: true, isActive: true, port: true, type: true, nasname: true, username: true }
    });
    console.log(`Total routers: ${routers.length}`);
    for (const r of routers) {
      console.log(`  - ${r.name}: ip=${r.ipAddress}:${r.port} type=${r.type} active=${r.isActive} nas=${r.nasname} user=${r.username || '(none)'}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 2. GenieACS ──────────────────────────────────────────────────
  console.log('\n━━━ 2. GENIEACS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const acsSettings = await p.genieacsSettings.findFirst({ where: { isActive: true } });
    if (acsSettings) {
      console.log(`  GenieACS host: ${acsSettings.host}`);
      console.log(`  Username: ${acsSettings.username}`);
      console.log(`  Password: ${mask(acsSettings.password)}`);
      console.log(`  Active: ${acsSettings.isActive}`);

      // Test connection
      try {
        console.log(`\n  Testing connection to ${acsSettings.host}...`);
        const res = await fetch(acsSettings.host.replace(/\/$/, ''));
        console.log(`  HTTP status: ${res.status}`);
        if (res.body) console.log(`  Response: ${res.body.substring(0, 200)}`);
      } catch (e) {
        console.log(`  Connection FAILED: ${e.message}`);
      }
    } else {
      console.log('  No active GenieACS settings found in DB');
    }

    // Check provisions/presets
    const provisions = await p.genieacsProvision.count();
    const presets = await p.genieacsPreset.count();
    const vpScripts = await p.genieacsVpScript.count();
    const virtualParams = await p.genieacsVirtualParameter.count();
    console.log(`\n  Provisions: ${provisions}`);
    console.log(`  Presets: ${presets}`);
    console.log(`  VP Scripts: ${vpScripts}`);
    console.log(`  Virtual Parameters: ${virtualParams}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // Also check if GenieACS process is running
  try {
    const procs = execSync('ps aux | grep -i genieacs | grep -v grep').toString().trim();
    console.log(`\n  GenieACS processes:\n${procs}`);
  } catch (e) {
    console.log('\n  GenieACS process: NOT running');
  }

  // ─── 3. Telegram ──────────────────────────────────────────────────
  console.log('\n━━━ 3. TELEGRAM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const tgSettings = await p.telegramBackupSettings.findFirst();
    if (tgSettings) {
      console.log(`  Enabled: ${tgSettings.enabled}`);
      console.log(`  Bot Token: ${mask(tgSettings.botToken)}`);
      console.log(`  Chat ID: ${tgSettings.chatId}`);
      console.log(`  Health Topic ID: ${tgSettings.healthTopicId || '(none)'}`);
      console.log(`  Backup Topic ID: ${tgSettings.backupTopicId || '(none)'}`);
      console.log(`  Schedule: ${tgSettings.schedule} at ${tgSettings.scheduleTime}`);

      // Test Telegram bot connection
      if (tgSettings.botToken) {
        try {
          console.log('\n  Testing Telegram bot API...');
          const res = await fetch(`https://api.telegram.org/bot${tgSettings.botToken}/getMe`);
          const body = JSON.parse(res.body);
          if (body.ok) {
            console.log(`  Bot OK: @${body.result.username} (${body.result.first_name})`);
          } else {
            console.log(`  Bot API error: ${body.description}`);
          }
        } catch (e) {
          console.log(`  Bot API test FAILED: ${e.message}`);
        }
      }
    } else {
      console.log('  No Telegram settings found in DB');
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 4. WhatsApp ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 4. WHATSAPP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const waProviders = await p.whatsapp_providers.findMany({
      where: { isActive: true }
    });
    console.log(`Active WhatsApp providers: ${waProviders.length}`);
    for (const w of waProviders) {
      console.log(`  - ${w.name}: type=${w.type} sender=${w.senderNumber || '(none)'} priority=${w.priority}`);
      console.log(`    API URL: ${w.apiUrl}`);
    }

    const waHistory = await p.whatsapp_history.count();
    const waRecent = await p.whatsapp_history.findMany({
      orderBy: { sentAt: 'desc' },
      take: 3,
      select: { phone: true, status: true, sentAt: true, providerName: true }
    });
    console.log(`\nWhatsApp history: ${waHistory} total messages`);
    console.log('Recent messages:');
    for (const h of waRecent) {
      console.log(`  ${h.sentAt.toISOString()} | ${h.phone} | ${h.status} | ${h.providerName || ''}`);
    }

    const waTemplates = await p.whatsapp_templates.count({ where: { isActive: true } });
    console.log(`\nActive WhatsApp templates: ${waTemplates}`);

    const waReminder = await p.whatsapp_reminder_settings.findFirst();
    if (waReminder) {
      console.log(`Reminder settings: enabled=${waReminder.enabled} days=${waReminder.reminderDays} otpEnabled=${waReminder.otpEnabled}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 5. FreeRADIUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 5. FREERADIUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const freeradiusStatus = execSync('systemctl is-active freeradius 2>&1').toString().trim();
    console.log(`  Service status: ${freeradiusStatus}`);
  } catch (e) {
    console.log(`  Service check failed: ${e.message}`);
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

    // Sample radcheck
    const sampleRadcheck = await p.radcheck.findMany({ take: 3, select: { username: true, attribute: true, op: true, value: true } });
    console.log('\n  Sample radcheck entries:');
    for (const r of sampleRadcheck) {
      const masked = r.attribute.toLowerCase().includes('password') ? '***' : r.value;
      console.log(`    ${r.username} | ${r.attribute} ${r.op} ${masked}`);
    }
  } catch (e) {
    console.log(`  RADIUS tables query failed: ${e.message}`);
  }

  // ─── 6. PPPoE Users ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 6. PPPOE USERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const pppoeUsers = await p.pppoeUser.groupBy({
      by: ['status'],
      _count: true
    });
    console.log('PPPoE users by status:');
    for (const g of pppoeUsers) {
      console.log(`  ${g.status}: ${g._count}`);
    }

    const totalPppoe = pppoeUsers.reduce((s, g) => s + g._count, 0);
    console.log(`  Total: ${totalPppoe}`);

    // Sample users
    const sampleUsers = await p.pppoeUser.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { username: true, status: true, routerId: true, balance: true, createdAt: true }
    });
    console.log('\n  Recent PPPoE users:');
    for (const u of sampleUsers) {
      console.log(`    ${u.username} | status=${u.status} | balance=${u.balance} | router=${u.routerId} | created=${u.createdAt.toISOString()}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 7. External Tasks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 7. EXTERNAL TASKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
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
      console.log(`  ${t.id} | op=${t.operation} status=${t.status} retries=${t.retryCount} lastAttempt=${t.lastAttemptAt?.toISOString() || 'never'}`);
      if (t.lastError) console.log(`    error: ${t.lastError.substring(0, 150)}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 8. RADIUS Sync Queue ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 8. RADIUS SYNC QUEUE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const radiusQueueStats = await p.radiusSyncQueue.groupBy({
      by: ['status'],
      _count: true
    });
    console.log('RADIUS sync queue by status:');
    for (const g of radiusQueueStats) {
      console.log(`  ${g.status}: ${g._count}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 9. Cron History (recent 24h) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 9. CRON HISTORY (last 24h) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCron = await p.cronHistory.findMany({
      where: { startedAt: { gte: yesterday } },
      orderBy: { startedAt: 'desc' },
      take: 15,
      select: { jobType: true, status: true, startedAt: true, duration: true, error: true }
    });
    console.log(`Recent cron runs (last 24h): ${recentCron.length}`);
    for (const c of recentCron) {
      console.log(`  ${c.startedAt.toISOString()} | ${c.jobType} | ${c.status} | ${c.duration}ms`);
      if (c.error) console.log(`    error: ${c.error.substring(0, 150)}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 10. Invoices & Payments ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 10. INVOICES & PAYMENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
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

    // Recent payments
    const recentPayments = await p.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, amount: true, status: true, method: true, createdAt: true }
    });
    console.log('\n  Recent payments:');
    for (const pay of recentPayments) {
      console.log(`    ${pay.id} | ${pay.amount} | ${pay.status} | ${pay.method} | ${pay.createdAt.toISOString()}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 11. PM2 Processes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 11. PM2 PROCESSES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const pm2Status = execSync('pm2 jlist 2>/dev/null').toString();
    const procs = JSON.parse(pm2Status);
    for (const proc of procs) {
      const uptime = proc.pm2_env.pm_uptime ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 1000) : 0;
      console.log(`  ${proc.name}: ${proc.pm2_env.status} (pid=${proc.pid}, restarts=${proc.pm2_env.restart_time}, uptime=${uptime}s)`);
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

  // ─── 13. Backend & Frontend Health ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 13. BACKEND & FRONTEND HEALTH ━━━━━━━━━━━━━━━━━━━━━━━━━━');
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

  // Try external domain
  try {
    const res = await fetch('https://radius.salfa.my.id/api/health');
    console.log(`  External /api/health: ${res.status}`);
  } catch (e) {
    console.log(`  External health check FAILED: ${e.message}`);
  }

  // ─── 14. Agents ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 14. AGENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const agentCount = await p.agent.count();
    console.log(`  Total agents: ${agentCount}`);
    const agents = await p.agent.findMany({
      take: 3,
      select: { id: true, name: true, balance: true, isActive: true }
    });
    for (const a of agents) {
      console.log(`  - ${a.name}: balance=${a.balance} active=${a.isActive}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 15. Customers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 15. CUSTOMERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const customerCount = await p.customer.count();
    console.log(`  Total customers: ${customerCount}`);

    const byStatus = await p.customer.groupBy({
      by: ['status'],
      _count: true
    });
    console.log('  By status:');
    for (const g of byStatus) {
      console.log(`    ${g.status}: ${g._count}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  // ─── 16. Financial Transactions (Keuangan) ━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ 16. FINANCIAL TRANSACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const txCount = await p.transaction.count();
    const txSum = await p.transaction.aggregate({ _sum: { amount: true } });
    console.log(`  Total transactions: ${txCount}`);
    console.log(`  Sum of amounts: ${txSum._sum.amount}`);

    const byType = await p.transaction.groupBy({
      by: ['type'],
      _count: true,
      _sum: { amount: true }
    });
    console.log('  By type:');
    for (const g of byType) {
      console.log(`    ${g.type}: ${g._count} txns, sum=${g._sum.amount}`);
    }

    const categories = await p.transactionCategory.count();
    console.log(`  Transaction categories: ${categories}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }

  await p.$disconnect();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  E2E VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
})().catch(e => {
  console.error('FATAL ERROR:', e.message);
  process.exit(1);
});
