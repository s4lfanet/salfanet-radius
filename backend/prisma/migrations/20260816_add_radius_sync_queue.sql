-- FreeRADIUS Sync Retry Queue
-- Tracks failed RADIUS syncs for retry with exponential backoff
CREATE TABLE IF NOT EXISTS `radius_sync_queue` (
  `id` VARCHAR(255) NOT NULL,
  `pppoe_user_id` VARCHAR(255) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `sync_type` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `retry_count` INT NOT NULL DEFAULT 0,
  `max_retries` INT NOT NULL DEFAULT 5,
  `last_error` TEXT NULL,
  `last_attempt_at` DATETIME NULL,
  `next_retry_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `failed_at` DATETIME NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_radius_sync_status` (`status`),
  INDEX `idx_radius_sync_next_retry` (`next_retry_at`),
  INDEX `idx_radius_sync_pppoe_user` (`pppoe_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Atomic Cron Lock (MySQL-based distributed lock)
-- Replaces in-memory Set + findFirst race condition
CREATE TABLE IF NOT EXISTS `cron_lock` (
  `job_key` VARCHAR(64) NOT NULL,
  `owner_token` VARCHAR(64) NOT NULL,
  `acquired_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`job_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agent JWT revocation: sessionVersion field
-- Increment to invalidate all existing JWT tokens for an agent
ALTER TABLE `agents` ADD COLUMN `sessionVersion` INT NOT NULL DEFAULT 0;

-- Payment idempotency: unique index on transactions.reference
-- Prevents duplicate financial entries from concurrent webhooks.
-- MySQL allows multiple NULLs in a unique index, so non-referenced entries are unaffected.
CREATE UNIQUE INDEX `idx_transactions_reference_unique` ON `transactions` (`reference`);
