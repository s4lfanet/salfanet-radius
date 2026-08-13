#!/bin/bash
# Script untuk cek FreeRADIUS log untuk user tertentu

echo "=== Checking FreeRADIUS Log for User: rudi ==="
echo ""

# Cek apakah user ada di radcheck
echo "1. Checking radcheck table..."
mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius -e "SELECT username, attribute, op, value FROM radcheck WHERE username = 'rudi';"
echo ""

# Cek group user
echo "2. Checking user group..."
mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius -e "SELECT username, groupname FROM radusergroup WHERE username = 'rudi';"
echo ""

# Cek IP Pool availability untuk group user
echo "3. Checking IP Pool availability..."
GROUPNAME=$(mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius -sN -e "SELECT groupname FROM radusergroup WHERE username = 'rudi' LIMIT 1;")
POOLNAME=$(mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius -sN -e "SELECT value FROM radgroupreply WHERE groupname = '$GROUPNAME' AND attribute = 'Pool-Name' LIMIT 1;")
echo "User Group: $GROUPNAME"
echo "Pool Name: $POOLNAME"
mysql -h 172.30.0.1 -u radius -pDeveloperGame21 radius -e "SELECT pool_name, COUNT(*) as total, SUM(CASE WHEN username = '' THEN 1 ELSE 0 END) as available FROM radippool WHERE pool_name = '$POOLNAME' GROUP BY pool_name;"
echo ""

# Cek last 20 lines of radius log
echo "4. Last authentication attempts (last 20 lines)..."
tail -20 /var/log/freeradius/radius.log | grep -i "rudi\|Auth:\|Login"
echo ""

echo "=== Done ==="
echo ""
echo "Instruksi:"
echo "1. Jika ada 'Auth-Type := Reject' di radcheck, user masih diisolir"
echo "2. Jika IP Pool available = 0, pool habis"
echo "3. Lihat log untuk error message saat user coba konek"
