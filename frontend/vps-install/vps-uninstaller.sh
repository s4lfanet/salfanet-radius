#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Uninstaller - Complete Removal
# ============================================================================
# DANGER: This will remove ALL installed components and data
# ============================================================================

# NOTE: No 'set -e' here — removal steps should continue even if individual
# packages/services are already gone. Each function uses '|| true' to be safe.

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

APP_DIR="/var/www/salfanet-radius"
# Try to detect APP_USER from directory ownership, fallback to salfanet
if [ -d "$APP_DIR" ]; then
    APP_USER=$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo "salfanet")
else
    APP_USER="salfanet"
fi
DB_NAME="salfanet_radius"
DB_USER="salfanet_user"

# Backup directory
BACKUP_DIR="/root/salfanet-backup-$(date +%Y%m%d-%H%M%S)"

# ============================================================================
# CONFIRMATION & WARNING
# ============================================================================

show_warning() {
    echo ""
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                      ⚠️  WARNING  ⚠️                              ║${NC}"
    echo -e "${RED}║                                                                   ║${NC}"
    echo -e "${RED}║  This script will COMPLETELY REMOVE all SALFANET RADIUS components ║${NC}"
    echo -e "${RED}║  including databases, configurations, and application files.     ║${NC}"
    echo -e "${RED}║                                                                   ║${NC}"
    echo -e "${RED}║  This action is IRREVERSIBLE unless you create a backup first!   ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Components that will be removed:${NC}"
    echo "  ❌ PM2 processes (salfanet-radius, salfanet-cron)"
    echo "  ❌ Application files ($APP_DIR)"
    echo "  ❌ MySQL database ($DB_NAME)"
    echo "  ❌ FreeRADIUS configuration"
    echo "  ❌ Nginx configuration"
    echo "  ❌ User account ($APP_USER)"
    echo "  ❌ System packages (optional)"
    echo "  ❌ All logs and data"
    echo ""
}

ask_backup() {
    read -p "Do you want to backup database before removal? [Y/n]: " BACKUP_CONFIRM </dev/tty
    
    if [[ ! "$BACKUP_CONFIRM" =~ ^[Nn]$ ]]; then
        return 0  # Yes, backup
    else
        return 1  # No backup
    fi
}

ask_confirmation() {
    echo -e "${YELLOW}Type 'REMOVE EVERYTHING' to confirm removal:${NC}"
    read -r CONFIRM_TEXT </dev/tty
    
    if [ "$CONFIRM_TEXT" = "REMOVE EVERYTHING" ]; then
        return 0
    else
        echo -e "${RED}Confirmation failed. Uninstall cancelled.${NC}"
        exit 1
    fi
}

# ============================================================================
# BACKUP FUNCTIONS
# ============================================================================

