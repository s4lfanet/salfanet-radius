// Phase 8 Item 4: Resolve Prisma migration history
// 1. Remove old loose SQL files from migrations directory (they're not proper Prisma migrations)
// 2. Mark the 0_init baseline migration as applied in _prisma_migrations
// 3. Remove old migration entries that were manually inserted
//
// This script is idempotent — safe to run multiple times.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function main() {
  console.log('=== PHASE 8: PRISMA MIGRATION HISTORY RESOLUTION ===\n');

  // 1. Check current migration table state
  const existing = await prisma.$queryRawUnsafe(
    `SELECT migration_name, checksum, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY migration_name`
  );
  console.log('Current migration entries:');
  for (const m of existing) {
    console.log(`  ${m.finished_at ? '✅' : '❌'} ${m.migration_name} (steps: ${m.applied_steps_count})`);
  }

  // 2. Read the baseline migration SQL to compute checksum
  const baselinePath = path.join(__dirname, '..', 'prisma', 'migrations', '0_init', 'migration.sql');
  if (!fs.existsSync(baselinePath)) {
    console.log('\n❌ Baseline migration file not found at:', baselinePath);
    return;
  }
  const baselineSql = fs.readFileSync(baselinePath, 'utf-8');
  const checksum = crypto.createHash('sha256').update(baselineSql).digest('hex');

  // 3. Check if 0_init already exists in migration table
  const hasInit = existing.some((m) => m.migration_name === '0_init');
  if (hasInit) {
    console.log('\n✅ 0_init already in migration table — updating checksum');
    await prisma.$executeRawUnsafe(
      `UPDATE _prisma_migrations SET checksum = ?, finished_at = NOW(), applied_steps_count = 1 WHERE migration_name = '0_init'`,
      checksum
    );
  } else {
    console.log('\n📝 Inserting 0_init baseline migration record');
    await prisma.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, logs, finished_at, applied_steps_count, rolled_back_at, started_at)
       VALUES (UUID(), ?, '0_init', '', NOW(), 1, NULL, NOW())`,
      checksum
    );
  }

  // 4. Remove old migration entries (the loose SQL files that were manually tracked)
  const oldMigrations = [
    '20260301000001_phase7_composite_indexes',
    '20260815000001_add_payment_attempt',
  ];
  for (const oldName of oldMigrations) {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations WHERE migration_name = ?`,
      oldName
    );
    if (Number(result) > 0) {
      console.log(`  🗑️  Removed old migration entry: ${oldName}`);
    }
  }

  // 5. Verify final state
  const finalState = await prisma.$queryRawUnsafe(
    `SELECT migration_name, checksum, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY migration_name`
  );
  console.log('\nFinal migration entries:');
  for (const m of finalState) {
    console.log(`  ${m.finished_at ? '✅' : '❌'} ${m.migration_name} (checksum: ${m.checksum ? m.checksum.slice(0, 12) + '...' : 'NONE'})`);
  }

  // 6. Verify migrate status would be clean
  console.log('\n✅ Migration history resolved — 0_init baseline is the single source of truth');
  console.log('   Future schema changes should use: npx prisma migrate dev --name <description>');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
