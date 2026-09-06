// Test timezone functions in production
const { formatInTimeZone, getTimezoneOffset } = require('date-fns-tz');

// Simulate what the backend does
const WIB_TIMEZONE = 'Asia/Jakarta';
let currentTimezone = WIB_TIMEZONE;

function getTimezoneOffsetMs() {
  return getTimezoneOffset(currentTimezone);
}

function startOfDayWIBtoUTC(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  const midnightCompanyTZ = new Date(tzStr + 'T00:00:00.000Z');
  return new Date(midnightCompanyTZ.getTime() - getTimezoneOffsetMs());
}

function endOfDayWIBtoUTC(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  const endOfDayCompanyTZ = new Date(tzStr + 'T23:59:59.999Z');
  return new Date(endOfDayCompanyTZ.getTime() - getTimezoneOffsetMs());
}

// Test: what month param does the frontend send for current month?
const now = new Date();
const currentMonth = formatInTimeZone(now, currentTimezone, 'yyyy-MM');
console.log('Current month (WIB):', currentMonth);
console.log('Current date (WIB):', formatInTimeZone(now, currentTimezone, 'yyyy-MM-dd HH:mm:ss'));
console.log('currentTimezone:', currentTimezone);
console.log('offset ms:', getTimezoneOffsetMs());
console.log('');

// Test monthly filter for August 2026
const monthParam = '2026-08';
const [y, m] = monthParam.split('-').map(Number);
const start = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
const end = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));
console.log(`Monthly ${monthParam}:`);
console.log('  start:', start.toISOString());
console.log('  end:', end.toISOString());

// Voucher createdAt
const voucher = new Date('2026-08-31T02:06:37.346Z');
console.log('  voucher:', voucher.toISOString());
console.log('  in range?', voucher >= start && voucher <= end);
console.log('');

// Test monthly filter for September 2026 (current month)
const monthParam2 = '2026-09';
const [y2, m2] = monthParam2.split('-').map(Number);
const start2 = startOfDayWIBtoUTC(new Date(Date.UTC(y2, m2 - 1, 1)));
const end2 = endOfDayWIBtoUTC(new Date(Date.UTC(y2, m2, 0)));
console.log(`Monthly ${monthParam2}:`);
console.log('  start:', start2.toISOString());
console.log('  end:', end2.toISOString());
console.log('  voucher in range?', voucher >= start2 && voucher <= end2);
