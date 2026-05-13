import urllib.request, urllib.parse, json, http.cookiejar, datetime

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
base = 'http://localhost:3000'

r = opener.open(base + '/api/auth/csrf')
csrf = json.loads(r.read().decode())['csrfToken']

data = urllib.parse.urlencode({'username':'superadmin','password':'admin123','csrfToken':csrf,'callbackUrl':base+'/admin','json':'true'}).encode()
r = opener.open(urllib.request.Request(base+'/api/auth/callback/credentials', data, {'Content-Type':'application/x-www-form-urlencoded'}))
print('Login:', json.loads(r.read().decode()))

r = opener.open(base + '/api/auth/session')
session = json.loads(r.read().decode())
print('Session user:', session.get('user',{}).get('role'))
exp = session.get('expires','')
print('Expires:', exp)
if exp:
    exp_dt = datetime.datetime.fromisoformat(exp.replace('Z','+00:00'))
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    days = (exp_dt - now_dt).days
    print('Days until expiry:', days, '(should be ~30)')