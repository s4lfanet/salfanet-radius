/**
 * Cron Lock Service Tests
 *
 * Tests distributed lock acquisition, release, renewal, and stale recovery.
 * Run with: npx tsx tests/cron-lock.test.ts
 *
 * Requirements:
 * - DATABASE_URL must point to a test database with cron_lock table
 * - The test database should be empty or have no active locks
 */
import { PrismaClient } from '@prisma/client';
import { acquireCronLock, releaseCronLock, renewCronLock, isLockHeld } from '../src/server/services/cron-lock.service';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const TEST_JOB_KEY = 'test_cron_lock_' + Date.now();
const TTL_MS = 5000; // 5 seconds for fast testing

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

async function testAcquireAndRelease() {
  console.log('\n--- Test: Acquire and Release ---');

  // Acquire lock
  const token = await acquireCronLock(TEST_JOB_KEY, TTL_MS);
  assert(token !== null, 'Lock acquired successfully');

  // Verify lock is held
  const held = await isLockHeld(TEST_JOB_KEY);
  assert(held === true, 'Lock is held after acquisition');

  // Release lock
  if (token) {
    await releaseCronLock(TEST_JOB_KEY, token);
  }
  const heldAfter = await isLockHeld(TEST_JOB_KEY);
  assert(heldAfter === false, 'Lock is released after releaseCronLock');
}

async function testConcurrentAcquisition() {
  console.log('\n--- Test: Concurrent Acquisition ---');

  // Two concurrent attempts to acquire the same lock
  const [token1, token2] = await Promise.all([
    acquireCronLock(TEST_JOB_KEY + '_concurrent', TTL_MS),
    acquireCronLock(TEST_JOB_KEY + '_concurrent', TTL_MS),
  ]);

  assert(token1 !== null || token2 !== null, 'At least one lock acquired');
  assert(!(token1 !== null && token2 !== null), 'Only one lock acquired (not both)');

  // Cleanup
  if (token1) await releaseCronLock(TEST_JOB_KEY + '_concurrent', token1);
  if (token2) await releaseCronLock(TEST_JOB_KEY + '_concurrent', token2);
}

async function testReleaseByNonOwner() {
  console.log('\n--- Test: Release by Non-Owner ---');

  const token = await acquireCronLock(TEST_JOB_KEY + '_nonowner', TTL_MS);
  assert(token !== null, 'Lock acquired by owner');

  // Try to release with wrong token — should not delete the lock
  if (token) {
    await releaseCronLock(TEST_JOB_KEY + '_nonowner', 'wrong-token-12345');
    const held = await isLockHeld(TEST_JOB_KEY + '_nonowner');
    assert(held === true, 'Lock still held after non-owner release attempt');

    // Now release with correct token
    await releaseCronLock(TEST_JOB_KEY + '_nonowner', token);
    const heldAfter = await isLockHeld(TEST_JOB_KEY + '_nonowner');
    assert(heldAfter === false, 'Lock released by owner');
  }
}

async function testHeartbeatRenewal() {
  console.log('\n--- Test: Heartbeat Renewal ---');

  const token = await acquireCronLock(TEST_JOB_KEY + '_heartbeat', TTL_MS);
  assert(token !== null, 'Lock acquired for heartbeat test');

  if (token) {
    // Renew the lock
    const renewed = await renewCronLock(TEST_JOB_KEY + '_heartbeat', token, TTL_MS);
    assert(renewed === true, 'Heartbeat renewal succeeded');

    // Verify lock is still held
    const held = await isLockHeld(TEST_JOB_KEY + '_heartbeat');
    assert(held === true, 'Lock still held after renewal');

    // Release
    await releaseCronLock(TEST_JOB_KEY + '_heartbeat', token);
  }
}

async function testHeartbeatFailureAfterRelease() {
  console.log('\n--- Test: Heartbeat Failure After Release ---');

  const token = await acquireCronLock(TEST_JOB_KEY + '_hb_fail', TTL_MS);
  assert(token !== null, 'Lock acquired for heartbeat failure test');

  if (token) {
    // Release the lock first
    await releaseCronLock(TEST_JOB_KEY + '_hb_fail', token);

    // Now try to renew — should fail
    const renewed = await renewCronLock(TEST_JOB_KEY + '_hb_fail', token, TTL_MS);
    assert(renewed === false, 'Heartbeat renewal fails after release (lock lost)');
  }
}

async function testStaleLockRecovery() {
  console.log('\n--- Test: Stale Lock Recovery ---');

  // Acquire with very short TTL (1 second)
  const token1 = await acquireCronLock(TEST_JOB_KEY + '_stale', 1000);
  assert(token1 !== null, 'Lock acquired with short TTL');

  // Wait for it to expire
  console.log('  Waiting 1.5 seconds for lock to expire...');
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Verify lock is expired (not held)
  const held = await isLockHeld(TEST_JOB_KEY + '_stale');
  assert(held === false, 'Lock expired after TTL');

  // Another instance should be able to acquire it (reclaim stale lock)
  const token2 = await acquireCronLock(TEST_JOB_KEY + '_stale', TTL_MS);
  assert(token2 !== null, 'Stale lock reclaimed by new instance');

  // Cleanup
  if (token2) await releaseCronLock(TEST_JOB_KEY + '_stale', token2);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Cron Lock Service Tests');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testAcquireAndRelease();
    await testConcurrentAcquisition();
    await testReleaseByNonOwner();
    await testHeartbeatRenewal();
    await testHeartbeatFailureAfterRelease();
    await testStaleLockRecovery();
  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    // Cleanup any remaining test locks
    try {
      await prisma.cronLock.deleteMany({
        where: { jobKey: { startsWith: 'test_cron_lock_' } },
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
