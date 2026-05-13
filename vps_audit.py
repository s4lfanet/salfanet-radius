import urllib.request, urllib.parse, json, http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
base = 'http://localhost'

# Get CSRF
r = opener.open(base + '/api/auth/csrf')
csrf = json.loads(r.read().decode())['csrfToken']
print('CSRF: ' + csrf[:20] + '...')

# Login
data = urllib.parse.urlencode({'username':'superadmin','password':'admin123','csrfToken':csrf,'callbackUrl':base+'/admin','json':'true'}).encode()
r = opener.open(urllib.request.Request(base+'/api/auth/callback/credentials', data, {'Content-Type':'application/x-www-form-urlencoded'}))
result = json.loads(r.read().decode())
print('Login: ' + str(result))

# Session check
r = opener.open(base + '/api/auth/session')
session = json.loads(r.read().decode())
_u = session.get('user') or {}
print('Session role: ' + str(_u.get('role')))
print()

# Admin API routes
admin_routes = [
    '/api/auth/session',
    '/api/public/company',
    '/api/company',
    '/api/settings/company',
    '/api/dashboard/stats',
    '/api/pppoe/profiles',
    '/api/pppoe/customers',
    '/api/pppoe/users',
    '/api/pppoe/areas',
    '/api/olt',
    '/api/billing/invoices',
    '/api/billing/manual-payments',
    '/api/hotspot/profiles',
    '/api/hotspot/vouchers',
    '/api/network/routers',
    '/api/network/olts',
    '/api/tickets',
    '/api/whatsapp/templates',
    '/api/whatsapp/providers',
    '/api/permissions',
    '/api/genieacs/devices',
    '/api/backup',
    '/api/cron/history',
    '/api/radius/users',
    '/api/admin/stats',
    '/api/admin/users',
    '/api/sessions',
    '/api/keuangan/transactions',
    '/api/keuangan/categories',
    '/api/telegram/settings',
    '/api/email/history',
    '/api/registrations',
    '/api/invoices',
    '/api/users/list',
    '/api/technician/auth/request-otp',
    '/api/agent/login',
    '/api/customer/auth/send-otp',
]

print('=== ADMIN (SUPER_ADMIN) ROUTES ===')
for route in admin_routes:
    try:
        req = urllib.request.Request(base + route)
        for cookie in jar:
            req.add_header('Cookie', cookie.name + '=' + cookie.value)
        r = urllib.request.urlopen(req)
        code = r.getcode()
        label = 'OK'
    except urllib.error.HTTPError as e:
        code = e.code
        label = 'FAIL-AUTH' if code in (401,403) else ('FAIL-DOWN' if code in (502,504) else 'ERR')
    except Exception as ex:
        code = 0
        label = 'ERR(' + str(ex)[:30] + ')'
    status = '[' + str(code) + '] ' + label
    print('  ' + status.ljust(20) + ' ' + route)

print()
print('=== PUBLIC/NO-AUTH ROUTES ===')
pub_routes = [
    '/admin/login',
    '/customer/login',
    '/technician/login',
    '/evoucher',
    '/daftar',
    '/pay/test',
    '/api/public/company',
    '/api/public/areas',
    '/api/public/profiles',
    '/api/public/stats',
    '/api/evoucher/profiles',
    '/api/auth/csrf',
    '/api/health',
]
fresh_opener = urllib.request.build_opener()
for route in pub_routes:
    try:
        r = fresh_opener.open(base + route)
        code = r.getcode()
        label = 'OK'
    except urllib.error.HTTPError as e:
        code = e.code
        label = 'NOTFOUND' if code == 404 else ('REDIRECT' if code in (301,302,307,308) else 'ERR')
    except Exception as ex:
        code = 0
        label = 'ERR(' + str(ex)[:30] + ')'
    print('  [' + str(code) + '] ' + label.ljust(12) + ' ' + route)

print()
print('=== AGENT PORTAL ===')
# Test agent login endpoint (POST)
try:
    data = json.dumps({'username':'test','password':'test'}).encode()
    r = fresh_opener.open(urllib.request.Request(base+'/api/agent/login', data, {'Content-Type':'application/json'}))
    code = r.getcode()
except urllib.error.HTTPError as e:
    code = e.code
print('  [' + str(code) + ']  POST /api/agent/login (401=exists,404=missing)')

print()
print('=== CUSTOMER PORTAL OTP ===')
try:
    data = json.dumps({'phone':'08123456789'}).encode()
    r = fresh_opener.open(urllib.request.Request(base+'/api/customer/auth/send-otp', data, {'Content-Type':'application/json'}))
    code = r.getcode()
except urllib.error.HTTPError as e:
    code = e.code
print('  [' + str(code) + ']  POST /api/customer/auth/send-otp (400/422=exists,404=missing)')

print()
print('=== TECHNICIAN OTP ===')
try:
    data = json.dumps({'phone':'08123456789'}).encode()
    r = fresh_opener.open(urllib.request.Request(base+'/api/technician/auth/request-otp', data, {'Content-Type':'application/json'}))
    code = r.getcode()
except urllib.error.HTTPError as e:
    code = e.code
print('  [' + str(code) + ']  POST /api/technician/auth/request-otp (400/422=exists,404=missing)')

print()
print('=== WEBSOCKET (GO) ===')
try:
    r = fresh_opener.open(base.replace('http','http') + '/ws/olt/test')
    code = r.getcode()
except urllib.error.HTTPError as e:
    code = e.code
print('  [' + str(code) + ']  /ws/olt/test (426/500=Go responding correctly)')

print()
print('=== GO BACKEND DIRECT ===')
try:
    r = fresh_opener.open('http://localhost:8080/api/system/health')
    d = json.loads(r.read().decode())
    print('  Go health: ' + str(d))
except Exception as e:
    print('  Go health ERROR: ' + str(e))

print()
print('=== SESSION EXPIRY CHECK ===')
import datetime
exp = session.get('expires','')
print('  Session expires: ' + str(exp))
print('  VPS time (UTC):  ' + datetime.datetime.utcnow().isoformat())