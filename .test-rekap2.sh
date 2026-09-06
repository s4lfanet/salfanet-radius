#!/bin/bash
# Test rekap voucher API with different period filters
BASE="http://localhost:3000"
API="http://localhost:3001"

# Get CSRF token
CSRF=$(curl -s -c /tmp/cookies2.txt "$BASE/api/auth/csrf" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
echo "CSRF: $CSRF"

# Login with correct credentials
curl -s -b /tmp/cookies2.txt -c /tmp/cookies2.txt -L -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@example.com&password=admin123&csrfToken=$CSRF&callbackUrl=$BASE/admin&json=true" > /dev/null 2>&1

# Check if we have a session
SESSION=$(grep -o 'next-auth.session-token	[^ ]*' /tmp/cookies2.txt | tail -1 | awk '{print $NF}')
echo "Session token found: $([ -n "$SESSION" ] && echo yes || echo no)"

# Test all data
echo ""
echo "=== ALL DATA ==="
RESULT=$(curl -s -b /tmp/cookies2.txt "$API/api/hotspot/rekap-voucher")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[]))); print('error:', d.get('error','none'))" 2>/dev/null || echo "$RESULT" | head -c 300

# Test monthly
echo ""
echo "=== MONTHLY (2026-08) ==="
RESULT=$(curl -s -b /tmp/cookies2.txt "$API/api/hotspot/rekap-voucher?month=2026-08")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[]))); print('error:', d.get('error','none'))" 2>/dev/null || echo "$RESULT" | head -c 300

# Test daily
echo ""
echo "=== DAILY (2026-08-31) ==="
RESULT=$(curl -s -b /tmp/cookies2.txt "$API/api/hotspot/rekap-voucher?date=2026-08-31")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[]))); print('error:', d.get('error','none'))" 2>/dev/null || echo "$RESULT" | head -c 300

# Test weekly
echo ""
echo "=== WEEKLY (2026-08-25) ==="
RESULT=$(curl -s -b /tmp/cookies2.txt "$API/api/hotspot/rekap-voucher?week=2026-08-25")
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('rekap count:', len(d.get('rekap',[]))); print('error:', d.get('error','none'))" 2>/dev/null || echo "$RESULT" | head -c 300

echo ""
echo "=== Backend logs ==="
pm2 logs salfanet-backend --lines 30 --nostream 2>&1 | grep REKAP

rm -f /tmp/cookies2.txt
