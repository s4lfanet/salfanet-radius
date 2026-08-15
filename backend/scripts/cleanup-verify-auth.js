// Clean stuck cron records and verify UNKNOWN routes have alternative auth
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
  // 1. Clean stuck "running" cron records (mark as error)
  console.log('=== CLEANING STUCK "running" CRON RECORDS ===');
  const result = await prisma.$queryRawUnsafe(`
    UPDATE cron_history SET status = 'error', error = 'Cleaned: stuck in running state (process crash)'
    WHERE status = 'running' AND startedAt < DATE_SUB(NOW(), INTERVAL 1 HOUR)
  `);
  // MySQL returns affectedRows in a different way
  const checkAfter = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM cron_history WHERE status = 'running'
  `);
  console.log(`  Stuck records remaining: ${checkAfter[0].cnt}`);

  // Also clean stale cron locks
  console.log('\n=== CLEANING STALE CRON LOCKS ===');
  const staleLocks = await prisma.$queryRawUnsafe(`
    SELECT job_key, expires_at FROM cron_lock WHERE expires_at < NOW()
  `);
  console.log(`  Stale locks found: ${staleLocks.length}`);
  for (const l of staleLocks) {
    console.log(`    ${l.job_key} expired: ${l.expires_at}`);
  }
  if (staleLocks.length > 0) {
    await prisma.$queryRawUnsafe(`DELETE FROM cron_lock WHERE expires_at < NOW()`);
    console.log('  Stale locks deleted ✅');
  } else {
    console.log('  No stale locks ✅');
  }

  // 2. Verify UNKNOWN routes have alternative auth
  console.log('\n=== UNKNOWN ROUTES — ALTERNATIVE AUTH CHECK ===');
  const apiRoot = path.join(__dirname, '..', 'src', 'app', 'api');
  function walk(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results = results.concat(walk(full));
      else if (entry.name === 'route.ts') results.push(full);
    }
    return results;
  }
  const routes = walk(apiRoot);

  const unknownRoutes = [];
  for (const r of routes) {
    const content = fs.readFileSync(r, 'utf-8');
    const hasPerm = content.includes('requirePermission') || content.includes('checkAuth');
    const hasSession = content.includes('getServerSession') && !hasPerm;
    if (hasPerm || hasSession) continue;

    const rel = path.relative(apiRoot, r).replace(/\\/g, '/');

    // Skip known legitimate no-auth categories
    if (rel.includes('webhook') || rel.includes('public') || rel.includes('company/info') ||
        rel.includes('company/route') || rel.includes('auth/') || rel.includes('auth/login') ||
        rel.includes('evoucher') || rel.includes('isolated') || rel.includes('pay-manual') ||
        rel.includes('register') || rel.includes('payment/create') || rel.includes('payment/pay')) {
      continue;
    }

    // Check for alternative auth mechanisms
    const hasAgentJwt = content.includes('agent-jwt') || content.includes('verifyAgentToken') || content.includes('agentJwt');
    const hasBearerToken = content.includes('Bearer') || content.includes('authorization') || content.includes('customerSession');
    const hasCronSecret = content.includes('CRON_SECRET') || content.includes('x-cron-secret');
    const hasApiKey = content.includes('x-api-key') || content.includes('API_KEY');
    const hasTechnicianAuth = content.includes('technicianJwt') || content.includes('verifyTechnicianToken');

    let altAuth = [];
    if (hasAgentJwt) altAuth.push('agentJWT');
    if (hasBearerToken) altAuth.push('BearerToken');
    if (hasCronSecret) altAuth.push('CronSecret');
    if (hasApiKey) altAuth.push('ApiKey');
    if (hasTechnicianAuth) altAuth.push('TechnicianJWT');

    unknownRoutes.push({ path: rel, altAuth: altAuth.join(',') || 'NONE' });
  }

  const withAuth = unknownRoutes.filter(r => r.altAuth !== 'NONE');
  const withoutAuth = unknownRoutes.filter(r => r.altAuth === 'NONE');

  console.log(`\n  With alternative auth: ${withAuth.length}`);
  for (const r of withAuth.slice(0, 20)) {
    console.log(`    [${r.altAuth}] ${r.path}`);
  }
  if (withAuth.length > 20) console.log(`    ... and ${withAuth.length - 20} more`);

  console.log(`\n  WITHOUT ANY AUTH: ${withoutAuth.length}`);
  for (const r of withoutAuth) {
    console.log(`    ❌ ${r.path}`);
  }

  // 3. Check cron history cleanup schedule
  console.log('\n=== CRON SCHEDULE CONFIG ===');
  const schedules = await prisma.$queryRawUnsafe(`
    SELECT jobType, schedule, enabled FROM cron_schedule_config ORDER BY jobType
  `);
  for (const s of schedules) {
    console.log(`  ${s.jobType}: ${s.schedule} (enabled=${s.enabled})`);
  }

  // 4. Check cron_history_cleanup retention (look at the cleanup code)
  console.log('\n=== CRON HISTORY CLEANUP RETENTION (from code) ===');
  const cleanupCodePath = path.join(__dirname, '..', 'src', 'server', 'cron', 'jobs.ts');
  if (fs.existsSync(cleanupCodePath)) {
    const code = fs.readFileSync(cleanupCodePath, 'utf-8');
    const cleanupMatch = code.match(/cron_history_cleanup[\s\S]{0,500}deleteMany[\s\S]{0,200}/);
    if (cleanupMatch) {
      console.log('  Cleanup logic found:');
      console.log('  ' + cleanupMatch[0].substring(0, 200).replace(/\n/g, '\n  '));
    } else {
      // Try to find the retention period
      const retentionMatch = code.match(/cron_history[\s\S]{0,300}?(?:days|DAY|interval|INTERVAL)\s*(\d+)/i);
      if (retentionMatch) {
        console.log(`  Retention: ${retentionMatch[1]} days`);
      } else {
        console.log('  Could not find retention period in code');
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
