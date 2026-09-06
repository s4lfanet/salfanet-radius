#!/bin/bash
# Test rekap voucher API with different period filters
# Get a valid session by logging in first

BASE="http://localhost:3000"
API="http://localhost:3001"

# Get CSRF token
CSRF=$(curl -s -c /tmp/cookies.txt "$BASE/api/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
echo "CSRF: $CSRF"

# Login
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123&csrfToken=$CSRF&callbackUrl=$BASE/admin&json=true" > /dev/null

# Get session token
SESSION=$(grep -o 'next-auth.session-token[^	]*[^ ]*' /tmp/cookies.txt | tail -1 | awk '{print $NF}')
echo "Session: ${SESSION:0:20}..."

# Test all data
echo ""
echo "=== ALL DATA ==="
RESULT=$(curl -s -b /tmp/cookies.txt "$API/api/hotspot/rekap-voucher")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[])))" 2>/dev/null || echo "$RESULT" | head -c 200

# Test monthly
echo ""
echo "=== MONTHLY (2026-08) ==="
RESULT=$(curl -s -b /tmp/cookies.txt "$API/api/hotspot/rekap-voucher?month=2026-08")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[])))" 2>/dev/null || echo "$RESULT" | head -c 200

# Test daily
echo ""
echo "=== DAILY (2026-08-31) ==="
RESULT=$(curl -s -b /tmp/cookies.txt "$API/api/hotspot/rekap-voucher?date=2026-08-31")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[])))" 2>/dev/null || echo "$RESULT" | head -c 200

# Test weekly
echo ""
echo "=== WEEKLY (2026-08-25) ==="
RESULT=$(curl -s -b /tmp/cookies.txt "$API/api/hotspot/rekap-voucher?week=2026-08-25")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[])))" 2>/dev/null || echo "$RESULT" | head -c 200

echo ""
echo "=== Backend logs ==="
pm2 logs salfanet-backend --lines 20 --nostream 2>&1 | grep REKAP

rm -f /tmp/cookies.txt
