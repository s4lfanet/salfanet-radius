-- Add localAddress and lastRouterId to pppoe_profiles for 1-click re-sync
ALTER TABLE `pppoe_profiles`
  ADD COLUMN `localAddress` VARCHAR(191) NULL AFTER `ipPoolName`,
  ADD COLUMN `lastRouterId` VARCHAR(191) NULL AFTER `localAddress`;
