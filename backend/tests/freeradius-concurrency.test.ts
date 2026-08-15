/**
 * FreeRADIUS Queue Concurrency Test
 *
 * Tests that two workers cannot claim the same queue item.
 * Must run on VPS where database is accessible.
 *
 * Run with: DATABASE_URL=mysql://... npx tsx tests/freeradius-concurrency.test.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function createTestQueueItem(username: string): Promise<string> {
  const item = await prisma.radiusSyncQueue.create({
    data: {
      id: `test_rq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pppoeUserId: `test_user_${Date.now()}`,
      username,
      syncType: 'CREATE',
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 5,
    },
  });
  return item.id;
}

async function claimItem(itemId: string): Promise<number> {
  // Atomic conditional claim — same as production code
  const result = await prisma.radiusSyncQueue.updateMany({
    where: {
      id: itemId,
      status: { in: ['PENDING', 'FAILED'] },
    },
    data: {
      status: 'SYNCING',
      lastAttemptAt: new Date(),
    },
  });
  return result.count;
}

async function testTwoWorkersSameItem() {
  console.log('\n--- Test: Two workers claim same PENDING item ---');

  const itemId = await createTestQueueItem('test_concurrent_user');

  // Both workers try to claim simultaneously
  const [claimA, claimB] = await Promise.all([
    claimItem(itemId),
    claimItem(itemId),
  ]);

  assert(claimA === 1 || claimB === 1, 'At least one worker claimed successfully');
  assert(!(claimA === 1 && claimB === 1), 'Both workers cannot claim (atomic)');

  // Verify status is SYNCING
  const item = await prisma.radiusSyncQueue.findUnique({ where: { id: itemId } });
  assert(item?.status === 'SYNCING', 'Item status is SYNCING after claim');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testClaimCompletedItem() {
  console.log('\n--- Test: Cannot claim COMPLETED item ---');

  const itemId = await createTestQueueItem('test_completed_user');

  // Mark as COMPLETED
  await prisma.radiusSyncQueue.update({
    where: { id: itemId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  // Try to claim
  const claimCount = await claimItem(itemId);
  assert(claimCount === 0, 'COMPLETED item cannot be claimed');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testClaimDeadItem() {
  console.log('\n--- Test: Cannot claim DEAD item ---');

  const itemId = await createTestQueueItem('test_dead_user');

  // Mark as DEAD
  await prisma.radiusSyncQueue.update({
    where: { id: itemId },
    data: { status: 'DEAD', failedAt: new Date() },
  });

  // Try to claim
  const claimCount = await claimItem(itemId);
  assert(claimCount === 0, 'DEAD item cannot be claimed');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testClaimSyncingItem() {
  console.log('\n--- Test: Cannot claim SYNCING item ---');

  const itemId = await createTestQueueItem('test_syncing_user');

  // Mark as SYNCING (already claimed by another worker)
  await prisma.radiusSyncQueue.update({
    where: { id: itemId },
    data: { status: 'SYNCING', lastAttemptAt: new Date() },
  });

  // Try to claim
  const claimCount = await claimItem(itemId);
  assert(claimCount === 0, 'SYNCING item cannot be claimed by another worker');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testClaimFailedItem() {
  console.log('\n--- Test: CAN claim FAILED item (retry) ---');

  const itemId = await createTestQueueItem('test_failed_user');

  // Mark as FAILED
  await prisma.radiusSyncQueue.update({
    where: { id: itemId },
    data: { status: 'FAILED', retryCount: 1 },
  });

  // Try to claim — should succeed (FAILED is eligible for retry)
  const claimCount = await claimItem(itemId);
  assert(claimCount === 1, 'FAILED item CAN be claimed (retry eligible)');

  // Verify status changed to SYNCING
  const item = await prisma.radiusSyncQueue.findUnique({ where: { id: itemId } });
  assert(item?.status === 'SYNCING', 'Status changed to SYNCING after retry claim');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testStatusTransitions() {
  console.log('\n--- Test: Status transition atomicity ---');

  const itemId = await createTestQueueItem('test_transition_user');

  // PENDING → SYNCING (should work)
  let count = await claimItem(itemId);
  assert(count === 1, 'PENDING → SYNCING succeeds');

  // SYNCING → COMPLETED (manual update, simulates job success)
  await prisma.radiusSyncQueue.update({
    where: { id: itemId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  // Try to claim COMPLETED → should fail
  count = await claimItem(itemId);
  assert(count === 0, 'COMPLETED item cannot be re-claimed');

  // Cleanup
  await prisma.radiusSyncQueue.delete({ where: { id: itemId } }).catch(() => {});
}

async function testMultipleItemsConcurrentClaim() {
  console.log('\n--- Test: 10 items, 2 workers, no overlap ---');

  const itemIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const id = await createTestQueueItem(`test_batch_user_${i}`);
    itemIds.push(id);
  }

  // Worker A claims items 0-4, Worker B claims items 5-9
  // But they race — we need to verify no item is claimed by both
  const claimedByA = new Set<string>();
  const claimedByB = new Set<string>();

  await Promise.all([
    // Worker A
    (async () => {
      for (const id of itemIds) {
        const count = await claimItem(id);
        if (count === 1) claimedByA.add(id);
      }
    })(),
    // Worker B
    (async () => {
      for (const id of itemIds) {
        const count = await claimItem(id);
        if (count === 1) claimedByB.add(id);
      }
    })(),
  ]);

  // Check no overlap
  let overlap = 0;
  for (const id of itemIds) {
    if (claimedByA.has(id) && claimedByB.has(id)) overlap++;
  }

  assert(overlap === 0, `No overlap between workers (overlap: ${overlap})`);

  // All items should be claimed by someone
  const totalClaimed = claimedByA.size + claimedByB.size;
  assert(totalClaimed === 10, `All 10 items claimed (total: ${totalClaimed})`);

  // Cleanup
  for (const id of itemIds) {
    await prisma.radiusSyncQueue.delete({ where: { id } }).catch(() => {});
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FreeRADIUS Queue Concurrency Tests');
  console.log('  (Requires DATABASE_URL to point to MySQL)');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testTwoWorkersSameItem();
    await testClaimCompletedItem();
    await testClaimDeadItem();
    await testClaimSyncingItem();
    await testClaimFailedItem();
    await testStatusTransitions();
    await testMultipleItemsConcurrentClaim();
  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    // Cleanup any remaining test items
    try {
      await prisma.radiusSyncQueue.deleteMany({
        where: { username: { startsWith: 'test_' } },
      });
    } catch { /* ignore */ }
    await prisma.$disconnect();
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
