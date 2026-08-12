-- Migration: tambah kolom nas_id ke radcheck, radusergroup, radreply
-- Tujuan: isolasi username per-NAS untuk multi-tenant dengan username yang sama
-- Idempotent: safe to run multiple times
-- Jalankan SETELAH prisma db push

-- Add nas_id column to radcheck (if not exists)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radcheck' AND COLUMN_NAME = 'nas_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE radcheck ADD COLUMN nas_id INT DEFAULT NULL', 'SELECT "radcheck.nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add nas_id column to radusergroup (if not exists)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radusergroup' AND COLUMN_NAME = 'nas_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE radusergroup ADD COLUMN nas_id INT DEFAULT NULL', 'SELECT "radusergroup.nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add nas_id column to radreply (if not exists)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radreply' AND COLUMN_NAME = 'nas_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE radreply ADD COLUMN nas_id INT DEFAULT NULL', 'SELECT "radreply.nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index on nas_id for radcheck (if not exists)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radcheck' AND INDEX_NAME = 'idx_radcheck_nas_id');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_radcheck_nas_id ON radcheck(nas_id)', 'SELECT "idx_radcheck_nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index on nas_id for radusergroup (if not exists)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radusergroup' AND INDEX_NAME = 'idx_radusergroup_nas_id');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_radusergroup_nas_id ON radusergroup(nas_id)', 'SELECT "idx_radusergroup_nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add index on nas_id for radreply (if not exists)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radreply' AND INDEX_NAME = 'idx_radreply_nas_id');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_radreply_nas_id ON radreply(nas_id)', 'SELECT "idx_radreply_nas_id already exists" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Verifikasi
SELECT 'radcheck' as tabel, COUNT(*) as total, SUM(nas_id IS NOT NULL) as dengan_nas_id FROM radcheck WHERE attribute = 'Cleartext-Password'
UNION ALL
SELECT 'radusergroup', COUNT(*), SUM(nas_id IS NOT NULL) FROM radusergroup
UNION ALL
SELECT 'radreply', COUNT(*), SUM(nas_id IS NOT NULL) FROM radreply;
