CSRF=$(curl -s http://localhost/api/auth/csrf | python3 -c "import json,sys; print(json.load(sys.stdin)[chr(99)+chr(115)+chr(114)+chr(102)+chr(84)+chr(111)+chr(107)+chr(101)+chr(110)])")
echo "CSRF=$CSRF"
curl -s -c /tmp/admin_cookies.txt -X POST http://localhost/api/auth/callback/credentials -H "Content-Type: application/x-www-form-urlencoded" -d "username=superadmin&password=admin123&csrfToken=$CSRF&callbackUrl=http://localhost/admin&json=true" | head -c 200
echo ""
echo "SESSION:"
curl -s -b /tmp/admin_cookies.txt http://localhost/api/auth/session | head -c 500
