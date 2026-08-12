#!/bin/bash
# ============================================================================
# SALFANET RADIUS — VPS Uninstaller (Complete Removal)
# ============================================================================
# DANGER: Removes ALL components — PM2, app files, database, FreeRADIUS config,
# Nginx config. Creates a backup before removal (optional).
#
# Usage:
#   bash vps-uninstaller.sh              # Interactive (with backup prompt)
#   bash vps-uninstaller.sh --force      # Skip confirmation (DANGEROUS)
#   bash vps-uninstaller.sh --no-backup  # Skip database backup
# ============================================================================

# No 'set -e' — removal should continue even if some components are missing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Parse args
FORCE=false
DO_BACKUP=true
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --force)     export FORCE=true;      shift ;;
        --no-backup) export DO_BACKUP=false; shift ;;
        --help|-h)
            echo "Usage: bash vps-uninstaller.sh [--force] [--no-backup]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

BACKUP_DIR="/root/salfanet-backup-$(date +%Y%m%d-%H%M%S)"

# ============================================================================
# WARNING + CONFIRMATION
# ============================================================================

show_warning() {
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  WARNING: This will COMPLETELY REMOVE all SALFANET RADIUS    ║${NC}"
    echo -e "${RED}║  components including database, configs, and app files.      ║${NC}"
    echo -e "${RED}║  This action is IRREVERSIBLE.                                ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Components to be removed:${NC}"
    echo "  - PM2 processes (salfanet-frontend, salfanet-backend, salfanet-wa)"
    echo "  - Application files ($APP_DIR)"
    echo "  - MySQL database ($DB_NAME) + user ($DB_USER)"
    echo "  - FreeRADIUS config (sqlippool, cui, custom queries)"
    echo "  - Nginx site config"
    echo "  - PM2 startup script"
    echo ""
}

ask_confirmation() {
    if [ "$FORCE" = "true" ]; then
        print_warn "--force flag set — skipping confirmation"
        return 0
    fi

    echo -e "${YELLOW}Type 'REMOVE EVERYTHING' to confirm:${NC}"
    read -r CONFIRM_TEXT </dev/tty

    if [ "$CONFIRM_TEXT" = "REMOVE EVERYTHING" ]; then
        return 0
    else
        print_error "Confirmation failed — uninstall cancelled"
        exit 1
    fi
}

# ============================================================================
# BACKUP
# ============================================================================

do_backup() {
    if [ "$DO_BACKUP" = "false" ]; then
        print_info "Skipping backup (--no-backup)"
        return 0
    fi

    mkdir -p "$BACKUP_DIR"

    # Database backup
    if command_exists mysqldump; then
        print_info "Backing up database to $BACKUP_DIR/db.sql..."
        mysqldump -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" > "$BACKUP_DIR/db.sql" 2>/dev/null || \
        mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_DIR/db.sql" 2>/dev/null || \
            print_warn "Database backup failed — check MySQL credentials"
    else
        print_warn "mysqldump not found — skipping DB backup"
    fi

    # App .env backup
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$BACKUP_DIR/dot-env" 2>/dev/null || true
    fi
    if [ -f "$APP_DIR/frontend/.env" ]; then
        cp "$APP_DIR/frontend/.env" "$BACKUP_DIR/frontend-dot-env" 2>/dev/null || true
    fi
    if [ -f "$APP_DIR/backend/.env" ]; then
        cp "$APP_DIR/backend/.env" "$BACKUP_DIR/backend-dot-env" 2>/dev/null || true
    fi

    print_success "Backup saved to $BACKUP_DIR"
}

# ============================================================================
# REMOVAL FUNCTIONS
# ============================================================================

remove_pm2() {
    print_step "Stop + Remove PM2 Processes"

    pm2 delete salfanet-frontend 2>/dev/null || true
    pm2 delete salfanet-backend 2>/dev/null || true
    pm2 delete salfanet-wa 2>/dev/null || true
    pm2 delete salfanet-cron 2>/dev/null || true

    pm2 save 2>/dev/null || true

    # Remove PM2 startup
    pm2 unstartup systemd 2>/dev/null || true

    print_success "PM2 processes removed"
}

remove_app() {
    print_step "Remove Application Files"

    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
        print_success "Removed $APP_DIR"
    else
        print_info "App directory not found — skipping"
    fi
}

remove_database() {
    print_step "Remove Database + User"

    mysql -u root -p"$DB_ROOT_PASSWORD" <<EOF 2>/dev/null || \
    mysql -u root <<EOF2 2>/dev/null || print_warn "Could not drop database (check root password)"
DROP DATABASE IF EXISTS \`$DB_NAME\`;
DROP USER IF EXISTS '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF
DROP DATABASE IF EXISTS \`$DB_NAME\`;
DROP USER IF EXISTS '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF2

    print_success "Database '$DB_NAME' and user '$DB_USER' removed"
}

remove_freeradius() {
    print_step "Remove FreeRADIUS Custom Config"

    local FR_DIR="/etc/freeradius/3.0"

    # Remove custom modules
    rm -f "$FR_DIR/mods-enabled/sqlippool" 2>/dev/null || true
    rm -f "$FR_DIR/mods-enabled/cui" 2>/dev/null || true
    rm -f "$FR_DIR/mods-enabled/cuisql" 2>/dev/null || true

    # Remove custom queries
    rm -f "$FR_DIR/mods-config/sql/ippool/mysql/queries.conf" 2>/dev/null || true

    # Drop stored procedure
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "DROP PROCEDURE IF EXISTS fr_allocate_previous_or_new_framedipaddress;" 2>/dev/null || true

    # Stop + disable
    systemctl stop freeradius 2>/dev/null || true
    systemctl disable freeradius 2>/dev/null || true

    # Optionally remove FreeRADIUS entirely
    if [ "$FORCE" = "true" ]; then
        apt-get purge -y freeradius freeradius-mysql freeradius-utils 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        print_success "FreeRADIUS completely purged"
    else
        print_success "FreeRADIUS custom config removed (package kept — use --force to purge)"
    fi
}

remove_nginx() {
    print_step "Remove Nginx Site Config"

    rm -f /etc/nginx/sites-enabled/salfanet 2>/dev/null || true
    rm -f /etc/nginx/sites-available/salfanet 2>/dev/null || true

    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true

    if [ "$FORCE" = "true" ]; then
        apt-get purge -y nginx 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        print_success "Nginx completely purged"
    else
        print_success "Nginx site config removed (package kept — use --force to purge)"
    fi
}

remove_pm2_global() {
    if [ "$FORCE" = "true" ]; then
        print_step "Remove PM2 global"
        npm uninstall -g pm2 2>/dev/null || true
        rm -rf /root/.pm2 2>/dev/null || true
        print_success "PM2 completely removed"
    fi
}

# ============================================================================
# MAIN
# ============================================================================

show_warning
ask_confirmation
do_backup

remove_pm2
remove_app
remove_database
remove_freeradius
remove_nginx
remove_pm2_global

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              UNINSTALL COMPLETE                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Backup: $BACKUP_DIR"
echo ""
if [ "$FORCE" = "false" ]; then
    echo "  Note: System packages (MySQL, Node.js, Nginx, FreeRADIUS) were kept."
    echo "  To remove them completely: bash vps-uninstaller.sh --force"
    echo ""
fi
