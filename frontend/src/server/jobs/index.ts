/**
 * Job Registry — src/server/jobs/index.ts
 *
 * Central entry point for all background cron jobs.
 * Import and start all jobs from here.
 *
 * NOTE: cron-service.js is a standalone HTTP-based cron runner that calls
 * the /api/cron/* endpoints. This file is the TypeScript counterpart that
 * can be used for in-process job execution if needed.
 */

export { CRON_JOBS, getNextRunTime } from './jobs.config';
export type { CronJobConfig } from './jobs.config';

// Job implementations
export { syncHotspotWithRadius } from './hotspot-sync';
export { autoIsolatePPPoEUsers } from './pppoe-sync';
export {
  syncVoucherFromRadius,
  recordAgentSales,
  generateInvoices,
  sendInvoiceReminders,
  disconnectExpiredVoucherSessions,
  reconcileVoucherTransactions,
  getCronHistory,
} from './voucher-sync';
export { autoIsolateExpiredUsers } from './auto-isolation';
export { processAutoRenewal } from './auto-renewal';
export { freeradiusHealthCheck } from './freeradius-health';
export { updateInvoiceStatus } from './invoice-status-updater';
export { syncPPPoESessions } from './pppoe-session-sync';
export {
  autoBackupToTelegram,
  sendHealthCheckToTelegram,
  startBackupCron,
  startHealthCron,
  stopBackupCron,
  stopHealthCron,
  getTelegramCronStatus,
} from './telegram-cron';
export { saveCronHistory, cleanupOldHistory } from './helpers';
