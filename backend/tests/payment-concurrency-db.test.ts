/**
 * Payment Concurrency Test — Real Database-Level Test
 *
 * Tests that the updateMany idempotency guard works correctly
 * under real concurrent database access.
 *
 * This test connects directly to the database via Prisma and
 * fires N concurrent updateMany calls against the same record.
 * Only one should succeed (count > 0); all others should get count = 0.
 *
 * Run with: npx tsx tests/payment-concurrency-db.test.ts
 *
 * Requirements:
 * - DATABASE_URL must be set in .env
 * - MySQL must be running
 * - Test creates and cleans up its own test data
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ─── Test Results Tracking ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

// ─── Test 1: Invoice updateMany idempotency ─────────────────────────────────
async function testInvoiceUpdateManyIdempotency() {
  console.log('\n📋 Test 1: Invoice updateMany idempotency (2 concurrent)');

  // Create a test invoice in PENDING status
  const testUser = await prisma.pppoeUser.create({
    data: {
      id: crypto.randomUUID(),
      username: `test-concurrency-${Date.now()}`,
      password: 'test',
      customerId: `TEST${Date.now().toString().slice(-6)}`,
      name: 'Test Concurrency',
      phone: '0000000000',
      status: 'active',
      profileId: await getFirstProfileId(),
      routerId: await getFirstRouterId(),
    },
  });

  const testInvoice = await prisma.invoice.create({
    data: {
      id: crypto.randomUUID(),
      invoiceNumber: `TEST-CONC-${Date.now()}`,
      invoiceType: 'MONTHLY',
      userId: testUser.id,
      amount: 50000,
      status: 'PENDING',
      description: 'Test concurrency invoice',
    },
  });

  try {
    // Fire 2 concurrent updateMany calls
    const results = await Promise.all([
      prisma.invoice.updateMany({
        where: { id: testInvoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      prisma.invoice.updateMany({
        where: { id: testInvoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      }),
    ]);

    const successCount = results.filter(r => r.count > 0).length;
    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    assert(successCount === 1, `Only 1 concurrent call should succeed (got ${successCount})`);
    assert(totalUpdated === 1, `Total updated rows should be 1 (got ${totalUpdated})`);

    // Verify invoice is PAID
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id: testInvoice.id },
    });
    assert(finalInvoice?.status === 'PAID', `Invoice should be PAID (got ${finalInvoice?.status})`);
  } finally {
    // Cleanup
    await prisma.invoice.delete({ where: { id: testInvoice.id } }).catch(() => {});
    await prisma.pppoeUser.delete({ where: { id: testUser.id } }).catch(() => {});
  }
}

// ─── Test 2: 10 concurrent callbacks ────────────────────────────────────────
async function testTenConcurrentCallbacks() {
  console.log('\n📋 Test 2: 10 concurrent updateMany calls');

  const testUser = await prisma.pppoeUser.create({
    data: {
      id: crypto.randomUUID(),
      username: `test-conc10-${Date.now()}`,
      password: 'test',
      customerId: `T10${Date.now().toString().slice(-6)}`,
      name: 'Test Concurrency 10',
      phone: '0000000001',
      status: 'active',
      profileId: await getFirstProfileId(),
      routerId: await getFirstRouterId(),
    },
  });

  const testInvoice = await prisma.invoice.create({
    data: {
      id: crypto.randomUUID(),
      invoiceNumber: `TEST-CONC10-${Date.now()}`,
      invoiceType: 'MONTHLY',
      userId: testUser.id,
      amount: 50000,
      status: 'PENDING',
      description: 'Test concurrency 10 invoice',
    },
  });

  try {
    // Fire 10 concurrent updateMany calls
    const promises = Array.from({ length: 10 }, () =>
      prisma.invoice.updateMany({
        where: { id: testInvoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      }),
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.count > 0).length;
    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    assert(successCount === 1, `Only 1 of 10 should succeed (got ${successCount})`);
    assert(totalUpdated === 1, `Total updated should be 1 (got ${totalUpdated})`);
  } finally {
    await prisma.invoice.delete({ where: { id: testInvoice.id } }).catch(() => {});
    await prisma.pppoeUser.delete({ where: { id: testUser.id } }).catch(() => {});
  }
}

// ─── Test 3: Voucher order updateMany idempotency ───────────────────────────
async function testVoucherOrderUpdateManyIdempotency() {
  console.log('\n📋 Test 3: Voucher order updateMany idempotency (5 concurrent)');

  const profileId = await getFirstHotspotProfileId();
  if (!profileId) {
    console.log('  ⏭️  Skipped (no hotspot profile found)');
    return;
  }

  const testOrder = await prisma.voucherOrder.create({
    data: {
      id: crypto.randomUUID(),
      orderNumber: `EVC-TEST-${Date.now()}`,
      profileId,
      quantity: 1,
      customerName: 'Test',
      customerPhone: '0000000000',
      totalAmount: 10000,
      status: 'PENDING',
    },
  });

  try {
    const promises = Array.from({ length: 5 }, () =>
      prisma.voucherOrder.updateMany({
        where: { id: testOrder.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      }),
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.count > 0).length;
    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    assert(successCount === 1, `Only 1 of 5 should succeed (got ${successCount})`);
    assert(totalUpdated === 1, `Total updated should be 1 (got ${totalUpdated})`);
  } finally {
    await prisma.voucherOrder.delete({ where: { id: testOrder.id } }).catch(() => {});
  }
}

// ─── Test 4: Agent deposit updateMany idempotency ───────────────────────────
async function testAgentDepositUpdateManyIdempotency() {
  console.log('\n📋 Test 4: Agent deposit updateMany idempotency (3 concurrent)');

  const testAgent = await prisma.agent.create({
    data: {
      id: crypto.randomUUID(),
      name: 'Test Agent Concurrency',
      phone: `000${Date.now().toString().slice(-7)}`,
      isActive: true,
      balance: 0,
    },
  });

  const testDeposit = await prisma.agentDeposit.create({
    data: {
      id: crypto.randomUUID(),
      agentId: testAgent.id,
      amount: 50000,
      status: 'PENDING',
    },
  });

  try {
    // Fire 3 concurrent updateMany + balance increment transactions
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        prisma.$transaction(async (tx) => {
          const markPaid = await tx.agentDeposit.updateMany({
            where: { id: testDeposit.id, status: 'PENDING' },
            data: {
              status: 'PAID',
              paidAt: new Date(),
            },
          });

          if (markPaid.count === 0) {
            return null;
          }

          await tx.agent.update({
            where: { id: testAgent.id },
            data: { balance: { increment: 50000 } },
          });

          return markPaid;
        }),
      ),
    );

    const successCount = results.filter(r => r !== null && r.count > 0).length;

    // Verify balance was only incremented once
    const finalAgent = await prisma.agent.findUnique({
      where: { id: testAgent.id },
    });

    assert(successCount === 1, `Only 1 of 3 should succeed (got ${successCount})`);
    assert(finalAgent?.balance === 50000, `Balance should be 50000 (got ${finalAgent?.balance})`);
  } finally {
    await prisma.agentDeposit.delete({ where: { id: testDeposit.id } }).catch(() => {});
    await prisma.agent.delete({ where: { id: testAgent.id } }).catch(() => {});
  }
}

// ─── Test 5: Cron lock atomic acquisition ───────────────────────────────────
async function testCronLockAtomicAcquisition() {
  console.log('\n📋 Test 5: Cron lock atomic acquisition (2 concurrent)');

  const jobKey = `test-lock-${Date.now()}`;
  const ownerA = crypto.randomUUID();
  const ownerB = crypto.randomUUID();
  const ttl = 30 * 60 * 1000; // 30 min
  const expiresAt = new Date(Date.now() + ttl);

  try {
    // Fire 2 concurrent INSERT attempts
    const results = await Promise.allSettled([
      prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKey}, ${ownerA}, NOW(), ${expiresAt})`,
      prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKey}, ${ownerB}, NOW(), ${expiresAt})`,
    ]);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;

    assert(successCount === 1, `Only 1 lock should be acquired (got ${successCount})`);
    assert(failureCount === 1, `1 lock should be denied (got ${failureCount})`);

    // Verify the lock exists
    const lock = await prisma.$queryRaw`SELECT * FROM cron_lock WHERE jobKey = ${jobKey}` as any[];
    assert(lock.length === 1, `Lock table should have 1 entry (got ${lock.length})`);
  } finally {
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey = ${jobKey}`.catch(() => {});
  }
}

// ─── Test 6: Different job keys can run concurrently ────────────────────────
async function testDifferentJobKeysConcurrent() {
  console.log('\n📋 Test 6: Different job keys can run concurrently');

  const jobKeyA = `test-lock-a-${Date.now()}`;
  const jobKeyB = `test-lock-b-${Date.now()}`;
  const ownerA = crypto.randomUUID();
  const ownerB = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  try {
    const results = await Promise.allSettled([
      prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKeyA}, ${ownerA}, NOW(), ${expiresAt})`,
      prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKeyB}, ${ownerB}, NOW(), ${expiresAt})`,
    ]);

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    assert(successCount === 2, `Both different-key locks should succeed (got ${successCount})`);
  } finally {
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey IN (${jobKeyA}, ${jobKeyB})`.catch(() => {});
  }
}

// ─── Test 7: Stale lock recovery ────────────────────────────────────────────
async function testStaleLockRecovery() {
  console.log('\n📋 Test 7: Stale lock recovery');

  const jobKey = `test-stale-${Date.now()}`;
  const oldOwner = crypto.randomUUID();
  const newOwner = crypto.randomUUID();
  const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago (expired)

  try {
    // Insert an expired lock
    await prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKey}, ${oldOwner}, ${pastDate}, ${pastDate})`;

    // Delete expired locks
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE expiresAt < NOW()`;
    const deleted = await prisma.$queryRaw`SELECT COUNT(*) as count FROM cron_lock WHERE jobKey = ${jobKey}` as any[];
    assert(Number(deleted[0].count) === 0, `Expired lock should be deleted`);

    // New lock should be acquirable
    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKey}, ${newOwner}, NOW(), ${futureDate})`;
    const lock = await prisma.$queryRaw`SELECT * FROM cron_lock WHERE jobKey = ${jobKey}` as any[];
    assert(lock.length === 1, `New lock should be acquired after stale recovery`);
    assert(lock[0].ownerToken === newOwner, `New lock should have new owner token`);
  } finally {
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey = ${jobKey}`.catch(() => {});
  }
}

// ─── Test 8: Owner-protected release ────────────────────────────────────────
async function testOwnerProtectedRelease() {
  console.log('\n📋 Test 8: Owner-protected release');

  const jobKey = `test-owner-${Date.now()}`;
  const ownerA = crypto.randomUUID();
  const ownerB = crypto.randomUUID();
  const futureDate = new Date(Date.now() + 30 * 60 * 1000);

  try {
    // Acquire lock with owner A
    await prisma.$executeRaw`INSERT INTO cron_lock (jobKey, ownerToken, acquiredAt, expiresAt) VALUES (${jobKey}, ${ownerA}, NOW(), ${futureDate})`;

    // Owner B tries to release — should not work
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey = ${jobKey} AND ownerToken = ${ownerB}`;
    const afterB = await prisma.$queryRaw`SELECT COUNT(*) as count FROM cron_lock WHERE jobKey = ${jobKey}` as any[];
    assert(Number(afterB[0].count) === 1, `Owner B should not be able to release lock`);

    // Owner A releases — should work
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey = ${jobKey} AND ownerToken = ${ownerA}`;
    const afterA = await prisma.$queryRaw`SELECT COUNT(*) as count FROM cron_lock WHERE jobKey = ${jobKey}` as any[];
    assert(Number(afterA[0].count) === 0, `Owner A should be able to release lock`);
  } finally {
    await prisma.$executeRaw`DELETE FROM cron_lock WHERE jobKey = ${jobKey}`.catch(() => {});
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function getFirstProfileId(): Promise<string> {
  const profile = await prisma.pppoeProfile.findFirst();
  if (!profile) throw new Error('No pppoeProfile found — seed the database first');
  return profile.id;
}

async function getFirstRouterId(): Promise<string | undefined> {
  const router = await prisma.router.findFirst();
  return router?.id;
}

async function getFirstHotspotProfileId(): Promise<string | null> {
  const profile = await prisma.hotspotProfile.findFirst();
  return profile?.id ?? null;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Payment Concurrency & Cron Lock Database Test Suite');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testInvoiceUpdateManyIdempotency();
    await testTenConcurrentCallbacks();
    await testVoucherOrderUpdateManyIdempotency();
    await testAgentDepositUpdateManyIdempotency();
    await testCronLockAtomicAcquisition();
    await testDifferentJobKeysConcurrent();
    await testStaleLockRecovery();
    await testOwnerProtectedRelease();
  } catch (error) {
    console.error('\n💥 Test suite error:', error);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main();
