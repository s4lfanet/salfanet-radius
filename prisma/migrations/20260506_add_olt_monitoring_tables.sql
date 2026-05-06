-- Migration: Add OLT monitoring columns and tables (v2.26.0)
-- Uses IF NOT EXISTS so safe to run on existing installs
-- Adds: monitoring columns on network_olts + all related monitoring tables

-- ─── 1. Add monitoring columns to network_olts ──────────────────────────────

ALTER TABLE `network_olts`
  ADD COLUMN IF NOT EXISTS `vendor`             VARCHAR(191)   DEFAULT 'huawei',
  ADD COLUMN IF NOT EXISTS `model`              VARCHAR(191)   NULL,
  ADD COLUMN IF NOT EXISTS `firmwareVersion`    VARCHAR(191)   NULL,
  ADD COLUMN IF NOT EXISTS `snmpEnabled`        TINYINT(1)     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `snmpCommunity`      VARCHAR(191)   NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS `snmpPort`           INT            NOT NULL DEFAULT 161,
  ADD COLUMN IF NOT EXISTS `telnetEnabled`      TINYINT(1)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `telnetPort`         INT            NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS `sshEnabled`         TINYINT(1)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `sshPort`            INT            NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS `username`           VARCHAR(191)   NULL,
  ADD COLUMN IF NOT EXISTS `password`           VARCHAR(191)   NULL,
  ADD COLUMN IF NOT EXISTS `monitoringEnabled`  TINYINT(1)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `pollingInterval`    INT            NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS `lastPollAt`         DATETIME(3)    NULL,
  ADD COLUMN IF NOT EXISTS `isOnline`           TINYINT(1)     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `uptime`             BIGINT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `temperature`        DOUBLE         NULL,
  ADD COLUMN IF NOT EXISTS `totalOnu`           INT            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `onlineOnu`          INT            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `offlineOnu`         INT            NOT NULL DEFAULT 0;

