import 'server-only'
import { randomBytes } from 'crypto';

/**
 * Generate invoice number dengan format: INV-YYYYMMDD-XXXXXX
 * Contoh: INV-20260506-A3F9B2
 * Format: tahun+bulan+tanggal + 6 random uppercase hex chars
 */
export function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = randomBytes(3).toString('hex').toUpperCase();
  return `INV-${year}${month}${day}-${random}`;
}

/**
 * Generate transaction ID dengan format: TRX-YYYYMMDD-HHMMSS-XXXX
 * Contoh: TRX-20251219-153045-0001
 */
export async function generateTransactionId(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}${seconds}`;
  const prefix = `TRX-${dateStr}-${timeStr}-`;

  // Random 4 digit untuk uniqueness
  const random = Math.floor(1000 + Math.random() * 9000);
  
  return `${prefix}${random}`;
}

/**
 * Generate category ID dengan format: CAT-YYYYMMDD-HHMMSS
 * Contoh: CAT-20251219-153045
 */
export function generateCategoryId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `CAT-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Generate invoice ID dengan format: inv-YYYYMMDD-HHMMSS-XXXX
 * Contoh: inv-20251219-153045-1234
 */
export function generateInvoiceId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const random = Math.floor(1000 + Math.random() * 9000);
  
  return `inv-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}
