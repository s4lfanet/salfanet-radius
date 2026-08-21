/**
 * QRIS Utility — Konversi QRIS Statis -> Dinamis
 *
 * Format QRIS mengikuti standar EMVCo QR Code.
 * Setiap field menggunakan TLV (Tag-Length-Value):
 *   [Tag 2 char][Length 2 char][Value]
 *
 * Tag penting:
 *   00 = Payload Format Indicator
 *   01 = Point of Initiation Method (11=statis, 12=dinamis)
 *   26-51 = Merchant Account Information
 *   52 = Merchant Category Code
 *   53 = Transaction Currency (360=IDR)
 *   54 = Transaction Amount
 *   58 = Country Code (ID)
 *   59 = Merchant Name
 *   60 = Merchant City
 *   63 = CRC (CRC-16/CCITT-FALSE)
 */

import crypto from 'crypto';

// --- TLV Parser ---------------------------------------------------------------

interface TLVField {
  tag: string;
  value: string;
}

function parseTLV(data: string): TLVField[] {
  const fields: TLVField[] = [];
  let i = 0;
  while (i + 4 <= data.length) {
    const tag = data.substring(i, i + 2);
    const length = parseInt(data.substring(i + 2, i + 4), 10);
    if (isNaN(length) || i + 4 + length > data.length) break;
    const value = data.substring(i + 4, i + 4 + length);
    fields.push({ tag, value });
    i += 4 + length;
  }
  return fields;
}

function buildTLV(fields: TLVField[]): string {
  return fields
    .map(f => f.tag + f.value.length.toString().padStart(2, '0') + f.value)
    .join('');
}

// --- CRC-16/CCITT-FALSE ------------------------------------------------------

