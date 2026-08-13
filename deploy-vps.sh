#!/bin/bash
set -e
cd /var/www/salfanet-radius
git pull origin master 2>&1

# ─── Install dependencies ─────────────────────────────────────────
pnpm install 2>&1 | tail -5

# ─── Generate Prisma for both apps ────────────────────────────────
cd backend
npx prisma generate 2>&1 | tail -2
cd ../frontend
npx prisma generate 2>&1 | tail -2

# ─── Build backend ────────────────────────────────────────────────
cd /var/www/salfanet-radius/backend
NEXTAUTH_SECRET="$(grep NEXTAUTH_SECRET ../.env | cut -d'"' -f2)"
DATABASE_URL="$(grep DATABASE_URL ../.env | cut -d'"' -f2)"
CRON_SECRET="$(grep CRON_SECRET ../.env | cut -d'"' -f2)"
export NEXTAUTH_SECRET DATABASE_URL CRON_SECRET
rm -rf .next
NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -5
cp ../.env .next/standalone/.env

# ─── Build frontend ───────────────────────────────────────────────
cd /var/www/salfanet-radius/frontend
NEXTAUTH_SECRET="$(grep NEXTAUTH_SECRET ../.env | cut -d'"' -f2)"
DATABASE_URL="$(grep DATABASE_URL ../.env | cut -d'"' -f2)"
SERVER_API_URL="http://localhost:3001"
export NEXTAUTH_SECRET DATABASE_URL SERVER_API_URL
rm -rf .next
NODE_OPTIONS='--max-old-space-size=1536' npx next build 2>&1 | tail -5
cp ../.env .next/standalone/.env

# ─── Update nginx ─────────────────────────────────────────────────
cat > /etc/nginx/sites-available/salfanet << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    # NextAuth routes → frontend (port 3000)
    location /api/auth/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        add_header Cache-Control 'no-store, no-cache, must-revalidate' always;
    }

    # API routes → backend (port 3001)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        add_header Cache-Control 'no-store, no-cache, must-revalidate' always;
    }

    # Everything else → frontend (port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_cache_bypass $http_upgrade;
        add_header Cache-Control 'no-cache, must-revalidate' always;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/salfanet /etc/nginx/sites-enabled/salfanet
nginx -t 2>&1
systemctl reload nginx

# ─── PM2 setup ────────────────────────────────────────────────────
# Stop old backend (NestJS)
pm2 stop salfanet-backend 2>/dev/null || true
pm2 delete salfanet-backend 2>/dev/null || true

# Start frontend (port 3000)
pm2 delete salfanet-frontend 2>/dev/null || true
cd /var/www/salfanet-radius/frontend/.next/standalone
pm2 start "node server.js" --name salfanet-frontend --update-env 2>&1 | tail -2

# Start backend (port 3001)
pm2 delete salfanet-backend 2>/dev/null || true
cd /var/www/salfanet-radius/backend/.next/standalone
pm2 start "PORT=3001 node server.js" --name salfanet-backend --update-env 2>&1 | tail -2

# Restart cron (points to backend API)
pm2 delete salfanet-cron 2>/dev/null || true
cd /var/www/salfanet-radius/backend
pm2 start "npx tsx cron-runner.ts" --name salfanet-cron --update-env 2>&1 | tail -2

# Restart WA service
pm2 restart salfanet-wa --update-env 2>/dev/null || true

pm2 save 2>&1 | tail -1
echo "=== Done ==="
pm2 list 2>/dev/null
