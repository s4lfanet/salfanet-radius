/**
 * Environment Configuration — Single Source of Truth
 *
 * Semua akses ke process.env sebaiknya melalui file ini.
 * Variabel wajib (required) akan throw saat startup jika tidak diset,
 * sehingga error terdeteksi lebih awal (fail-fast).
 *
 * File ini SERVER-ONLY — tidak bisa diimport di client component.
 * Variabel NEXT_PUBLIC_* tetap dapat diakses di client via process.env langsung.
 *
 * @module lib/env
 */
import 'server-only'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(
      `[env] Missing required environment variable: ${key}\n` +
      `  → Tambahkan ke file .env atau environment VPS sebelum menjalankan app.`
    )
  }
  return val
}

function optionalEnv(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue
}

// ─────────────────────────────────────────────
// REQUIRED — app tidak bisa berjalan tanpa ini
// ─────────────────────────────────────────────
const _required = {
  /** MySQL connection string (Prisma) */
  DATABASE_URL: requireEnv('DATABASE_URL'),
  /** NextAuth signing secret — generate: openssl rand -base64 32 */
  NEXTAUTH_SECRET: requireEnv('NEXTAUTH_SECRET'),
  /** Public URL aplikasi untuk NextAuth callback */
  NEXTAUTH_URL: requireEnv('NEXTAUTH_URL'),
}

// ─────────────────────────────────────────────
// SERVER-ONLY OPTIONAL — fitur tertentu tidak aktif tanpa ini
// ─────────────────────────────────────────────
const _server = {
  /** Secret untuk endpoint /api/cron — generate: crypto.randomBytes(32).toString('hex') */
  CRON_SECRET: optionalEnv('CRON_SECRET'),
  /** VAPID private key untuk Web Push notifications */
  VAPID_PRIVATE_KEY: optionalEnv('VAPID_PRIVATE_KEY'),
  /** VAPID contact email / subject */
  VAPID_CONTACT_EMAIL: optionalEnv('VAPID_CONTACT_EMAIL', optionalEnv('VAPID_SUBJECT')),
  /** Radius CoA secret — harus sama dengan konfigurasi MikroTik */
  RADIUS_COA_SECRET: optionalEnv('RADIUS_COA_SECRET'),
  /** Radius CoA port (default: 3799) */
  RADIUS_COA_PORT: parseInt(optionalEnv('RADIUS_COA_PORT', '3799'), 10),
  /** IP publik VPS / server RADIUS */
  RADIUS_SERVER_IP: optionalEnv('RADIUS_SERVER_IP', optionalEnv('VPS_IP')),
  /** JWT secret untuk customer session token */
  JWT_SECRET: optionalEnv('JWT_SECRET', optionalEnv('NEXTAUTH_SECRET')),
  /** JWT secret untuk agent session token */
  AGENT_JWT_SECRET: optionalEnv('AGENT_JWT_SECRET', optionalEnv('NEXTAUTH_SECRET')),
  /** Encryption key untuk data sensitif di DB */
  ENCRYPTION_KEY: optionalEnv('ENCRYPTION_KEY'),
  /** Upload directory untuk file attachments */
  UPLOAD_DIR: optionalEnv('UPLOAD_DIR', '/var/www/salfanet-radius/public/uploads'),
  /** WireGuard network interface (opsional, untuk VPN routing) */
  WG_IFACE: optionalEnv('WG_IFACE', 'wg0'),
  /** Node environment */
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test',
}

// ─────────────────────────────────────────────
// PUBLIC — aman diakses di client via process.env langsung
// (disertakan di sini hanya untuk referensi & type safety server-side)
// ─────────────────────────────────────────────
const _public = {
  /** Public URL aplikasi (exposed ke browser) */
  APP_URL: optionalEnv('NEXT_PUBLIC_APP_URL', optionalEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')),
  /** Timezone aplikasi */
  TIMEZONE: optionalEnv('NEXT_PUBLIC_TIMEZONE', 'Asia/Jakarta'),
  /** VAPID public key untuk Web Push (exposed ke browser) */
  VAPID_PUBLIC_KEY: optionalEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export const env = {
  ..._required,
  ..._server,
  public: _public,
} as const

export type Env = typeof env
