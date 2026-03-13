import re

with open('/etc/nginx/sites-enabled/salfanet-radius') as f:
    txt = f.read()

# Remove the injected duplicate lines added by sed
txt = re.sub(r'proxy_http_version 1\.1;\n        proxy_set_header Connection "";\n        ', '', txt)

with open('/etc/nginx/sites-enabled/salfanet-radius', 'w') as f:
    f.write(txt)

print('Fixed. Lines remaining with proxy_http_version:', txt.count('proxy_http_version'))
print('Lines with Connection:', txt.count('Connection'))
