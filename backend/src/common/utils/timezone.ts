/**
 * Timezone Utilities — Backend version
 *
 * Ported from frontend src/lib/timezone.ts
 * Only includes functions needed by backend modules.
 *
 * Architecture: WIB-as-UTC
 * MySQL stores DATETIME in WIB (Asia/Jakarta, +07:00).
 * Prisma reads raw values treating them as UTC.
 * So all Prisma Date objects have WIB time values in their UTC field.
 */

export const WIB_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Jakarta';
export const WIB_OFFSET = '+07:00';

let currentTimezone = WIB_TIMEZONE;

export function setCurrentTimezone(timezone: string): void {
  currentTimezone = timezone;
}

export function getCurrentTimezone(): string {
  return currentTimezone;
}

export function getTimezoneOffsetMs(): number {
  const offsetStr = getTimezoneOffset(currentTimezone);
  const match = offsetStr.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 7 * 60 * 60 * 1000;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2]);
  const minutes = parseInt(match[3]);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * Get current time in WIB-as-UTC format.
 * Returns a Date where UTC values represent current WIB time.
 */
export function nowWIB(): Date {
  return new Date(Date.now() + getTimezoneOffsetMs());
}

/**
 * Parse a date string as WIB values, returning a WIB-as-UTC Date.
 */
export function parseDateAsWIB(dateStr: string): Date {
  if (!dateStr.includes('T')) {
    return new Date(dateStr + 'T00:00:00.000Z');
  }
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
    return new Date(dateStr.endsWith('.000') ? dateStr + 'Z' : dateStr + (dateStr.includes('.') ? 'Z' : '.000Z'));
  }
  return new Date(dateStr);
}

/**
 * Convert a date for display (returns as-is since UTC values = WIB).
 */
export function toWIB(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  try {
    return typeof date === 'string' ? new Date(date) : date;
  } catch {
    return null;
  }
}

/**
 * Get start of day in WIB, in WIB-as-UTC format for Prisma queries.
 */
export function startOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Get end of day in WIB, in WIB-as-UTC format for Prisma queries.
 */
export function endOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function getTimezoneOffset(tz: string): string {
  const offsetMap: Record<string, string> = {
    'Asia/Jakarta': '+07:00',
    'Asia/Makassar': '+08:00',
    'Asia/Jayapura': '+09:00',
    'Asia/Singapore': '+08:00',
    'Asia/Kuala_Lumpur': '+08:00',
    'Asia/Bangkok': '+07:00',
    'Asia/Manila': '+08:00',
    'Asia/Ho_Chi_Minh': '+07:00',
    'Asia/Dubai': '+04:00',
    'Asia/Riyadh': '+03:00',
    'Asia/Tokyo': '+09:00',
    'Asia/Seoul': '+09:00',
    'Asia/Hong_Kong': '+08:00',
    'Australia/Sydney': '+11:00',
    'Australia/Melbourne': '+11:00',
    'Pacific/Auckland': '+13:00',
  };
  return offsetMap[tz] || '+07:00';
}
