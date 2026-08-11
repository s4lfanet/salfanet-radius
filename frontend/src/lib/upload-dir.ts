import 'server-only'
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Persistent upload directory — lives OUTSIDE the build/git directory so that
 * `git reset --hard`, `rm -rf .next`, and `npm run build` never touch it.
 *
 * Production: /var/data/salfanet/uploads  (set via UPLOAD_DIR env var)
 * Development: <project>/data/uploads
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/var/data/salfanet/uploads'
    : join(process.cwd(), 'data', 'uploads'));

/**
 * Get absolute path for an upload sub-directory.
 * Automatically creates the directory if it doesn't exist.
 *
 * Usage:
 *   getUploadDir('payment-proofs')       → /var/data/salfanet/uploads/payment-proofs
 *   getUploadDir('pppoe-customers', 'id-cards') → /var/data/salfanet/uploads/pppoe-customers/id-cards
 */
export function getUploadDir(...segments: string[]): string {
  const dir = join(UPLOAD_DIR, ...segments);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get absolute file path for an uploaded file.
 * Does NOT create directories (use getUploadDir for that).
 */
export function getUploadPath(...segments: string[]): string {
  return join(UPLOAD_DIR, ...segments);
}
