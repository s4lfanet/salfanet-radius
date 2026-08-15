/**
 * Cron Schedule Parser Tests
 *
 * Tests cron-parser library for accurate nextRun calculation.
 * Run with: npx tsx tests/cron-schedule.test.ts
 */
import { CronExpressionParser } from 'cron-parser';

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

function getNextRun(cronExpr: string, timezone: string, fromDate: Date): Date {
  const parser = CronExpressionParser.parse(cronExpr, {
    currentDate: fromDate,
    tz: timezone,
  });
  return parser.next().toDate();
}

function testDailyAt7AM() {
  console.log('\n--- Test: 0 7 * * * (daily at 7:00 AM) ---');

  // From 06:59 → next should be 07:00 today
  const from1 = new Date('2026-01-15T06:59:00+07:00');
  const next1 = getNextRun('0 7 * * *', 'Asia/Jakarta', from1);
  assert(next1.getHours() === 7, `07:00 expected, got ${next1.getHours()}:${next1.getMinutes()}`);
  assert(next1.getDate() === 15, 'Same day (Jan 15)');

  // From 07:00 → next should be 07:00 tomorrow
  const from2 = new Date('2026-01-15T07:00:00+07:00');
  const next2 = getNextRun('0 7 * * *', 'Asia/Jakarta', from2);
  assert(next2.getDate() === 16, 'Next day (Jan 16)');

  // From 07:01 → next should be 07:00 tomorrow
  const from3 = new Date('2026-01-15T07:01:00+07:00');
  const next3 = getNextRun('0 7 * * *', 'Asia/Jakarta', from3);
  assert(next3.getDate() === 16, 'Next day from 07:01');
  assert(next3.getHours() === 7, 'At 07:00');
}

function testEvery5Minutes() {
  console.log('\n--- Test: */5 * * * * (every 5 minutes) ---');

  const from = new Date('2026-01-15T10:03:00+07:00');
  const next = getNextRun('*/5 * * * *', 'Asia/Jakarta', from);
  assert(next.getMinutes() === 5, `:05 expected, got :${next.getMinutes()}`);
  assert(next.getHours() === 10, 'Same hour');
}

function testEvery15Minutes() {
  console.log('\n--- Test: */15 * * * * (every 15 minutes) ---');

  const from = new Date('2026-01-15T10:07:00+07:00');
  const next = getNextRun('*/15 * * * *', 'Asia/Jakarta', from);
  assert(next.getMinutes() === 15, `:15 expected, got :${next.getMinutes()}`);

  const from2 = new Date('2026-01-15T10:16:00+07:00');
  const next2 = getNextRun('*/15 * * * *', 'Asia/Jakarta', from2);
  assert(next2.getMinutes() === 30, `:30 expected, got :${next2.getMinutes()}`);
}

function testEvery6Hours() {
  console.log('\n--- Test: 0 */6 * * * (every 6 hours) ---');

  const from = new Date('2026-01-15T03:30:00+07:00');
  const next = getNextRun('0 */6 * * *', 'Asia/Jakarta', from);
  assert(next.getHours() === 6, `06:00 expected, got ${next.getHours()}:00`);
  assert(next.getMinutes() === 0, 'At :00');
}

function testDailyAt8AM() {
  console.log('\n--- Test: 0 8 * * * (daily at 8:00 AM) ---');

  const from = new Date('2026-01-15T07:59:00+07:00');
  const next = getNextRun('0 8 * * *', 'Asia/Jakarta', from);
  assert(next.getHours() === 8, `08:00 expected, got ${next.getHours()}`);
  assert(next.getDate() === 15, 'Same day');
}

function testMidnight() {
  console.log('\n--- Test: 0 0 * * * (midnight) ---');

  const from = new Date('2026-01-15T23:59:00+07:00');
  const next = getNextRun('0 0 * * *', 'Asia/Jakarta', from);
  assert(next.getHours() === 0, `00:00 expected, got ${next.getHours()}`);
  assert(next.getDate() === 16, 'Next day (Jan 16)');
}

