import 'server-only'
import { TextEncoder } from 'util';

/** Resolved JWT secret — falls back to NEXTAUTH_SECRET, then dev-only default in non-production. */
const _jwtSecret =
  process.env.JWT_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'your-secret-key-change-this-in-production' : undefined);

if (!_jwtSecret) {
  throw new Error('JWT_SECRET (or NEXTAUTH_SECRET) is required in production.');
}

/** Resolved JWT secret value. */
export const JWT_SECRET_VALUE = _jwtSecret;

/** Uint8Array encoded secret ready for jose jwtVerify / SignJWT. */
export const TECH_JWT_SECRET = new TextEncoder().encode(JWT_SECRET_VALUE);

// Fail fast at request time (not build time) if JWT_SECRET is missing in production.
export function assertJwtSecretSet(): void {
  if (!process.env.JWT_SECRET && !process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET (or NEXTAUTH_SECRET) is required in production.');
  }
}
