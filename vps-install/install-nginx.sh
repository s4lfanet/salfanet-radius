#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Nginx Module
# ============================================================================
# Step 6: Install & configure Nginx reverse proxy
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# NGINX CONFIGURATION
# ============================================================================

generate_selfsigned_cert() {
    local CERT="/etc/ssl/certs/nginx-selfsigned.crt"
    local KEY="/etc/ssl/private/nginx-selfsigned.key"

    if [ -f "$CERT" ] && [ -f "$KEY" ]; then
        print_info "Self-signed cert already exists — skipping generation"
        return 0
    fi

    print_info "Generating self-signed SSL certificate..."
    mkdir -p /etc/ssl/private

    local CN="${VPS_DOMAIN:-${VPS_IP:-localhost}}"
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$CERT" \
        -subj "/CN=${CN}/O=SalfaNet/C=ID" 2>/dev/null

    chmod 600 "$KEY"
    print_success "Self-signed cert created: $CERT"
}

# Helper: common proxy location blocks (used for HTTP and IP-only HTTPS blocks)
# Matches production-grade config: separate /api/ no-cache + manifest static serving
_proxy_locations() {
    cat <<'LOCATIONS'
    client_max_body_size 100M;

    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    access_log /var/log/nginx/salfanet-radius-access.log;
    error_log  /var/log/nginx/salfanet-radius-error.log;

    location /downloads/ {
        alias /var/www/salfanet-radius/public/downloads/;
        autoindex off;
        add_header Content-Disposition 'attachment';
    }

    # PWA manifest files — serve directly from public/ (no Node.js needed)
    location ~ ^/manifest(-[a-z]+)?\.json$ {
        root /var/www/salfanet-radius/public;
        expires 1d;
        add_header Cache-Control "public, max-age=86400";
        add_header Content-Type "application/manifest+json";
    }

    # Service worker — no cache
    location = /sw.js {
        root /var/www/salfanet-radius/public;
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Service-Worker-Allowed "/";
    }

    # PWA icons and assets
    location /pwa/ {
        root /var/www/salfanet-radius/public;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }

    location /_next/static/ {
        alias /var/www/salfanet-radius/.next/static/;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # API routes — no cache, return JSON not HTML on error
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   CF-Connecting-IP $http_cf_connecting_ip;

        add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' always;
        add_header Pragma 'no-cache' always;

        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-XSS-Protection;
        proxy_hide_header X-Content-Type-Options;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   CF-Connecting-IP $http_cf_connecting_ip;
        proxy_cache_bypass $http_upgrade;

        add_header Cache-Control 'no-cache, must-revalidate' always;

        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-XSS-Protection;
        proxy_hide_header X-Content-Type-Options;
    }
LOCATIONS
}

# Helper: full HTTPS domain location blocks — production-grade config
# Includes CSP, Referrer-Policy, separate /api/ no-cache, CDN bypass headers
_proxy_locations_https_domain() {
    cat <<'LOCATIONS'
    client_max_body_size 100M;

    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CSP - allow Cloudflare Insights beacon
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com; script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.fonnte.com https://api.wablas.com https://api.kirimi.id https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;

    access_log /var/log/nginx/salfanet-radius-access.log;
    error_log  /var/log/nginx/salfanet-radius-error.log;

    location /downloads/ {
        alias /var/www/salfanet-radius/public/downloads/;
        autoindex off;
        add_header Content-Disposition 'attachment';
    }

    # Static assets - long cache (hashed filenames change on rebuild)
    location /_next/static/ {
        alias /var/www/salfanet-radius/.next/static/;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    # PWA manifest files — serve directly from public/ (no Node.js needed)
    location ~ ^/manifest(-[a-z]+)?\.json$ {
        root /var/www/salfanet-radius/public;
        expires 1d;
        add_header Cache-Control "public, max-age=86400";
        add_header Content-Type "application/manifest+json";
    }

    # Service worker — no cache
    location = /sw.js {
        root /var/www/salfanet-radius/public;
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Service-Worker-Allowed "/";
    }

    # PWA icons and assets
    location /pwa/ {
        root /var/www/salfanet-radius/public;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }

    # API routes - NO cache, bypass Cloudflare CDN
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   CF-Connecting-IP $http_cf_connecting_ip;

        # Prevent Cloudflare and browser from caching API responses
        add_header Cache-Control 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0' always;
        add_header CDN-Cache-Control 'no-store' always;
        add_header Cloudflare-CDN-Cache-Control 'no-store' always;
        add_header Pragma 'no-cache' always;

        proxy_hide_header Content-Security-Policy;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-XSS-Protection;
        proxy_hide_header X-Content-Type-Options;
    }

    # All other routes (pages) - no CDN cache
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   CF-Connecting-IP $http_cf_connecting_ip;
        proxy_cache_bypass $http_upgrade;

        # Prevent Cloudflare from caching HTML pages
        add_header Cache-Control 'no-cache, must-revalidate' always;
        add_header CDN-Cache-Control 'no-store' always;
        add_header Cloudflare-CDN-Cache-Control 'no-store' always;

        proxy_hide_header Content-Security-Policy;
        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-XSS-Protection;
        proxy_hide_header X-Content-Type-Options;
    }
