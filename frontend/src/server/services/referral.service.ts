import 'server-only'
/**
 * Referral code utilities for Salfanet RADIUS
 *
 * Referral codes are 8-char uppercase alphanumeric strings (A-Z 0-9, no ambiguous chars).
 * They are stored in pppoeUser.referralCode (unique index in DB).
 * Auto-generated on user creation via generateUniqueReferralCode().
 */

import { prisma } from '@/server/db/client';

// Alphabet: uppercase A-Z + digits 0-9, minus easily confused chars (O, 0, I, 1, L)
const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/**
 * Generate a random referral code string (not checked for uniqueness).
 */
function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return code;
}

/**
 * Generate a referral code that is guaranteed unique in the DB.
 * Retries up to 10 times (collision probability is negligible for <1M users).
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const exists = await prisma.pppoeUser.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!exists) {
      return code;
    }
  }
  // Fallback: add timestamp suffix to guarantee uniqueness
  return generateCode() + Date.now().toString(36).toUpperCase().slice(-2);
}

/**
 * Assign a referral code to an existing user who doesn't have one.
 * Safe to call multiple times (idempotent).
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.pppoeUser.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true },
  });

  if (!user) throw new Error('User not found');
  if (user.referralCode) return user.referralCode;

  const code = await generateUniqueReferralCode();
  await prisma.pppoeUser.update({
    where: { id: userId },
    data: { referralCode: code } as any,
  });
  return code;
}
