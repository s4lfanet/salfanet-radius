#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - FreeRADIUS Module
# ============================================================================
# Step 5: Install & configure FreeRADIUS 3.x with MySQL
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

# Detect FreeRADIUS config directory
detect_freeradius_path() {
    if [ -d "/etc/freeradius/3.0" ]; then
        echo "/etc/freeradius/3.0"
    elif [ -d "/etc/freeradius" ]; then
        echo "/etc/freeradius"
    else
        echo "/etc/freeradius/3.0"
    fi
}

# Function to remove BOM (Byte Order Mark) from files
remove_bom() {
    local file="$1"
    if [ -f "$file" ]; then
        # Remove UTF-8 BOM, UTF-16 LE/BE BOMs
        sed -i '1s/^\xEF\xBB\xBF//' "$file" 2>/dev/null || true
        sed -i '1s/^\xFF\xFE//' "$file" 2>/dev/null || true
        sed -i '1s/^\xFE\xFF//' "$file" 2>/dev/null || true
        tr -d '\0' < "$file" > "$file.tmp" && mv "$file.tmp" "$file" 2>/dev/null || true
    fi
}

# ============================================================================
# FREERADIUS INSTALLATION
# ============================================================================

remove_old_freeradius() {
    print_info "Removing old FreeRADIUS installation (if exists)..."
    
    systemctl stop freeradius 2>/dev/null || true
    killall -9 freeradius 2>/dev/null || true
    
    # IMPORTANT: include freeradius-config in purge so dpkg knows to re-create
    # config files on next install. Without this, freeradius-config stays
    # "installed" (but files deleted by rm -rf) and apt-get install skips
    # re-extracting its config files.
    apt-get remove --purge -y freeradius freeradius-config freeradius-mysql freeradius-utils freeradius-common freeradius-rest 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    apt-get autoclean 2>/dev/null || true
    rm -rf /etc/freeradius /var/log/freeradius /var/run/freeradius 2>/dev/null || true
}

install_freeradius_packages() {
    print_info "Installing fresh FreeRADIUS..."
    
    apt-get install -y freeradius freeradius-config freeradius-mysql freeradius-utils freeradius-rest || {
        print_error "Failed to install FreeRADIUS packages"
        return 1
    }
    
    # Detect FreeRADIUS config directory after installation
    export FR_CONFIG_DIR=$(detect_freeradius_path)
    print_info "FreeRADIUS config directory: $FR_CONFIG_DIR"
    
    # Verify critical config files exist; if not, extract from deb directly.
    # This is needed when dpkg skips file extraction for already-tracked conffiles.
    if [ ! -f "${FR_CONFIG_DIR}/radiusd.conf" ]; then
        print_warning "radiusd.conf missing after install — extracting from deb package..."
        local TMP_EXTRACT="/tmp/fr-deb-extract"
        rm -rf "${TMP_EXTRACT}" && mkdir -p "${TMP_EXTRACT}"
        if apt-get download freeradius-config 2>/tmp/apt-dl.log && \
           dpkg-deb -x /tmp/freeradius-config_*.deb "${TMP_EXTRACT}" 2>&1; then
            # Copy all config files without overwriting existing ones
            cp -r "${TMP_EXTRACT}/etc/freeradius/3.0/." "${FR_CONFIG_DIR}/"
            print_success "FreeRADIUS config files extracted from deb"
        else
            print_error "Failed to extract freeradius-config deb!"
            cat /tmp/apt-dl.log
            return 1
        fi
        rm -rf "${TMP_EXTRACT}" /tmp/freeradius-config_*.deb 2>/dev/null || true
    fi
    
    print_success "FreeRADIUS packages installed"
}

