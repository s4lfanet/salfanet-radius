#!/bin/bash
# ============================================================================
# SALFANET RADIUS — Post-Install Fix Script (v2)
# ============================================================================
# Fixes PWA manifest 404 + API issues on VPS installed with older installer.
#
# Root causes fixed:
#   1. nginx used `alias` with regex location (broken in nginx)
#      → changed to `root /var/www/salfanet-radius/public` (serve from project public/)
#   2. `cp -r public .next/standalone/public/` creates nested public/public/
#      → fixed copy command + still needed for standalone server.js serving
#   3. Missing /api/ no-cache block in IP-only nginx config
#   4. Missing ENCRYPTION_KEY in standalone .env
#
# Usage:
#   bash vps-install/fix-pwa-nginx.sh
# ============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
NGINX_CONF="/etc/nginx/sites-available/salfanet-radius"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
print_success() { echo -e "${GREEN}[OK]${NC}   $*"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $*"; }
print_error()   { echo -e "${RED}[ERR]${NC}  $*"; }
print_step()    { echo -e "\n${GREEN}==> $*${NC}"; }

# ---------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root: sudo bash $0"
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    print_error "App directory not found: $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

# ---------------------------------------------------------------------------
# STEP 1: Fix standalone public/ copy (avoid nested public/public/)
# ---------------------------------------------------------------------------
print_step "Step 1: Copy public assets into standalone bundle"

if [ ! -d ".next/standalone" ]; then
    print_warning ".next/standalone not found — app may not have been built yet."
    print_warning "Run: cd $APP_DIR && npm run build, then re-run this script."
else
    # Fix: use cp contents (public/.) not directory (public) to avoid nesting
    if [ -d "public" ]; then
        mkdir -p .next/standalone/public
        cp -r public/. .next/standalone/public/
        print_success "public/ contents → .next/standalone/public/"
    fi

    if [ -d ".next/static" ]; then
        mkdir -p .next/standalone/.next
        cp -r .next/static .next/standalone/.next/static
        print_success ".next/static/ → .next/standalone/.next/static/"
    fi

    # Verify files are at correct level (not nested public/public/)
    if [ -f ".next/standalone/public/manifest-admin.json" ]; then
        print_success "Verified: manifest-admin.json at correct path"
    elif [ -f ".next/standalone/public/public/manifest-admin.json" ]; then
        print_warning "Found nested public/public/ — fixing..."
        cp -r .next/standalone/public/public/. .next/standalone/public/
        rm -rf .next/standalone/public/public
        print_success "Nested public/public/ flattened"
    fi
fi

# ---------------------------------------------------------------------------
# STEP 2: Add ENCRYPTION_KEY to .env files if missing
# ---------------------------------------------------------------------------
print_step "Step 2: Ensure ENCRYPTION_KEY in .env"

ensure_encryption_key() {
    local ENV_FILE="$1"
    if [ -f "$ENV_FILE" ] && ! grep -q "^ENCRYPTION_KEY=" "$ENV_FILE"; then
        if grep -q "^ENCRYPTION_KEY=" "$APP_DIR/.env" 2>/dev/null; then
            ENC_KEY=$(grep "^ENCRYPTION_KEY=" "$APP_DIR/.env" | head -1 | cut -d= -f2-)
        else
            ENC_KEY=$(openssl rand -hex 16)
            echo "ENCRYPTION_KEY=$ENC_KEY" >> "$APP_DIR/.env"
            print_success "Generated ENCRYPTION_KEY in .env"
        fi
        echo "ENCRYPTION_KEY=$ENC_KEY" >> "$ENV_FILE"
        print_success "ENCRYPTION_KEY → $ENV_FILE"
    elif [ -f "$ENV_FILE" ]; then
        print_success "ENCRYPTION_KEY already in $ENV_FILE"
    fi
}

ensure_encryption_key "$APP_DIR/.env"
[ -f "$APP_DIR/.next/standalone/.env" ] && ensure_encryption_key "$APP_DIR/.next/standalone/.env"

# ---------------------------------------------------------------------------
# STEP 3: Fix nginx config — replace broken alias/try_files with root/public
# ---------------------------------------------------------------------------
print_step "Step 3: Fix nginx config"

if [ ! -f "$NGINX_CONF" ]; then
    print_warning "Nginx config not found at $NGINX_CONF — skipping"
else
    cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
    print_info "Nginx config backed up"

    python3 - <<'PYEOF'
import re, sys

CONF_PATH = "/etc/nginx/sites-available/salfanet-radius"

with open(CONF_PATH, "r") as f:
    content = f.read()

original = content

# ---- Fix 1: Replace broken manifest alias/try_files blocks ----
# Remove old manifest blocks (alias-based or standalone/public root-based)
# Pattern 1: location with alias + standalone/public
content = re.sub(
    r'\n\s*#[^\n]*manifest[^\n]*\n'
    r'\s*location\s+~\*?\s+\^/manifest[^\n]+\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)
# Pattern 2: sw.js with alias or standalone root
content = re.sub(
    r'\n\s*#[^\n]*[Ss]ervice\s+[Ww]orker[^\n]*\n'
    r'\s*location\s+=\s+/sw\.js\s+\{[^}]+\}\n',
    '\n',
    content,
    flags=re.DOTALL
)
# Pattern 3: named @nextjs_* fallback locations
content = re.sub(
    r'\n\s*location\s+@nextjs_\w+\s+\{[^}]+\}\n',
    '\n',
    content
)
# Pattern 4: @nextjs_fallback
content = re.sub(
    r'\n\s*location\s+@nextjs_fallback\s+\{[^}]+\}\n',
    '\n',
    content
)
# Pattern 5: @nextjs (without underscore suffix)
content = re.sub(
    r'\n\s*location\s+@nextjs\s+\{[^}]+\}\n',
    '\n',
    content
)

# ---- Fix 2: Remove duplicate CF-Connecting-IP ----
content = re.sub(
    r'(proxy_set_header\s+CF-Connecting-IP\s+\$http_cf_connecting_ip;\n)'
    r'\s*proxy_set_header\s+CF-Connecting-IP\s+\$http_cf_connecting_ip;\n',
    r'\1',
    content
)

# ---- Fix 3: Inject correct manifest/sw.js/pwa blocks ----
# Only inject if NOT already present with the correct root approach
PWA_BLOCK = """
    # PWA manifest files — serve directly from public/ (no Node.js needed)
    location ~ ^/manifest(-[a-z]+)?\\.json$ {
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
"""

# ---- Fix 4: Inject /api/ block if missing ----
API_BLOCK = """
    # API routes — no cache
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   CF-Connecting-IP $http_cf_connecting_ip;

        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;

        proxy_hide_header X-Frame-Options;
        proxy_hide_header X-XSS-Protection;
        proxy_hide_header X-Content-Type-Options;
    }
"""

has_manifest = 'root /var/www/salfanet-radius/public' in content and 'manifest' in content
has_api = 'location /api/' in content

# Find each "location / {" (the catch-all) and inject before it
# We need to inject in EACH server block
if not has_manifest or not has_api:
    parts = []
    last_end = 0
    for m in re.finditer(r'\n([ \t]+)location\s+/\s*\{', content):
        insert_pos = m.start()
        parts.append(content[last_end:insert_pos])
        inject = ""
        if not has_manifest:
            inject += PWA_BLOCK
        if not has_api:
            inject += API_BLOCK
        parts.append(inject)
        last_end = insert_pos
        # Mark as injected for subsequent blocks
        has_manifest = True
        has_api = True
    parts.append(content[last_end:])
    content = "".join(parts)
    print("  PWA/API blocks injected")
else:
    print("  PWA/API blocks already present — skipping")

# Clean up multiple blank lines
content = re.sub(r'\n{3,}', '\n\n', content)

if content != original:
    with open(CONF_PATH, "w") as f:
        f.write(content)
    print("  Nginx config updated")
else:
    print("  No changes needed")
PYEOF

    if nginx -t 2>&1; then
        print_success "Nginx config valid"
    else
        print_error "Nginx config test failed! Restoring backup..."
        LATEST_BAK=$(ls -t "${NGINX_CONF}.bak."* 2>/dev/null | head -1)
        if [ -n "$LATEST_BAK" ]; then
            cp "$LATEST_BAK" "$NGINX_CONF"
            print_warning "Backup restored: $LATEST_BAK"
        fi
        print_warning "Run 'nginx -t' to debug manually"
    fi
fi

# ---------------------------------------------------------------------------
# STEP 4: Reload nginx
# ---------------------------------------------------------------------------
print_step "Step 4: Reload nginx"

if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null && print_success "Nginx reloaded" || \
    systemctl restart nginx 2>/dev/null && print_success "Nginx restarted" || \
    print_error "Nginx restart failed!"
else
    print_warning "Nginx config invalid — skipping reload"
fi

# ---------------------------------------------------------------------------
# STEP 5: Restart app
# ---------------------------------------------------------------------------
print_step "Step 5: Restart application"

APP_USER=$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo root)

if command -v pm2 >/dev/null 2>&1; then
    if pm2 list 2>/dev/null | grep -q "salfanet-radius"; then
        pm2 restart salfanet-radius --update-env 2>/dev/null && print_success "App restarted (root pm2)" || true
    fi
fi

if [ "$APP_USER" != "root" ] && id "$APP_USER" &>/dev/null; then
    sudo su - "$APP_USER" -c 'pm2 restart salfanet-radius --update-env 2>/dev/null || true' && \
        print_success "App restarted as $APP_USER" || true
fi

# ---------------------------------------------------------------------------
print_step "Done!"
echo ""
print_info "What was fixed:"
echo "  1. public/ copied into .next/standalone/ (fixed nested public/public/ bug)"
echo "  2. ENCRYPTION_KEY ensured in .env (GenieACS save fix)"
echo "  3. Nginx: manifest/sw.js/pwa use 'root public/' (was broken 'alias standalone/')"
echo "  4. Nginx: /api/ no-cache block added (fixes API returning HTML 404)"
echo ""
print_info "Test:"
echo "  curl -I http://\$(hostname -I | awk '{print \$1}')/manifest-admin.json"
echo "  curl -s http://\$(hostname -I | awk '{print \$1}')/api/health | head -c 100"
