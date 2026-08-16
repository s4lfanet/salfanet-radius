const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1. Verify the repaired invoice
  const inv = await p.invoice.findFirst({
    where: { invoiceNumber: 'INV-20260815-CC9B17' },
    include: { payments: true }
  });
  console.log('=== Invoice Repair Verification ===');
  console.log('Invoice status:', inv?.status);
  console.log('Invoice amount:', inv?.amount);
  console.log('Payments count:', inv?.payments?.length);
  console.log('Payment amounts:', inv?.payments?.map(pay => pay.amount));
  console.log('Payment IDs:', inv?.payments?.map(pay => pay.id));

  // 2. Check for duplicate ledger entries from the fix
  const ledgerEntries = await p.transaction.findMany({
    where: { reference: { contains: 'pay_fix_1786837937071' } }
  });
  console.log('\n=== Ledger Duplicate Check ===');
  console.log('Ledger entries for fix payment:', ledgerEntries.length);
  if (ledgerEntries.length > 0) {
    console.log('Amounts:', ledgerEntries.map(t => t.amount));
  }

  // 3. Check overall financial consistency
  const totalPayments = await p.payment.aggregate({ _sum: { amount: true }, _count: true });
  const totalLedger = await p.transaction.aggregate({ _sum: { amount: true }, _count: true });
  console.log('\n=== Financial Totals ===');
  console.log('Total payments:', totalPayments._count, 'sum:', totalPayments._sum.amount);
  console.log('Total ledger entries:', totalLedger._count, 'sum:', totalLedger._sum.amount);

  // 4. Check for DEAD external tasks
  const deadTasks = await p.externalTask.count({ where: { status: 'DEAD' } });
  console.log('\n=== Queue Health ===');
  console.log('DEAD external tasks:', deadTasks);

  // 5. Check cron history count
  const cronHistory = await p.cronHistory.count();
  const oldCron = await p.cronHistory.count({
    where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
  });
  console.log('Cron history records:', cronHistory);
  console.log('Cron history older than 30 days:', oldCron);

  // 6. Migration state
  const migrations = await p.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5`;
  console.log('\n=== Migration State ===');
  console.log('Recent migrations:', JSON.stringify(migrations, null, 2));

  await p.$disconnect();
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
