/**
 * QRIS Notification Signature V2 — HMAC-based authenticity + replay protection,
 * additive to the existing V1 device_key-only trust model.
 *
 * V1 clients never send a `signature` field and never touch this file —
 * qris-notify/route.ts only calls verify() when that field is present.
 *
 * Canonical string signed by the client: "{device_key}|{amount}|{timestamp}|{nonce}"
 * Signature: hex-encoded HMAC-SHA256(device_secret, canonical_string).
 *
 * Port of PHP lib/QrisSignature.php
 */

import crypto from 'crypto';

const TIMESTAMP_WINDOW_SECONDS = 300; // ±5 minutes clock skew tolerance

export interface VerifyResult {
  valid: boolean;
  reason: string;
}

/**
 * Verify a V2 signed notification. Fails closed on any internal error.
 */
export function verifyQrisSignature(
  deviceSecret: string,
  deviceKey: string,
  amount: number,
  timestamp: number,
  nonce: string,
  signature: string
): VerifyResult {
  try {
    if (!deviceSecret) {
      return { valid: false, reason: 'no_device_secret_configured' };
    }
    if (!nonce || nonce.length < 8 || nonce.length > 128) {
      return { valid: false, reason: 'invalid_nonce' };
    }
    if (!signature) {
      return { valid: false, reason: 'missing_signature' };
    }
    if (timestamp <= 0) {
      return { valid: false, reason: 'invalid_timestamp' };
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TIMESTAMP_WINDOW_SECONDS) {
      return { valid: false, reason: 'timestamp_out_of_window' };
    }

    const canonical = `${deviceKey}|${amount}|${timestamp}|${nonce}`;
    const expected = crypto
      .createHmac('sha256', deviceSecret)
      .update(canonical)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase().trim()))) {
      return { valid: false, reason: 'signature_mismatch' };
    }

    return { valid: true, reason: 'ok' };
  } catch (e) {
    console.error('[QrisSignature] verify() exception:', e);
    return { valid: false, reason: 'exception' };
  }
}

/**
 * In-memory nonce cache for replay protection.
 * In production with multiple instances, use Redis instead.
 * Entry expires after 10 minutes (longer than timestamp window).
 */
const NONCE_TTL_SECONDS = 600;
const nonceCache = new Map<string, number>();

/**
 * Claim a nonce atomically. Returns true if the nonce was not seen before
 * (within the TTL window), false if it was already used (replay).
 */
export function claimNonce(deviceKey: string, nonce: string): boolean {
  const key = `${deviceKey}:${nonce}`;
  const now = Math.floor(Date.now() / 1000);

  // Clean expired entries
  for (const [k, t] of nonceCache.entries()) {
    if (now - t > NONCE_TTL_SECONDS) {
      nonceCache.delete(k);
    }
  }

  if (nonceCache.has(key)) {
    return false; // replay
  }

  nonceCache.set(key, now);
  return true;
}