restore_from_backup() {
    local FR_BACKUP_DIR="${APP_DIR}/freeradius-config"
    
    if [ ! -d "$FR_BACKUP_DIR" ]; then
        return 1
    fi
    
    if [ ! -f "$FR_BACKUP_DIR/mods-available/sql" ] && [ ! -f "$FR_BACKUP_DIR/mods-enabled/sql" ]; then
        return 1
    fi
    
    print_info "Found FreeRADIUS backup configs in project..."
    print_info "Restoring configuration from backup..."
    
    # Restore SQL module
    if [ -f "$FR_BACKUP_DIR/mods-available/sql" ]; then
        cp "$FR_BACKUP_DIR/mods-available/sql" ${FR_CONFIG_DIR}/mods-available/sql
        remove_bom ${FR_CONFIG_DIR}/mods-available/sql
        sed -i "s/login = .*/login = \"${DB_USER}\"/" ${FR_CONFIG_DIR}/mods-available/sql
        sed -i "s/password = .*/password = \"${DB_PASSWORD}\"/" ${FR_CONFIG_DIR}/mods-available/sql
        sed -i "s/radius_db = .*/radius_db = \"${DB_NAME}\"/" ${FR_CONFIG_DIR}/mods-available/sql
        # IMPORTANT: mods-enabled/sql must be a STANDALONE FILE (not symlink) on this VPS.
        # Copy the modified mods-available/sql directly instead of creating a symlink.
        rm -f ${FR_CONFIG_DIR}/mods-enabled/sql
        cp ${FR_CONFIG_DIR}/mods-available/sql ${FR_CONFIG_DIR}/mods-enabled/sql
        print_success "SQL module restored (standalone file, not symlink)"
    fi
    
    # Restore sites-enabled/default
    # IMPORTANT: On this VPS, sites-enabled/default is a STANDALONE FILE (not a symlink).
    # Deploy directly from freeradius-config/sites-enabled/default (the authoritative copy).
    # Deploying only to sites-available/ has NO effect because sites-enabled/ is not a symlink.
    if [ -f "$FR_BACKUP_DIR/sites-enabled/default" ]; then
        cp "$FR_BACKUP_DIR/sites-enabled/default" ${FR_CONFIG_DIR}/sites-enabled/default
        remove_bom ${FR_CONFIG_DIR}/sites-enabled/default
        # Also update sites-available as a reference copy (not used by FreeRADIUS directly)
        cp ${FR_CONFIG_DIR}/sites-enabled/default ${FR_CONFIG_DIR}/sites-available/default
        print_success "Default site restored (standalone file, not symlink)"
    elif [ -f "$FR_BACKUP_DIR/sites-available/default" ]; then
        # Fallback: use sites-available if sites-enabled not present in backup
        cp "$FR_BACKUP_DIR/sites-available/default" ${FR_CONFIG_DIR}/sites-enabled/default
        remove_bom ${FR_CONFIG_DIR}/sites-enabled/default
        cp ${FR_CONFIG_DIR}/sites-enabled/default ${FR_CONFIG_DIR}/sites-available/default
        print_success "Default site restored from sites-available fallback (standalone file)"
    fi
    
    # Restore clients.conf
    if [ -f "$FR_BACKUP_DIR/clients.conf" ]; then
        cp "$FR_BACKUP_DIR/clients.conf" ${FR_CONFIG_DIR}/clients.conf
        remove_bom ${FR_CONFIG_DIR}/clients.conf
        print_success "Clients config restored"
    fi
    
    # Restore policy.d/filter for PPPoE support
    if [ -f "$FR_BACKUP_DIR/policy.d/filter" ]; then
        cp "$FR_BACKUP_DIR/policy.d/filter" ${FR_CONFIG_DIR}/policy.d/filter
        remove_bom ${FR_CONFIG_DIR}/policy.d/filter
        print_success "Policy filter restored (PPPoE realm support enabled)"
    fi

    # Restore REST module (for real-time Redis online-user accounting)
    if [ -f "$FR_BACKUP_DIR/mods-available/rest" ]; then
        cp "$FR_BACKUP_DIR/mods-available/rest" ${FR_CONFIG_DIR}/mods-available/rest
        remove_bom ${FR_CONFIG_DIR}/mods-available/rest
        # Update connect_uri to local app
        sed -i 's|connect_uri = .*|connect_uri = "http://localhost:3000"|' ${FR_CONFIG_DIR}/mods-available/rest
        rm -f ${FR_CONFIG_DIR}/mods-enabled/rest
        ln -sf ${FR_CONFIG_DIR}/mods-available/rest ${FR_CONFIG_DIR}/mods-enabled/rest
        print_success "REST module restored (real-time accounting → Redis)"
    fi

    # Enable CoA site (Disconnect-Request / CoA-Request support)
    if [ -f "$FR_BACKUP_DIR/sites-available/coa" ]; then
        cp "$FR_BACKUP_DIR/sites-available/coa" ${FR_CONFIG_DIR}/sites-available/coa
        remove_bom ${FR_CONFIG_DIR}/sites-available/coa
        rm -f ${FR_CONFIG_DIR}/sites-enabled/coa
        ln -sf ${FR_CONFIG_DIR}/sites-available/coa ${FR_CONFIG_DIR}/sites-enabled/coa
        print_success "CoA site enabled (port 3799/UDP)"
    fi

    return 0
}

