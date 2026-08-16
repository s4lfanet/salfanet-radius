#!/bin/bash
# Get session cookie first
rm -f /tmp/cookies2.txt
curl -s -c /tmp/cookies2.txt http://127.0.0.1:3000/api/auth/csrf > /tmp/csrf2.json
TOKEN=$(cat /tmp/csrf2.json | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
echo "CSRF: $TOKEN"

# Login
curl -s -b /tmp/cookies2.txt -c /tmp/cookies2.txt -L \
  -X POST http://127.0.0.1:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "username=superadmin&password=admin123&csrfToken=$TOKEN&callbackUrl=http://127.0.0.1:3000/admin&json=true" > /dev/null 2>&1

echo "=== SESSION ==="
curl -s -b /tmp/cookies2.txt http://127.0.0.1:3000/api/auth/session 2>&1
echo

echo "=== SYSTEM INFO (via nginx 8080) ==="
curl -s -b /tmp/cookies2.txt http://127.0.0.1:8080/api/admin/system/info 2>&1
echo

echo "=== CHANGELOG (via nginx 8080) ==="
curl -s -b /tmp/cookies2.txt http://127.0.0.1:8080/api/admin/system/changelog 2>&1
echo
