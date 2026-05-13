import urllib.request, json
req = urllib.request.Request("http://localhost/api/customer/auth/send-otp", json.dumps({"phone": "08123456789"}).encode(), {"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req)
    print(json.loads(r.read()))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, json.loads(e.read()))
except Exception as ex:
    print("ERR", ex)
