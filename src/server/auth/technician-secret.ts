import { TextEncoder } from 'util';

/** Resolved JWT secret — falls back to dev-only default in non-production. */
export const JWT_SECRET_VALUE =
  process.env.JWT_SECRET ?? 'your-secret-key-change-this-in-production';

/** Uint8Array encoded secret ready for jose jwtVerify / SignJWT. */
export const TECH_JWT_SECRET = new TextEncoder().encode(JWT_SECRET_VALUE);

// Fail fast at request time (not build time) if JWT_SECRET is missing in production.
export function assertJwtSecretSet(): void {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }
}
