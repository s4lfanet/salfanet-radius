/**
 * Timezone Utilities for SALFANET RADIUS
 * 
 * ============================================
 * TIMEZONE CONSISTENCY ARCHITECTURE
 * ============================================
 * 
 * All dates are stored as TRUE UTC in MySQL DATETIME columns.
 * Prisma's mysql2 driver sends JS Date's UTC components to MySQL,
 * and reads them back as UTC. No timezone shifting on storage.
 * 
 * 1. DATABASE STORAGE: True UTC
 *    - Prisma/mysql2 stores JS Date UTC components to DATETIME
 *    - All Date objects from Prisma are true UTC
 *    - new Date() and nowWIB() both return true UTC
 * 
 * 2. DISPLAY: Convert UTC to company timezone
 *    - formatWIB() uses formatInTimeZone(d, currentTimezone, ...)
 *    - toWIB() shifts UTC by company offset for display
 * 
 * 3. USER INPUT: Convert company timezone to UTC
 *    - parseDateAsWIB() interprets input as company TZ, converts to UTC
 *    - fromDatetimeLocalWIB() delegates to parseDateAsWIB()
 *    - toUTC() passes through (Date objects are already UTC)
 * 
 * 4. COMPARISONS: All in true UTC
 *    - nowWIB() returns new Date() (true UTC)
 *    - isExpiredWIB() compares against Date.now()
 *    - Date range filters use startOfDayWIBtoUTC/endOfDayWIBtoUTC
 *      which convert company-TZ start/end of day to true UTC
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

// Cache for server-fetched timezone (refreshed periodically)
let dbTimezoneCache: string | null = null;
let dbTimezoneCacheTime = 0;
const DB_TIMEZONE_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Refresh timezone from the backend's public company API (server-side only).
 * Frontend has no direct DB access — it fetches from the backend service.
 * Caches for 1 minute to avoid repeated requests.
 */
async function refreshTimezoneFromBackend(): Promise<string> {
  const now = Date.now();
  if (dbTimezoneCache && (now - dbTimezoneCacheTime) < DB_TIMEZONE_CACHE_TTL) {
    currentTimezone = dbTimezoneCache;
    return currentTimezone;
  }
  try {
    const baseUrl = process.env.SERVER_API_URL || process.env.BACKEND_URL || 'http://localhost:3001';
    const res = await fetch(`${baseUrl}/api/public/company`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const tz = data?.company?.timezone || data?.data?.timezone || data?.timezone;
      if (tz) {
        dbTimezoneCache = tz;
        dbTimezoneCacheTime = now;
        currentTimezone = tz;
      }
    }
  } catch {
    // Backend unavailable — keep current/default
  }
  return currentTimezone;
}

/**
 * Self-initializing background refresh (server-side only) — fixes stale
 * timezone state after a PM2 restart. Without this, frontend SSR pages
 * would keep using the ENV default (NEXT_PUBLIC_TIMEZONE) until a browser
 * session called setCurrentTimezone() via the client-side company store.
 * Guarded against duplicate registration (HMR / dev).
 */
declare global {
  // eslint-disable-next-line no-var
  var __salfanetTimezoneAutoRefreshStarted: boolean | undefined;
}

if (typeof window === 'undefined' && !globalThis.__salfanetTimezoneAutoRefreshStarted) {
  globalThis.__salfanetTimezoneAutoRefreshStarted = true;
  refreshTimezoneFromBackend().catch(() => { /* non-fatal */ });
  setInterval(() => {
    refreshTimezoneFromBackend().catch(() => { /* non-fatal */ });
  }, DB_TIMEZONE_CACHE_TTL);
}

/**
 * Get timezone offset in milliseconds from the configured timezone.
 * Uses Intl.DateTimeFormat (DST-aware) instead of hardcoded values.
 * Falls back to extracting offset from the system's own timezone if
 * the company timezone cannot be resolved.
 */
