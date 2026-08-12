#!/bin/bash
# =====================================================
# Salfanet Radius — Enable FreeRADIUS IP Pool + CUI modules
# Diadopsi dari home.pmynet.id-main (FreeRADIUS 3.2.8)
#
# Jalankan di VPS:
#   bash deploy/freeradius/install-radius-modules.sh
#
# Prerequisites:
#   - FreeRADIUS 3.0.x with sql module enabled
#   - MySQL database with radippool, cui, nasreload tables
#   - prisma db push sudah dijalankan
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FR_DIR="/etc/freeradius/3.0"
BACKUP_DIR="/var/backups/freeradius-$(date +%Y%m%d-%H%M%S)"

echo "=== Backup FreeRADIUS config ==="
mkdir -p "$BACKUP_DIR"
cp "$FR_DIR/mods-available/sqlippool" "$BACKUP_DIR/" 2>/dev/null || true
cp "$FR_DIR/mods-available/cui" "$BACKUP_DIR/" 2>/dev/null || true
cp "$FR_DIR/sites-enabled/default" "$BACKUP_DIR/" 2>/dev/null || true
cp "$FR_DIR/mods-config/sql/ippool/mysql/queries.conf" "$BACKUP_DIR/" 2>/dev/null || true
echo "Backup saved to $BACKUP_DIR"

echo ""
echo "=== Step 1: Enable sqlippool module ==="
ln -sf "$FR_DIR/mods-available/sqlippool" "$FR_DIR/mods-enabled/sqlippool"
echo "sqlippool enabled"

echo ""
echo "=== Step 2: Copy queries.conf (uses stored procedure) ==="
cp "$SCRIPT_DIR/queries-sqlippool.conf" "$FR_DIR/mods-config/sql/ippool/mysql/queries.conf"
echo "queries.conf installed"

echo ""
echo "=== Step 3: Import stored procedure ==="
# Get DB credentials from .env
if [ -f /var/www/salfanet-radius/.env ]; then
  source /var/www/salfanet-radius/.env
elif [ -f /var/www/salfanet-radius/backend/.env ]; then
  source /var/www/salfanet-radius/backend/.env
fi

# Parse DATABASE_URL
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^/]*/\)\?\([^?]*\).*|\2|p')
[ -z "$DB_NAME" ] && DB_NAME="salfanet_radius"

echo "Importing SP to $DB_NAME@$DB_HOST..."
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SCRIPT_DIR/fr_allocate_sp.sql" 2>&1 | grep -v "Warning"
echo "Stored procedure imported"

echo ""
echo "=== Step 4: Install cui module (MySQL) ==="
cp "$SCRIPT_DIR/cui.conf" "$FR_DIR/mods-available/cui"
ln -sf "$FR_DIR/mods-available/cui" "$FR_DIR/mods-enabled/cui"
echo "cui module enabled (MySQL)"

echo ""
echo "=== Step 5: Add sqlippool + cuisql to sites-enabled/default ==="
DEFAULT_SITE="$FR_DIR/sites-enabled/default"

if grep -q "sqlippool" "$DEFAULT_SITE"; then
  echo "sqlippool already in default site"
else
  # Add sqlippool after "sql" in post-auth section
  SQL_LINE=$(grep -n "^        sql$" "$DEFAULT_SITE" | head -1 | cut -d: -f1)
  if [ -n "$SQL_LINE" ]; then
    sed -i "${SQL_LINE}a\\        sqlippool\n        cuisql" "$DEFAULT_SITE"
    echo "sqlippool + cuisql added to post-auth"
  fi
fi

# Add sqlippool to accounting section
if grep -q "sqlippool" <(sed -n '/^    accounting {/,/^    }/p' "$DEFAULT_SITE"); then
  echo "sqlippool already in accounting"
else
  sed -i '/^    accounting {/,/^    }/ {
    /^    }/i\        sqlippool
  }' "$DEFAULT_SITE"
  echo "sqlippool added to accounting"
fi

echo ""
echo "=== Step 6: Test config ==="
freeradius -C -d "$FR_DIR" 2>&1 | tail -5
if [ $? -eq 0 ]; then
  echo "Config OK"
else
  echo "CONFIG TEST FAILED - check errors above"
  exit 1
fi

echo ""
echo "=== Step 7: Restart FreeRADIUS ==="
systemctl restart freeradius
sleep 2
systemctl status freeradius 2>&1 | head -5

echo ""
echo "=== DONE ==="
echo "FreeRADIUS modules enabled:"
echo "  - sqlippool (IP Pool allocation via stored procedure)"
echo "  - cuisql (Chargeable User Identity tracking)"
echo ""
echo "To test:"
echo "  radtest <username> <password> 127.0.0.1 0 testing123"
