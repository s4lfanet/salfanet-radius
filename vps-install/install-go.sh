#!/usr/bin/env bash
# ============================================================================
# Salfanet RADIUS Go — VPS Clean Install Script
# Target: Ubuntu 22.04 LTS
# Usage:  sudo bash install-go.sh
# ============================================================================
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
APP_USER="salfanet"
APP_DIR="/var/www/salfanet-radius"
GO_VERSION="1.23.5"
GO_ARCH="linux-amd64"
SERVICE_NAME="salfanet-radius"
NODE_VERSION="20"
APP_PORT="${APP_PORT:-8080}"
WA_PORT="${WA_PORT:-3001}"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

# ─── Root check ──────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Run as root: sudo bash $0"
  exit 1
fi

log "=== Salfanet RADIUS Go — VPS Clean Install ==="
log "App dir: $APP_DIR | Port: $APP_PORT | WA sidecar: $WA_PORT"

# ─── 1. System packages ──────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  nginx ufw \
  mysql-client \
  freeradius freeradius-mysql \
  ca-certificates gnupg

# ─── 2. Go ───────────────────────────────────────────────────────────────────
if ! command -v go &>/dev/null || [[ "$(go version 2>/dev/null | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
  log "Installing Go ${GO_VERSION}..."
  GO_TAR="go${GO_VERSION}.${GO_ARCH}.tar.gz"
  wget -q "https://go.dev/dl/${GO_TAR}" -O "/tmp/${GO_TAR}"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "/tmp/${GO_TAR}"
  rm "/tmp/${GO_TAR}"
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
else
  log "Go $(go version | awk '{print $3}') already installed, skipping."
fi

export PATH="/usr/local/go/bin:$PATH"
go version

# ─── 3. Node.js (for wa-service sidecar) ────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
else
  log "Node.js $(node --version) already installed, skipping."
fi

# ─── 4. PM2 ──────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  npm install -g pm2 --quiet
fi

# ─── 5. Create app user ──────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  log "Creating system user '${APP_USER}'..."
  useradd --system --no-create-home --shell /bin/false "$APP_USER"
fi

# ─── 6. App directory ────────────────────────────────────────────────────────
log "Setting up app directory at ${APP_DIR}..."
mkdir -p "$APP_DIR/bin" "$APP_DIR/logs" "$APP_DIR/public"

# ─── 7. Clone / update repo ──────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/s4lfanet/salfanet-radius-go.git}"

if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo..."
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning repo from ${REPO_URL}..."
  git clone "$REPO_URL" "$APP_DIR"
fi

# ─── 8. Build Go binary ──────────────────────────────────────────────────────
log "Building Go binary..."
cd "$APP_DIR"
go mod download
go build -o bin/server ./cmd/server/
chmod +x bin/server

# ─── 9. wa-service (WhatsApp sidecar) ────────────────────────────────────────
log "Installing wa-service npm dependencies..."
npm --prefix "$APP_DIR" install --omit=dev --quiet

# ─── 10. Environment file ────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating .env from template..."
  cat > "$ENV_FILE" <<'ENV'
# ─── App ──────────────────────────────────────────────────────────────────────
APP_ENV=production
PORT=8080
APP_TIMEZONE=Asia/Jakarta

# ─── Database (MySQL/MariaDB) ─────────────────────────────────────────────────
# Format: user:password@tcp(host:port)/dbname?parseTime=true&loc=Asia%2FJakarta
DATABASE_URL=salfanet:CHANGE_ME@tcp(127.0.0.1:3306)/salfanet_radius?parseTime=true&loc=Asia%2FJakarta

# ─── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHAR_STRING

# ─── CORS ────────────────────────────────────────────────────────────────────
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000

# ─── WhatsApp sidecar ────────────────────────────────────────────────────────
WA_SERVICE_URL=http://localhost:3001
ENV
  warn ".env created at $ENV_FILE — EDIT IT before starting the service!"
else
  log ".env already exists, skipping creation."
fi

# ─── 11. Systemd service for Go binary ───────────────────────────────────────
log "Creating systemd service: ${SERVICE_NAME}..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<SYSTEMD
[Unit]
Description=Salfanet RADIUS Go API Server
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/bin/server
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/logs
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# ─── 12. PM2 for wa-service sidecar ──────────────────────────────────────────
log "Setting up wa-service with PM2..."
pm2 delete wa-service 2>/dev/null || true
pm2 start "$APP_DIR/wa-service.js" \
  --name wa-service \
  --log "$APP_DIR/logs/wa-service.log" \
  --time \
  --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# ─── 13. Nginx reverse proxy ─────────────────────────────────────────────────
DOMAIN="${DOMAIN:-_}"   # set DOMAIN=yourdomain.com before running
NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"

log "Configuring Nginx reverse proxy..."
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    # Static files from Next.js public dir (optional passthrough)
    root ${APP_DIR}/public;

    location /api/ {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    location /ws/ {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    # Serve frontend (Next.js on port 3000 or static build)
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        try_files \$uri \$uri/ =404;
    }
}
NGINX

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ─── 14. UFW firewall ────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ─── 15. FreeRADIUS config ───────────────────────────────────────────────────
if [ -d "$APP_DIR/freeradius-config" ]; then
  log "Applying FreeRADIUS config..."
  cp -r "$APP_DIR/freeradius-config/"* /etc/freeradius/3.0/ 2>/dev/null || true
  chown -R freerad:freerad /etc/freeradius/3.0/
  systemctl restart freeradius || warn "FreeRADIUS restart failed — check /etc/freeradius/3.0/ config"
fi

# ─── 16. File ownership ──────────────────────────────────────────────────────
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ─── 17. Start services ──────────────────────────────────────────────────────
log "Starting services..."
systemctl start "$SERVICE_NAME"
systemctl status "$SERVICE_NAME" --no-pager -l

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
log "============================================================"
log "  Salfanet RADIUS Go installed successfully!"
log "============================================================"
log "  Go API:       http://localhost:${APP_PORT}"
log "  Health check: http://localhost:${APP_PORT}/api/system/health"
log "  WA sidecar:   http://localhost:${WA_PORT}"
log ""
warn "  IMPORTANT: Edit ${APP_DIR}/.env with real secrets before use!"
warn "  Run: systemctl restart ${SERVICE_NAME}  after editing .env"
log "============================================================"
