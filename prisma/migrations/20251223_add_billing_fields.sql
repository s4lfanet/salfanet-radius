-- Migration: Add billing fields for flexible prepaid/postpaid system
-- Created: 2025-12-23
-- Version: 2.7.5 -> 2.8.0
-- MySQL-compatible: no ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- Run with mysql --force so duplicate-column/index errors (1060/1061) are skipped safely

-- Add new columns to pppoe_users table (one per statement for idempotency via --force)
ALTER TABLE pppoe_users ADD COLUMN billing_day INT DEFAULT 1 COMMENT 'Tanggal tagihan bulanan (1-28), untuk postpaid';
ALTER TABLE pppoe_users ADD COLUMN auto_isolation_enabled BOOLEAN DEFAULT TRUE COMMENT 'Enable auto isolation saat expired/overdue';
ALTER TABLE pppoe_users ADD COLUMN balance INT DEFAULT 0 COMMENT 'Saldo deposit pelanggan (untuk prepaid)';
ALTER TABLE pppoe_users ADD COLUMN auto_renewal BOOLEAN DEFAULT FALSE COMMENT 'Auto perpanjang dari saldo';
ALTER TABLE pppoe_users ADD COLUMN connection_type ENUM('PPPOE', 'HOTSPOT', 'STATIC_IP') DEFAULT 'PPPOE' COMMENT 'Tipe koneksi pelanggan';

-- Add indexes for performance (errors 1061 = duplicate index, safe to ignore with --force)
CREATE INDEX idx_pppoe_users_billing_day ON pppoe_users(billing_day);
CREATE INDEX idx_pppoe_users_subscription_type ON pppoe_users(subscription_type);
CREATE INDEX idx_pppoe_users_auto_renewal ON pppoe_users(auto_renewal);
CREATE INDEX idx_pppoe_users_connection_type ON pppoe_users(connection_type);

-- Add constraint: billing_day must be between 1 and 28
ALTER TABLE pppoe_users ADD CONSTRAINT chk_billing_day CHECK (billing_day >= 1 AND billing_day <= 28);

-- Update existing users to have billing_day = 1 if null
UPDATE pppoe_users SET billing_day = 1 WHERE billing_day IS NULL;

-- Add new fields to invoices table for better tracking (one per statement)
ALTER TABLE invoices ADD COLUMN invoice_type ENUM('MONTHLY', 'INSTALLATION', 'ADDON', 'TOPUP', 'RENEWAL') DEFAULT 'MONTHLY' COMMENT 'Tipe invoice';
ALTER TABLE invoices ADD COLUMN base_amount INT COMMENT 'Jumlah sebelum pajak';
ALTER TABLE invoices ADD COLUMN tax_rate DECIMAL(5,2) COMMENT 'Persentase pajak';
ALTER TABLE invoices ADD COLUMN additional_fees JSON COMMENT 'Biaya tambahan: [{name, amount}]';

-- Add index for invoice_type
CREATE INDEX idx_invoices_type ON invoices(invoice_type);

-- Comments for documentation
ALTER TABLE pppoe_users MODIFY COLUMN subscription_type ENUM('POSTPAID', 'PREPAID') DEFAULT 'POSTPAID' COMMENT 'POSTPAID: tagihan tetap tiap bulan, PREPAID: bayar dimuka';
ALTER TABLE pppoe_users MODIFY COLUMN expired_at DATETIME COMMENT 'Untuk PREPAID: tanggal kadaluarsa, untuk POSTPAID: NULL (tidak ada expiry)';

-- Validate data
-- For POSTPAID users, expiredAt should be NULL
UPDATE pppoe_users SET expired_at = NULL WHERE subscription_type = 'POSTPAID';

-- For PREPAID users without expiredAt, set to 30 days from now
UPDATE pppoe_users SET expired_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE subscription_type = 'PREPAID' AND expired_at IS NULL;