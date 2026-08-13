#!/bin/bash
cd /var/www/salfanet-radius/backend
export CRON_SECRET="$(grep CRON_SECRET ../.env | cut -d'"' -f2)"
export DATABASE_URL="$(grep DATABASE_URL ../.env | cut -d'"' -f2)"
export NEXTAUTH_SECRET="$(grep NEXTAUTH_SECRET ../.env | cut -d'"' -f2)"

echo "=== Test invoice_generate ==="
npx tsx cron-runner.ts --job=invoice_generate 2>&1 | tail -5

echo ""
echo "=== Test invoice_status_update ==="
npx tsx cron-runner.ts --job=invoice_status_update 2>&1 | tail -5

echo ""
echo "=== Direct API test ==="
curl -s -X POST http://localhost:3001/api/cron -H "Content-Type: application/json" -H "x-cron-secret: $CRON_SECRET" -d '{"type":"invoice_status_update"}' 2>&1

echo ""
echo "=== PM2 status ==="
pm2 list 2>/dev/null | grep -E "salfanet|name|status"
