-- Migration: Add billing fields for flexible prepaid/postpaid system
-- Created: 2025-12-23
-- Version: 2.7.5 -> 2.8.0
-- MySQL-compatible: no ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- Run with mysql --force so duplicate-column/index errors (1060/1061) are skipped safely
-- NOTE: Prisma uses camelCase column names in MySQL (no @map decorators)

-- Add new columns to pppoe_users (one per statement; Prisma may have already created these)
ALTER TABLE pppoe_users ADD COLUMN billingDay INT DEFAULT 1 COMMENT 'Tanggal tagihan bulanan (1-28), untuk postpaid';
ALTER TABLE pppoe_users ADD COLUMN autoIsolationEnabled BOOLEAN DEFAULT TRUE COMMENT 'Enable auto isolation saat expired/overdue';
ALTER TABLE pppoe_users ADD COLUMN balance INT DEFAULT 0 COMMENT 'Saldo deposit pelanggan (untuk prepaid)';
ALTER TABLE pppoe_users ADD COLUMN autoRenewal BOOLEAN DEFAULT FALSE COMMENT 'Auto perpanjang dari saldo';
ALTER TABLE pppoe_users ADD COLUMN connectionType ENUM('PPPOE', 'HOTSPOT', 'STATIC_IP') DEFAULT 'PPPOE' COMMENT 'Tipe koneksi pelanggan';

-- Add indexes for performance (errors 1061 = duplicate index, safe with --force)
CREATE INDEX idx_pppoe_users_billingDay ON pppoe_users(billingDay);
CREATE INDEX idx_pppoe_users_subscriptionType ON pppoe_users(subscriptionType);
CREATE INDEX idx_pppoe_users_autoRenewal ON pppoe_users(autoRenewal);
CREATE INDEX idx_pppoe_users_connectionType ON pppoe_users(connectionType);

-- Add constraint: billingDay must be between 1 and 28
ALTER TABLE pppoe_users ADD CONSTRAINT chk_billing_day CHECK (billingDay >= 1 AND billingDay <= 28);

-- Update existing users to have billingDay = 1 if null
UPDATE pppoe_users SET billingDay = 1 WHERE billingDay IS NULL;

-- Add new fields to invoices table (one per statement)
ALTER TABLE invoices ADD COLUMN invoiceType ENUM('MONTHLY', 'INSTALLATION', 'ADDON', 'TOPUP', 'RENEWAL') DEFAULT 'MONTHLY' COMMENT 'Tipe invoice';
ALTER TABLE invoices ADD COLUMN baseAmount INT COMMENT 'Jumlah sebelum pajak';
ALTER TABLE invoices ADD COLUMN taxRate DECIMAL(5,2) COMMENT 'Persentase pajak';
ALTER TABLE invoices ADD COLUMN additionalFees JSON COMMENT 'Biaya tambahan: [{name, amount}]';

-- Add index for invoiceType
CREATE INDEX idx_invoices_invoiceType ON invoices(invoiceType);

-- Validate data: for POSTPAID users, expiredAt should be NULL
UPDATE pppoe_users SET expiredAt = NULL WHERE subscriptionType = 'POSTPAID';

-- For PREPAID users without expiredAt, set to 30 days from now
UPDATE pppoe_users SET expiredAt = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE subscriptionType = 'PREPAID' AND expiredAt IS NULL;