configure_sql_module() {
    print_info "Configuring FreeRADIUS SQL module..."
    
    cat > ${FR_CONFIG_DIR}/mods-available/sql <<'EOF'
sql {
    driver = "rlm_sql_mysql"
    dialect = "mysql"

    server = "localhost"
    port = 3306
    login = "DB_USER_PLACEHOLDER"
    password = "DB_PASSWORD_PLACEHOLDER"

    radius_db = "DB_NAME_PLACEHOLDER"

    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
    authcheck_table = "radcheck"
    groupcheck_table = "radgroupcheck"
    authreply_table = "radreply"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"

    group_attribute = "SQL-Group"

    # Read clients from database
    # Set to 'no' - we use clients.d/nas-from-db.conf instead (auto-generated by app)
    read_clients = no
    client_table = "nas"

    # Connection pool
    pool {
        start = 5
        min = 4
        max = 10
        spare = 3
        uses = 0
        retry_delay = 30
        lifetime = 0
        idle_timeout = 60
    }

    # Query configuration
    $INCLUDE ${modconfdir}/${.:name}/main/${dialect}/queries.conf
}
EOF

    # Replace placeholders
    sed -i "s/DB_USER_PLACEHOLDER/${DB_USER}/" ${FR_CONFIG_DIR}/mods-available/sql
    sed -i "s/DB_PASSWORD_PLACEHOLDER/${DB_PASSWORD}/" ${FR_CONFIG_DIR}/mods-available/sql
    sed -i "s/DB_NAME_PLACEHOLDER/${DB_NAME}/" ${FR_CONFIG_DIR}/mods-available/sql
    
    print_success "SQL module configured"
}

configure_rest_module() {
    print_info "Configuring FreeRADIUS REST module for API integration..."
    
    cat > ${FR_CONFIG_DIR}/mods-available/rest <<'EOF'
rest {
    tls {
        check_cert = no
        check_cert_cn = no
    }

    # Base URI of the Next.js app
    connect_uri = "http://localhost:3000"

    # Authorize: check user/voucher status BEFORE authentication
    # Returns Auth-Type=Reject + Reply-Message if expired/blocked
    authorize {
        uri = "${..connect_uri}/api/radius/authorize"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"nasIp\": \"%{NAS-IP-Address}\", \"nasPort\": \"%{NAS-Port}\", \"calledStationId\": \"%{Called-Station-Id}\" }"
        tls = ${..tls}
    }

    # Post-Auth: set firstLoginAt, expiresAt, create billing transactions
    post-auth {
        uri = "${..connect_uri}/api/radius/post-auth"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"reply\": \"Access-Accept\", \"nasIp\": \"%{NAS-IP-Address}\" }"
        tls = ${..tls}
    }

    # Accounting: update Redis online-users real-time (Start/Stop/Interim)
    accounting {
        uri = "${..connect_uri}/api/radius/accounting"
        method = "post"
        body = "json"
        data = "{ \"username\": \"%{User-Name}\", \"statusType\": \"%{Acct-Status-Type}\", \"sessionId\": \"%{Acct-Session-Id}\", \"nasIp\": \"%{NAS-IP-Address}\", \"framedIp\": \"%{Framed-IP-Address}\", \"callingStationId\": \"%{Calling-Station-Id}\", \"sessionTime\": \"%{Acct-Session-Time}\", \"inputOctets\": \"%{Acct-Input-Octets}\", \"outputOctets\": \"%{Acct-Output-Octets}\" }"
        tls = ${..tls}
    }

    # IMPORTANT: start=0 and min=0 prevent FreeRADIUS from pre-creating HTTP
    # connections at startup. The Next.js app is not running yet at this point;
    # connections will be made lazily on the first real RADIUS request.
    pool {
        start = 0
        min = 0
        max = 10
        spare = 3
        uses = 0
        retry_delay = 30
        lifetime = 0
        idle_timeout = 60
    }
}
EOF

    print_success "REST module configured"
}

