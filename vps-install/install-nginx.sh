#!/bin/bash
# ============================================================================
# SALFANET RADIUS — Nginx Reverse Proxy
# ============================================================================
# Routes:
#   /api/v1/*  -> NestJS backend (port 3001)
#   /api/docs  -> NestJS backend (Swagger)
#   /api/*     -> Next.js frontend (port 3000) — legacy routes
#   /          -> Next.js frontend (port 3000)
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_nginx() {
    print_step "Nginx Reverse Proxy"

    if command_exists nginx; then
        print_info "Nginx already installed — skipping apt install"
    else
        export DEBIAN_FRONTEND=noninteractive
        apt-get install -yqq nginx
    fi

    # Copy config from repo if available, else use inline
    local conf_src="$APP_DIR/deploy/nginx-salfanet.conf"
    local conf_dst="/etc/nginx/sites-available/salfanet"

    if [ -f "$conf_src" ]; then
        cp "$conf_src" "$conf_dst"
        print_info "Nginx config copied from repo"
    else
        # Inline fallback
        cat > "$conf_dst" <<NGINXEOF
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    # NestJS Backend API (/api/v1/*)
    location /api/v1/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # Swagger API Docs
    location /api/docs {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Legacy Next.js API routes (/api/*)
    location /api/ {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Next.js frontend (all other routes)
    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF
    fi

    # Enable site
    ln -sf "$conf_dst" /etc/nginx/sites-enabled/salfanet
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    # Test + reload
    nginx -t || die "Nginx config test failed"
    systemctl enable nginx
    systemctl reload nginx

    print_success "Nginx configured and running"
}
