import { TextEncoder } from 'util';

const raw = process.env.JWT_SECRET;

if (!raw && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production.');
}

/** Resolved JWT secret — falls back to dev-only default in non-production. */
export const JWT_SECRET_VALUE =
  raw ?? 'your-secret-key-change-this-in-production';

/** Uint8Array encoded secret ready for jose jwtVerify / SignJWT. */
export const TECH_JWT_SECRET = new TextEncoder().encode(JWT_SECRET_VALUE);
