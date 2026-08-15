// Verify Phase 7 — production state (snake_case columns)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. External task backlog
  console.log('=== EXTERNAL TASK BACKLOG ===');
  try {
    const taskStats = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as cnt FROM external_task GROUP BY status ORDER BY status
    `);
    if (taskStats.length === 0) console.log('  (empty — no tasks queued)');
    for (const t of taskStats) console.log(`  ${t.status}: ${t.cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 2. RADIUS sync queue backlog
  console.log('\n=== RADIUS SYNC QUEUE BACKLOG ===');
  try {
    const radiusStats = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as cnt FROM radius_sync_queue GROUP BY status ORDER BY status
    `);
    if (radiusStats.length === 0) console.log('  (empty — no syncs queued)');
    for (const r of radiusStats) console.log(`  ${r.status}: ${r.cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 3. Stuck external tasks (snake_case: next_retry_at)
  console.log('\n=== STUCK EXTERNAL TASKS (PENDING past next_retry_at) ===');
  try {
    const stuckTasks = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM external_task
      WHERE status = 'PENDING' AND next_retry_at IS NOT NULL AND next_retry_at < NOW()
    `);
    console.log(`  Stuck PENDING tasks: ${stuckTasks[0].cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 4. Stuck RADIUS sync
  console.log('\n=== STUCK RADIUS SYNC (PENDING past next_retry_at) ===');
  try {
    const stuckRadius = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as cnt FROM radius_sync_queue
      WHERE status = 'PENDING' AND next_retry_at IS NOT NULL AND next_retry_at < NOW()
    `);
    console.log(`  Stuck PENDING RADIUS syncs: ${stuckRadius[0].cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 5. DEAD tasks
  console.log('\n=== DEAD TASKS (exhausted retries) ===');
  try {
    const deadTasks = await prisma.$queryRawUnsafe(`
      SELECT entity_type, operation, COUNT(*) as cnt
      FROM external_task WHERE status = 'DEAD' GROUP BY entity_type, operation
    `);
    if (deadTasks.length === 0) console.log('  No dead tasks ✅');
    else for (const d of deadTasks) console.log(`  ${d.entity_type}/${d.operation}: ${d.cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 6. FAILED RADIUS syncs
  console.log('\n=== FAILED RADIUS SYNCS ===');
  try {
    const failedRadius = await prisma.$queryRawUnsafe(`
      SELECT sync_type, COUNT(*) as cnt FROM radius_sync_queue
      WHERE status IN ('FAILED','DEAD') GROUP BY sync_type
    `);
    if (failedRadius.length === 0) console.log('  No failed RADIUS syncs ✅');
    else for (const r of failedRadius) console.log(`  ${r.sync_type}: ${r.cnt}`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 7. Cron lock state
  console.log('\n=== CRON LOCK STATE ===');
  try {
    const locks = await prisma.$queryRawUnsafe(`
      SELECT job_key, owner_token, acquired_at, expires_at,
        CASE WHEN expires_at < NOW() THEN 'EXPIRED' ELSE 'ACTIVE' END as state
      FROM cron_lock
    `);
    if (locks.length === 0) console.log('  No active locks ✅');
    else for (const l of locks) console.log(`  ${l.state}: ${l.job_key} (expires: ${l.expires_at})`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 8. Recent cron history
  console.log('\n=== RECENT CRON HISTORY (last 10) ===');
  try {
    const cronHist = await prisma.$queryRawUnsafe(`
      SELECT job_type, status, started_at, duration FROM cron_history ORDER BY started_at DESC LIMIT 10
    `);
    if (cronHist.length === 0) console.log('  (no cron history)');
    else for (const c of cronHist) console.log(`  ${c.status} ${c.job_type} @ ${c.started_at} (${c.duration}ms)`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 9. Table sizes
  console.log('\n=== TABLE ROW COUNTS ===');
  const tables = ['pppoe_users', 'invoices', 'payments', 'radacct', 'external_task', 'radius_sync_queue', 'cron_history', 'payment_attempts'];
  for (const table of tables) {
    try {
      const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      console.log(`  ${table}: ${count[0].cnt} rows`);
    } catch (e) { console.log(`  ${table}: ERROR`); }
  }

  // 10. Duplicate migration entries
  console.log('\n=== MIGRATION TABLE DUPLICATES ===');
  try {
    const dupes = await prisma.$queryRawUnsafe(`
      SELECT migration_name, COUNT(*) as cnt FROM _prisma_migrations
      GROUP BY migration_name HAVING cnt > 1
    `);
    if (dupes.length === 0) console.log('  No duplicates ✅');
    else for (const d of dupes) console.log(`  ${d.migration_name}: ${d.cnt} entries`);
  } catch (e) { console.log('  ERROR:', e.message.substring(0, 100)); }

  // 11. Permission matrix — count routes using requirePermission vs getServerSession
  console.log('\n=== PERMISSION MATRIX (code-level check) ===');
  const fs = require('fs');
  const path = require('path');
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
  let withPerm = 0, withSession = 0, withNeither = 0;
  const noAuthRoutes = [];
  for (const r of routes) {
    const content = fs.readFileSync(r, 'utf-8');
    const hasPerm = content.includes('requirePermission') || content.includes('checkAuth');
    const hasSession = content.includes('getServerSession') && !hasPerm;
    if (hasPerm) withPerm++;
    else if (hasSession) withSession++;
    else {
      // Skip public routes (webhooks, public, company/info)
      const rel = path.relative(apiRoot, r).replace(/\\/g, '/');
      if (rel.includes('webhook') || rel.includes('public') || rel.includes('company/info') || rel.includes('company/route')) {
        continue;
      }
      withNeither++;
      noAuthRoutes.push(rel);
    }
  }
  console.log(`  Total routes: ${routes.length}`);
  console.log(`  With requirePermission/checkAuth: ${withPerm}`);
  console.log(`  With getServerSession only: ${withSession}`);
  console.log(`  With NO auth: ${withNeither}`);
  if (noAuthRoutes.length > 0 && noAuthRoutes.length <= 20) {
    console.log('  Routes without auth:');
    for (const r of noAuthRoutes) console.log(`    - ${r}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
