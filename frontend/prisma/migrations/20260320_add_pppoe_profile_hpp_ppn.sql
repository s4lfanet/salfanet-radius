-- Migration: Add hpp and ppnActive fields to pppoe_profiles table
-- Date: 2026-03-20
-- MySQL-compatible: split into one statement per column (use mysql --force for idempotency)

ALTER TABLE `pppoe_profiles` ADD COLUMN `hpp` INT NULL COMMENT 'Harga Modal / Biaya Pokok Penjualan';
ALTER TABLE `pppoe_profiles` ADD COLUMN `ppnActive` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'PPN aktif';
