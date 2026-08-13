#!/bin/bash
# Script untuk setup FreeRADIUS dengan konfigurasi IP Pool

set -e

# Auto-detect RADDB_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RADDB_DIR="$SCRIPT_DIR/core/raddb"

echo "=== Setup FreeRADIUS untuk ISP ==="
echo "RADDB Directory: $RADDB_DIR"

# 1. Buat directory mods-enabled dan sites-enabled jika belum ada
echo "[1/6] Membuat directory mods-enabled dan sites-enabled..."
mkdir -p "$RADDB_DIR/mods-enabled"
mkdir -p "$RADDB_DIR/sites-enabled"

# 2. Enable modul-modul yang diperlukan
echo "[2/6] Mengaktifkan modul SQL dan IP Pool..."
cd "$RADDB_DIR/mods-enabled"

# Hapus symlink lama jika ada
rm -f sql sqlippool always attr_filter detail files linelog preprocess

# Buat symlink baru
ln -sf ../mods-available/sql sql
ln -sf ../mods-available/sqlippool sqlippool
ln -sf ../mods-available/always always
ln -sf ../mods-available/attr_filter attr_filter
ln -sf ../mods-available/detail detail
ln -sf ../mods-available/files files
ln -sf ../mods-available/linelog linelog
ln -sf ../mods-available/preprocess preprocess
ln -sf ../mods-available/expiration expiration
ln -sf ../mods-available/logintime logintime
ln -sf ../mods-available/pap pap
ln -sf ../mods-available/chap chap
ln -sf ../mods-available/mschap mschap
ln -sf ../mods-available/digest digest
ln -sf ../mods-available/exec exec
ln -sf ../mods-available/expr expr
ln -sf ../mods-available/eap eap
ln -sf ../mods-available/realm realm
ln -sf ../mods-available/replicate replicate

# 3. Enable virtual server default
echo "[3/6] Mengaktifkan virtual server default..."
cd "$RADDB_DIR/sites-enabled"
rm -f default
ln -sf ../sites-available/default default

# 4. Update konfigurasi SQL
echo "[4/6] Mengupdate konfigurasi SQL..."
cat > "$RADDB_DIR/mods-enabled/sql" << 'SQLEOF'
sql {
    dialect = "mysql"
    driver = "rlm_sql_${dialect}"
    
    mysql {
        warnings = auto
    }
    
    server = "172.30.0.1"
    port = 3306
    login = "radius"
    password = "DeveloperGame21"
    radius_db = "radius"
    
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
    authcheck_table = "radcheck"
    groupcheck_table = "radgroupcheck"
    authreply_table = "radreply"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"
    
    delete_stale_sessions = yes
    
    pool {
        start = 5
        min = 3
        max = 32
        spare = 10
        uses = 0
        retry_delay = 30
        lifetime = 0
        idle_timeout = 60
        max_retries = 5
    }
    
    read_clients = yes
    client_table = "nas"
    group_attribute = "SQL-Group"
    
    $INCLUDE ${modconfdir}/${.:name}/main/${dialect}/queries.conf
}
SQLEOF

# 5. Update konfigurasi clients.conf dengan IP Mikrotik yang benar
echo "[5/6] Mengupdate konfigurasi clients.conf..."
cat > "$RADDB_DIR/clients.conf" << 'CLIENTEOF'
# Client Mikrotik
client mikrotik {
    ipaddr = 103.191.165.25
    secret = Mynet@2026
    require_message_authenticator = no
    nas_type = mikrotik
}

# Client localhost untuk testing
client localhost {
    ipaddr = 127.0.0.1
    secret = testing123
    require_message_authenticator = no
}

# Client Docker Network
client docker_network {
    ipaddr = 172.30.0.0/24
    secret = testing123
    require_message_authenticator = no
}
CLIENTEOF

# 6. Buat SQL script untuk setup IP Pool
echo "[6/6] Membuat SQL script untuk IP Pool..."
cat > "$RADDB_DIR/setup-ippool.sql" << 'SQLSCRIPT'
-- Buat tabel radippool jika belum ada
CREATE TABLE IF NOT EXISTS radippool (
  id int(11) unsigned NOT NULL auto_increment,
  pool_name varchar(30) NOT NULL,
  framedipaddress varchar(15) NOT NULL default '',
  nasipaddress varchar(15) NOT NULL default '',
  calledstationid VARCHAR(30) NOT NULL,
  callingstationid VARCHAR(30) NOT NULL,
  expiry_time DATETIME NULL default NULL,
  username varchar(64) NOT NULL default '',
  pool_key varchar(30) NOT NULL,
  PRIMARY KEY (id),
  KEY radippool_poolname_expire (pool_name, expiry_time),
  KEY framedipaddress (framedipaddress),
  KEY radippool_nasip_poolkey_ipaddress (nasipaddress, pool_key, framedipaddress)
) ENGINE=InnoDB;

-- Hapus IP pool lama jika ada
DELETE FROM radippool WHERE pool_name = 'main_pool';

-- Insert IP Pool (contoh: 10.10.10.2 - 10.10.10.254)
-- Sesuaikan dengan range IP yang Anda inginkan
INSERT INTO radippool (pool_name, framedipaddress, nasipaddress, calledstationid, callingstationid, expiry_time, username, pool_key)
SELECT 
    'main_pool',
    CONCAT('10.10.10.', n),
    '',
    '',
    '',
    NULL,
    '',
    ''
FROM (
    SELECT 2 + (a.N + b.N * 10 + c.N * 100) AS n
    FROM 
        (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
        (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2) c
) numbers
WHERE n <= 254;

-- Tambahkan Pool-Name ke radgroupreply untuk semua user
-- Ini akan memberikan IP dari pool 'main_pool' ke semua user
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES ('user', 'Pool-Name', ':=', 'main_pool')
ON DUPLICATE KEY UPDATE value = 'main_pool';

-- Pastikan semua user masuk ke group 'user'
INSERT INTO radusergroup (username, groupname, priority)
SELECT DISTINCT username, 'user', 1
FROM radcheck
WHERE NOT EXISTS (
    SELECT 1 FROM radusergroup WHERE radusergroup.username = radcheck.username
);

-- Tambahkan Session-Timeout agar sesuai dengan lease duration (3600 detik = 1 jam)
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES ('user', 'Session-Timeout', ':=', '3600')
ON DUPLICATE KEY UPDATE value = '3600';

SELECT 'IP Pool setup completed!' AS status;
SELECT COUNT(*) AS total_ips FROM radippool WHERE pool_name = 'main_pool';
SQLSCRIPT

echo ""
echo "=== Setup Selesai! ==="
echo ""
echo "Langkah selanjutnya:"
echo "1. Jalankan SQL script untuk setup IP Pool:"
echo "   mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius < $RADDB_DIR/setup-ippool.sql"
echo ""
echo "2. Restart FreeRADIUS di VPS:"
echo "   systemctl restart freeradius"
echo ""
echo "3. Test dengan radtest:"
echo "   radtest username password localhost 0 testing123"
echo ""
echo "4. Cek log FreeRADIUS:"
echo "   tail -f /var/log/freeradius/radius.log"
echo ""
echo "CATATAN PENTING:"
echo "- Range IP Pool: 10.10.10.2 - 10.10.10.254"
echo "- Sesuaikan range IP di file setup-ippool.sql jika perlu"
echo "- Pastikan Mikrotik IP Pool juga menggunakan range yang sama"
echo "- Secret RADIUS: Mynet@2026"
echo "- IP MikroTik (NAS): 103.191.165.25"
echo "- IP FreeRADIUS: 103.191.165.189"