enable_modules() {
    print_info "Enabling FreeRADIUS modules..."
    
    # Remove old symlinks
    rm -f ${FR_CONFIG_DIR}/mods-enabled/sql*
    rm -f ${FR_CONFIG_DIR}/mods-enabled/rest
    
    # Enable SQL module
    ln -sf ${FR_CONFIG_DIR}/mods-available/sql ${FR_CONFIG_DIR}/mods-enabled/sql
    
    # Enable REST module symlink so FreeRADIUS can load it.
    # The module itself uses '-rest' (non-fatal) in sites/default so that
    # if the Next.js app is not running yet, accounting still succeeds.
    ln -sf ${FR_CONFIG_DIR}/mods-available/rest ${FR_CONFIG_DIR}/mods-enabled/rest
    
    print_success "Modules enabled (SQL + REST)"
}

configure_clients_d() {
    print_info "Setting up clients.d directory for dynamic NAS management..."

    # Create clients.d directory
    mkdir -p ${FR_CONFIG_DIR}/clients.d
    chown freerad:freerad ${FR_CONFIG_DIR}/clients.d 2>/dev/null || true
    chmod 750 ${FR_CONFIG_DIR}/clients.d 2>/dev/null || true

    # Create empty nas-from-db.conf (populated by app on first NAS change)
    if [ ! -f "${FR_CONFIG_DIR}/clients.d/nas-from-db.conf" ]; then
        cat > ${FR_CONFIG_DIR}/clients.d/nas-from-db.conf <<'EOF'
# Auto-generated by salfanet-radius - DO NOT EDIT MANUALLY
# Regenerate with: systemctl restart freeradius (triggered by app on NAS change)
EOF
    fi

    # Ensure $INCLUDE clients.d/ is in clients.conf
    if ! grep -q 'INCLUDE clients.d/' ${FR_CONFIG_DIR}/clients.conf; then
        echo '' >> ${FR_CONFIG_DIR}/clients.conf
        echo '$INCLUDE clients.d/' >> ${FR_CONFIG_DIR}/clients.conf
        print_success "Added \$INCLUDE clients.d/ to clients.conf"
    else
        print_success "clients.d/ already included in clients.conf"
    fi

    # Ensure require_message_authenticator on localhost clients
    for BLOCK in 'localhost' 'localhost_ipv6'; do
        if grep -q "client ${BLOCK}" ${FR_CONFIG_DIR}/clients.conf; then
            if ! grep -A 20 "client ${BLOCK} {" ${FR_CONFIG_DIR}/clients.conf | grep -q 'require_message_authenticator'; then
                python3 - <<PYEOF
import re
with open('${FR_CONFIG_DIR}/clients.conf', 'r') as f:
    cc = f.read()
block_name = '${BLOCK}'
marker = 'client ' + block_name + ' {'
if marker in cc:
    idx = cc.index(marker) + len(marker)
    depth, pos = 1, idx
    while pos < len(cc) and depth > 0:
        if cc[pos] == '{': depth += 1
        elif cc[pos] == '}': depth -= 1
        pos += 1
    block = cc[idx:pos-1]
    if 'require_message_authenticator' not in block:
        new_block = block.rstrip() + '\nrequire_message_authenticator = no\n'
        cc = cc[:idx] + new_block + cc[pos-1:]
        with open('${FR_CONFIG_DIR}/clients.conf', 'w') as f:
            f.write(cc)
        print('Fixed ' + block_name)
PYEOF
            fi
        fi
    done

    print_success "clients.d configured"
}

