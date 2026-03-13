#!/bin/bash
# Nginx performance tuning for 2-CPU VPS
# Run once: bash /tmp/nginx-tune.sh

NGINX_CONF="/etc/nginx/nginx.conf"
SITE_CONF="/etc/nginx/sites-enabled/salfanet-radius"

# 1. Patch nginx.conf — add keepalive_timeout and upstream upstream block
cp $NGINX_CONF ${NGINX_CONF}.bak

cat > $NGINX_CONF << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
    multi_accept on;
    use epoll;
}

http {
    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 200;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Buffer tuning
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;
    output_buffers 2 32k;
    postpone_output 1460;

    # SSL
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # Gzip (global)
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types
        text/plain text/css text/xml text/javascript
        application/json application/javascript application/xml
        application/font-woff application/font-woff2 font/ttf font/otf
        image/svg+xml;

    # Open file cache
    open_file_cache max=1000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # Upstream with keepalive — prevents creating new TCP conn per request to Next.js
    upstream nextjs {
        server 127.0.0.1:3000;
        keepalive 16;
    }

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

# 2. Update site config to use upstream nextjs + keepalive headers
# Only patch the proxy_pass in location / blocks
sed -i 's|proxy_pass.*http://127.0.0.1:3000;|proxy_pass http://nextjs;|g' $SITE_CONF
# Add Connection header for upstream keepalive if not present
grep -q 'proxy_set_header.*Connection ""' $SITE_CONF || \
  sed -i '/proxy_pass http:\/\/nextjs;/a\        proxy_http_version 1.1;\n        proxy_set_header Connection "";' $SITE_CONF

# Remove duplicate proxy_http_version lines if any
# (leave as-is, nginx handles duplicates fine for now)

echo "Testing nginx config..."
nginx -t && systemctl reload nginx && echo "Nginx reloaded successfully"
