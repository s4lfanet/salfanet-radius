// Debug rekap voucher date filtering
const { formatInTimeZone } = require('date-fns-tz');

const currentTimezone = 'Asia/Jakarta';
const getTimezoneOffsetMs = () => {
  const now = new Date();
  const tz = Intl.DateTimeFormat('en-US', { timeZone: currentTimetime, timeZoneName: 'short' });
  return 0; // placeholder
};

// Simulate startOfDayWIBtoUTC for 2026-08-01
function startOfDayWIBtoUTC(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  const midnightCompanyTZ = new Date(tzStr + 'T00:00:00.000Z');
  // WIB = UTC+7, so to convert from WIB to UTC, subtract 7 hours
  return new Date(midnightCompanyTZ.getTime() - 7 * 60 * 60 * 1000);
}

function endOfDayWIBtoUTC(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : date;
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  const endOfDayCompanyTZ = new Date(tzStr + 'T23:59:59.999Z');
  return new Date(endOfDayCompanyTZ.getTime() - 7 * 60 * 60 * 1000);
}

// Test monthly filter: 2026-08
const monthParam = '2026-08';
const [y, m] = monthParam.split('-').map(Number);
const startDate = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
const endDate = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0)));

console.log('Monthly filter 2026-08:');
console.log('  start:', startDate.toISOString());
console.log('  end:', endDate.toISOString());

// The voucher createdAt is: 2026-08-31 02:06:37.346
const voucherDate = new Date('2026-08-31T02:06:37.346Z');
console.log('  voucher createdAt:', voucherDate.toISOString());
console.log('  in range?', voucherDate >= startDate && voucherDate <= endDate);

// Test daily filter: 2026-08-31
const dateParam = '2026-08-31';
const dailyStart = startOfDayWIBtoUTC(dateParam);
const dailyEnd = endOfDayWIBtoUTC(dateParam);
console.log('\nDaily filter 2026-08-31:');
console.log('  start:', dailyStart.toISOString());
console.log('  end:', dailyEnd.toISOString());
console.log('  in range?', voucherDate >= dailyStart && voucherDate <= dailyEnd);

// Test weekly filter: Monday 2026-08-25
const weekParam = '2026-08-25';
const weekStart = startOfDayWIBtoUTC(weekParam);
const weekEnd = endOfDayWIBtoUTC(new Date(weekParam + 'T00:00:00Z'));
weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
console.log('\nWeekly filter 2026-08-25:');
console.log('  start:', weekStart.toISOString());
console.log('  end:', weekEnd.toISOString());
console.log('  in range?', voucherDate >= weekStart && voucherDate <= weekEnd);

// What if createdAt is stored as WIB-as-UTC (legacy)?
// 2026-08-31 02:06:37 in DB = if this was WIB-as-UTC, actual WIB time is 02:06:37
// But if it's true UTC, actual WIB time is 09:06:37
console.log('\n--- If createdAt is WIB-as-UTC (legacy) ---');
console.log('WIB time:', formatInTimeZone(voucherDate, currentTimezone, 'yyyy-MM-dd HH:mm:ss'));
