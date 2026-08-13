ALTER TABLE `pppoe_profiles`
  ADD COLUMN `mikrotikProfileName` VARCHAR(191) NULL AFTER `groupName`,
  ADD COLUMN `ipPoolName` VARCHAR(191) NULL AFTER `mikrotikProfileName`;

UPDATE `pppoe_profiles`
SET `mikrotikProfileName` = COALESCE(NULLIF(`groupName`, ''), `name`)
WHERE `mikrotikProfileName` IS NULL;