configure_openssl_mschapv2() {
    # Ubuntu 22.04+ / OpenSSL 3.x disables legacy algorithms (MD4) by default.
    # MS-CHAPv2 (used by MikroTik PPPoE) requires MD4 for NT hash computation.
    # Without this patch, FreeRADIUS mschap module links against libssl but
    # EVP_md4() returns NULL because the legacy provider is not loaded, causing
    # all MS-CHAPv2/MS-CHAP auth attempts to fail with "unknown message digest".
    print_info "Configuring OpenSSL legacy provider for MS-CHAPv2 / MD4 support..."

    local OPENSSL_CNF="/etc/ssl/openssl.cnf"
    if [ ! -f "$OPENSSL_CNF" ]; then
        print_warning "OpenSSL config not found at $OPENSSL_CNF — skipping (non-critical for non-Ubuntu installs)"
        return 0
    fi

    if grep -q 'legacy_sect' "$OPENSSL_CNF"; then
        print_success "OpenSSL legacy provider already enabled"
        return 0
    fi

    # Backup original
    cp "${OPENSSL_CNF}" "${OPENSSL_CNF}.bak.$(date +%Y%m%d%H%M%S)"

    python3 - "${OPENSSL_CNF}" << 'PYEOF'
import sys

cnf = sys.argv[1]
with open(cnf, 'r') as f:
    content = f.read()

# 1. Add openssl_conf directive at the top (before any section header)
if 'openssl_conf = openssl_init' not in content:
    content = 'openssl_conf = openssl_init\n\n' + content

# 2. Append provider sections if not present
if '[openssl_init]' not in content:
    content += """
[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect
legacy = legacy_sect

[default_sect]
activate = 1

[legacy_sect]
activate = 1
"""

with open(cnf, 'w') as f:
    f.write(content)

print("Patched: OpenSSL legacy provider enabled (MD4/MS-CHAPv2 support)")
PYEOF

    print_success "OpenSSL legacy provider configured (MD4 enabled for MS-CHAPv2)"
}

configure_pppoe_support() {
    print_info "Configuring PPPoE realm support..."
    
    # Disable filter_username to allow username@realm format
    if [ -f "${FR_CONFIG_DIR}/sites-enabled/default" ]; then
        if grep -q "^\s*filter_username" ${FR_CONFIG_DIR}/sites-enabled/default; then
            sed -i 's/^\(\s*\)filter_username/\1#filter_username # DISABLED for PPPoE realm support/' ${FR_CONFIG_DIR}/sites-enabled/default
            print_success "PPPoE realm support enabled"
        fi
        # Ensure expiration module is called in authorize section (for voucher expiry)
        if ! grep -q '\bexpiration\b' ${FR_CONFIG_DIR}/sites-enabled/default; then
            sed -i '/^\s*sql/{n; /^\s*pap/{s/\(\s*\)pap/\1expiration\n\1pap/}}' ${FR_CONFIG_DIR}/sites-enabled/default 2>/dev/null || true
            print_success "expiration module added to authorize section"
        else
            print_success "expiration already in authorize section"
        fi
    fi
    
    # Modify policy.d/filter
    if [ -f "${FR_CONFIG_DIR}/policy.d/filter" ]; then
        sed -i '/must have at least 1 string-dot-string/,/reject$/{s/^/#/}' ${FR_CONFIG_DIR}/policy.d/filter 2>/dev/null || true
        print_success "Policy filter modified for PPPoE"
    fi
}

configure_firewall() {
    if [ "${SKIP_UFW:-false}" = "true" ]; then
        print_info "UFW firewall dilewati (${DEPLOY_ENV_LABEL:-LXC/Container})"
        print_info "Buka port berikut di Proxmox Datacenter Firewall:"
        print_info "  1812/udp - RADIUS Authentication"
        print_info "  1813/udp - RADIUS Accounting"
        print_info "  3799/udp - RADIUS CoA (Change of Authorization)"
        print_info "  500/udp  - IPSec IKE (L2TP/IPSec VPN)"
        print_info "  4500/udp - IPSec NAT-T (L2TP/IPSec VPN)"
        print_info "  1701/udp - L2TP Tunnel (L2TP/IPSec VPN)"
        return 0
    fi

    print_info "Configuring firewall for FreeRADIUS and L2TP/IPSec..."
    ufw allow 22/tcp   comment 'SSH' 2>/dev/null || true
    ufw allow 1812/udp comment 'RADIUS Authentication' 2>/dev/null || true
    ufw allow 1813/udp comment 'RADIUS Accounting' 2>/dev/null || true
    ufw allow 3799/udp comment 'RADIUS CoA' 2>/dev/null || true
    # L2TP/IPSec ports — required for MikroTik CHR to connect as L2TP client
    ufw allow 500/udp  comment 'IPSec IKE' 2>/dev/null || true
    ufw allow 4500/udp comment 'IPSec NAT-T' 2>/dev/null || true
    ufw allow 1701/udp comment 'L2TP Tunnel' 2>/dev/null || true
    print_success "Firewall configured (RADIUS + L2TP/IPSec ports opened)"
}