LOCATIONS
}

tune_nginx_global() {
    print_info "Tuning Nginx global config (nginx.conf)..."

    # Detect CPU count for worker_processes
    local CPU_COUNT
    CPU_COUNT=$(nproc 2>/dev/null || echo 2)

    # Backup original nginx.conf once
    [ ! -f /etc/nginx/nginx.conf.bak ] && cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak

    cat > /etc/nginx/nginx.conf <<EOF
user www-data;
worker_processes ${CPU_COUNT};
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    # upstream keepalive to Node.js — reuse TCP connections
    upstream nextjs {
        server 127.0.0.1:3000;
        keepalive 16;
    }

    sendfile            on;
    tcp_nopush          on;
    tcp_nodelay         on;
    types_hash_max_size 2048;
    server_tokens       off;

    keepalive_timeout   65;
    keepalive_requests  200;

    client_body_buffer_size     16k;
    client_header_buffer_size   1k;
    client_max_body_size        100M;
    large_client_header_buffers 4 8k;
    proxy_buffer_size           8k;
    proxy_buffers               16 8k;
    proxy_busy_buffers_size     32k;

    open_file_cache          max=2000 inactive=20s;
    open_file_cache_valid    30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors   on;

    include      /etc/nginx/mime.types;
    default_type application/octet-stream;

    access_log /var/log/nginx/access.log;
    error_log  /var/log/nginx/error.log;

    gzip              on;
    gzip_vary         on;
    gzip_proxied      any;
    gzip_comp_level   6;
    gzip_buffers      16 8k;
    gzip_http_version 1.1;
    gzip_min_length   1024;
    gzip_types        text/plain text/css text/xml text/javascript
                      application/json application/javascript
                      application/xml+rss image/svg+xml;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

    print_success "Nginx global tuning applied: ${CPU_COUNT} workers, upstream keepalive 16, epoll"
}

create_nginx_config() {
    print_info "Creating Nginx site configuration..."

    # Get VPS IP if not set
    if [ -z "${VPS_IP:-}" ]; then
        export VPS_IP=$(detect_ip_address)
    fi

    # Always generate a self-signed cert as HTTPS fallback
    generate_selfsigned_cert

    local CERT="/etc/ssl/certs/nginx-selfsigned.crt"
    local KEY="/etc/ssl/private/nginx-selfsigned.key"

    # ---------------------------------------------------------------------------
    # 4-block config:
    #   1. HTTP domain → redirect to HTTPS          (if domain set)
    #   2. HTTP default_server (IP fallback)
    #   3. HTTPS domain block (self-signed, to be upgraded by certbot later)  (if domain set)
    #   4. HTTPS default_server (IP fallback)
    # ---------------------------------------------------------------------------

    if [ -n "${VPS_DOMAIN:-}" ]; then
        print_info "Domain: ${VPS_DOMAIN} — generating 4-block HTTPS config..."

        cat > /etc/nginx/sites-available/salfanet-radius <<EOF
# Block 1: HTTP domain → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${VPS_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Block 2: HTTP default_server (direct IP access)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ ${VPS_IP};

$(_proxy_locations)
}

# Block 3: HTTPS domain
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${VPS_DOMAIN};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

$(_proxy_locations_https_domain)
}

# Block 4: HTTPS default_server (direct IP access)
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _ ${VPS_IP};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

$(_proxy_locations)
}
EOF

    else
        # No domain: 2-block config (HTTP + HTTPS) with IP only
        print_info "No domain set — generating IP-only HTTP+HTTPS config..."

        cat > /etc/nginx/sites-available/salfanet-radius <<EOF
# Block 1: HTTP (IP direct access)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ ${VPS_IP};

$(_proxy_locations)
}

# Block 2: HTTPS (IP direct access, self-signed cert)
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _ ${VPS_IP};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

$(_proxy_locations)
}
EOF
    fi

    print_success "Nginx configuration created"
}