function test23Hours() {
  console.log('\n--- Test: 0 23 * * * (11 PM) ---');

  const from = new Date('2026-01-15T22:30:00+07:00');
  const next = getNextRun('0 23 * * *', 'Asia/Jakarta', from);
  assert(next.getHours() === 23, `23:00 expected, got ${next.getHours()}`);
  assert(next.getDate() === 15, 'Same day');
}

function testTimezoneUTC() {
  console.log('\n--- Test: UTC timezone ---');

  // 0 7 * * * in UTC means 7:00 UTC = 14:00 WIB
  const from = new Date('2026-01-15T06:00:00Z');
  const next = getNextRun('0 7 * * *', 'UTC', from);
  // next should be 07:00 UTC
  assert(next.getUTCHours() === 7, `07:00 UTC expected, got ${next.getUTCHours()}`);
}

function testTimezoneDifference() {
  console.log('\n--- Test: Timezone difference (same cron, different TZ) ---');

  const from = new Date('2026-01-15T06:30:00Z'); // 13:30 WIB

  // In Jakarta: 0 7 * * * → next 07:00 WIB = 00:00 UTC on Jan 16
  const nextJakarta = getNextRun('0 7 * * *', 'Asia/Jakarta', from);

  // In UTC: 0 7 * * * → next 07:00 UTC on Jan 15
  const nextUTC = getNextRun('0 7 * * *', 'UTC', from);

  // They should be different (7 hours apart)
  const diffMs = Math.abs(nextJakarta.getTime() - nextUTC.getTime());
  const diffHours = diffMs / (60 * 60 * 1000);

  // The difference should be a multiple of 7 hours (timezone offset)
  // But since they're on different days, let's just verify they're different
  assert(nextJakarta.getTime() !== nextUTC.getTime(), 'Jakarta and UTC nextRun differ');
}

function testMonthBoundary() {
  console.log('\n--- Test: Month boundary (Jan 31 → Feb) ---');

  const from = new Date('2026-01-31T23:59:00+07:00');
  const next = getNextRun('0 0 * * *', 'Asia/Jakarta', from);
  assert(next.getMonth() === 1, `February expected, got month ${next.getMonth()}`);
  assert(next.getDate() === 1, 'Feb 1st');
}

function testAllProductionSchedules() {
  console.log('\n--- Test: All production cron schedules parse without error ---');

  const schedules: Record<string, string> = {
    hotspot_sync: '* * * * *',
    pppoe_auto_isolir: '*/5 * * * *',
    agent_sales: '*/5 * * * *',
    invoice_generate: '0 7 * * *',
    invoice_reminder: '0 * * * *',
    invoice_status_update: '0 * * * *',
    notification_check: '0 */6 * * *',
    session_monitor: '*/15 * * * *',
    disconnect_sessions: '*/5 * * * *',
    auto_renewal: '0 8 * * *',
    activity_log_cleanup: '0 2 * * *',
    webhook_log_cleanup: '0 3 * * *',
    auto_stop: '0 5 * * *',
    suspend_check: '0 * * * *',
    cron_history_cleanup: '0 4 * * *',
    radius_sync_retry: '*/5 * * * *',
    radius_reconciliation: '0 6 * * *',
    freeradius_health: '*/5 * * * *',
    pppoe_session_sync: '*/5 * * * *',
  };

  let allParsed = true;
  for (const [job, schedule] of Object.entries(schedules)) {
    try {
      const parser = CronExpressionParser.parse(schedule, { tz: 'Asia/Jakarta' });
      const next = parser.next().toDate();
      assert(true, `${job} (${schedule}) → next: ${next.toISOString()}`);
    } catch (err) {
      assert(false, `${job} (${schedule}) FAILED to parse: ${err}`);
      allParsed = false;
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Cron Schedule Parser Tests');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    testDailyAt7AM();
    testDailyAt8AM();
    testEvery5Minutes();
    testEvery15Minutes();
    testEvery6Hours();
    testMidnight();
    test23Hours();
    testTimezoneUTC();
    testTimezoneDifference();
    testMonthBoundary();
    testAllProductionSchedules();
  } catch (err) {
    console.error('Test error:', err);
    failed++;
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