fix_freeradius_permissions() {
    print_info "Fixing FreeRADIUS file ownership and permissions..."

    # Detect the freeradius runtime user (usually 'freerad' on Debian/Ubuntu)
    local FR_USER="freerad"
    local FR_GROUP="freerad"
    if ! id "$FR_USER" &>/dev/null; then
        # Fallback: some distros use 'freeradius'
        FR_USER="freeradius"
        FR_GROUP="freeradius"
    fi

    # All files written by the installer (root) must be readable by freerad.
    # Without this, the daemon starts, fails to open config files, exits 1
    # with NO diagnostic message in journalctl.
    chown -R ${FR_USER}:${FR_GROUP} "${FR_CONFIG_DIR}" 2>/dev/null || true

    # Config dir itself needs execute bit for traversal
    chmod 750 "${FR_CONFIG_DIR}" 2>/dev/null || true

    # mods-available / sites-available files
    find "${FR_CONFIG_DIR}" -type f -exec chmod 640 {} \; 2>/dev/null || true
    find "${FR_CONFIG_DIR}" -type d -exec chmod 750 {} \; 2>/dev/null || true

    # Ensure run directory exists with correct ownership
    # (systemd tmpfiles should create this, but be explicit)
    mkdir -p /var/run/freeradius
    chown ${FR_USER}:${FR_GROUP} /var/run/freeradius
    chmod 750 /var/run/freeradius

    # Log directory
    mkdir -p /var/log/freeradius
    chown ${FR_USER}:${FR_GROUP} /var/log/freeradius
    chmod 750 /var/log/freeradius

    print_success "FreeRADIUS permissions fixed (owner: ${FR_USER}:${FR_GROUP})"
}

start_freeradius() {
    print_info "Starting FreeRADIUS service..."
    
    # Stop existing service first
    systemctl stop freeradius 2>/dev/null || true
    killall -9 freeradius 2>/dev/null || true
    sleep 2

    # Fix permissions BEFORE config test and start
    # (files written by installer as root must be readable by 'freerad' user)
    fix_freeradius_permissions
    
    # Test configuration first (run as freerad user for accurate result)
    print_info "Testing FreeRADIUS configuration..."
    if freeradius -CX 2>&1 | tee /tmp/freeradius-test.log | grep -q "Configuration appears to be OK"; then
        print_success "FreeRADIUS configuration is valid"
    else
        print_error "FreeRADIUS configuration has errors!"
        echo "========================================"
        tail -50 /tmp/freeradius-test.log
        echo "========================================"
        print_info "Common fixes:"
        echo "  1. Check SQL module: ${FR_CONFIG_DIR}/mods-enabled/sql"
        echo "  2. Check clients.conf: ${FR_CONFIG_DIR}/clients.conf"
        echo "  3. Verify MySQL connection"
        echo "  4. Run debug: freeradius -X"
        return 1
    fi
    
    # Enable and start service
    systemctl enable freeradius
    systemctl start freeradius
    
    # Wait for service — if it fails, show journalctl for direct diagnosis
    if ! wait_for_service "freeradius" 15; then
        print_error "FreeRADIUS failed to start! Last 40 lines from journalctl:"
        echo "========================================"
        journalctl -xeu freeradius.service --no-pager -n 40 2>/dev/null || true
        echo "========================================"
        print_info "Manual debug: freeradius -X"
        return 1
    fi
}

