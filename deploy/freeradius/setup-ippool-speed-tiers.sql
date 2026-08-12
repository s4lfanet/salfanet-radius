-- =====================================================
-- Setup IP Pool Berdasarkan Speed/Paket (per NAS)
-- Idempotent: safe to run multiple times
-- =====================================================

-- Pool 10Mbps: 172.19.200.2 - 172.19.200.254 (253 IP)
DELETE FROM radippool WHERE pool_name = '10Mbps-Pool';
INSERT INTO radippool (pool_name, framedipaddress, expiry_time, username, callingstationid, nasipaddress, pool_key)
SELECT '10Mbps-Pool', CONCAT('172.19.200.', n), NULL, '', '', '', ''
FROM (
    SELECT @row := @row + 1 AS n
    FROM (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t1,
         (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t2,
         (SELECT @row := 1) r
) numbers
WHERE n BETWEEN 2 AND 254;

-- Pool 20Mbps: 172.24.200.2 - 172.24.200.254 (253 IP)
DELETE FROM radippool WHERE pool_name = '20Mbps-Pool';
INSERT INTO radippool (pool_name, framedipaddress, expiry_time, username, callingstationid, nasipaddress, pool_key)
SELECT '20Mbps-Pool', CONCAT('172.24.200.', n), NULL, '', '', '', ''
FROM (
    SELECT @row := @row + 1 AS n
    FROM (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t1,
         (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t2,
         (SELECT @row := 1) r
) numbers
WHERE n BETWEEN 2 AND 254;

-- Pool 30Mbps: 172.25.30.2 - 172.25.30.254 (253 IP)
DELETE FROM radippool WHERE pool_name = '30Mbps-Pool';
INSERT INTO radippool (pool_name, framedipaddress, expiry_time, username, callingstationid, nasipaddress, pool_key)
SELECT '30Mbps-Pool', CONCAT('172.25.30.', n), NULL, '', '', '', ''
FROM (
    SELECT @row := @row + 1 AS n
    FROM (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t1,
         (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t2,
         (SELECT @row := 1) r
) numbers
WHERE n BETWEEN 2 AND 254;

-- Pool 50Mbps: 172.25.50.2 - 172.25.50.254 (253 IP)
DELETE FROM radippool WHERE pool_name = '50Mbps-Pool';
INSERT INTO radippool (pool_name, framedipaddress, expiry_time, username, callingstationid, nasipaddress, pool_key)
SELECT '50Mbps-Pool', CONCAT('172.25.50.', n), NULL, '', '', '', ''
FROM (
    SELECT @row := @row + 1 AS n
    FROM (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t1,
         (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t2,
         (SELECT @row := 1) r
) numbers
WHERE n BETWEEN 2 AND 254;

-- Pool 100Mbps: 172.26.100.2 - 172.26.100.254 (253 IP)
DELETE FROM radippool WHERE pool_name = '100Mbps-Pool';
INSERT INTO radippool (pool_name, framedipaddress, expiry_time, username, callingstationid, nasipaddress, pool_key)
SELECT '100Mbps-Pool', CONCAT('172.26.100.', n), NULL, '', '', '', ''
FROM (
    SELECT @row := @row + 1 AS n
    FROM (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t1,
         (SELECT 0 UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) t2,
         (SELECT @row := 1) r
) numbers
WHERE n BETWEEN 2 AND 254;

-- =====================================================
-- Mapping Group ke Pool-Name (radgroupreply)
-- =====================================================
DELETE FROM radgroupreply WHERE attribute = 'Pool-Name';

INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
  ('10Mbps',  'Pool-Name', ':=', '10Mbps-Pool'),
  ('20Mbps',  'Pool-Name', ':=', '20Mbps-Pool'),
  ('30Mbps',  'Pool-Name', ':=', '30Mbps-Pool'),
  ('50Mbps',  'Pool-Name', ':=', '50Mbps-Pool'),
  ('100Mbps', 'Pool-Name', ':=', '100Mbps-Pool'),
  ('radius-default', 'Pool-Name', ':=', '10Mbps-Pool');

-- =====================================================
-- Verifikasi
-- =====================================================
SELECT 'IP Pool Summary:' as '';
SELECT pool_name, COUNT(*) as total_ips, MIN(framedipaddress) as start_ip, MAX(framedipaddress) as end_ip
FROM radippool GROUP BY pool_name ORDER BY pool_name;

SELECT '' as '';
SELECT 'Group Mapping:' as '';
SELECT groupname, attribute, value FROM radgroupreply WHERE attribute = 'Pool-Name' ORDER BY groupname;
