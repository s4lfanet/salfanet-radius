/**
 * Timezone Utilities for SALFANET RADIUS
 * 
 * ============================================
 * TIMEZONE CONSISTENCY ARCHITECTURE
 * ============================================
 * 
 * For consistent timezone handling across the entire system:
 * 
 * 1. SYSTEM TIMEZONE: Asia/Jakarta (WIB, UTC+7)
 *    - Set via: timedatectl set-timezone Asia/Jakarta
 *    - Affects: All OS-level timestamps, FreeRADIUS logs
 * 
 * 2. MYSQL TIMEZONE: +07:00 (matching system)
 *    - Config: /etc/mysql/mysql.conf.d/timezone.cnf
 *    - Set via: SET GLOBAL time_zone = '+07:00';
 *    - CRITICAL: MySQL MUST use same timezone as system!
 *    - NOW() and all datetime columns will use this timezone
 * 
 * 3. NODE.JS/PM2 TIMEZONE: Asia/Jakarta
 *    - Set via: TZ="Asia/Jakarta" in .env and ecosystem.config.js
 *    - Affects: new Date(), console.log timestamps
 * 
 * 4. FREERADIUS: Uses system timezone
 *    - radacct.acctstarttime is in system local time (WIB)
 *    - No conversion needed when storing to database
 * 
 * 5. DATABASE QUERIES:
 *    - Use NOW() for local time comparisons (NOT UTC_TIMESTAMP()!)
 *    - Example: WHERE expiresAt < NOW() -- Correct for WIB storage
 * 
 * ============================================
 * CRITICAL: Timezone Bug Prevention
 * ============================================
 * 
 * If MySQL timezone != System timezone:
 * - Voucher expiration will be incorrect (7 hour offset for WIB)
 * - NOW() vs UTC_TIMESTAMP() will give different results
 * - Sessions may appear active when they're expired
 * 
 * To verify timezone consistency:
 * ```bash
 * # 1. Check system timezone
 * timedatectl show --property=Timezone --value  # Should show: Asia/Jakarta
 * 
 * # 2. Check MySQL timezone
 * mysql -e "SELECT @@global.time_zone, NOW(), UTC_TIMESTAMP()"
 * # NOW() and system 'date' command should match!
 * 
 * # 3. Check Node.js timezone
 * node -e "console.log(new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}))"
 * ```
 * 
 * @see docs/VOUCHER_EXPIRATION_TIMEZONE_FIX.md for detailed explanation
 */

import { 
  format, 
  formatDistanceToNow, 
  differenceInDays,
  addDays,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
} from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';

// Constants - These are default values, actual timezone is loaded from database/company settings
export const WIB_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'Asia/Jakarta';
export const WIB_OFFSET = '+07:00';

// Dynamic timezone getter - will be updated from company settings
let currentTimezone = WIB_TIMEZONE;

/**
 * Set the current timezone (called from company settings)
 */
export function setCurrentTimezone(timezone: string) {
  currentTimezone = timezone;
}

/**
 * Get the current configured timezone
 */
export function getCurrentTimezone(): string {
  return currentTimezone;
}

/**
 * Get timezone offset in milliseconds from the configured timezone offset string
 */
export function getTimezoneOffsetMs(): number {
  const offsetStr = getTimezoneOffset(currentTimezone);
  const match = offsetStr.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 7 * 60 * 60 * 1000; // Default WIB +7
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2]);
  const minutes = parseInt(match[3]);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * Parse a date string as WIB values, returning a WIB-as-UTC Date.
 * Used for user-entered dates that should be interpreted as WIB.
 * @param dateStr - Date string (e.g., "2026-03-01" or "2026-03-01T10:00:00")
 * @returns Date where UTC values represent WIB time
 */
export function parseDateAsWIB(dateStr: string): Date {
  if (!dateStr.includes('T')) {
    // Date only: "2026-03-01" → midnight WIB
    return new Date(dateStr + 'T00:00:00.000Z');
  }
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
    // DateTime without timezone: treat values as WIB
    return new Date(dateStr.endsWith('.000') ? dateStr + 'Z' : dateStr + (dateStr.includes('.') ? 'Z' : '.000Z'));
  }
  // Already has timezone indicator
  return new Date(dateStr);
}

/**
 * Convert date for display purposes.
 * 
 * PRISMA + MYSQL TIMEZONE ARCHITECTURE:
 * MySQL stores DATETIME in WIB (Asia/Jakarta, +07:00).
 * Prisma reads the raw value and treats it as UTC.
 * So all Prisma Date objects have WIB time values in their UTC field.
 * 
 * This function returns the date as-is since the UTC values
 * already represent WIB time (no conversion needed).
 * 
 * @param date - Date from database (WIB values in UTC field)
 * @returns Same date or null
 */
