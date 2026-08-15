/**
 * Operational Monitoring Logger
 *
 * Structured logging for operational events:
 *   - FreeRADIUS sync success/failure/retry/dead/reconciliation
 *   - Cron lock acquired/denied/expired/heartbeat/execution
 *   - Payment duplicate/idempotency/settlement
 *
 * SECURITY: This logger MUST NOT log:
 *   - passwords
 *   - JWT tokens
 *   - API keys
 *   - payment secrets
 *   - WhatsApp tokens
 *   - database credentials
 *
 * All log messages are structured as JSON for easy parsing by log aggregation.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogEvent {
  category: string;
  event: string;
  message: string;
  [key: string]: unknown;
}

function log(level: LogLevel, event: LogEvent): void {
  const timestamp = new Date().toISOString();
  const line = JSON.stringify({ timestamp, level, ...event });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ─── FreeRADIUS Monitoring ──────────────────────────────────────────────────

export function logRadiusSyncSuccess(username: string, nasIdentifier: string | null): void {
  log('info', {
    category: 'freeradius',
    event: 'sync_success',
    message: 'RADIUS sync succeeded',
    username,
    nasIdentifier: nasIdentifier || 'global',
  });
}

export function logRadiusSyncFailure(username: string, error: string): void {
  log('warn', {
    category: 'freeradius',
    event: 'sync_failure',
    message: 'RADIUS sync failed',
    username,
    error: error.slice(0, 200), // no secrets, limit length
  });
}

export function logRadiusRetry(username: string, retryCount: number, nextRetryAt: string): void {
  log('info', {
    category: 'freeradius',
    event: 'retry',
    message: 'RADIUS sync queued for retry',
    username,
    retryCount,
    nextRetryAt,
  });
}

export function logRadiusDead(username: string, retryCount: number, error: string): void {
  log('error', {
    category: 'freeradius',
    event: 'dead_queue',
    message: 'RADIUS sync exhausted retries — moved to dead queue',
    username,
    retryCount,
    error: error.slice(0, 200),
  });
}

export function logRadiusReconciliation(report: {
  totalSalfaNetUsers: number;
  totalRadiusUsers: number;
  missingInRadius: number;
  staleInRadius: number;
  mismatchPassword: number;
  mismatchProfile: number;
  mismatchIp: number;
  knownStale: number;
  unknownStale: number;
  deleteQueued: number;
}): void {
  log('info', {
    category: 'freeradius',
    event: 'reconciliation',
    message: 'RADIUS reconciliation completed',
    ...report,
  });
}

export function logRadiusBackpressure(consecutiveFailures: number, deferredCount: number): void {
  log('warn', {
    category: 'freeradius',
    event: 'backpressure',
    message: 'Backpressure activated — processing paused',
    consecutiveFailures,
    deferredCount,
  });
}

// ─── Cron Monitoring ────────────────────────────────────────────────────────

export function logCronLockAcquired(jobKey: string): void {
  log('info', {
    category: 'cron',
    event: 'lock_acquired',
    message: 'Cron lock acquired',
    jobKey,
  });
}

export function logCronLockDenied(jobKey: string): void {
  log('info', {
    category: 'cron',
    event: 'lock_denied',
    message: 'Cron lock denied — held by another instance',
    jobKey,
  });
}

export function logCronLockExpired(jobKey: string): void {
  log('warn', {
    category: 'cron',
    event: 'lock_expired',
    message: 'Cron lock expired (stale)',
    jobKey,
  });
}

export function logCronHeartbeatFailure(jobKey: string): void {
  log('error', {
    category: 'cron',
    event: 'heartbeat_failure',
    message: 'Cron lock heartbeat failed — lock lost',
    jobKey,
  });
}

export function logCronExecution(jobKey: string, durationMs: number, success: boolean): void {
  log('info', {
    category: 'cron',
    event: 'execution',
    message: 'Cron job completed',
    jobKey,
    durationMs,
    success,
  });
}

// ─── Payment Monitoring ─────────────────────────────────────────────────────

export function logPaymentDuplicateCallback(gateway: string, orderId: string): void {
  log('info', {
    category: 'payment',
    event: 'duplicate_callback',
    message: 'Duplicate payment callback ignored',
    gateway,
    orderId, // order ID is not a secret
  });
}

export function logPaymentIdempotencyHit(gateway: string, orderId: string): void {
  log('info', {
    category: 'payment',
    event: 'idempotency_hit',
    message: 'Payment idempotency guard triggered — settlement skipped',
    gateway,
    orderId,
  });
}

export function logPaymentSettlementSuccess(orderId: string, amount: number): void {
  log('info', {
    category: 'payment',
    event: 'settlement_success',
    message: 'Payment settled successfully',
    orderId,
    amount,
  });
}

export function logPaymentSettlementFailure(orderId: string, error: string): void {
  log('error', {
    category: 'payment',
    event: 'settlement_failure',
    message: 'Payment settlement failed',
    orderId,
    error: error.slice(0, 200),
  });
}
