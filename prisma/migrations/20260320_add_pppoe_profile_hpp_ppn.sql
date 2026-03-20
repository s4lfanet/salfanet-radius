-- Migration: Add hpp and ppnActive fields to pppoe_profiles table
-- Date: 2026-03-20

ALTER TABLE `pppoe_profiles`
  ADD COLUMN IF NOT EXISTS `hpp` INT NULL COMMENT 'Harga Modal / Biaya Pokok Penjualan',
  ADD COLUMN IF NOT EXISTS `ppnActive` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'PPN aktif';