# ---------------------------------------------------------------------------
# (Optional) Upgrade domain HTTPS block to Let's Encrypt certificate.
# The 4-block base config is already in place with a self-signed cert.
# This function only patches the ssl_certificate lines for Block 3 if
# certbot succeeds — the IP fallback blocks keep the self-signed cert.
# NOTE: Skip certbot if the domain is behind Cloudflare (DNS proxy).
# ---------------------------------------------------------------------------
setup_ssl_domain() {
    if [ -z "${VPS_DOMAIN:-}" ]; then
        return 0
    fi

    print_info "Checking Let's Encrypt availability for ${VPS_DOMAIN}..."

    # Install certbot if not present
    if ! command -v certbot &>/dev/null; then
        apt-get install -y certbot python3-certbot-nginx 2>/dev/null | tail -3
    fi

    local SSL_EMAIL="${VPS_SSL_EMAIL:-admin@${VPS_DOMAIN}}"
    local LE_CERT="/etc/letsencrypt/live/${VPS_DOMAIN}/fullchain.pem"
    local LE_KEY="/etc/letsencrypt/live/${VPS_DOMAIN}/privkey.pem"

    # If cert already exists, just make sure nginx uses it
    if certbot certificates 2>/dev/null | grep -q "${VPS_DOMAIN}"; then
        print_info "Let's Encrypt cert for ${VPS_DOMAIN} already exists — upgrading nginx block..."
    else
        # Verify DNS points to this server (not Cloudflare proxy IP)
        local DOMAIN_IP
        DOMAIN_IP=$(dig +short "${VPS_DOMAIN}" 2>/dev/null | tail -1)
        local MY_IP="${VPS_IP:-$(detect_ip_address)}"

        if [ -z "$DOMAIN_IP" ] || [ "$DOMAIN_IP" != "$MY_IP" ]; then
            print_warning "DNS ${VPS_DOMAIN} resolves to '${DOMAIN_IP:-unresolvable}', not ${MY_IP}"
            print_warning "Kemungkinan domain di-proxy oleh Cloudflare atau DNS belum propagasi."
            print_info "  → Self-signed cert sudah aktif (cukup untuk Cloudflare mode Full/Flexible)"
            print_info "  → Untuk Let's Encrypt nanti (jika DNS langsung/bypass CF):"
            print_info "      certbot --nginx -d ${VPS_DOMAIN} -m ${SSL_EMAIL} --agree-tos"
            return 0
        fi

        print_info "Requesting Let's Encrypt cert for ${VPS_DOMAIN} (email: ${SSL_EMAIL})..."
        certbot certonly --nginx \
            -d "${VPS_DOMAIN}" \
            --non-interactive \
            --agree-tos \
            -m "${SSL_EMAIL}" \
            2>&1 | tee /tmp/certbot.log

        if [ ${PIPESTATUS[0]} -ne 0 ]; then
            print_warning "Certbot gagal. Log: /tmp/certbot.log"
            print_info "  → Self-signed cert tetap aktif untuk koneksi HTTPS."
            return 0
        fi

        print_success "Let's Encrypt cert berhasil untuk ${VPS_DOMAIN}"
    fi

    # Patch only the ssl lines in Block 3 (HTTPS domain, no default_server)
    # We use sed to replace the self-signed cert paths with LE paths in the
    # server block that has `server_name ${VPS_DOMAIN}` and `listen 443 ssl;`
    # but NOT the default_server block.
    if [ -f "$LE_CERT" ]; then
        # Rewrite full config with LE cert for domain block, self-signed for IP block
        local CERT="/etc/ssl/certs/nginx-selfsigned.crt"
        local KEY_SS="/etc/ssl/private/nginx-selfsigned.key"

        cat > /etc/nginx/sites-available/salfanet-radius <<EOF
# Block 1: HTTP domain → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${VPS_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Block 2: HTTP default_server (direct IP access)
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ ${VPS_IP};

$(_proxy_locations)
}

# Block 3: HTTPS domain (Let's Encrypt cert)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${VPS_DOMAIN};

    ssl_certificate     ${LE_CERT};
    ssl_certificate_key ${LE_KEY};
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

$(_proxy_locations_https_domain)
}

# Block 4: HTTPS default_server (direct IP, self-signed cert)
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _ ${VPS_IP};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY_SS};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

$(_proxy_locations)
}
EOF
        nginx -t && systemctl restart nginx
        print_success "Nginx diupgrade ke Let's Encrypt cert untuk ${VPS_DOMAIN}"
    fi
}

enable_nginx_site() {
    print_info "Enabling Nginx site..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Enable our site
    ln -sf /etc/nginx/sites-available/salfanet-radius /etc/nginx/sites-enabled/
    
    print_success "Nginx site enabled"
}

test_nginx_config() {
    print_info "Testing Nginx configuration..."
    
    if nginx -t 2>&1 | grep -q "successful"; then
        print_success "Nginx configuration is valid"
        return 0
    else
        print_error "Nginx configuration test failed!"
        nginx -t
        return 1
    fi
}

