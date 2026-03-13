#!/bin/bash
# DB audit script
DB="salfanet_radius"
USER="salfanet_user"
PASS="salfanetradius123"
M="mysql -u $USER -p$PASS $DB"

echo "=== TABLE SIZES ==="
$M -e "SELECT TABLE_NAME, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,2) AS mb, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB' ORDER BY (DATA_LENGTH+INDEX_LENGTH) DESC LIMIT 15;" 2>/dev/null

echo "=== INDEXES ON KEY TABLES ==="
$M -e "SHOW INDEX FROM pppoe_users;" 2>/dev/null
$M -e "SHOW INDEX FROM radacct;" 2>/dev/null
$M -e "SHOW INDEX FROM invoices;" 2>/dev/null
$M -e "SHOW INDEX FROM radcheck;" 2>/dev/null
$M -e "SHOW INDEX FROM radpostauth;" 2>/dev/null

echo "=== MYSQL GLOBAL VARS ==="
$M -e "SHOW GLOBAL VARIABLES LIKE 'innodb_buffer_pool_size';" 2>/dev/null
$M -e "SHOW GLOBAL VARIABLES LIKE 'query_cache%';" 2>/dev/null
$M -e "SHOW GLOBAL VARIABLES LIKE 'max_connections';" 2>/dev/null
$M -e "SHOW GLOBAL VARIABLES LIKE 'slow_query%';" 2>/dev/null
$M -e "SHOW GLOBAL STATUS LIKE 'Slow_queries';" 2>/dev/null

echo "=== SLOW QUERIES (top 10) ==="
$M -e "SELECT DIGEST_TEXT, COUNT_STAR, AVG_TIMER_WAIT/1000000000000 AS avg_sec FROM performance_schema.events_statements_summary_by_digest ORDER BY AVG_TIMER_WAIT DESC LIMIT 10;" 2>/dev/null
