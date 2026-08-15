// Phase 8 Audit 5: Production-vs-Schema Migration Drift
// Compare actual production DB tables/columns against Prisma schema
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== PHASE 8: PRODUCTION-vs-SCHEMA DRIFT CHECK ===\n');

  // 1. Get all tables in production DB
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`Production tables: ${tables.length}`);
  const dbTableNames = tables.map(t => t.table_name || t.TABLE_NAME);

  // 2. Parse schema.prisma for @@map annotations
  const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const schemaModels = [];
  const modelRegex = /model (\w+) \{[\s\S]*?@@map\("(\w+)"\)/g;
  let match;
  while ((match = modelRegex.exec(schema)) !== null) {
    schemaModels.push({ modelName: match[1], tableName: match[2] });
  }
  console.log(`Schema models with @@map: ${schemaModels.length}`);

  // 3. Find tables in DB but not in schema
  const schemaTableNames = schemaModels.map(m => m.tableName);
  const dbOnlyTables = dbTableNames.filter(t => !schemaTableNames.includes(t));
  const schemaOnlyTables = schemaTableNames.filter(t => !dbTableNames.includes(t));

  console.log('\n=== TABLES IN DB BUT NOT IN SCHEMA ===');
  if (dbOnlyTables.length === 0) console.log('  None ✅');
  else for (const t of dbOnlyTables) console.log(`  ❌ ${t}`);

  console.log('\n=== TABLES IN SCHEMA BUT NOT IN DB ===');
  if (schemaOnlyTables.length === 0) console.log('  None ✅');
  else for (const t of schemaOnlyTables) console.log(`  ❌ ${t}`);

  // 4. For each table that exists in both, compare columns
  console.log('\n=== COLUMN DRIFT CHECK ===');
  let driftCount = 0;

  for (const model of schemaModels) {
    if (!dbTableNames.includes(model.tableName)) continue;

    // Get DB columns
    const dbCols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_key
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?
      ORDER BY ordinal_position
    `, model.tableName);
    const dbColNames = dbCols.map(c => c.column_name || c.COLUMN_NAME);

    // Parse schema columns for this model
    const modelRegex2 = new RegExp(`model ${model.modelName} \\{([\\s\\S]*?)\\}`);
    const modelMatch = schema.match(modelRegex2);
    if (!modelMatch) continue;

    const modelBody = modelMatch[1];
    const schemaCols = [];
    const fieldRegex = /^\s+(\w+)\s+(\S+)/gm;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(modelBody)) !== null) {
      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      // Skip Prisma directives, relations, and annotations
      if (['id', 'map', 'unique', 'index', 'relation'].includes(fieldName.toLowerCase())) continue;
      if (fieldName.startsWith('@@') || fieldName.startsWith('//')) continue;
      // Check for @map annotation
      const mapMatch = modelBody.match(new RegExp(`\\s${fieldName}\\s+\\S+[\\s\\S]*?@map\\("([^"]+)"\\)`));
      const dbColName = mapMatch ? mapMatch[1] : fieldName;
      schemaCols.push({ fieldName, dbColName, fieldType });
    }

    // Find columns in schema but not in DB
    const schemaColNames = schemaCols.map(c => c.dbColName);
    const missingInDb = schemaColNames.filter(c => !dbColNames.includes(c));
    const missingInSchema = dbColNames.filter(c => !schemaColNames.includes(c));

    if (missingInDb.length > 0 || missingInSchema.length > 0) {
      driftCount++;
      console.log(`\n  ⚠️  ${model.tableName} (${model.modelName}):`);
      if (missingInDb.length > 0) {
        console.log(`    In schema but NOT in DB: ${missingInDb.join(', ')}`);
      }
      if (missingInSchema.length > 0) {
        console.log(`    In DB but NOT in schema: ${missingInSchema.join(', ')}`);
      }
    }
  }

  if (driftCount === 0) {
    console.log('\n  ✅ No column drift detected');
  } else {
    console.log(`\n  ⚠️  ${driftCount} tables have column drift`);
  }

  // 5. Check migration table state
  console.log('\n=== MIGRATION TABLE STATE ===');
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, applied_steps_count,
      CASE WHEN finished_at IS NULL THEN 'UNFINISHED' ELSE 'APPLIED' END as state
    FROM _prisma_migrations ORDER BY migration_name
  `);
  for (const m of migrations) {
    console.log(`  ${m.state === 'APPLIED' ? '✅' : '❌'} ${m.migration_name}`);
  }

  // 6. Check for duplicate migration entries
  console.log('\n=== MIGRATION DUPLICATES ===');
  const dupes = await prisma.$queryRawUnsafe(`
    SELECT migration_name, COUNT(*) as cnt FROM _prisma_migrations
    GROUP BY migration_name HAVING cnt > 1
  `);
  if (dupes.length === 0) console.log('  No duplicates ✅');
  else for (const d of dupes) console.log(`  ❌ ${d.migration_name}: ${d.cnt} entries`);

  // 7. Check cron_history indexes
  console.log('\n=== CRON_HISTORY INDEXES ===');
  const cronIndexes = await prisma.$queryRawUnsafe(`
    SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) as cols
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'cron_history'
    GROUP BY index_name ORDER BY index_name
  `);
  for (const idx of cronIndexes) {
    console.log(`  ${idx.index_name}: (${idx.cols})`);
  }

  // 8. Check cron_history row count and age
  console.log('\n=== CRON_HISTORY STATS ===');
  const cronStats = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) as total,
      MIN(startedAt) as oldest,
      MAX(startedAt) as newest,
      SUM(CASE WHEN startedAt < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as older_than_7d,
      SUM(CASE WHEN startedAt < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as older_than_30d
    FROM cron_history
  `);
  console.log(`  Total rows: ${cronStats[0].total}`);
  console.log(`  Oldest: ${cronStats[0].oldest}`);
  console.log(`  Newest: ${cronStats[0].newest}`);
  console.log(`  Older than 7 days: ${cronStats[0].older_than_7d}`);
  console.log(`  Older than 30 days: ${cronStats[0].older_than_30d}`);

  // 9. Financial ledger consistency check
  console.log('\n=== FINANCIAL LEDGER CONSISTENCY ===');

  // Check: sum of payments for each user vs their balance
  const balanceCheck = await prisma.$queryRawUnsafe(`
    SELECT
      u.id,
      u.username,
      u.balance,
      COALESCE(SUM(p.amount), 0) as total_payments,
      u.balance - COALESCE(SUM(p.amount), 0) as difference
    FROM pppoe_users u
    LEFT JOIN payments p ON p.invoiceId IN (SELECT id FROM invoices WHERE userId = u.id)
    GROUP BY u.id, u.username, u.balance
    HAVING difference != 0
    LIMIT 20
  `);
  if (balanceCheck.length === 0) {
    console.log('  ✅ All user balances match sum of payments');
  } else {
    console.log(`  ⚠️  ${balanceCheck.length} users with balance != sum of payments:`);
    for (const b of balanceCheck) {
      console.log(`    ${b.username}: balance=${b.balance}, payments=${b.total_payments}, diff=${b.difference}`);
    }
  }

  // Check: invoice status vs payment existence
  const invoicePaymentCheck = await prisma.$queryRawUnsafe(`
    SELECT
      i.id,
      i.invoiceNumber,
      i.status,
      i.amount,
      COALESCE(p.amount, 0) as payment_amount,
      CASE
        WHEN i.status = 'PAID' AND p.amount IS NULL THEN 'PAID but no payment record'
        WHEN i.status = 'PENDING' AND p.amount IS NOT NULL THEN 'PENDING but has payment record'
        WHEN i.status = 'PAID' AND p.amount != i.amount THEN 'Amount mismatch'
      END as issue
    FROM invoices i
    LEFT JOIN payments p ON p.invoiceId = i.id
    WHERE (i.status = 'PAID' AND p.amount IS NULL)
       OR (i.status = 'PENDING' AND p.amount IS NOT NULL)
       OR (i.status = 'PAID' AND p.amount IS NOT NULL AND p.amount != i.amount)
    LIMIT 20
  `);
  if (invoicePaymentCheck.length === 0) {
    console.log('  ✅ All invoice statuses match payment records');
  } else {
    console.log(`  ⚠️  ${invoicePaymentCheck.length} invoice/payment inconsistencies:`);
    for (const inv of invoicePaymentCheck) {
      console.log(`    ${inv.invoiceNumber}: ${inv.issue}`);
    }
  }

  // Check: duplicate payments for same invoice
  const duplicatePayments = await prisma.$queryRawUnsafe(`
    SELECT invoiceId, COUNT(*) as cnt
    FROM payments
    GROUP BY invoiceId HAVING cnt > 1
  `);
  if (duplicatePayments.length === 0) {
    console.log('  ✅ No duplicate payments');
  } else {
    console.log(`  ❌ ${duplicatePayments.length} invoices with duplicate payments:`);
    for (const d of duplicatePayments) {
      console.log(`    Invoice ${d.invoiceId}: ${d.cnt} payments`);
    }
  }

  // 10. Table sizes
  console.log('\n=== TABLE SIZES ===');
  const sizeTables = ['pppoe_users', 'invoices', 'payments', 'payment_attempts', 'radacct',
    'external_task', 'radius_sync_queue', 'cron_history', 'cron_lock', 'cron_schedule_config',
    'activity_log', 'customer_sessions', 'webhook_logs'];
  for (const table of sizeTables) {
    try {
      const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      console.log(`  ${table}: ${count[0].cnt} rows`);
    } catch (e) {
      console.log(`  ${table}: (not found)`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