prompt_db_root_password() {
    if [ -n "${DB_ROOT_PASSWORD:-}" ]; then
        return 0
    fi

    # Try to read from .env first
    if [ -f "${APP_DIR}/.env" ]; then
        local ENV_PASS
        ENV_PASS=$(grep -E '^DATABASE_URL=' "${APP_DIR}/.env" 2>/dev/null | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|' || true)
        if [ -n "$ENV_PASS" ]; then
            DB_ROOT_PASSWORD="$ENV_PASS"
            print_info "DB password read from .env"
            return 0
        fi
    fi

    # Fall back to prompt
    echo -n "MySQL root password (leave empty if no password): "
    read -rs DB_ROOT_PASSWORD </dev/tty
    echo ""
    export DB_ROOT_PASSWORD
}

backup_database() {
    print_step "Creating database backup"
    
    mkdir -p "$BACKUP_DIR"
    
    if command -v mysql >/dev/null 2>&1; then
        prompt_db_root_password
        print_info "Backing up database to: $BACKUP_DIR"
        
        mysqldump -u root ${DB_ROOT_PASSWORD:+-p"${DB_ROOT_PASSWORD}"} ${DB_NAME} > "$BACKUP_DIR/database.sql" 2>/dev/null || {
            print_warning "Database backup failed (database may not exist)"
        }
        
        if [ -f "$BACKUP_DIR/database.sql" ]; then
            print_success "Database backed up successfully"
        fi
    fi
}

backup_configs() {
    print_info "Backing up configurations..."
    
    # Backup .env
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$BACKUP_DIR/env.backup" 2>/dev/null || true
    fi
    
    # Backup FreeRADIUS configs
    if [ -d "/etc/freeradius" ]; then
        cp -r /etc/freeradius "$BACKUP_DIR/freeradius-backup" 2>/dev/null || true
    fi
    
    # Backup Nginx configs
    if [ -f "/etc/nginx/sites-available/salfanet-radius" ]; then
        cp /etc/nginx/sites-available/salfanet-radius "$BACKUP_DIR/nginx-backup" 2>/dev/null || true
    fi
    
    print_success "Configurations backed up to: $BACKUP_DIR"
}

# ============================================================================
# REMOVAL FUNCTIONS
# ============================================================================

kill_port_processes() {
    print_step "Killing processes on application ports"
    
    # Ports used by SALFANET RADIUS
    local PORTS=(3000 1812 1813 3799 1814)
    
    for PORT in "${PORTS[@]}"; do
        print_info "Checking port $PORT..."
        
        # Get PIDs using the port
        local PIDS=$(lsof -ti :$PORT 2>/dev/null || true)
        
        if [ -n "$PIDS" ]; then
            print_info "Killing processes on port $PORT: $PIDS"
            echo "$PIDS" | xargs -r kill -9 2>/dev/null || true
            sleep 1
            
            # Verify port is free
            if lsof -ti :$PORT &>/dev/null; then
                print_warning "Port $PORT still in use after kill attempt"
            else
                print_success "Port $PORT freed"
            fi
        else
            print_info "Port $PORT is free"
        fi
    done
}

stop_all_services() {
    print_step "Stopping all services"
    
    # Stop PM2 processes (both root and salfanet user)
    print_info "Stopping PM2 processes..."
    pm2 delete all 2>/dev/null || true
    pm2 kill 2>/dev/null || true
    
    if id "$APP_USER" &>/dev/null; then
        sudo su - $APP_USER -c 'pm2 delete all' 2>/dev/null || true
        sudo su - $APP_USER -c 'pm2 kill' 2>/dev/null || true
    fi
    
    # Stop system services
    print_info "Stopping system services..."
    systemctl stop nginx 2>/dev/null || true
    systemctl stop freeradius 2>/dev/null || true
    
    # Kill any remaining Node processes
    pkill -9 node 2>/dev/null || true
    
    # Kill processes on application ports
    kill_port_processes
    
    print_success "All services stopped"
}

remove_application() {
    print_step "Removing application files"
    
    if [ -d "$APP_DIR" ]; then
        print_info "Removing: $APP_DIR"
        rm -rf "$APP_DIR"
        print_success "Application files removed"
    else
        print_info "Application directory not found (already removed)"
    fi
}

remove_database() {
    print_step "Removing MySQL database and user"
    
    if command -v mysql >/dev/null 2>&1; then
        prompt_db_root_password
        local MYSQL_ARGS="-u root"
        [ -n "${DB_ROOT_PASSWORD:-}" ] && MYSQL_ARGS="$MYSQL_ARGS -p${DB_ROOT_PASSWORD}"

        print_info "Dropping database: $DB_NAME"
        mysql $MYSQL_ARGS -e "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || {
            print_warning "Database removal failed (may not exist)"
        }
        
        print_info "Dropping user: $DB_USER"
        mysql $MYSQL_ARGS -e "DROP USER IF EXISTS '${DB_USER}'@'localhost';" 2>/dev/null || true
        mysql $MYSQL_ARGS -e "FLUSH PRIVILEGES;" 2>/dev/null || true
        
        print_success "Database and user removed"
    else
        print_info "MySQL not installed (skipping)"
    fi
}

