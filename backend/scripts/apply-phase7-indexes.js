// Temporary script to apply Phase 7 indexes (MySQL-compatible)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function indexExists(table, indexName) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    table, indexName
  );
  return Number(result[0].cnt) > 0;
}

async function createIndexIfMissing(table, indexName, columns) {
  if (await indexExists(table, indexName)) {
    console.log('SKIP (exists):', indexName);
    return;
  }
  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns})`);
    console.log('OK:', indexName);
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME') {
      console.log('SKIP (dup):', indexName);
    } else {
      console.log('ERR:', indexName, e.message.substring(0, 120));
    }
  }
}

async function main() {
  await createIndexIfMissing('invoices', 'invoices_userId_status_idx', '`userId`, `status`');
  await createIndexIfMissing('invoices', 'invoices_status_dueDate_idx', '`status`, `dueDate`');
  await createIndexIfMissing('invoices', 'invoices_paidAt_idx', '`paidAt`');
  await createIndexIfMissing('payments', 'payments_status_idx', '`status`');
  await createIndexIfMissing('payments', 'payments_paidAt_idx', '`paidAt`');
  await createIndexIfMissing('pppoe_users', 'pppoe_users_subscriptionType_status_idx', '`subscriptionType`, `status`');
  await createIndexIfMissing('pppoe_users', 'pppoe_users_lastPaymentDate_idx', '`lastPaymentDate`');
  await createIndexIfMissing('payment_attempts', 'payment_attempts_invoiceId_status_idx', '`invoiceId`, `status`');

  // Mark migrations as applied in _prisma_migrations
  for (const name of ['20260815000001_add_payment_attempt', '20260301000001_phase7_composite_indexes']) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO _prisma_migrations (id, checksum, migration_name, logs, finished_at, applied_steps_count) VALUES (UUID(), '', ?, '', NOW(), 0)`,
        name
      );
      console.log('Marked:', name);
    } catch (e) {
      console.log('Mark err:', name, e.message.substring(0, 80));
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
