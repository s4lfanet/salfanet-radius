#!/bin/bash
# =============================================================
# Salfanet RADIUS — Backup running FreeRADIUS config to Git
#
# Pulls the LIVE config from /etc/freeradius/3.0/ and syncs
# into the repo's freeradius-config/ directory, then commits
# and pushes to GitHub (origin/master).
#
# Run ON the VPS:
#   bash /var/www/salfanet-radius/scripts/backup-freeradius-to-git.sh
# =============================================================

set -e

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
FR_DIR="/etc/freeradius/3.0"
BACKUP_DIR="$APP_DIR/freeradius-config"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE_SHORT=$(date '+%Y-%m-%d')

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()  { echo -e "${GREEN}✔ $1${NC}"; }
log() { echo -e "${YELLOW}  $1${NC}"; }
err() { echo -e "${RED}✘ $1${NC}"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   FreeRADIUS Config Backup → Git ($DATE_SHORT)   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Sanity checks ────────────────────────────────────────────
[ -d "$FR_DIR" ]     || err "FreeRADIUS config dir not found: $FR_DIR"
[ -d "$APP_DIR" ]    || err "App dir not found: $APP_DIR"
[ -d "$APP_DIR/.git" ] || err "Not a git repo: $APP_DIR"

cd "$APP_DIR"

# ── Files to sync: source → destination (relative to APP_DIR) ─
declare -A FILES=(
    ["$FR_DIR/clients.conf"]="freeradius-config/clients.conf"
    ["$FR_DIR/clients.d/nas-from-db.conf"]="freeradius-config/clients.d/nas-from-db.conf"
    ["$FR_DIR/mods-available/sql"]="freeradius-config/mods-available/sql"
    ["$FR_DIR/mods-available/rest"]="freeradius-config/mods-available/rest"
    ["$FR_DIR/mods-available/mschap"]="freeradius-config/mods-available/mschap"
    ["$FR_DIR/mods-enabled/sql"]="freeradius-config/mods-enabled/sql"
    ["$FR_DIR/mods-enabled/rest"]="freeradius-config/mods-enabled/rest"
    ["$FR_DIR/sites-available/default"]="freeradius-config/sites-available/default"
    ["$FR_DIR/sites-available/coa"]="freeradius-config/sites-available/coa"
    ["$FR_DIR/sites-enabled/default"]="freeradius-config/sites-enabled/default"
    ["$FR_DIR/policy.d/filter"]="freeradius-config/policy.d/filter"
)

CHANGED=0

for SRC in "${!FILES[@]}"; do
    DEST="${FILES[$SRC]}"
    DEST_FULL="$APP_DIR/$DEST"

    if [ ! -f "$SRC" ]; then
        log "SKIP (not found): $SRC"
        continue
    fi

    # If it's a symlink, read the actual file content
    ACTUAL_SRC="$SRC"
    if [ -L "$SRC" ]; then
        ACTUAL_SRC=$(readlink -f "$SRC")
        log "Symlink resolved: $SRC → $ACTUAL_SRC"
    fi

    mkdir -p "$(dirname "$DEST_FULL")"

    if [ ! -f "$DEST_FULL" ] || ! diff -q "$ACTUAL_SRC" "$DEST_FULL" &>/dev/null; then
        cp "$ACTUAL_SRC" "$DEST_FULL"
        ok "Updated: $DEST"
        CHANGED=$((CHANGED + 1))
    else
        echo "  ─ No change: $DEST"
    fi
done

echo ""

if [ "$CHANGED" -eq 0 ]; then
    echo -e "${GREEN}✔ All configs already in sync — nothing to commit.${NC}"
    exit 0
fi

log "$CHANGED file(s) changed — committing..."

# ── Git commit & push ─────────────────────────────────────────
git -C "$APP_DIR" add freeradius-config/
git -C "$APP_DIR" commit -m "chore(freeradius): sync running config from VPS ($DATE_SHORT)" \
    -m "Pulled live config from $FR_DIR on $(hostname) at $TIMESTAMP"
git -C "$APP_DIR" push origin master

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Backup complete — pushed to GitHub ✔           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