export function toWIB(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  try {
    return typeof date === 'string' ? new Date(date) : date;
  } catch (error) {
    console.error('toWIB error:', error);
    return null;
  }
}

/**
 * Convert a local WIB date to WIB-as-UTC format for Prisma/MySQL storage.
 * Since Prisma stores the Date's UTC value to MySQL DATETIME,
 * and MySQL expects WIB values, we need the Date's UTC = WIB.
 * 
 * @param wib - Date in local timezone (from user input, new Date() etc.)
 * @returns Date where UTC values represent WIB time (for Prisma storage)
 */
export function toUTC(wib: Date | string): Date {
  if (typeof wib === 'string') {
    return parseDateAsWIB(wib);
  }
  // For Date objects: shift from real UTC to WIB-as-UTC
  // Local time on TZ=Jakarta IS WIB, extract local components as UTC
  return new Date(Date.UTC(
    wib.getFullYear(), wib.getMonth(), wib.getDate(),
    wib.getHours(), wib.getMinutes(), wib.getSeconds(), wib.getMilliseconds()
  ));
}

/**
 * Format a database date as WIB string.
 * 
 * Since Prisma stores MySQL WIB values in the Date's UTC field,
 * we format using UTC timezone to display the raw WIB values correctly.
 * This works on both server (any TZ) and browser (any TZ) consistently.
 * 
 * @param date - Date from database (WIB values in UTC field)
 * @param formatStr - Format string (default: 'dd MMM yyyy HH:mm')
 * @returns Formatted date string showing WIB time
 */
export function formatWIB(
  date: Date | string | null | undefined,
  formatStr: string = 'dd MMM yyyy HH:mm'
): string {
  if (!date) return '-';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    // Format using UTC timezone — the UTC values ARE the WIB time
    return formatInTimeZone(d, 'UTC', formatStr, { locale: localeId });
  } catch (error) {
    console.error('formatWIB error:', error);
    return '-';
  }
}

/**
 * Format a date that is already in local timezone.
 * Since all database dates through Prisma have WIB values in UTC field,
 * this now delegates to formatWIB which handles both cases correctly.
 * 
 * @param localDate - Date from database
 * @param formatStr - Format string (default: 'dd MMM yyyy HH:mm')
 * @returns Formatted date string showing WIB time
 */
export function formatLocalDate(
  localDate: Date | string | null | undefined,
  formatStr: string = 'dd MMM yyyy HH:mm'
): string {
  return formatWIB(localDate, formatStr);
}

/**
 * Relative time from now in WIB (e.g., "2 jam yang lalu")
 */
export function relativeWIB(date: Date | string | null | undefined): string {
  if (!date) return '-';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    // Both d and nowWIB() are in WIB-as-UTC format, so distance is correct
    const now = nowWIB();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const suffix = diffMs >= 0 ? ' yang lalu' : ' lagi';
    if (diffSec < 60) return `beberapa detik${suffix}`;
    if (diffMin < 60) return `${diffMin} menit${suffix}`;
    if (diffHour < 24) return `${diffHour} jam${suffix}`;
    if (diffDay < 30) return `${diffDay} hari${suffix}`;
    if (diffDay < 365) return `${Math.floor(diffDay / 30)} bulan${suffix}`;
    return `${Math.floor(diffDay / 365)} tahun${suffix}`;
  } catch (error) {
    console.error('relativeWIB error:', error);
    return '-';
  }
}

/**
 * Check if date is expired (compared to current WIB time)
 * Both DB dates and nowWIB() are in WIB-as-UTC format, so comparison works.
 */
export function isExpiredWIB(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  return d.getTime() < nowWIB().getTime();
}

/**
 * Days until expiry (negative if expired)
 * Both dates in WIB-as-UTC format for correct comparison.
 */
