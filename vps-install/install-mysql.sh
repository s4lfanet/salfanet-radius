#!/bin/bash
# ============================================================================
# SALFANET RADIUS — MySQL/MariaDB Installation
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_mysql() {
    print_step "MySQL Server"

    if command_exists mysql; then
        print_info "MySQL already installed — skipping"
    else
        export DEBIAN_FRONTEND=noninteractive
        apt-get install -yqq mysql-server mysql-client
    fi

    # Start MySQL
    systemctl enable mysql 2>/dev/null || systemctl enable mysqld 2>/dev/null || true
    systemctl start mysql 2>/dev/null || systemctl start mysqld 2>/dev/null || true
    wait_for_mysql

    # Set root password (if empty)
    mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';" 2>/dev/null || true
    mysql -u root -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1 || true

    # Create database + user
    mysql -u root -p"$DB_ROOT_PASSWORD" <<EOF
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF

    print_success "Database '$DB_NAME' and user '$DB_USER' ready"
}