test_freeradius() {
    print_info "Testing FreeRADIUS installation..."
    
    # Test radtest (will fail without user, but confirms RADIUS is running)
    if radtest test test localhost 0 testing123 2>&1 | grep -q "Received Access-Reject"; then
        print_success "FreeRADIUS is responding to requests"
    elif systemctl is-active --quiet freeradius; then
        print_success "FreeRADIUS is running"
    else
        print_error "FreeRADIUS may not be running correctly"
        return 1
    fi
}

configure_sudoers() {
    print_info "Configuring sudoers for FreeRADIUS control..."

    # Guard: skip if APP_USER is empty, root, or user doesn't exist yet
    if [ -z "${APP_USER:-}" ] || [ "${APP_USER}" = "root" ]; then
        print_warning "APP_USER not set or is root — skipping sudoers (non-critical)"
        return 0
    fi
    
    # Detect real systemctl path (Ubuntu 24.04 uses /usr/bin, older uses /bin)
    local SYSTEMCTL_PATH
    SYSTEMCTL_PATH=$(command -v systemctl 2>/dev/null || echo "/usr/bin/systemctl")
    # Resolve symlinks so visudo gets the real binary path
    SYSTEMCTL_PATH=$(readlink -f "$SYSTEMCTL_PATH" 2>/dev/null || echo "$SYSTEMCTL_PATH")
    print_info "systemctl path: $SYSTEMCTL_PATH"

    local SUDOERS_FILE="/etc/sudoers.d/${APP_USER}-freeradius"
    
    # Allow app user to restart freeradius without password
    # This is needed for the health check cron job to restart freeradius if down
    cat > "$SUDOERS_FILE" <<EOF
# Allow ${APP_USER} user to control FreeRADIUS service
${APP_USER} ALL=(ALL) NOPASSWD: ${SYSTEMCTL_PATH} restart freeradius
${APP_USER} ALL=(ALL) NOPASSWD: ${SYSTEMCTL_PATH} start freeradius
${APP_USER} ALL=(ALL) NOPASSWD: ${SYSTEMCTL_PATH} stop freeradius
${APP_USER} ALL=(ALL) NOPASSWD: ${SYSTEMCTL_PATH} status freeradius
EOF
    
    # Must be root-owned and mode 0440 for sudo to accept it
    chown root:root "$SUDOERS_FILE"
    chmod 0440 "$SUDOERS_FILE"
    
    # Validate sudoers file
    if visudo -c -f "$SUDOERS_FILE" 2>/dev/null; then
        print_success "Sudoers configured for FreeRADIUS control"
    else
        print_warning "Sudoers validation failed, removing (non-critical)..."
        print_info "  visudo error: $(visudo -c -f "$SUDOERS_FILE" 2>&1 || true)"
        rm -f "$SUDOERS_FILE"
    fi
}

install_freeradius() {
    print_step "Step 5: Installing FreeRADIUS"
    
    remove_old_freeradius
    install_freeradius_packages
    
    # Try to restore from backup, if fails create fresh config
    if ! restore_from_backup; then
        print_info "No backup found, creating fresh configuration..."
        configure_sql_module
        configure_rest_module
    fi
    
    enable_modules
    configure_clients_d
    configure_pppoe_support
    configure_openssl_mschapv2
    configure_firewall
    configure_sudoers
    # Fix file ownership BEFORE starting FreeRADIUS.
    # All cp/cat/sed operations above ran as root, so files are root-owned.
    # FreeRADIUS daemon runs as 'freerad' and cannot read root-owned config files,
    # causing a silent exit-code=1 failure even when 'freeradius -CX' passes.
    fix_freeradius_permissions
    start_freeradius
    test_freeradius
    
    print_success "FreeRADIUS installation completed"
    
    echo ""
    print_info "FreeRADIUS Configuration:"
    echo "  Authentication Port: 1812/UDP"
    echo "  Accounting Port: 1813/UDP"
    echo "  CoA Port: 3799/UDP"
    echo "  SQL Module: Enabled (${DB_NAME})"
    echo "  REST API: Enabled (http://localhost:3000)"
    echo "  MS-CHAPv2: Enabled (OpenSSL legacy provider / MD4)"
    echo ""
    print_info "Debug mode: freeradius -X"
    print_info "Test auth: radtest username password localhost 0 testing123"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_freeradius
fi