remove_freeradius() {
    print_step "Removing FreeRADIUS"
    
    # Stop service
    systemctl stop freeradius 2>/dev/null || true
    systemctl disable freeradius 2>/dev/null || true
    
    # Remove packages (optional)
    read -p "Remove FreeRADIUS packages? [y/N]: " REMOVE_FREERADIUS </dev/tty
    if [[ "$REMOVE_FREERADIUS" =~ ^[Yy]$ ]]; then
        print_info "Removing FreeRADIUS packages..."
        apt-get purge -y freeradius freeradius-config freeradius-common freeradius-mysql freeradius-utils freeradius-rest 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
    fi
    
    # Remove configurations and runtime files
    print_info "Removing FreeRADIUS configurations..."
    rm -rf /etc/freeradius 2>/dev/null || true
    rm -rf /var/log/freeradius 2>/dev/null || true
    rm -rf /var/run/freeradius 2>/dev/null || true

    # Remove sudoers entry created by installer
    rm -f /etc/sudoers.d/${APP_USER}-freeradius
    print_info "Sudoers entry removed"
    
    print_success "FreeRADIUS removed"
}

remove_nginx_config() {
    print_step "Removing Nginx configuration"
    
    # Remove site configuration
    print_info "Removing Nginx site configuration..."
    rm -f /etc/nginx/sites-available/salfanet-radius
    rm -f /etc/nginx/sites-enabled/salfanet-radius

    # Remove self-signed SSL cert generated by installer
    rm -f /etc/ssl/certs/nginx-selfsigned.crt
    rm -f /etc/ssl/private/nginx-selfsigned.key
    print_info "Self-signed SSL cert removed"

    # Remove Let's Encrypt cert if it exists
    if [ -n "${VPS_DOMAIN:-}" ] && [ -d "/etc/letsencrypt/live/${VPS_DOMAIN}" ]; then
        certbot delete --cert-name "${VPS_DOMAIN}" --non-interactive 2>/dev/null || true
        print_info "Let's Encrypt cert removed for ${VPS_DOMAIN}"
    fi
    
    # Restore default site if it exists
    if [ -f "/etc/nginx/sites-available/default" ] && [ ! -L "/etc/nginx/sites-enabled/default" ]; then
        ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
    fi
    
    # Reload Nginx
    systemctl reload nginx 2>/dev/null || true
    
    print_success "Nginx configuration removed"
}

remove_user() {
    print_step "Removing user account"
    
    if id "$APP_USER" &>/dev/null; then
        # Check if this is a system user (ubuntu, root, etc.) - don't delete
        if [[ "$APP_USER" == "ubuntu" ]] || [[ "$APP_USER" == "root" ]] || [[ "$APP_USER" == "admin" ]] || id -u "$APP_USER" -lt 1000 2>/dev/null; then
            print_warning "User $APP_USER is a system user - skipping deletion"
            print_info "PM2 processes and app files have been removed, but user remains"
            return 0
        fi
        
        print_info "Removing user: $APP_USER"
        
        # Kill all user processes
        pkill -u $APP_USER 2>/dev/null || true
        sleep 2
        
        # Remove user and home directory
        userdel -r $APP_USER 2>/dev/null || {
            print_warning "User removal failed (may have active processes)"
            print_info "Trying force removal..."
            userdel -f $APP_USER 2>/dev/null || true
        }
        
        print_success "User removed"
    else
        print_info "User does not exist (already removed)"
    fi
}

remove_pm2() {
    print_step "Removing PM2"
    
    # Remove PM2 systemd startup service regardless of whether we remove PM2 pkg
    print_info "Removing PM2 systemd startup service..."
    pm2 unstartup systemd 2>/dev/null || true
    # Also remove any pm2-*.service files left behind
    rm -f /etc/systemd/system/pm2-*.service 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true

    read -p "Remove PM2 globally? [y/N]: " REMOVE_PM2 </dev/tty
    if [[ "$REMOVE_PM2" =~ ^[Yy]$ ]]; then
        print_info "Removing PM2..."
        npm uninstall -g pm2 2>/dev/null || true
        rm -rf ~/.pm2 2>/dev/null || true
        rm -rf /home/$APP_USER/.pm2 2>/dev/null || true
        print_success "PM2 removed"
    else
        print_info "PM2 package kept (startup service removed)"
    fi
}

remove_nodejs() {
    print_step "Removing Node.js"
    
    read -p "Remove Node.js? [y/N]: " REMOVE_NODEJS </dev/tty
    if [[ "$REMOVE_NODEJS" =~ ^[Yy]$ ]]; then
        print_info "Removing Node.js..."
        apt-get purge -y nodejs 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
        rm -rf /usr/lib/node_modules
        rm -rf ~/.npm
        print_success "Node.js removed"
    else
        print_info "Node.js kept (skipping)"
    fi
}

