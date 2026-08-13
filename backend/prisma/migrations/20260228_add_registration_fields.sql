-- Add idCardNumber and idCardPhoto to registration_requests table
-- MySQL-compatible: no ADD COLUMN IF NOT EXISTS (run with mysql --force)
ALTER TABLE `registration_requests` ADD COLUMN `idCardNumber` VARCHAR(20) NULL;
ALTER TABLE `registration_requests` ADD COLUMN `idCardPhoto` TEXT NULL;