export function getTimezoneOffsetMs(): number {
  const offsetStr = getTimezoneOffset(currentTimezone);
  const match = offsetStr.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    // Fallback: use the system's actual UTC offset (not hardcoded +7)
    const systemOffset = -new Date().getTimezoneOffset() * 60 * 1000;
    return systemOffset;
  }
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2]);
  const minutes = parseInt(match[3]);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * Parse a date string as company-timezone values, returning a true UTC Date.
 * Used for user-entered dates that should be interpreted as company timezone.
 * @param dateStr - Date string (e.g., "2026-03-01" or "2026-03-01T10:00:00")
 * @returns Date in true UTC (converted from company timezone input)
 */
export function parseDateAsWIB(dateStr: string): Date {
  if (!dateStr.includes('T')) {
    // Date only: "2026-03-01" → midnight company timezone → convert to UTC
    const wibMidnight = new Date(dateStr + 'T00:00:00.000Z');
    return new Date(wibMidnight.getTime() - getTimezoneOffsetMs());
  }
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
    // DateTime without timezone: treat values as company timezone → convert to UTC
    const normalized = dateStr.endsWith('.000') ? dateStr + 'Z' : dateStr + (dateStr.includes('.') ? 'Z' : '.000Z');
    const wibDate = new Date(normalized);
    return new Date(wibDate.getTime() - getTimezoneOffsetMs());
  }
  // Already has timezone indicator — parse as-is
  return new Date(dateStr);
}

/**
 * Convert a UTC date from the database to a company-timezone Date.
 * 
 * PRISMA + MYSQL TIMEZONE ARCHITECTURE:
 * Prisma's mysql2 driver stores JS Date's UTC components to MySQL DATETIME.
 * MySQL DATETIME has no timezone awareness — values are stored as-is.
 * When read back, Prisma interprets them as UTC.
 * 
 * This function converts the UTC date to the company timezone for display.
 * 
 * @param date - Date from database (true UTC)
 * @returns Date shifted to company timezone, or null
 */
export function toWIB(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    // Convert UTC to company timezone by adding the offset
    return new Date(d.getTime() + getTimezoneOffsetMs());
  } catch (error) {
    console.error('toWIB error:', error);
    return null;
  }
}

/**
 * Convert a company-timezone date to true UTC for Prisma/MySQL storage.
 *
 * Prisma's mysql2 driver stores JS Date's UTC components to MySQL DATETIME.
 * So we need to pass true UTC dates to Prisma.
 *
 * @param local - Date in company timezone (from user input, new Date() etc.)
 * @returns Date in true UTC (for Prisma storage)
 */
export function toUTC(local: Date | string): Date {
  if (typeof local === 'string') {
    return parseDateAsWIB(local);
  }
  // If the input is a JS Date from new Date(), it's already in true UTC.
  // No conversion needed — Prisma stores UTC components directly.
  return local;
}

/**
 * Format a database date as company-timezone string.
 * 
 * Prisma stores true UTC values to MySQL DATETIME (via mysql2 driver).
 * This function converts the UTC date to the company timezone for display.
 * Works on both server (any TZ) and browser (any TZ) consistently.
 * 
 * @param date - Date from database (true UTC)
 * @param formatStr - Format string (default: 'dd MMM yyyy HH:mm')
 * @returns Formatted date string showing company timezone time
 */
