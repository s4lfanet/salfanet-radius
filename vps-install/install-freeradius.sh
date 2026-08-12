#!/bin/bash
# ============================================================================
# SALFANET RADIUS — FreeRADIUS Installation
# ============================================================================
# Installs FreeRADIUS 3.x + MySQL module + enables sqlippool/cui
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_freeradius() {
    print_step "FreeRADIUS 3.x"

    if command_exists freeradius; then
        print_info "FreeRADIUS already installed — skipping apt install"
    else
        export DEBIAN_FRONTEND=noninteractive
        apt-get install -yqq freeradius freeradius-mysql freeradius-rest freeradius-utils
    fi

    local FR_DIR="/etc/freeradius/3.0"

    # Enable sql module
    ln -sf "$FR_DIR/mods-available/sql" "$FR_DIR/mods-enabled/sql" 2>/dev/null || true

    # Configure sql module to use MySQL + our database
    cat > "$FR_DIR/mods-available/sql" <<SQLEOF
sql {
    driver = "rlm_sql_mysql"
    dialect = "mysql"
    server = "localhost"
    port = 3306
    login = "$DB_USER"
    password = "$DB_PASSWORD"
    radius_db = "$DB_NAME"

    # Table names (required by queries.conf)
    authcheck_table = "radcheck"
    authreply_table = "radreply"
    groupcheck_table = "radgroupcheck"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"

    read_clients = yes
    client_table = "nas"

    group_attribute = "SQL-Group"

    \$INCLUDE \${modconfdir}/sql/main/\${dialect}/queries.conf
}
SQLEOF
    ln -sf "$FR_DIR/mods-available/sql" "$FR_DIR/mods-enabled/sql"

    # Enable sqlippool + cui via repo installer
    if [ -f "$APP_DIR/deploy/freeradius/install-radius-modules.sh" ]; then
        print_info "Running FreeRADIUS module installer from repo..."
        bash "$APP_DIR/deploy/freeradius/install-radius-modules.sh" || {
            print_warn "FreeRADIUS module installer had issues — check output above"
        }
    else
        print_warn "deploy/freeradius/install-radius-modules.sh not found — skipping module setup"
    fi

    # Validate config
    if freeradius -Cx -lstdout 2>&1 | grep -q "Configuration appears to be OK"; then
        print_success "FreeRADIUS config validation passed"
    else
        print_warn "FreeRADIUS config validation had warnings — check 'freeradius -Cx'"
    fi

    systemctl enable freeradius
    systemctl restart freeradius

    print_success "FreeRADIUS installed and running"
}