-- ─── 2. ONU status per-OLT ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_onu_status` (
  `id`              VARCHAR(191)  NOT NULL,
  `oltId`           VARCHAR(191)  NOT NULL,
  `onuIndex`        INT           NOT NULL DEFAULT 0,
  `frame`           INT           NOT NULL DEFAULT 0,
  `slot`            INT           NOT NULL DEFAULT 0,
  `port`            INT           NOT NULL,
  `onuId`           INT           NOT NULL,
  `macAddress`      VARCHAR(191)  NULL,
  `serialNumber`    VARCHAR(191)  NULL,
  `description`     TEXT          NULL,
  `status`          ENUM('online','offline','dying_gasp','los','auth_failed') NOT NULL DEFAULT 'offline',
  `rxPower`         DOUBLE        NULL,
  `txPower`         DOUBLE        NULL,
  `distance`        INT           NULL,
  `temperature`     DOUBLE        NULL,
  `voltage`         DOUBLE        NULL,
  `biasCurrent`     DOUBLE        NULL,
  `lastDeregReason` VARCHAR(191)  NULL,
  `ipAddress`       VARCHAR(191)  NULL,
  `vlanId`          INT           NULL,
  `bandwidthUp`     BIGINT        NOT NULL DEFAULT 0,
  `bandwidthDown`   BIGINT        NOT NULL DEFAULT 0,
  `customerId`      VARCHAR(191)  NULL,
  `firstSeenAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt`      DATETIME(3)   NULL,
  `lastOfflineAt`   DATETIME(3)   NULL,
  `createdAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)   NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `olt_onu_status_oltId_frame_slot_port_onuId_key` (`oltId`, `frame`, `slot`, `port`, `onuId`),
  INDEX `olt_onu_status_oltId_idx` (`oltId`),
  INDEX `olt_onu_status_status_idx` (`status`),
  INDEX `olt_onu_status_serialNumber_idx` (`serialNumber`),
  INDEX `olt_onu_status_macAddress_idx` (`macAddress`),
  INDEX `olt_onu_status_customerId_idx` (`customerId`),

  CONSTRAINT `olt_onu_status_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `olt_onu_status_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `pppoe_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 3. Performance metrics time-series ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_performance_metrics` (
  `id`          VARCHAR(191) NOT NULL,
  `oltId`       VARCHAR(191) NOT NULL,
  `cpuUsage`    DOUBLE       NULL,
  `memoryUsage` DOUBLE       NULL,
  `temperature` DOUBLE       NULL,
  `uptime`      BIGINT       NULL,
  `totalOnu`    INT          NOT NULL DEFAULT 0,
  `onlineOnu`   INT          NOT NULL DEFAULT 0,
  `offlineOnu`  INT          NOT NULL DEFAULT 0,
  `rxBytes`     BIGINT       NOT NULL DEFAULT 0,
  `txBytes`     BIGINT       NOT NULL DEFAULT 0,
  `rxErrors`    BIGINT       NOT NULL DEFAULT 0,
  `txErrors`    BIGINT       NOT NULL DEFAULT 0,
  `recordedAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `olt_performance_metrics_oltId_idx` (`oltId`),
  INDEX `olt_performance_metrics_recordedAt_idx` (`recordedAt`),

  CONSTRAINT `olt_performance_metrics_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 4. Alert records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_alerts` (
  `id`                  VARCHAR(191) NOT NULL,
  `oltId`               VARCHAR(191) NULL,
  `onuId`               VARCHAR(191) NULL,
  `alertType`           ENUM('olt_offline','olt_high_temp','onu_offline','low_signal','high_errors','dying_gasp','unauthorized_onu') NOT NULL DEFAULT 'onu_offline',
  `severity`            ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  `message`             TEXT         NOT NULL,
  `details`             JSON         NULL,
  `isResolved`          TINYINT(1)   NOT NULL DEFAULT 0,
  `resolvedAt`          DATETIME(3)  NULL,
  `resolvedBy`          VARCHAR(191) NULL,
  `notifiedViaEmail`    TINYINT(1)   NOT NULL DEFAULT 0,
  `notifiedViaWhatsapp` TINYINT(1)   NOT NULL DEFAULT 0,
  `emailSentAt`         DATETIME(3)  NULL,
  `whatsappSentAt`      DATETIME(3)  NULL,
  `createdAt`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`           DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `olt_alerts_oltId_idx` (`oltId`),
  INDEX `olt_alerts_onuId_idx` (`onuId`),
  INDEX `olt_alerts_alertType_idx` (`alertType`),
  INDEX `olt_alerts_severity_idx` (`severity`),
  INDEX `olt_alerts_isResolved_idx` (`isResolved`),
  INDEX `olt_alerts_createdAt_idx` (`createdAt`),

  CONSTRAINT `olt_alerts_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `olt_alerts_onuId_fkey`
    FOREIGN KEY (`onuId`) REFERENCES `olt_onu_status` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 5. Alert settings per-OLT ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_alert_settings` (
  `id`                 VARCHAR(191) NOT NULL,
  `oltId`              VARCHAR(191) NULL,
  `alertType`          VARCHAR(191) NOT NULL,
  `isEnabled`          TINYINT(1)   NOT NULL DEFAULT 1,
  `thresholdValue`     DOUBLE       NULL,
  `notifyEmail`        TINYINT(1)   NOT NULL DEFAULT 0,
  `notifyWhatsapp`     TINYINT(1)   NOT NULL DEFAULT 1,
  `emailRecipients`    TEXT         NULL,
  `whatsappRecipients` TEXT         NULL,
  `cooldownMinutes`    INT          NOT NULL DEFAULT 30,
  `createdAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `olt_alert_settings_oltId_idx` (`oltId`),
  INDEX `olt_alert_settings_alertType_idx` (`alertType`),

  CONSTRAINT `olt_alert_settings_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 6. Monitoring audit logs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_monitoring_logs` (
  `id`        VARCHAR(191) NOT NULL,
  `oltId`     VARCHAR(191) NOT NULL,
  `logType`   ENUM('poll','alert','command','error','reboot') NOT NULL DEFAULT 'poll',
  `message`   TEXT         NULL,
  `data`      JSON         NULL,
  `severity`  ENUM('info','warning','error','critical') NOT NULL DEFAULT 'info',
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `olt_monitoring_logs_oltId_idx` (`oltId`),
  INDEX `olt_monitoring_logs_logType_idx` (`logType`),
  INDEX `olt_monitoring_logs_severity_idx` (`severity`),
  INDEX `olt_monitoring_logs_createdAt_idx` (`createdAt`),

  CONSTRAINT `olt_monitoring_logs_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 7. Custom alert rules ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `olt_custom_alert_rules` (
  `id`              VARCHAR(191) NOT NULL,
  `name`            VARCHAR(191) NOT NULL,
  `description`     TEXT         NULL,
  `oltId`           VARCHAR(191) NULL,
  `isEnabled`       TINYINT(1)   NOT NULL DEFAULT 1,
  `priority`        INT          NOT NULL DEFAULT 0,
  `conditions`      JSON         NOT NULL,
  `actions`         JSON         NOT NULL,
  `schedule`        JSON         NULL,
  `cooldownSeconds` INT          NOT NULL DEFAULT 900,
  `lastTriggeredAt` DATETIME(3)  NULL,
  `triggerCount`    INT          NOT NULL DEFAULT 0,
  `createdBy`       VARCHAR(191) NULL,
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `olt_custom_alert_rules_oltId_idx` (`oltId`),
  INDEX `olt_custom_alert_rules_isEnabled_idx` (`isEnabled`),
  INDEX `olt_custom_alert_rules_priority_idx` (`priority`),

  CONSTRAINT `olt_custom_alert_rules_oltId_fkey`
    FOREIGN KEY (`oltId`) REFERENCES `network_olts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
