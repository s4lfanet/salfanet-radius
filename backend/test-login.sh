#!/bin/bash
rm -f /tmp/cookies.txt
curl -s -c /tmp/cookies.txt http://127.0.0.1:3000/api/auth/csrf > /tmp/csrf.json
TOKEN=$(cat /tmp/csrf.json | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
echo "CSRF: $TOKEN"
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -L -w '\nHTTP %{http_code}\n' \
  -X POST http://127.0.0.1:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "username=superadmin&password=admin123&csrfToken=$TOKEN&callbackUrl=http://127.0.0.1:3000/admin&json=true" 2>&1 | tail -5
echo
echo "=== COOKIES ==="
cat /tmp/cookies.txt | grep -i session
echo "=== SESSION CHECK ==="
curl -s -b /tmp/cookies.txt http://127.0.0.1:3000/api/auth/session 2>&1
