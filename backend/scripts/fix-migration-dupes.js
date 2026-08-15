// Fix migration duplicates and check cron history
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Clean up duplicate migration entries — keep only the latest finished one
  console.log('=== CLEANING MIGRATION DUPLICATES ===');
  const dupes = await prisma.$queryRawUnsafe(`
    SELECT migration_name, id, finished_at,
      ROW_NUMBER() OVER (PARTITION BY migration_name ORDER BY finished_at DESC) as rn
    FROM _prisma_migrations
    WHERE migration_name IN ('20260815000001_add_payment_attempt', '20260301000001_phase7_composite_indexes')
    ORDER BY migration_name, rn
  `);
  for (const d of dupes) {
    console.log(`  rn=${d.rn} ${d.migration_name} id=${d.id.substring(0,8)} finished=${d.finished_at}`);
  }

  // Delete duplicates (keep rn=1, the latest finished)
  const toDelete = dupes.filter(d => Number(d.rn) > 1);
  for (const d of toDelete) {
    await prisma.$queryRawUnsafe(`DELETE FROM _prisma_migrations WHERE id = ?`, d.id);
    console.log(`  DELETED duplicate: ${d.migration_name} (id=${d.id.substring(0,8)})`);
  }

  // Also delete the unfinished one (finished_at is null)
  const unfinished = await prisma.$queryRawUnsafe(`
    SELECT id, migration_name FROM _prisma_migrations
    WHERE migration_name = '20260815000001_add_payment_attempt' AND finished_at IS NULL
  `);
  for (const u of unfinished) {
    await prisma.$queryRawUnsafe(`DELETE FROM _prisma_migrations WHERE id = ?`, u.id);
    console.log(`  DELETED unfinished: ${u.migration_name} (id=${u.id.substring(0,8)})`);
  }

  // Verify clean state
  console.log('\n=== MIGRATION TABLE AFTER CLEANUP ===');
  const remaining = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at FROM _prisma_migrations
    WHERE migration_name LIKE '%phase7%' OR migration_name LIKE '%add_payment_attempt%'
    ORDER BY migration_name
  `);
  for (const r of remaining) {
    console.log(`  ${r.finished_at ? '✅' : '❌'} ${r.migration_name}`);
  }

  // 2. Check cron_history columns (Prisma model uses camelCase without @map)
  console.log('\n=== CRON HISTORY COLUMNS ===');
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'cron_history'
    ORDER BY ordinal_position
  `);
  console.log('  Columns:', cols.map(c => c.column_name).join(', '));

  // 3. Recent cron history (use actual column names)
  console.log('\n=== RECENT CRON HISTORY (last 10) ===');
  const cronHist = await prisma.$queryRawUnsafe(`
    SELECT jobType, status, startedAt, duration FROM cron_history ORDER BY startedAt DESC LIMIT 10
  `);
  for (const c of cronHist) {
    console.log(`  ${c.status} ${c.jobType} @ ${c.startedAt} (${c.duration}ms)`);
  }

  // 4. Cron history by job type (last 7 days)
  console.log('\n=== CRON HISTORY BY JOB TYPE (last 7 days) ===');
  const byJob = await prisma.$queryRawUnsafe(`
    SELECT jobType, status, COUNT(*) as cnt,
      MIN(startedAt) as earliest, MAX(startedAt) as latest,
      AVG(duration) as avgDuration
    FROM cron_history
    WHERE startedAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY jobType, status ORDER BY jobType, status
  `);
  for (const j of byJob) {
    console.log(`  ${j.jobType}/${j.status}: ${j.cnt} runs, avg=${Math.round(j.avgDuration || 0)}ms, last=${j.latest}`);
  }

  // 5. Cron history growth (rows per day, last 7 days)
  console.log('\n=== CRON HISTORY GROWTH (rows per day) ===');
  const growth = await prisma.$queryRawUnsafe(`
    SELECT DATE(startedAt) as day, COUNT(*) as cnt
    FROM cron_history
    WHERE startedAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY DATE(startedAt) ORDER BY day DESC
  `);
  for (const g of growth) {
    console.log(`  ${g.day}: ${g.cnt} rows`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