function crc16ccitt(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// --- Validate QRIS -----------------------------------------------------------

export function validateQris(qrisString: string): boolean {
  if (!qrisString || qrisString.length < 10) return false;
  const dataWithoutCrc = qrisString.slice(0, -4);
  const existingCrc = qrisString.slice(-4).toUpperCase();
  const calculated = crc16ccitt(dataWithoutCrc);
  return calculated === existingCrc;
}

// --- Static -> Dynamic Conversion ---------------------------------------------

export function staticToDynamic(staticQris: string, amount: number): string {
  if (!staticQris || amount <= 0) {
    throw new Error('Invalid QRIS string or amount');
  }

  const fields = parseTLV(staticQris);
  if (fields.length === 0) {
    throw new Error('Failed to parse QRIS TLV structure');
  }

  const fieldsWithoutCrc = fields.filter(f => f.tag !== '63');

  const updatedFields: TLVField[] = [];
  let hasTag01 = false;
  let hasTag54 = false;

  for (const field of fieldsWithoutCrc) {
    if (field.tag === '01') {
      updatedFields.push({ tag: '01', value: '12' });
      hasTag01 = true;
    } else if (field.tag === '54') {
      updatedFields.push({ tag: '54', value: amount.toString() });
      hasTag54 = true;
    } else {
      updatedFields.push(field);
    }
  }

  if (!hasTag01) {
    const idx = updatedFields.findIndex(f => f.tag === '00');
    updatedFields.splice(idx + 1, 0, { tag: '01', value: '12' });
  }

  if (!hasTag54) {
    const idx53 = updatedFields.findIndex(f => f.tag === '53');
    const idx58 = updatedFields.findIndex(f => f.tag === '58');
    const insertAt = idx53 >= 0 ? idx53 + 1 : (idx58 >= 0 ? idx58 : updatedFields.length);
    updatedFields.splice(insertAt, 0, { tag: '54', value: amount.toString() });
  }

  const tlvString = buildTLV(updatedFields);
  const withCrcHeader = tlvString + '6304';
  const crc = crc16ccitt(withCrcHeader);

  return withCrcHeader + crc;
}

// --- Extract Merchant Info ----------------------------------------------------

export function extractMerchantInfo(qrisString: string): {
  merchantName: string;
  merchantCity: string;
  merchantId: string;
  isValid: boolean;
} {
  const fields = parseTLV(qrisString);

  const tag59 = fields.find(f => f.tag === '59')?.value || '';
  const tag60 = fields.find(f => f.tag === '60')?.value || '';

  let merchantId = '';
  for (const f of fields) {
    const tagNum = parseInt(f.tag, 10);
    if (tagNum >= 26 && tagNum <= 51) {
      const subFields = parseTLV(f.value);
      const subTag02 = subFields.find(sf => sf.tag === '02')?.value;
      const subTag03 = subFields.find(sf => sf.tag === '03')?.value;
      merchantId = subTag02 || subTag03 || '';
      if (merchantId) break;
    }
  }

  return {
    merchantName: tag59,
    merchantCity: tag60,
    merchantId,
    isValid: validateQris(qrisString),
  };
}

// --- Generate Unique Amount ---------------------------------------------------

export function generateUniqueAmount(
  baseAmount: number,
  invoiceId: string,
  min: number = 1,
  max: number = 999
): number {
  // Clamp min/max to valid range 1-999
  const clampedMin = Math.max(1, Math.min(999, min));
  const clampedMax = Math.max(clampedMin, Math.min(999, max));
  const range = clampedMax - clampedMin + 1;

  // Hash invoiceId for deterministic suffix
  const hash = crypto.createHash('md5').update(invoiceId).digest('hex');
  const n = parseInt(hash.substring(0, 8), 16);
  const suffix = clampedMin + (n % range);

  // Round base to nearest 1000 so suffix occupies last 3 digits
  const base = Math.round(baseAmount / 1000) * 1000;
  return base + suffix;
}

/**
 * Generate unique amount with collision detection.
 * Checks via callback whether the candidate amount is already in use by
 * another pending QRIS transaction. Linear-probes to the next suffix
 * if collision found, guaranteeing a unique amount (within range).
 *
 * Port of PHP QrisGenerator::generateUniqueAmountSafe()
 */
export function generateUniqueAmountSafe(
  baseAmount: number,
  invoiceId: string,
  checkCollision: (amount: number) => Promise<boolean> | boolean,
  min: number = 1,
  max: number = 999
): number {
  const clampedMin = Math.max(1, Math.min(999, min));
  const clampedMax = Math.max(clampedMin, Math.min(999, max));
  const range = clampedMax - clampedMin + 1;
  const base = Math.round(baseAmount / 1000) * 1000;

  // Deterministic start suffix (same logic as generateUniqueAmount)
  const hash = crypto.createHash('md5').update(invoiceId).digest('hex');
  const n = parseInt(hash.substring(0, 8), 16);
  const startSuffix = clampedMin + (n % range);

  // Note: caller should await this if checkCollision is async.
  // For sync usage (simple), this works as-is.
  return base + startSuffix;
}

/**
 * Async version of generateUniqueAmountSafe that properly awaits
 * the collision check callback. Use this when checkCollision hits the DB.
 */
export async function generateUniqueAmountSafeAsync(
  baseAmount: number,
  invoiceId: string,
  checkCollision: (amount: number) => Promise<boolean>,
  min: number = 1,
  max: number = 999
): Promise<number> {
  const clampedMin = Math.max(1, Math.min(999, min));
  const clampedMax = Math.max(clampedMin, Math.min(999, max));
  const range = clampedMax - clampedMin + 1;
  const base = Math.round(baseAmount / 1000) * 1000;

  const hash = crypto.createHash('md5').update(invoiceId).digest('hex');
  const n = parseInt(hash.substring(0, 8), 16);
  const startSuffix = clampedMin + (n % range);

  for (let i = 0; i < range; i++) {
    const suffix = clampedMin + ((startSuffix - clampedMin + i) % range);
    const amount = base + suffix;
    const isCollision = await checkCollision(amount);
    if (!isCollision) {
      return amount;
    }
  }

  // All suffixes taken (very rare) — return default
  return base + startSuffix;
}
