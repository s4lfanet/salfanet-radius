#!/bin/bash
source /etc/profile 2>/dev/null
export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
export HOME=/root
cd /var/www/salfanet-radius

echo '=== Git pull ==='
git pull origin master 2>&1

echo '=== Backend build ==='
cd backend
pnpm install --no-frozen-lockfile 2>&1 | tail -3
pnpm build 2>&1 | tail -10
cp .env .next/standalone/backend/.env 2>/dev/null || true
mkdir -p .next/standalone/backend/.next
cp -r .next/static .next/standalone/backend/.next/static/ 2>/dev/null || true
mkdir -p .next/standalone/backend/public
cp -r public/. .next/standalone/backend/public/ 2>/dev/null || true

echo '=== Frontend build ==='
cd /var/www/salfanet-radius/frontend
pnpm install --no-frozen-lockfile 2>&1 | tail -3
pnpm build 2>&1 | tail -10
cp .env .next/standalone/frontend/.env 2>/dev/null || true
mkdir -p .next/standalone/frontend/.next
cp -r .next/static .next/standalone/frontend/.next/static/ 2>/dev/null || true
mkdir -p .next/standalone/frontend/public
cp -r public/. .next/standalone/frontend/public/ 2>/dev/null || true

echo '=== Restart PM2 ==='
cd /var/www/salfanet-radius
export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' backend/.env | tr -d '"' | tr -d "'")
export NEXTAUTH_SECRET=$(sed -n 's/^NEXTAUTH_SECRET=//p' frontend/.env | tr -d '"' | tr -d "'")
export NEXTAUTH_URL=$(sed -n 's/^NEXTAUTH_URL=//p' frontend/.env | tr -d '"' | tr -d "'")
pm2 reload salfanet-frontend --update-env 2>&1 || pm2 restart salfanet-frontend --update-env 2>&1
pm2 reload salfanet-backend --update-env 2>&1 || pm2 restart salfanet-backend --update-env 2>&1
pm2 save 2>&1

sleep 3
echo '=== CHECK FE ==='
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>&1
echo
echo '=== CHECK BE ==='
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/company 2>&1
echo
echo '=== CHECK WA ==='
curl -s http://127.0.0.1:4000/status 2>&1
echo
echo '=== DONE ==='
