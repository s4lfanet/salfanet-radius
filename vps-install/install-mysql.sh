#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - MySQL Module
# ============================================================================
# Step 3: Install & configure MySQL 8.0
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

MYSQL_SERVICE="mysql"

detect_mysql_service() {
    if systemctl list-unit-files 2>/dev/null | grep -q '^mysql\.service'; then
        MYSQL_SERVICE="mysql"
    elif systemctl list-unit-files 2>/dev/null | grep -q '^mariadb\.service'; then
        MYSQL_SERVICE="mariadb"
    else
        MYSQL_SERVICE="mysql"
    fi
    print_info "Using MySQL service: ${MYSQL_SERVICE}"
}

mysql_service_ctl() {
    local ACTION="$1"
    systemctl "$ACTION" "$MYSQL_SERVICE"
}

wait_mysql_ready() {
    local RETRIES=${1:-40}
    local DELAY=${2:-2}
    local i

    for ((i=1; i<=RETRIES; i++)); do
        if mysqladmin ping --silent >/dev/null 2>&1; then
            return 0
        fi
        sleep "$DELAY"
    done

    return 1
}

print_mysql_diagnostics() {
    print_warning "MySQL diagnostics (last 40 lines):"
    systemctl status "$MYSQL_SERVICE" --no-pager -l 2>/dev/null | tail -40 || true
    journalctl -u "$MYSQL_SERVICE" -n 60 --no-pager 2>/dev/null || true
}

ensure_mysql_running() {
    if systemctl is-active --quiet "$MYSQL_SERVICE"; then
        return 0
    fi

    print_warning "${MYSQL_SERVICE} is not active, attempting to start..."
    mysql_service_ctl start || true

    if ! systemctl is-active --quiet "$MYSQL_SERVICE"; then
        print_mysql_diagnostics
        return 1
    fi

    if ! wait_mysql_ready 30 2; then
        print_mysql_diagnostics
        return 1
    fi

    return 0
}

