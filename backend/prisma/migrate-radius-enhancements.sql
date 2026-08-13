-- =====================================================
-- Salfanet Radius — RADIUS Schema Enhancements Migration
-- Diadopsi dari home.pmynet.id-main (FreeRADIUS 3.2.8)
-- Date: 2026-08-12
--
-- Jalankan di VPS:
--   mysql -u root -p salfanet_radius < migrate-radius-enhancements.sql
--
-- ATAU via prisma db push (recommended):
--   cd /var/www/salfanet-radius/frontend
--   npx prisma db push --schema=prisma/schema.prisma
-- =====================================================

-- =====================================================
-- 1. Multi-NAS Isolation: nas_identifier column
--    Memungkinkan username yang sama di NAS/router berbeda
--    MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS — use procedure
-- =====================================================

DROP PROCEDURE IF EXISTS add_nas_identifier_columns;
DELIMITER $$
CREATE PROCEDURE add_nas_identifier_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'radcheck'
                     AND column_name = 'nas_identifier') THEN
        ALTER TABLE radcheck ADD COLUMN nas_identifier VARCHAR(128) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'radreply'
                     AND column_name = 'nas_identifier') THEN
        ALTER TABLE radreply ADD COLUMN nas_identifier VARCHAR(128) DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'radusergroup'
                     AND column_name = 'nas_identifier') THEN
        ALTER TABLE radusergroup ADD COLUMN nas_identifier VARCHAR(128) DEFAULT NULL;
    END IF;
    -- Index untuk query filter per-NAS
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'radcheck'
                     AND index_name = 'idx_radcheck_nas_identifier') THEN
        CREATE INDEX idx_radcheck_nas_identifier ON radcheck(nas_identifier);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'radreply'
                     AND index_name = 'idx_radreply_nas_identifier') THEN
        CREATE INDEX idx_radreply_nas_identifier ON radreply(nas_identifier);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = 'radusergroup'
                     AND index_name = 'idx_radusergroup_nas_identifier') THEN
        CREATE INDEX idx_radusergroup_nas_identifier ON radusergroup(nas_identifier);
    END IF;
END$$
DELIMITER ;
CALL add_nas_identifier_columns();
DROP PROCEDURE IF EXISTS add_nas_identifier_columns;

-- =====================================================
-- 2. RADIUS IP Pool table (radippool)
--    FreeRADIUS ippool module — dynamic IP allocation
-- =====================================================

CREATE TABLE IF NOT EXISTS radippool (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pool_name             VARCHAR(30) NOT NULL,
  framedipaddress       VARCHAR(15) NOT NULL DEFAULT '',
  nasipaddress          VARCHAR(15) NOT NULL DEFAULT '',
  calledstationid       VARCHAR(30) NOT NULL DEFAULT '',
  callingstationid      VARCHAR(30) NOT NULL DEFAULT '',
  expiry_time           DATETIME NULL DEFAULT NULL,
  username              VARCHAR(64) NOT NULL DEFAULT '',
  pool_key              VARCHAR(30) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_radippool_poolname_expire (pool_name, expiry_time),
  KEY idx_radippool_framedipaddress (framedipaddress),
  KEY idx_radippool_nasip_poolkey_ip (nasipaddress, pool_key, framedipaddress)
) ENGINE=InnoDB;

-- =====================================================
-- 3. CUI (Chargeable User Identity) table
--    Persistent user tracking across sessions/NAS
-- =====================================================

CREATE TABLE IF NOT EXISTS cui (
  clientipaddress  VARCHAR(46) NOT NULL DEFAULT '',
  callingstationid VARCHAR(50) NOT NULL DEFAULT '',
  username         VARCHAR(64) NOT NULL DEFAULT '',
  cui              VARCHAR(32) NOT NULL DEFAULT '',
  creationdate     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastaccounting   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username, clientipaddress, callingstationid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- =====================================================
-- 4. Data Usage by Period table
--    Bandwidth reporting per user per period
-- =====================================================

CREATE TABLE IF NOT EXISTS data_usage_by_period (
  username         VARCHAR(64) NOT NULL,
  period_start     DATETIME NOT NULL,
  period_end       DATETIME NULL,
  acctinputoctets  BIGINT(20) NULL,
  acctoutputoctets BIGINT(20) NULL,
  PRIMARY KEY (username, period_start),
  KEY idx_data_usage_period_start (period_start),
  KEY idx_data_usage_period_end (period_end)
) ENGINE=InnoDB;

-- =====================================================
-- 5. NAS Reload tracking table
--    FreeRADIUS lightweight accounting-on/off
-- =====================================================

CREATE TABLE IF NOT EXISTS nasreload (
  nasipaddress VARCHAR(15) NOT NULL,
  reloadtime   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nasipaddress)
) ENGINE=InnoDB;

-- =====================================================
-- 6. Populate nas_identifier dari pppoe_users yang ada
--    Sync routerId → nas_identifier untuk existing data
-- =====================================================

UPDATE radcheck rc
JOIN pppoe_users pu ON pu.username = rc.username
SET rc.nas_identifier = pu.router_id
WHERE rc.nas_identifier IS NULL AND pu.router_id IS NOT NULL;

UPDATE radreply rr
JOIN pppoe_users pu ON pu.username = rr.username
SET rr.nas_identifier = pu.router_id
WHERE rr.nas_identifier IS NULL AND pu.router_id IS NOT NULL;

UPDATE radusergroup rug
JOIN pppoe_users pu ON pu.username = rug.username
SET rug.nas_identifier = pu.router_id
WHERE rug.nas_identifier IS NULL AND pu.router_id IS NOT NULL;

-- =====================================================
-- Verifikasi
-- =====================================================

SELECT '=== Migration Summary ===' AS '';

SELECT 'radcheck with nas_identifier' AS table_name,
  COUNT(*) AS total,
  SUM(nas_identifier IS NOT NULL) AS with_nas
FROM radcheck
UNION ALL
SELECT 'radreply', COUNT(*), SUM(nas_identifier IS NOT NULL) FROM radreply
UNION ALL
SELECT 'radusergroup', COUNT(*), SUM(nas_identifier IS NOT NULL) FROM radusergroup;

SELECT 'radippool' AS table_name, COUNT(*) AS total FROM radippool;
SELECT 'cui' AS table_name, COUNT(*) AS total FROM cui;
SELECT 'data_usage_by_period' AS table_name, COUNT(*) AS total FROM data_usage_by_period;
SELECT 'nasreload' AS table_name, COUNT(*) AS total FROM nasreload;

SELECT '=== Migration Complete ===' AS '';