export function daysUntilExpiry(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  // Both in WIB-as-UTC space
  const now = nowWIB();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get current time in WIB-as-UTC format.
 * Returns a Date where UTC values represent current WIB time.
 * This is consistent with how Prisma reads MySQL DATETIME values.
 */
export function nowWIB(): Date {
  return new Date(Date.now() + getTimezoneOffsetMs());
}

/**
 * Get today's date string in WIB (yyyy-MM-dd).
 * Safe on both server and client regardless of system timezone.
 */
export function todayWIBStr(): string {
  return formatWIB(nowWIB(), 'yyyy-MM-dd');
}

/**
 * Get first of current month string in WIB (yyyy-MM-01).
 */
export function firstOfMonthWIBStr(): string {
  return formatWIB(nowWIB(), 'yyyy-MM') + '-01';
}

/**
 * Add days to UTC date (returns UTC)
 */
export function addDaysToUTC(utc: Date | string, days: number): Date {
  const date = typeof utc === 'string' ? new Date(utc) : utc;
  return addDays(date, days);
}

/**
 * Get start of day in WIB, in WIB-as-UTC format for Prisma queries.
 * Accepts strings (parsed as WIB) or Date objects (WIB-as-UTC from DB/nowWIB).
 */
export function startOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  // Use UTC components (which represent WIB in our system)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Get end of day in WIB, in WIB-as-UTC format for Prisma queries.
 * Accepts strings (parsed as WIB) or Date objects (WIB-as-UTC from DB/nowWIB).
 */
export function endOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Format for datetime-local input (WIB)
 */
export function toDatetimeLocalWIB(utc: Date | string | null | undefined): string {
  if (!utc) return '';
  return formatWIB(utc, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Parse datetime-local input (WIB) to WIB-as-UTC Date for Prisma storage.
 * datetime-local values are always WIB from the user's perspective.
 */
export function fromDatetimeLocalWIB(datetimeLocal: string): Date {
  // Parse as WIB values directly into UTC field
  return parseDateAsWIB(datetimeLocal);
}

/**
 * Get timezone info
 */
export function getTimezoneInfo() {
  const tzName = getTimezoneName(currentTimezone);
  const tzAbbr = getTimezoneAbbreviation(currentTimezone);
  const tzOffset = getTimezoneOffset(currentTimezone);
  
  return {
    timezone: currentTimezone,
    offset: tzOffset,
    name: tzName,
    abbreviation: tzAbbr,
  };
}

/**
 * Get timezone display name
 */
function getTimezoneName(tz: string): string {
  const tzMap: Record<string, string> = {
    'Asia/Jakarta': 'Western Indonesia Time (WIB)',
    'Asia/Makassar': 'Central Indonesia Time (WITA)',
    'Asia/Jayapura': 'Eastern Indonesia Time (WIT)',
    'Asia/Singapore': 'Singapore Time (SGT)',
    'Asia/Kuala_Lumpur': 'Malaysia Time (MYT)',
    'Asia/Bangkok': 'Indochina Time (ICT)',
    'Asia/Manila': 'Philippine Time (PHT)',
    'Asia/Ho_Chi_Minh': 'Indochina Time (ICT)',
    'Asia/Dubai': 'Gulf Standard Time (GST)',
    'Asia/Riyadh': 'Arabia Standard Time (AST)',
    'Asia/Tokyo': 'Japan Standard Time (JST)',
    'Asia/Seoul': 'Korea Standard Time (KST)',
    'Asia/Hong_Kong': 'Hong Kong Time (HKT)',
    'Australia/Sydney': 'Australian Eastern Time (AET)',
    'Australia/Melbourne': 'Australian Eastern Time (AET)',
    'Pacific/Auckland': 'New Zealand Time (NZT)',
  };
  return tzMap[tz] || tz;
}

/**
 * Get timezone abbreviation
 */
function getTimezoneAbbreviation(tz: string): string {
  const abbrevMap: Record<string, string> = {
    'Asia/Jakarta': 'WIB',
    'Asia/Makassar': 'WITA',
    'Asia/Jayapura': 'WIT',
    'Asia/Singapore': 'SGT',
    'Asia/Kuala_Lumpur': 'MYT',
    'Asia/Bangkok': 'ICT',
    'Asia/Manila': 'PHT',
    'Asia/Ho_Chi_Minh': 'ICT',
    'Asia/Dubai': 'GST',
    'Asia/Riyadh': 'AST',
    'Asia/Tokyo': 'JST',
    'Asia/Seoul': 'KST',
    'Asia/Hong_Kong': 'HKT',
    'Australia/Sydney': 'AEDT',
    'Australia/Melbourne': 'AEDT',
    'Pacific/Auckland': 'NZDT',
  };
  return abbrevMap[tz] || tz;
}

/**
 * Get timezone UTC offset
 */
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

/**
 * Format date with status color indicator
 * Useful for due dates, expiry dates, etc.
 */
export function formatDateWithStatus(date: Date | string | null) {
  if (!date) return { text: '-', color: 'gray' as const };
  
  const days = daysUntilExpiry(date);
  if (days === null) return { text: '-', color: 'gray' as const };
  
  const formatted = formatWIB(date, 'dd MMM yyyy');
  
  if (days < 0) {
    return {
      text: `${formatted} (Telat ${Math.abs(days)} hari)`,
      color: 'red' as const,
    };
  } else if (days === 0) {
    return {
      text: `${formatted} (Hari ini!)`,
      color: 'orange' as const,
    };
  } else if (days <= 3) {
    return {
      text: `${formatted} (${days} hari lagi)`,
      color: 'yellow' as const,
    };
  } else {
    return {
      text: formatted,
      color: 'green' as const,
    };
  }
}