mysql_root_exec() {
    local SQL="$1"

    # Try password auth first
    if mysql -u root -p"${DB_ROOT_PASSWORD}" -e "$SQL" >/dev/null 2>&1; then
        return 0
    fi

    # Fallback to socket auth (fresh Ubuntu/Debian installs)
    if mysql -u root -e "$SQL" >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

safe_restart_mysql_with_fallback() {
    print_info "Restarting ${MYSQL_SERVICE} to apply config..."

    if mysql_service_ctl restart >/dev/null 2>&1 && ensure_mysql_running; then
        return 0
    fi

    print_warning "${MYSQL_SERVICE} failed after applying tuning config. Rolling back salfanet-perf.cnf..."
    if [ -f /etc/mysql/mysql.conf.d/salfanet-perf.cnf ]; then
        mv /etc/mysql/mysql.conf.d/salfanet-perf.cnf "/etc/mysql/mysql.conf.d/salfanet-perf.cnf.disabled.$(date +%s)" || true
    fi

    mysql_service_ctl restart >/dev/null 2>&1 || true
    ensure_mysql_running
}

# ============================================================================
# MYSQL INSTALLATION & CONFIGURATION
# ============================================================================

remove_old_mysql() {
    print_info "Removing old MySQL installation (if exists)..."
    
    systemctl stop mysql 2>/dev/null || true
    systemctl stop mariadb 2>/dev/null || true
    apt-get remove --purge -y mysql-server mysql-client mysql-common mysql-server-core-* mysql-client-core-* 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    apt-get autoclean 2>/dev/null || true
    rm -rf /etc/mysql /var/lib/mysql /var/log/mysql 2>/dev/null || true
}

install_mysql_server() {
    print_info "Installing fresh MySQL..."
    
    apt-get install -y mysql-server mysql-client || {
        print_error "Failed to install MySQL"
        return 1
    }
    
    detect_mysql_service

    mysql_service_ctl start || {
        print_error "Failed to start ${MYSQL_SERVICE} service"
        print_mysql_diagnostics
        return 1
    }

    mysql_service_ctl enable || true

    ensure_mysql_running || {
        print_error "${MYSQL_SERVICE} is not running after installation"
        return 1
    }
}

secure_mysql() {
    print_info "Configuring MySQL security..."

    ensure_mysql_running || return 1
    
    # Set root password
    mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';" 2>/dev/null || true
    mysql -u root -p"${DB_ROOT_PASSWORD}" -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';" 2>/dev/null || true
    
    # Secure installation
    mysql_root_exec "DELETE FROM mysql.user WHERE User='';" || true
    mysql_root_exec "DROP DATABASE IF EXISTS test;" || true
    mysql_root_exec "DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';" || true
    mysql_root_exec "FLUSH PRIVILEGES;" || true
    
    print_success "MySQL secured"
}

create_database() {
    print_info "Creating database and user..."

    ensure_mysql_running || return 1

    if ! mysql_root_exec "SELECT 1;"; then
        print_error "Cannot access MySQL as root (password/socket auth failed)"
        return 1
    fi
    
    # Check if database already exists
    local DB_EXISTS
    DB_EXISTS=$(mysql -N -B -u root -p"${DB_ROOT_PASSWORD}" -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='${DB_NAME}';" 2>/dev/null || echo "0")
    if ! [[ "$DB_EXISTS" =~ ^[0-9]+$ ]]; then
        DB_EXISTS=0
    fi
    
    if [ "$DB_EXISTS" -eq "1" ]; then
        print_warning "Database ${DB_NAME} already exists!"
        echo ""
        read -p "Do you want to keep existing database? (y/n): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Creating backup of existing database..."
            local BACKUP_FILE="/root/salfanet_radius_backup_$(date +%Y%m%d_%H%M%S).sql"
            mysqldump -u root -p"${DB_ROOT_PASSWORD}" ${DB_NAME} > ${BACKUP_FILE} 2>/dev/null || true
            print_success "Database backed up to: ${BACKUP_FILE}"
            
            # Keep existing database, ensure user exists
            mysql -u root -p"${DB_ROOT_PASSWORD}" <<EOF 2>/dev/null || true
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
ALTER USER IF EXISTS '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
        else
            print_info "Dropping existing database and user..."
            mysql -u root -p"${DB_ROOT_PASSWORD}" <<EOF 2>/dev/null || true
DROP DATABASE IF EXISTS ${DB_NAME};
DROP USER IF EXISTS '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
            # Create fresh database
            mysql -u root -p"${DB_ROOT_PASSWORD}" <<EOF
CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
        fi
    else
        # Create fresh database and user
        print_info "Creating fresh database and user..."
        mysql -u root -p"${DB_ROOT_PASSWORD}" <<EOF
CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
    fi
    
    print_success "Database and user configured"
}

configure_mysql_timezone() {
    print_info "Setting MySQL timezone to Asia/Jakarta..."
    
    # Detect RAM to scale InnoDB buffer pool (use 25% of total RAM)
    local TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
    local BUFFER_POOL_MB=$((TOTAL_RAM_MB / 4))
    # Clamp: minimum 128M, maximum 2048M
    [ "$BUFFER_POOL_MB" -lt 128  ] && BUFFER_POOL_MB=128
    [ "$BUFFER_POOL_MB" -gt 2048 ] && BUFFER_POOL_MB=2048
    # Number of buffer pool instances (1 per 512MB, min 1, max 8)
    local POOL_INSTANCES=$(( BUFFER_POOL_MB / 512 ))
    [ "$POOL_INSTANCES" -lt 1 ] && POOL_INSTANCES=1
    [ "$POOL_INSTANCES" -gt 8 ] && POOL_INSTANCES=8
    # max_connections: scale with RAM (50 per GB, min 50, max 300)
    local MAX_CONN=$(( TOTAL_RAM_MB / 20 ))
    [ "$MAX_CONN" -lt 50  ] && MAX_CONN=50
    [ "$MAX_CONN" -gt 300 ] && MAX_CONN=300

    print_info "MySQL tuning: RAM=${TOTAL_RAM_MB}MB, buffer_pool=${BUFFER_POOL_MB}M (${POOL_INSTANCES} instances), max_conn=${MAX_CONN}"

    # Create MySQL config for timezone + performance
    cat > /etc/mysql/mysql.conf.d/salfanet-perf.cnf <<EOF
[mysqld]
# ============================================================
# SALFANET RADIUS - MySQL Tuning (auto-generated by installer)
# RAM: ${TOTAL_RAM_MB}MB
# ============================================================

# Timezone (WIB = UTC+7)
default-time-zone = '+07:00'
log_bin_trust_function_creators = 1

# Character set
character-set-server  = utf8mb4
collation-server      = utf8mb4_unicode_ci

# Connection & packet
max_allowed_packet    = 64M
skip-name-resolve     = ON
wait_timeout          = 28800
interactive_timeout   = 28800
max_connections       = ${MAX_CONN}
thread_cache_size     = 16

# InnoDB performance — scaled to ${TOTAL_RAM_MB}MB RAM
innodb_buffer_pool_size       = ${BUFFER_POOL_MB}M
innodb_buffer_pool_instances  = ${POOL_INSTANCES}
innodb_log_buffer_size        = 16M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method           = O_DIRECT
innodb_read_io_threads        = 4
innodb_write_io_threads       = 4

# Query optimization
tmp_table_size    = 64M
max_heap_table_size = 64M
query_cache_type  = 0
join_buffer_size  = 2M
sort_buffer_size  = 2M

# Slow query log (queries > 2s go to slow log)
slow_query_log         = 1
slow_query_log_file    = /var/log/mysql/slow.log
long_query_time        = 2
log_queries_not_using_indexes = 0
EOF
    
    # Set timezone immediately (live, without restart)
    # Restart MySQL to apply full config, with rollback if config breaks startup
    if ! safe_restart_mysql_with_fallback; then
        print_error "MySQL failed to restart even after fallback"
        return 1
    fi

    mysql_root_exec "SET GLOBAL time_zone = '+07:00';" || true
    mysql_root_exec "SET GLOBAL log_bin_trust_function_creators = 1;" || true
    
    # Verify timezone
    local MYSQL_TZ
    MYSQL_TZ=$(mysql -u root -p"${DB_ROOT_PASSWORD}" -N -e "SELECT @@global.time_zone;" 2>/dev/null || echo "unknown")
    print_success "MySQL timezone: ${MYSQL_TZ} | buffer_pool: ${BUFFER_POOL_MB}M | max_conn: ${MAX_CONN}"
}

test_mysql_connection() {
    print_info "Testing database connection..."

    ensure_mysql_running || return 1
    
    if mysql -u "${DB_USER}" -p"${DB_PASSWORD}" -e "USE ${DB_NAME}; SELECT 1;" > /dev/null 2>&1; then
        print_success "Database connection test successful"
        return 0
    else
        print_error "Database connection test failed!"
        return 1
    fi
}

install_mysql() {
    print_step "Step 3: Installing MySQL 8.0"
    
    remove_old_mysql
    install_mysql_server
    secure_mysql
    create_database
    configure_mysql_timezone
    test_mysql_connection
    
    print_success "MySQL installation and configuration completed"
    
    # Save credentials
    save_install_info "DB_NAME" "$DB_NAME"
    save_install_info "DB_USER" "$DB_USER"
    save_install_info "DB_PASSWORD" "$DB_PASSWORD"
    save_install_info "DB_ROOT_PASSWORD" "$DB_ROOT_PASSWORD"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_mysql
fi
