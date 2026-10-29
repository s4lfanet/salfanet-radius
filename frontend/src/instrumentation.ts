/**
 * Next.js Instrumentation
 * Called once when the server starts
 *
 * NOTE: Backup Telegram dijalankan oleh job telegram_backup di proses salfanet-cron
 * (backend/cron-runner.ts via PM2). Tidak dijalankan di sini untuk menghindari
 * double/triple send karena Next.js berjalan dalam cluster mode (multiple workers).
 */
export async function register() {
  // Cron jobs ditangani oleh dedicated cron runner process (salfanet-cron)
}
