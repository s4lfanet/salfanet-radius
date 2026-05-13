import urllib.request, urllib.parse, json, http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
base = 'http://localhost:3000'

# Login
r = opener.open(base + '/api/auth/csrf')
csrf = json.loads(r.read().decode())['csrfToken']
data = urllib.parse.urlencode({'username':'superadmin','password':'admin123','csrfToken':csrf,'callbackUrl':base+'/admin','json':'true'}).encode()
opener.open(urllib.request.Request(base+'/api/auth/callback/credentials', data, {'Content-Type':'application/x-www-form-urlencoded'}))

def get(path):
    try:
        r = opener.open(base + path)
        return json.loads(r.read().decode())
    except Exception as e:
        return {'_error': str(e)[:100]}

# Company
company = get('/api/settings/company')
c = company.get('company', {})
print('=== COMPANY ===')
print('  Name    :', c.get('name'))
print('  Address :', c.get('address'))
print('  Phone   :', c.get('phone'))
print('  Email   :', c.get('email'))

# WA Providers
print()
print('=== WHATSAPP PROVIDERS ===')
wa = get('/api/whatsapp/providers')
providers = wa if isinstance(wa, list) else wa.get('providers', wa.get('data', []))
if not providers:
    print('  No WA providers configured!')
else:
    for p in providers:
        print(f'  [{p.get("isActive","?")}] {p.get("name","?")} - {p.get("type","?")}')

# WA Templates
print()
print('=== WHATSAPP TEMPLATES ===')
wt = get('/api/whatsapp/templates')
templates = wt if isinstance(wt, list) else wt.get('templates', wt.get('data', []))
print(f'  Templates count: {len(templates) if isinstance(templates, list) else "?"}')

# Telegram settings
print()
print('=== TELEGRAM SETTINGS ===')
tg = get('/api/telegram/settings')
print('  Data:', json.dumps(tg)[:200])

# Dashboard stats
print()
print('=== DASHBOARD STATS ===')
ds = get('/api/dashboard/stats')
if '_error' not in ds:
    for k, v in (ds.get('stats', ds) if isinstance(ds, dict) else {}).items():
        print(f'  {k}: {v}')
else:
    print('  Error:', ds)

# PPPoE customers count
print()
print('=== PPPOE DATA ===')
pppoe = get('/api/pppoe/customers?limit=1')
total = pppoe.get('total', pppoe.get('count', '?'))
print('  Customers:', total)

profiles = get('/api/pppoe/profiles')
prof_list = profiles if isinstance(profiles, list) else profiles.get('profiles', profiles.get('data', []))
print('  Profiles:', len(prof_list) if isinstance(prof_list, list) else '?')

# Network
print()
print('=== NETWORK ===')
routers = get('/api/network/routers')
r_list = routers if isinstance(routers, list) else routers.get('routers', routers.get('data', []))
print('  Routers:', len(r_list) if isinstance(r_list, list) else '?')

olts = get('/api/network/olts')
o_list = olts if isinstance(olts, list) else olts.get('olts', olts.get('data', []))
print('  OLTs:', len(o_list) if isinstance(o_list, list) else '?')
