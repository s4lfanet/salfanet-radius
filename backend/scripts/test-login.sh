#!/bin/bash
# Test login and authenticated API calls
echo "=== 1. Get CSRF token ==="
curl -s -c /tmp/cookies.txt http://localhost:3000/api/auth/csrf
echo ''

CSRF=$(grep csrfToken /tmp/cookies.txt | awk '{print $NF}')
echo "CSRF: $CSRF"

echo "=== 2. Login as superadmin ==="
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -L -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "username=superadmin&password=superadmin&csrfToken=$CSRF&callbackUrl=%2F&json=true" \
  http://localhost:3000/api/auth/callback/credentials | head -5
echo ''

echo "=== 3. Check session ==="
curl -s -b /tmp/cookies.txt http://localhost:3000/api/auth/session
echo ''

echo "=== 4. Test backend API with session ==="
echo "--- Dashboard stats ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/dashboard/stats | head -3
echo ''
echo "--- Invoices counts ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/invoices/counts
echo ''
echo "--- PPPoE online status ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/pppoe/users/online-status | head -3
echo ''
echo "--- External tasks stats ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/admin/external-tasks/stats
echo ''
echo "--- Network routers ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/network/routers | head -3
echo ''
echo "--- WhatsApp providers ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/whatsapp/providers | head -3
echo ''
echo "--- Customers with location ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/customers/with-location | head -3
echo ''
echo "--- GenieACS tasks ---"
curl -s -b /tmp/cookies.txt http://localhost:3001/api/genieacs/tasks | head -3
echo ''
echo "=== DONE ==="