remove_mysql() {
    print_step "Removing MySQL"
    
    read -p "Remove MySQL completely? (DANGER: All databases will be lost) [y/N]: " REMOVE_MYSQL </dev/tty
    if [[ "$REMOVE_MYSQL" =~ ^[Yy]$ ]]; then
        print_warning "This will remove ALL MySQL databases!"
        read -p "Are you absolutely sure? Type 'YES' to confirm: " CONFIRM_MYSQL </dev/tty
        
        if [ "$CONFIRM_MYSQL" = "YES" ]; then
            print_info "Removing MySQL..."
            systemctl stop mysql 2>/dev/null || true
            apt-get purge -y mysql-server mysql-client mysql-common 2>/dev/null || true
            apt-get autoremove -y 2>/dev/null || true
            rm -rf /etc/mysql
            rm -rf /var/lib/mysql
            rm -rf /var/log/mysql
            print_success "MySQL removed"
        else
            print_info "MySQL removal cancelled"
        fi
    else
        print_info "MySQL kept (skipping)"
    fi
}

clean_firewall() {
    print_step "Cleaning firewall rules"
    
    read -p "Remove all application firewall rules? [Y/n]: " CLEAN_FIREWALL </dev/tty
    if [[ ! "$CLEAN_FIREWALL" =~ ^[Nn]$ ]]; then
        print_info "Removing UFW rules..."
        # RADIUS ports
        ufw delete allow 1812/udp 2>/dev/null || true
        ufw delete allow 1813/udp 2>/dev/null || true
        ufw delete allow 3799/udp 2>/dev/null || true
        # L2TP/IPSec ports (opened by install-freeradius.sh)
        ufw delete allow 500/udp  2>/dev/null || true
        ufw delete allow 4500/udp 2>/dev/null || true
        ufw delete allow 1701/udp 2>/dev/null || true
        # HTTP/HTTPS (opened by install-nginx.sh)
        ufw delete allow 80/tcp   2>/dev/null || true
        ufw delete allow 443/tcp  2>/dev/null || true
        print_success "Firewall rules removed"
    fi
}

clean_logs() {
    print_step "Cleaning logs"
    
    print_info "Removing application logs..."
    rm -rf /var/log/salfanet-vps-install.log
    rm -rf /var/log/freeradius
    rm -rf /var/log/nginx/salfanet-radius-*
    
    print_success "Logs cleaned"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    # Check root
    check_root
    
    # Show warning
    show_warning
    
    # Ask for backup
    if ask_backup; then
        backup_database
        backup_configs
        echo ""
        echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
        echo ""
    fi
    
    # Final confirmation
    ask_confirmation
    
    echo ""
    print_info "Starting removal process..."
    echo ""
    
    # Prompt for DB root password once (used by backup and remove_database)
    prompt_db_root_password

    # Execute removal steps
    stop_all_services
    remove_application
    remove_database
    remove_freeradius
    remove_nginx_config
    remove_user
    remove_pm2
    clean_firewall
    clean_logs
    
    # Optional removals
    echo ""
    print_info "Optional removals (can affect other applications):"
    echo ""
    remove_nodejs
    remove_mysql
    
    # Final summary
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    UNINSTALL COMPLETED                            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Summary:${NC}"
    echo "  ✓ PM2 processes stopped and removed"
    echo "  ✓ Application files deleted"
    echo "  ✓ Database and user removed"
    echo "  ✓ FreeRADIUS cleaned"
    echo "  ✓ Nginx configuration removed"
    echo "  ✓ User account deleted"
    echo "  ✓ Logs cleaned"
    echo ""
    
    if [ -d "$BACKUP_DIR" ]; then
        echo -e "${CYAN}Backup location:${NC}"
        echo "  $BACKUP_DIR"
        echo ""
        echo "To restore database:"
        echo "  mysql -u root -p $DB_NAME < $BACKUP_DIR/database.sql"
        echo ""
    fi
    
    echo -e "${CYAN}System is now clean and ready for fresh installation.${NC}"
    echo ""
    echo "To reinstall, run:"
    echo "  cd /root/SALFANET-RADIUS-main/vps-install"
    echo "  ./vps-installer.sh"
    echo ""
}

# Run main function
main "$@"
