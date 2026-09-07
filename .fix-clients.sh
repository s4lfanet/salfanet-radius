#!/bin/bash
echo "=== Remove \$INCLUDE clients.d/ from clients.conf ==="
# Comment out the $INCLUDE clients.d/ line
sed -i 's|^\$INCLUDE clients.d/|#\$INCLUDE clients.d/|' /etc/freeradius/3.0/clients.conf
grep 'INCLUDE clients.d' /etc/freeradius/3.0/clients.conf

echo ""
echo "=== Remove nas-from-db.conf ==="
rm -f /etc/freeradius/3.0/clients.d/nas-from-db.conf
ls /etc/freeradius/3.0/clients.d/

echo ""
echo "=== Test config ==="
freeradius -Cx 2>&1 | tail -5

echo ""
echo "=== Restart FreeRADIUS ==="
systemctl restart freeradius
sleep 2
systemctl status freeradius 2>&1 | head -5

echo ""
echo "=== Check log for duplicate client error ==="
tail -15 /var/log/freeradius/radius.log

echo ""
echo "=== Test auth ==="
radtest server3 salfanet 127.0.0.1 1812 testing123 2>&1 | grep -E 'Accept|Reject|Rate-Limit|Mikrotik'