export function formatWIB(
  date: Date | string | null | undefined,
  formatStr: string = 'dd MMM yyyy HH:mm'
): string {
  if (!date) return '-';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    // Convert from true UTC to company timezone for display
    return formatInTimeZone(d, currentTimezone, formatStr, { locale: localeId });
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
 * Relative time from now in company timezone (e.g., "2 jam yang lalu")
 */
export function relativeWIB(date: Date | string | null | undefined): string {
  if (!date) return '-';
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    // Both d and new Date() are in true UTC, so distance is correct
    const now = new Date();
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
 * Check if date is expired (compared to current time)
 * Both DB dates and new Date() are in true UTC, so comparison works.
 */
export function isExpiredWIB(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/**
 * Days until expiry (negative if expired)
 * Both dates in true UTC for correct comparison.
 */
export function daysUntilExpiry(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get current time in true UTC format.
 * Prisma stores true UTC to MySQL DATETIME, so this is consistent.
 */
export function nowWIB(): Date {
  return new Date();
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
 * Get start of day in company timezone, as true UTC for Prisma queries.
 * Accepts strings (parsed as company TZ) or Date objects (true UTC from DB/new Date()).
 */
export function startOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  // Get company-timezone components for this date
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  // Start of that day in company timezone = midnight company TZ as UTC
  const midnightCompanyTZ = new Date(tzStr + 'T00:00:00.000Z');
  // Convert from company timezone to true UTC
  return new Date(midnightCompanyTZ.getTime() - getTimezoneOffsetMs());
}

/**
 * Get end of day in company timezone, as true UTC for Prisma queries.
 * Accepts strings (parsed as company TZ) or Date objects (true UTC from DB/new Date()).
 */
export function endOfDayWIBtoUTC(date: Date | string = nowWIB()): Date {
  const d = typeof date === 'string' ? parseDateAsWIB(date) : date;
  // Get company-timezone components for this date
  const tzStr = formatInTimeZone(d, currentTimezone, 'yyyy-MM-dd');
  // End of that day in company timezone = 23:59:59.999 company TZ as UTC
  const endOfDayCompanyTZ = new Date(tzStr + 'T23:59:59.999Z');
  // Convert from company timezone to true UTC
  return new Date(endOfDayCompanyTZ.getTime() - getTimezoneOffsetMs());
}

/**
 * Format for datetime-local input (WIB)
 */
export function toDatetimeLocalWIB(utc: Date | string | null | undefined): string {
  if (!utc) return '';
  return formatWIB(utc, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Parse datetime-local input (company timezone) to true UTC Date for Prisma storage.
 * datetime-local values are always in company timezone from the user's perspective.
 */
export function fromDatetimeLocalWIB(datetimeLocal: string): Date {
  // Parse as company timezone values, then convert to true UTC
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
 * Get timezone UTC offset — uses Intl.DateTimeFormat for DST-aware,
 * universally correct offset calculation.
 *
 * This replaces the old hardcoded offsetMap which:
 *   1. Only supported a fixed list of timezones
 *   2. Did not handle DST (Daylight Saving Time)
 *   3. Fell back to +07:00 for any unknown timezone (WRONG)
 *
 * Now supports ANY valid IANA timezone (e.g., 'America/New_York',
 * 'Europe/London', 'Asia/Makassar') with automatic DST adjustment.
 *
 * @param tz - IANA timezone identifier (e.g., 'Asia/Jakarta')
 * @returns Offset string like '+07:00', '-05:00', '+00:00'
 */
function getTimezoneOffset(tz: string): string {
  // UTC and GMT have zero offset
  if (tz === 'UTC' || tz === 'GMT' || tz === 'Etc/UTC' || tz === 'Etc/GMT') {
    return '+00:00';
  }

  try {
    // Use Intl.DateTimeFormat to get the actual offset for this timezone
    // at the current moment (DST-aware).
    // formatToParts with timeZoneName: 'longOffset' returns e.g. "GMT+07:00"
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    });
    const parts = dtf.formatToParts(new Date());
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');

    if (offsetPart) {
      // offsetPart.value is like "GMT+07:00", "GMT-05:00", or "GMT" (UTC)
      const val = offsetPart.value;
      if (val === 'GMT' || val === 'UTC') return '+00:00';

      // Parse "GMT+07:00" → "+07:00"
      const match = val.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, '0');
        const minutes = match[3] || '00';
        return `${sign}${hours}:${minutes}`;
      }
    }
  } catch {
    // Invalid timezone — fall through to default
  }

  // Last resort fallback — WIB +07:00 (should rarely happen)
  console.warn(`[timezone] Could not determine offset for "${tz}", defaulting to +07:00`);
  return '+07:00';
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