restart_nginx() {
    print_info "Restarting Nginx..."
    
    systemctl restart nginx
    systemctl enable nginx
    
    wait_for_service "nginx" 10
}

configure_firewall_nginx() {
    if [ "${SKIP_UFW:-false}" = "true" ]; then
        print_info "UFW firewall dilewati (${DEPLOY_ENV_LABEL:-LXC/Container})"
        print_info "Buka port 80 dan 443 di Proxmox Datacenter Firewall"
        return 0
    fi

    print_info "Configuring firewall for Nginx..."
    ufw allow 80/tcp comment 'HTTP' 2>/dev/null || true
    ufw allow 443/tcp comment 'HTTPS' 2>/dev/null || true
    print_success "Firewall configured"
}

verify_external_web_access() {
    print_info "Running web access diagnostics..."

    local PUBLIC_IP="${VPS_IP:-$(detect_ip_address)}"

    # 1) Internal app check (Next.js)
    if curl -fsS -I --max-time 5 http://127.0.0.1:3000 >/dev/null 2>&1; then
        print_success "Internal app check OK: http://127.0.0.1:3000"
    else
        print_warning "Internal app check failed: http://127.0.0.1:3000"
        print_info "  Cek PM2: pm2 status && pm2 logs salfanet-radius --lines 60"
    fi

    # 2) Internal Nginx check (HTTP)
    if curl -fsS -I --max-time 5 http://127.0.0.1 >/dev/null 2>&1; then
        print_success "Internal Nginx check OK: http://127.0.0.1"
    else
        print_warning "Internal Nginx check failed: http://127.0.0.1"
        print_info "  Cek Nginx: nginx -t && systemctl status nginx --no-pager"
    fi

    # 3) Public check by detected IP (best-effort)
    if [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        if curl -fsS -I --max-time 7 "http://${PUBLIC_IP}" >/dev/null 2>&1; then
            print_success "Public HTTP reachable: http://${PUBLIC_IP}"
        else
            print_warning "Public HTTP not reachable: http://${PUBLIC_IP}"
            print_info "  Jika VM/Proxmox NAT: pastikan DNAT 80->VM:80 dan 443->VM:443"
            print_info "  Jika pakai Cloud Firewall/Security Group: allow TCP 80 dan 443"
            print_info "  Cek host NAT rule: iptables -t nat -L -n -v | grep -E 'dpt:(80|443)'"
        fi

        # HTTPS optional check (might fail on self-signed cert without -k)
        if curl -kfsS -I --max-time 7 "https://${PUBLIC_IP}" >/dev/null 2>&1; then
            print_success "Public HTTPS reachable: https://${PUBLIC_IP}"
        else
            print_warning "Public HTTPS check failed: https://${PUBLIC_IP}"
            print_info "  Jika pakai cert self-signed ini normal untuk browser (warning cert)"
            print_info "  Jika handshake gagal total, cek mapping 443 di NAT/load balancer"
        fi
    else
        print_warning "Detected public IP tidak valid/tersedia: ${PUBLIC_IP}"
        print_info "  Kemungkinan server berada di jaringan lokal/NAT tanpa public IP langsung"
    fi
}

install_nginx() {
    print_step "Step 6: Configuring Nginx Reverse Proxy"
    
    # Nginx should already be installed by install-system.sh
    if ! command -v nginx &>/dev/null; then
        print_info "Installing Nginx..."
        apt-get install -y nginx
    fi

    # Pastikan dnsutils tersedia untuk verifikasi DNS domain
    if ! command -v dig &>/dev/null; then
        apt-get install -y dnsutils 2>/dev/null || true
    fi

    tune_nginx_global
    create_nginx_config
    enable_nginx_site
    test_nginx_config
    restart_nginx
    configure_firewall_nginx

    # Setup SSL jika domain disediakan (setelah nginx running)
    setup_ssl_domain
    verify_external_web_access
    
    print_success "Nginx installation and configuration completed"
    
    echo ""
    print_info "Nginx Configuration:"
    echo "  HTTP Port:  80  (redirects to HTTPS for domain)"
    echo "  HTTPS Port: 443 (self-signed cert, Cloudflare-compatible)"
    echo "  Proxy to:   http://127.0.0.1:3000"
    if [ -n "${VPS_DOMAIN:-}" ]; then
    echo "  Access URL: https://${VPS_DOMAIN}"
    echo "  Direct IP:  https://${VPS_IP:-$(detect_ip_address)}"
    else
    echo "  Access URL: https://${VPS_IP:-$(detect_ip_address)}"
    fi
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    
    install_nginx
fi
