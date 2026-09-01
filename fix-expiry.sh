#!/bin/bash
# Extend user server3 expiry by 1 month from current expiry (2026-09-03 -> 2026-10-03)
# Current expiry is still in the future, so base = current expiry + 1 month
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "UPDATE pppoe_users SET expiredAt = DATE_ADD(expiredAt, INTERVAL 1 MONTH) WHERE username = 'server3'"
echo "User server3 expiry extended by 1 month"
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT username, status, expiredAt FROM pppoe_users WHERE username = 'server3'" 2>/dev/null
