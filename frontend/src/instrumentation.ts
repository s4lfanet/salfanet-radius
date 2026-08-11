/**
 * Next.js Instrumentation
 * Called once when the server starts
 *
 * NOTE: Telegram backup & health crons dijalankan HANYA oleh proses salfanet-cron
 * (src/cron/runner.ts via PM2). Tidak dijalankan di sini untuk menghindari
 * double/triple send karena Next.js berjalan dalam cluster mode (multiple workers).
 */
export async function register() {
  console.log('[INSTRUMENTATION] Register called, runtime:', process.env.NEXT_RUNTIME)
  // Cron jobs ditangani oleh dedicated cron runner process (salfanet-cron)
}
