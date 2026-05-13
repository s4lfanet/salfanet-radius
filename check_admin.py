import urllib.request, urllib.parse, json, http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
base = 'http://localhost:3000'

r = opener.open(base + '/api/auth/csrf')
csrf = json.loads(r.read().decode())['csrfToken']
data = urllib.parse.urlencode({'username':'superadmin','password':'admin123','csrfToken':csrf,'callbackUrl':base+'/admin','json':'true'}).encode()
opener.open(urllib.request.Request(base+'/api/auth/callback/credentials', data, {'Content-Type':'application/x-www-form-urlencoded'}))

def get(path):
    try:
        r = opener.open(base + path)
        d = json.loads(r.read().decode())
        return 200, d
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except:
            return e.code, {}
    except Exception as e:
        return 0, {'_error': str(e)[:80]}

print('=== ADMIN USERS ===')
code, d = get('/api/admin/users')
print(f'  [{code}]', json.dumps(d)[:300])

print()
print('=== REGISTRATIONS (GET) ===')
code, d = get('/api/registrations')
print(f'  [{code}]', json.dumps(d)[:300])

print()
print('=== PPPOE AREAS ===')
code, d = get('/api/pppoe/areas')
print(f'  [{code}] count={d.get("count","?")}')

print()
print('=== SESSIONS ===')
code, d = get('/api/sessions')
print(f'  [{code}]', json.dumps(d)[:200])

print()
print('=== PM2 STATUS (check startup) ===')
import subprocess
r = subprocess.run(['pm2', 'list', '--no-color'], capture_output=True, text=True)
for line in r.stdout.split('\n'):
    if 'salfanet' in line or 'wa-service' in line:
        print(' ', line.strip())

print()
print('=== STARTUP SCRIPT ===')
import os
r2 = subprocess.run(['pm2', 'startup', '--no-daemon'], capture_output=True, text=True)
print(r2.stdout[:200] if r2.stdout else r2.stderr[:200])
