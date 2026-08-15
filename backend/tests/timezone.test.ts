/**
 * Timezone Utility Tests
 *
 * Tests that timezone functions produce correct results for:
 * - Asia/Jakarta (WIB, UTC+7)
 * - UTC
 * - Company timezone (dynamic)
 *
 * Run with: npx tsx tests/timezone.test.ts
 */
import {
  nowWIB,
  formatWIB,
  parseDateAsWIB,
  toUTC,
  isExpiredWIB,
  daysUntilExpiry,
  startOfDayWIBtoUTC,
  endOfDayWIBtoUTC,
  getCurrentTimezone,
  setCurrentTimezone,
  getTimezoneOffsetMs,
} from '../src/lib/timezone';

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

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (expected ~${expected}, got ${actual}, diff=${diff})`);
}

async function testNowWIB() {
  console.log('\n--- Test: nowWIB() ---');

  const now = nowWIB();
  const realNow = Date.now();
  const offsetMs = getTimezoneOffsetMs();

  // nowWIB should be approximately realNow + offsetMs
  assertApprox(now.getTime(), realNow + offsetMs, 1000, 'nowWIB() ≈ Date.now() + timezone offset');

  // Should be a valid Date
  assert(!isNaN(now.getTime()), 'nowWIB() returns valid Date');
}

async function testParseDateAsWIB() {
  console.log('\n--- Test: parseDateAsWIB() ---');

  // Date-only string → midnight WIB
  const d1 = parseDateAsWIB('2026-01-15');
  assert(d1.getUTCFullYear() === 2026, 'Year is 2026');
  assert(d1.getUTCMonth() === 0, 'Month is January (0)');
  assert(d1.getUTCDate() === 15, 'Day is 15');
  assert(d1.getUTCHours() === 0, 'Hour is 0');
  assert(d1.getUTCMinutes() === 0, 'Minute is 0');

  // DateTime string without timezone → treated as WIB
  const d2 = parseDateAsWIB('2026-01-15T10:30:00');
  assert(d2.getUTCHours() === 10, 'Hour is 10 (WIB values in UTC)');
  assert(d2.getUTCMinutes() === 30, 'Minute is 30');

  // DateTime with Z → already UTC
  const d3 = parseDateAsWIB('2026-01-15T10:30:00Z');
  assert(d3.getUTCHours() === 10, 'Hour is 10 (already UTC)');
}

async function testFormatWIB() {
  console.log('\n--- Test: formatWIB() ---');

  // Format a known date
  const d = new Date('2026-01-15T10:30:00.000Z'); // WIB values in UTC
  const formatted = formatWIB(d, 'yyyy-MM-dd HH:mm');
  assert(formatted === '2026-01-15 10:30', `formatWIB returns correct format (got: ${formatted})`);

  // Null/undefined → '-'
  assert(formatWIB(null) === '-', 'formatWIB(null) returns "-"');
  assert(formatWIB(undefined) === '-', 'formatWIB(undefined) returns "-"');
}

async function testIsExpiredWIB() {
  console.log('\n--- Test: isExpiredWIB() ---');

  // Past date → expired
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
  assert(isExpiredWIB(past) === true, 'Past date is expired');

  // Future date → not expired
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
  assert(isExpiredWIB(future) === false, 'Future date is not expired');

  // Null → false
  assert(isExpiredWIB(null) === false, 'Null date is not expired');
}

async function testDaysUntilExpiry() {
  console.log('\n--- Test: daysUntilExpiry() ---');

  // 7 days from now
  const future = new Date(nowWIB().getTime() + 7 * 24 * 60 * 60 * 1000);
  const days = daysUntilExpiry(future);
  assert(days !== null, 'daysUntilExpiry returns non-null for valid date');
  if (days !== null) {
    assert(days === 7, `7 days until expiry (got: ${days})`);
  }

  // Past date → negative
  const past = new Date(nowWIB().getTime() - 3 * 24 * 60 * 60 * 1000);
  const pastDays = daysUntilExpiry(past);
  if (pastDays !== null) {
    assert(pastDays === -3, `-3 days for past date (got: ${pastDays})`);
  }
}

async function testStartAndEndOfDay() {
  console.log('\n--- Test: startOfDayWIBtoUTC / endOfDayWIBtoUTC ---');

  const date = new Date('2026-06-15T14:30:00.000Z'); // WIB values in UTC
  const start = startOfDayWIBtoUTC(date);
  const end = endOfDayWIBtoUTC(date);

  assert(start.getUTCHours() === 0 && start.getUTCMinutes() === 0, 'Start of day is 00:00');
  assert(start.getUTCDate() === 15, 'Start of day is 15th');
  assert(end.getUTCHours() === 23 && end.getUTCMinutes() === 59, 'End of day is 23:59');
  assert(end.getUTCDate() === 15, 'End of day is 15th');
}

async function testTimezoneSwitching() {
  console.log('\n--- Test: Timezone Switching ---');

  // Default timezone
  const defaultTz = getCurrentTimezone();
  assert(defaultTz === 'Asia/Jakarta', `Default timezone is Asia/Jakarta (got: ${defaultTz})`);

  // Switch to UTC
  setCurrentTimezone('UTC');
  const utcTz = getCurrentTimezone();
  assert(utcTz === 'UTC', `Timezone switched to UTC (got: ${utcTz})`);

  // UTC offset should be 0
  const utcOffset = getTimezoneOffsetMs();
  assert(utcOffset === 0, `UTC offset is 0 (got: ${utcOffset})`);

  // Switch back to Jakarta
  setCurrentTimezone('Asia/Jakarta');
  const jakartaOffset = getTimezoneOffsetMs();
  assert(jakartaOffset === 7 * 60 * 60 * 1000, `Jakarta offset is +7h (got: ${jakartaOffset})`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Timezone Utility Tests');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testNowWIB();
    await testParseDateAsWIB();
    await testFormatWIB();
    await testIsExpiredWIB();
    await testDaysUntilExpiry();
    await testStartAndEndOfDay();
    await testTimezoneSwitching();
  } catch (err) {
    console.error('Test error:', err);
    failed++;
  }

  // Reset timezone
  setCurrentTimezone('Asia/Jakarta');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
