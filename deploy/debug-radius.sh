#!/bin/bash
echo "=== 1. radusergroup for muhammadluthfi@rw02 ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, username, groupname, priority, nas_identifier
FROM radusergroup WHERE username = 'muhammadluthfi@rw02'\G
" 2>/dev/null

echo ""
echo "=== 2. radcheck for muhammadluthfi@rw02 ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, username, attribute, op, value, nas_identifier
FROM radcheck WHERE username = 'muhammadluthfi@rw02'\G
" 2>/dev/null

echo ""
echo "=== 3. radreply for muhammadluthfi@rw02 ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, username, attribute, op, value, nas_identifier
FROM radreply WHERE username = 'muhammadluthfi@rw02'\G
" 2>/dev/null

echo ""
echo "=== 4. pppoe_user full data ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, username, password, status, profileId, routerId, ipAddress, expiredAt, subscriptionType
FROM pppoe_users WHERE username = 'muhammadluthfi@rw02'\G
" 2>/dev/null

echo ""
echo "=== 5. Profile groupName ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT p.id, p.name, p.groupName, p.price FROM pppoe_profiles p
INNER JOIN pppoe_users u ON u.profileId = p.id
WHERE u.username = 'muhammadluthfi@rw02'\G
" 2>/dev/null

echo ""
echo "=== 6. Router info ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, nasname, ipAddress, port, username, authMode FROM nas WHERE id = (
  SELECT routerId FROM pppoe_users WHERE username = 'muhammadluthfi@rw02'
)\G
" 2>/dev/null

echo ""
echo "=== 7. MikroTik active PPP sessions ==="
# Get router credentials
ROUTER_IP=$(mysql -u salfanet_user -psalfanetradius123 salfanet_radius -se "SELECT ipAddress FROM nas WHERE id = (SELECT routerId FROM pppoe_users WHERE username = 'muhammadluthfi@rw02')" 2>/dev/null)
ROUTER_USER=$(mysql -u salfanet_user -psalfanetradius123 salfanet_radius -se "SELECT username FROM nas WHERE id = (SELECT routerId FROM pppoe_users WHERE username = 'muhammadluthfi@rw02')" 2>/dev/null)
ROUTER_PASS=$(mysql -u salfanet_user -psalfanetradius123 salfanet_radius -se "SELECT password FROM nas WHERE id = (SELECT routerId FROM pppoe_users WHERE username = 'muhammadluthfi@rw02')" 2>/dev/null)
echo "Router: $ROUTER_IP user: $ROUTER_USER"

echo ""
echo "=== 8. radpostauth (recent auth attempts) ==="
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "
SELECT id, username, pass, reply, authdate
FROM radpostauth
WHERE username = 'muhammadluthfi@rw02'
ORDER BY authdate DESC LIMIT 10\G
" 2>/dev/null

echo ""
echo "=== 9. FreeRADIUS last 20 log lines ==="
tail -20 /var/log/freeradius/radacct/localhost/auth-detail-$(date +%Y%m%d).log 2>/dev/null || journalctl -u freeradius --no-pager -n 20 2>/dev/null || echo "No FreeRADIUS logs found"
