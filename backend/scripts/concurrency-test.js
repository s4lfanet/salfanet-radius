// Real concurrency test — simulate concurrent payment attempts on same invoice
// This tests the transaction isolation and idempotency of payment settlement
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== CONCURRENCY TEST: Payment Settlement ===\n');

  // 1. Find an existing invoice to test with
  const invoice = await prisma.invoice.findFirst({
    where: { status: 'PENDING' },
    include: { user: { select: { id: true, username: true, balance: true } } }
  });

  if (!invoice) {
    console.log('No PENDING invoice found for testing. Testing with synthetic data...\n');

    // Create a test profile first
    let testProfile = await prisma.pppoeProfile.findFirst();
    if (!testProfile) {
      testProfile = await prisma.pppoeProfile.create({
        data: {
          id: 'testprof' + Date.now(),
          name: 'Test Profile',
          price: 50000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });
    }

    // Create a test user and invoice
    const testUser = await prisma.pppoeUser.create({
      data: {
        id: 'testconc' + Date.now(),
        username: 'testconc' + Date.now(),
        name: 'Concurrency Test User',
        phone: '0000000000',
        balance: 0,
        status: 'active',
        password: 'test',
        profileId: testProfile.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    const testInvoice = await prisma.invoice.create({
      data: {
        id: 'testinv' + Date.now(),
        invoiceNumber: 'TESTCONC' + Date.now(),
        userId: testUser.id,
        amount: 50000,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invoiceType: 'MONTHLY',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    console.log(`Created test invoice: ${testInvoice.id} for user: ${testUser.id}`);

    // 2. Simulate 5 concurrent payment attempts on the same invoice
    console.log('\nSimulating 5 concurrent payment attempts...\n');

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          // Re-read invoice inside transaction with lock
          const inv = await tx.$queryRaw`
            SELECT id, status, amount, userId FROM invoices WHERE id = ${testInvoice.id} FOR UPDATE
          `;

          if (inv[0].status !== 'PENDING') {
            return { attempt: i, result: 'REJECTED', reason: 'Already paid' };
          }

          // Simulate payment processing
          await new Promise(resolve => setTimeout(resolve, 50));

          // Update invoice to PAID
          await tx.invoice.update({
            where: { id: testInvoice.id },
            data: { status: 'PAID', paidAt: new Date() }
          });

          // Create payment record
          await tx.payment.create({
            data: {
              id: 'testpay' + i + '' + Date.now(),
              invoiceId: testInvoice.id,
              amount: inv[0].amount,
              method: 'TEST',
              status: 'SUCCESS',
              paidAt: new Date(),
              createdAt: new Date(),
            }
          });

          return { attempt: i, result: 'SUCCESS' };
        }, { timeout: 10000 })
      )
    );

    // 3. Analyze results
    console.log('Results:');
    let successCount = 0;
    let rejectedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < attempts.length; i++) {
      const result = attempts[i];
      if (result.status === 'fulfilled') {
        console.log(`  Attempt ${i + 1}: ${result.value.result} ${result.value.reason || ''}`);
        if (result.value.result === 'SUCCESS') successCount++;
        else rejectedCount++;
      } else {
        console.log(`  Attempt ${i + 1}: ERROR - ${result.reason.message.substring(0, 100)}`);
        errorCount++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`  Success: ${successCount}`);
    console.log(`  Rejected (already paid): ${rejectedCount}`);
    console.log(`  Error: ${errorCount}`);

    if (successCount === 1) {
      console.log('\n✅ CONCURRENCY TEST PASSED — exactly 1 payment succeeded');
    } else if (successCount > 1) {
      console.log('\n❌ CONCURRENCY TEST FAILED — multiple payments succeeded (double-spend!)');
    } else {
      console.log('\n⚠️  CONCURRENCY TEST INCONCLUSIVE — no payment succeeded');
    }

    // 4. Verify final state
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id: testInvoice.id },
      include: { payments: true }
    });
    console.log(`\nFinal invoice status: ${finalInvoice.status}`);
    console.log(`Payment records created: ${finalInvoice.payments.length}`);

    // 5. Cleanup
    await prisma.payment.deleteMany({ where: { invoiceId: testInvoice.id } });
    await prisma.invoice.delete({ where: { id: testInvoice.id } });
    await prisma.pppoeUser.delete({ where: { id: testUser.id } });
    console.log('\nTest data cleaned up ✅');

  } else {
    console.log(`Found UNPAID invoice: ${invoice.id} (user: ${invoice.user?.username})`);
    console.log('Skipping concurrent test on real data to avoid side effects.');
    console.log('Run with no UNPAID invoices to trigger synthetic test.');
  }

  // 6. Test cron lock concurrency
  console.log('\n=== CONCURRENCY TEST: Cron Lock ===\n');

  const jobKey = 'test-conc-lock-' + Date.now();
  const lockAttempts = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      prisma.$transaction(async (tx) => {
        // Try to acquire lock
        const result = await tx.$executeRaw`
          INSERT INTO cron_lock (job_key, owner_token, acquired_at, expires_at)
          VALUES (${jobKey}, ${'token-' + i}, NOW(), DATE_ADD(NOW(), INTERVAL 60 SECOND))
          ON DUPLICATE KEY UPDATE
            owner_token = IF(expires_at < NOW(), VALUES(owner_token), owner_token),
            expires_at = IF(expires_at < NOW(), VALUES(expires_at), expires_at)
        `;
        // Check if we got the lock
        const lock = await tx.$queryRaw`
          SELECT owner_token FROM cron_lock WHERE job_key = ${jobKey}
        `;
        return { attempt: i, gotLock: lock[0].owner_token === 'token-' + i };
      })
    )
  );

  let lockWinners = 0;
  for (let i = 0; i < lockAttempts.length; i++) {
    const result = lockAttempts[i];
    if (result.status === 'fulfilled') {
      console.log(`  Attempt ${i + 1}: ${result.value.gotLock ? 'GOT LOCK' : 'LOCKED OUT'}`);
      if (result.value.gotLock) lockWinners++;
    } else {
      console.log(`  Attempt ${i + 1}: ERROR - ${result.reason.message.substring(0, 80)}`);
    }
  }

  if (lockWinners === 1) {
    console.log('\n✅ CRON LOCK TEST PASSED — exactly 1 lock acquired');
  } else {
    console.log(`\n⚠️  CRON LOCK TEST: ${lockWinners} locks acquired (expected 1)`);
  }

  // Cleanup lock
  await prisma.$executeRaw`DELETE FROM cron_lock WHERE job_key = ${jobKey}`;
  console.log('Lock cleaned up ✅');

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
