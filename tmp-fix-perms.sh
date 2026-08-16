#!/bin/bash
APP_DIR=/var/www/salfanet-radius

# Fix execute permissions on all node_modules/.bin
find $APP_DIR -path "*/node_modules/.bin" -type d | while read bindir; do
    chmod +x "$bindir"/* 2>/dev/null || true
done

# Fix Prisma engines
find $APP_DIR -path "*/node_modules/@prisma/engines" -type d | while read enginedir; do
    chmod +x "$enginedir"/* 2>/dev/null || true
    find "$enginedir" -type f | while read engine; do
        chmod +x "$engine" 2>/dev/null || true
    done
done

echo "Permissions fixed"
ls -la /var/www/salfanet-radius/backend/node_modules/.bin/prisma

# Now run seeds
cd /var/www/salfanet-radius
echo "=== Running seeds ==="
backend/node_modules/.bin/tsx backend/prisma/seeds/seed-all.ts 2>&1 | tail -20
echo "=== Seed done ==="

# Verify admin
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -se "SELECT COUNT(*) FROM admin_users WHERE role='SUPER_ADMIN';" 2>/dev/null
