/**
 * DEPRECATED: This file is replaced by @/lib/timezone.ts
 *
 * ⚠️ TZ NOTE (corrected): Dates in database are NOT stored as UTC.
 * - Application-set dates (written via Prisma new Date()): stored as UTC components in MySQL DATETIME.
 *   Read back by Prisma correctly (appends Z → same UTC epoch). No TZ correction needed.
 * - FreeRADIUS-written dates (acctstarttime etc.) and MySQL CURRENT_TIMESTAMP fields:
 *   stored as WIB wall clock. Prisma appends Z → reads as WIB-as-UTC (7h offset from real UTC).
 *   Comparisons/arithmetic MUST use nowWIB() or subtract TZ_OFFSET_MS.
 * Use timezone.ts for proper WIB-as-UTC conversion.
 *
 * This file is kept for backward compatibility
 */

import { toWIB, formatWIB, daysUntilExpiry, relativeWIB, nowWIB } from '@/lib/timezone'

/**
 * Format datetime string (UTC from DB) to WIB display
 * Format: dd/MM/yyyy HH:mm:ss
 */
export function formatToWIB(dateStr: string | Date): string {
  return formatWIB(dateStr, 'dd/MM/yyyy HH:mm:ss')
}

/**
 * Format date only (UTC from DB) to WIB display
 * Format: dd/MM/yyyy
 */
export function formatDateOnly(dateStr: string | Date): string {
  return formatWIB(dateStr, 'dd/MM/yyyy')
}

/**
 * Format time only (UTC from DB) to WIB display
 * Format: HH:mm:ss
 */
export function formatTimeOnly(dateStr: string | Date): string {
  return formatWIB(dateStr, 'HH:mm:ss')
}

/**
 * Calculate time left until expiry
 * Returns human-readable string like "2h 30m left"
 */
export function calculateTimeLeft(expiresAtStr: string | Date): string {
  if (!expiresAtStr) return '-'
  
  try {
    const expiresWIB = toWIB(expiresAtStr)
    if (!expiresWIB) return '-'
    
    const now = nowWIB()
    const diff = Math.max(0, Math.floor((expiresWIB.getTime() - now.getTime()) / 1000))
    
    if (diff === 0) return 'Expired'
    
    const hours = Math.floor(diff / 3600)
    const minutes = Math.floor((diff % 3600) / 60)
    const seconds = diff % 60
    
    if (hours > 0) return `${hours}h ${minutes}m left`
    if (minutes > 0) return `${minutes}m ${seconds}s left`
    return `${seconds}s left`
  } catch {
    return 'Invalid'
  }
}

/**
 * Get current time in WIB
 */
export function nowInWIB(): Date {
  return nowWIB()
}

/**
 * Format relative time (e.g., "2 hours ago")
 * Uses date-fns relativeWIB which supports Indonesian locale
 */
export function formatRelativeTime(dateStr: string | Date): string {
  return relativeWIB(dateStr)
}
