#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Application Setup Module
# ============================================================================
# Step 4: Setup application files, npm install, Prisma setup
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# APPLICATION SETUP
# ============================================================================

copy_application_files() {
    print_info "Creating application directory..."
    mkdir -p ${APP_DIR}

    # --- Check if already installed via git clone (installer run from cloned repo) ---
    # Go up two levels from vps-install/ to reach the monorepo root
    # (vps-install/ is inside frontend/, which is inside the monorepo root)
    local SCRIPT_SOURCE_DIR
    SCRIPT_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

    # Priority order of source locations:
    #   1. Installer was run from inside a cloned repo (detect by pnpm-workspace.yaml or package.json at monorepo root)
    #   2. /root/salfanet-radius  (git clone default location)
    #   3. /root/SALFANET-RADIUS-main  (GitHub ZIP extraction)
    #   4. Current working directory
    local SOURCE_DIR=""

    for candidate in "$SCRIPT_SOURCE_DIR" "/root/salfanet-radius" "/root/SALFANET-RADIUS-main" "$(pwd)"; do
        # Prefer monorepo root (has pnpm-workspace.yaml or backend/ directory)
        if [ -f "$candidate/pnpm-workspace.yaml" ] || { [ -f "$candidate/package.json" ] && [ -d "$candidate/backend" ]; }; then
            SOURCE_DIR="$candidate"
            break
        fi
    done

    # Fallback: any directory with package.json
    if [ -z "$SOURCE_DIR" ]; then
        for candidate in "$SCRIPT_SOURCE_DIR" "/root/salfanet-radius" "/root/SALFANET-RADIUS-main" "$(pwd)"; do
            if [ -f "$candidate/package.json" ]; then
                SOURCE_DIR="$candidate"
                break
            fi
        done
    fi

    if [ -z "$SOURCE_DIR" ]; then
        print_error "Source directory not found. Please clone the repo first:"
        print_error "  git clone https://github.com/YOUR_USERNAME/salfanet-radius.git /root/salfanet-radius"
        return 1
    fi

    # If APP_DIR is the same as SOURCE_DIR (ran installer from within app dir), skip copy
    if [ "$(realpath "$SOURCE_DIR")" = "$(realpath "$APP_DIR")" ]; then
        print_success "Source directory is the app directory — no copy needed"
        return 0
    fi

    print_info "From: $SOURCE_DIR"
    print_info "To: ${APP_DIR}"

    cp -r "$SOURCE_DIR"/. "${APP_DIR}/"

    if [ "$(realpath "$SOURCE_DIR")" != "$(realpath "$APP_DIR")" ]; then
        print_info "Source repo remains at: $SOURCE_DIR"
        print_info "Active application directory is: ${APP_DIR}"
        print_info "PM2/Nginx will use only: ${APP_DIR}"
    fi

    print_success "Application code copied successfully"
}

verify_critical_files() {
    print_info "Verifying critical files..."
    
    cd ${APP_DIR} || {
        print_error "Failed to change to ${APP_DIR}"
        return 1
    }
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found in ${APP_DIR}!"
        return 1
    fi
    
    # Check for schema.prisma in backend/ (monorepo) or root (legacy)
    if [ -f "backend/prisma/schema.prisma" ]; then
        print_success "Critical files verified (backend/prisma/schema.prisma)"
    elif [ -f "prisma/schema.prisma" ]; then
        print_success "Critical files verified (prisma/schema.prisma)"
    else
        print_error "prisma/schema.prisma not found in backend/ or root!"
        return 1
    fi
}

create_env_file() {
    print_info "Creating .env file..."
    
    # Generate NextAuth secret if not set
    if [ -z "$NEXTAUTH_SECRET" ]; then
        export NEXTAUTH_SECRET=$(generate_secret)
    fi

    # Generate Agent JWT secret if not set
    if [ -z "$AGENT_JWT_SECRET" ]; then
        export AGENT_JWT_SECRET=$(generate_secret)
    fi

    # Generate Encryption key if not set
    if [ -z "$ENCRYPTION_KEY" ]; then
        export ENCRYPTION_KEY=$(openssl rand -hex 16)
    fi

    # Generate CRON_SECRET for cron-runner ↔ backend API auth
    if [ -z "$CRON_SECRET" ]; then
        export CRON_SECRET=$(openssl rand -hex 32)
    fi
    
    # Get public IP if not set
    if [ -z "$VPS_IP" ]; then
        export VPS_IP=$(detect_ip_address)
    fi
    
    # Tentukan URL berdasarkan domain atau IP
    local APP_BASE_URL
    if [ -n "${VPS_DOMAIN:-}" ]; then
        APP_BASE_URL="https://${VPS_DOMAIN}"
    else
        APP_BASE_URL="http://${VPS_IP}"
    fi

    cat > ${APP_DIR}/.env <<EOF
# Database Configuration
DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/${DB_NAME}?connection_limit=10&pool_timeout=20"

# Timezone - CRITICAL for WIB handling
TZ="Asia/Jakarta"
NEXT_PUBLIC_TIMEZONE="Asia/Jakarta"

# App Configuration
NEXT_PUBLIC_APP_NAME="SALFANET RADIUS ISP"
NEXT_PUBLIC_APP_URL="${APP_BASE_URL}"

# NextAuth
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="${APP_BASE_URL}"

# RADIUS Server IP — used by setup-radius route to generate NAS config
# Set automatically to detected VPS/server IP during installation
RADIUS_SERVER_IP="${VPS_IP}"

# Agent Portal JWT
AGENT_JWT_SECRET="${AGENT_JWT_SECRET}"

# Encryption Key for sensitive data at rest (GenieACS password, VPN credentials)
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

# Cron Secret — shared between cron-runner and backend API for auth bypass
CRON_SECRET="${CRON_SECRET}"

# Node Environment
NODE_ENV="production"

# Redis Cache (Opsional - aktifkan dengan: bash vps-install/install-redis.sh)
# REDIS_URL=redis://127.0.0.1:6379

# GenieACS Configuration (optional - configure in admin panel)
# GENIEACS_URL="http://YOUR_GENIEACS_IP:7557"
# GENIEACS_USERNAME=""
# GENIEACS_PASSWORD=""
EOF

    chmod 600 ${APP_DIR}/.env
    print_success ".env file created"
    
    # Save to install info
    save_install_info "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET"
    save_install_info "AGENT_JWT_SECRET" "$AGENT_JWT_SECRET"
    save_install_info "ENCRYPTION_KEY" "$ENCRYPTION_KEY"
    save_install_info "CRON_SECRET" "$CRON_SECRET"
    save_install_info "VPS_IP" "$VPS_IP"
}

install_dependencies() {
    print_step "Installing Node.js dependencies (5-10 minutes)"
    
    cd ${APP_DIR} || return 1

    # Remove leftover node_modules from any previous failed install to avoid
    # permission errors on postinstall scripts (e.g. napi-postinstall Permission denied)
    if [ -d "node_modules" ]; then
        print_info "Cleaning previous node_modules..."
        rm -rf node_modules
    fi
    # Clear npm cache to avoid stale/corrupt entries from previous attempts
    npm cache clean --force 2>/dev/null || true
    
    print_info "Downloading packages from npm registry..."
    
    # Try pnpm first (monorepo workspace), fall back to npm
    if command -v pnpm &>/dev/null && [ -f "pnpm-workspace.yaml" ]; then
        print_info "Using pnpm (monorepo workspace detected)..."
        if ! pnpm install 2>&1 | tee /tmp/npm-install.log; then
            print_error "pnpm install failed!"
            echo ""
            echo "Last 20 lines of error:"
            tail -20 /tmp/npm-install.log
            return 1
        fi
    else
        print_info "Using npm (falling back from pnpm)..."
        if ! npm install --production=false 2>&1 | tee /tmp/npm-install.log; then
            print_error "npm install failed!"
            echo ""
            echo "Last 20 lines of error:"
            tail -20 /tmp/npm-install.log
            return 1
        fi
    fi
    
    # Verify node_modules exists
    if [ ! -d "node_modules" ]; then
        print_error "node_modules directory not created!"
        return 1
    fi
    
    print_success "Dependencies installed successfully"
    print_success "node_modules verified"
}

fix_prisma_engines() {
    print_info "Fixing Prisma engine permissions..."
    
    cd ${APP_DIR} || return 1
    
    # Find and fix all Prisma engine binaries
    if [ -d "node_modules/@prisma/engines" ]; then
        print_info "Setting execute permissions for Prisma engines..."
        
        # Make all engine binaries executable
        find node_modules/@prisma/engines -type f -executable -o -name '*engine*' | while read engine; do
            chmod +x "$engine" 2>/dev/null || true
        done
        
        # Specifically target known engine files
        chmod +x node_modules/@prisma/engines/schema-engine-* 2>/dev/null || true
        chmod +x node_modules/@prisma/engines/query-engine-* 2>/dev/null || true
        chmod +x node_modules/@prisma/engines/migration-engine-* 2>/dev/null || true
        chmod +x node_modules/@prisma/engines/introspection-engine-* 2>/dev/null || true
        chmod +x node_modules/@prisma/engines/prisma-fmt-* 2>/dev/null || true
        
        print_success "Prisma engine permissions fixed"
    else
        print_warning "Prisma engines directory not found"
    fi
}

ensure_mysql_ready_for_app_setup() {
    print_info "Ensuring MySQL is running before Prisma/seed..."

    local MYSQL_SERVICE="mysql"
    if systemctl list-unit-files 2>/dev/null | grep -q '^mysql\.service'; then
        MYSQL_SERVICE="mysql"
    elif systemctl list-unit-files 2>/dev/null | grep -q '^mariadb\.service'; then
        MYSQL_SERVICE="mariadb"
    fi

    if ! systemctl is-active --quiet "$MYSQL_SERVICE"; then
        print_warning "${MYSQL_SERVICE} is not active, starting it..."
        systemctl start "$MYSQL_SERVICE" || true
    fi

    local i
    for ((i=1; i<=30; i++)); do
        if mysql -h 127.0.0.1 -u "${DB_USER}" -p"${DB_PASSWORD}" -e "SELECT 1;" >/dev/null 2>&1; then
            print_success "MySQL is ready for Prisma/seed"
            return 0
        fi
        sleep 2
    done

    print_error "MySQL not ready after waiting. Diagnostics:"
    systemctl status "$MYSQL_SERVICE" --no-pager -l 2>/dev/null | tail -40 || true
    journalctl -u "$MYSQL_SERVICE" -n 50 --no-pager 2>/dev/null || true
    return 1
}

setup_prisma() {
    print_step "Setting up Prisma ORM"
    
    cd ${APP_DIR}/backend || {
        print_error "Failed to change to ${APP_DIR}/backend"
        return 1
    }
    
    # Fix Prisma engine permissions first
    fix_prisma_engines

    ensure_mysql_ready_for_app_setup || return 1
    
    # Disable Prisma update notifications
    export PRISMA_HIDE_UPDATE_MESSAGE=true
    
    # Use local prisma binary from backend (where schema.prisma lives)
    local PRISMA_BIN="${APP_DIR}/backend/node_modules/.bin/prisma"
    if [ ! -f "$PRISMA_BIN" ]; then
        print_error "Local prisma binary not found at $PRISMA_BIN — install may have failed"
        return 1
    fi

    # Generate Prisma Client
    print_info "Generating Prisma Client..."
    if ! "$PRISMA_BIN" generate 2>&1 | tee /tmp/prisma-generate.log; then
        print_error "Prisma generate failed!"
        cat /tmp/prisma-generate.log
        return 1
    fi
    
    print_success "Prisma Client generated"
    
    # Push database schema
    print_info "Creating database tables with Prisma..."
    print_info "This will create 47+ tables for the application..."
    
    if ! "$PRISMA_BIN" db push --accept-data-loss --skip-generate 2>&1 | tee /tmp/prisma-push.log; then
        print_error "Prisma db push failed!"
        cat /tmp/prisma-push.log
        return 1
    fi
    
    print_success "Database schema pushed successfully"
    
    # Verify tables were created
    print_info "Verifying database tables..."
    local TABLE_COUNT=$(mysql -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -e "SHOW TABLES;" 2>/dev/null | wc -l)
    
    if [ "$TABLE_COUNT" -gt "10" ]; then
        print_success "Database schema created successfully ($TABLE_COUNT tables)"
    else
        print_error "Database schema creation failed! Only $TABLE_COUNT tables found."
        return 1
    fi
}

seed_database() {
    print_step "Seeding database with initial data"
    
    cd ${APP_DIR} || return 1

    ensure_mysql_ready_for_app_setup || return 1
    
    print_info "Creating admin user, permissions, profiles, categories, and templates..."
    
    # Determine seed directory (backend/prisma/ for monorepo, prisma/ for legacy)
    local SEED_DIR=""
    if [ -f "backend/prisma/seeds/seed-all.ts" ]; then
        SEED_DIR="backend/prisma"
    elif [ -f "prisma/seeds/seed-all.ts" ]; then
        SEED_DIR="prisma"
    elif [ -f "prisma/seed.ts" ]; then
        SEED_DIR="prisma"
    fi

    # Try comprehensive seed first
    if [ -n "$SEED_DIR" ] && [ -f "${SEED_DIR}/seeds/seed-all.ts" ]; then
        print_info "Running comprehensive seed from ${SEED_DIR}/seeds/..."
        if node_modules/.bin/tsx ${SEED_DIR}/seeds/seed-all.ts 2>&1 | tee /tmp/seed.log; then
            print_success "Comprehensive seed completed"
        else
            print_warning "Comprehensive seed had issues, trying individual seeds..."
            run_individual_seeds
        fi
    elif [ -n "$SEED_DIR" ] && [ -f "${SEED_DIR}/seed.ts" ]; then
        print_info "Running default seed from ${SEED_DIR}/..."
        if node_modules/.bin/tsx ${SEED_DIR}/seed.ts 2>&1 | tee /tmp/seed.log; then
            print_success "Default seed completed"
        else
            print_warning "Default seed had issues, trying individual seeds..."
            run_individual_seeds
        fi
    else
        print_warning "No seed file found, trying individual seeds..."
        run_individual_seeds
    fi
    
    # Seed additional templates
    seed_additional_templates
    
    # Verify admin user
    verify_admin_user
}

run_individual_seeds() {
    # Determine seed directory (backend/prisma/ for monorepo, prisma/ for legacy)
    local SD=""
    if [ -d "backend/prisma/seeds" ]; then
        SD="backend/prisma"
    elif [ -d "prisma/seeds" ]; then
        SD="prisma"
    fi

    if [ -z "$SD" ]; then
        print_warning "No seeds directory found"
        return 0
    fi

    # Seed permissions
    if [ -f "${SD}/seeds/permissions.ts" ]; then
        print_info "Seeding permissions..."
        node_modules/.bin/tsx ${SD}/seeds/permissions.ts || print_warning "Permissions seed failed"
    fi
    
    # Seed financial categories
    if [ -f "${SD}/seeds/keuangan-categories.ts" ]; then
        print_info "Seeding financial categories..."
        node_modules/.bin/tsx ${SD}/seeds/keuangan-categories.ts || print_warning "Categories seed failed"
    fi
    
    # Seed admin user
    if [ -f "${SD}/seeds/seed-admin.ts" ]; then
        print_info "Seeding admin user..."
        node_modules/.bin/tsx ${SD}/seeds/seed-admin.ts || print_warning "Admin seed failed"
    fi
    
    # Seed isolation templates
    if [ -f "${SD}/seeds/isolation-templates.ts" ]; then
        print_info "Seeding isolation templates..."
        node_modules/.bin/tsx ${SD}/seeds/isolation-templates.ts || print_warning "Isolation templates seed failed"
    fi
}

seed_additional_templates() {
    # Determine seed directory (backend/prisma/ for monorepo, prisma/ for legacy)
    local SD=""
    if [ -d "backend/prisma/seeds" ]; then
        SD="backend/prisma"
    elif [ -d "prisma/seeds" ]; then
        SD="prisma"
    fi

    [ -z "$SD" ] && return 0

    # Seed notification templates
    if [ -f "${SD}/seeds/seed-templates.js" ]; then
        print_info "Seeding notification templates..."
        node ${SD}/seeds/seed-templates.js || true
    fi
    
    # Seed voucher templates
    if [ -f "${SD}/seeds/seed-voucher.js" ]; then
        print_info "Seeding voucher templates..."
        node ${SD}/seeds/seed-voucher.js || true
    fi
    
    # Fix emoji encoding
    if [ -f "${SD}/seeds/fix-emoji.js" ]; then
        print_info "Fixing emoji encoding..."
        node ${SD}/seeds/fix-emoji.js || true
    fi
}

verify_admin_user() {
    print_info "Verifying admin user..."
    
    local ADMIN_CHECK=$(mysql -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -se "SELECT COUNT(*) FROM admin_users WHERE role='SUPER_ADMIN';" 2>/dev/null || echo "0")
    
    if [ "$ADMIN_CHECK" -ge "1" ]; then
        print_success "Admin user verified ($ADMIN_CHECK user(s) found)"
    else
        print_warning "Admin user not found in database. You may need to seed manually."
        print_info "You can seed later with: cd ${APP_DIR} && npx tsx prisma/seeds/seed-all.ts"
    fi
}

create_app_user() {
    # Skip if using existing user
    if [ "$CREATE_NEW_USER" = "false" ]; then
        print_info "Using existing user: ${APP_USER}"
        print_success "User ${APP_USER} configured"
        return 0
    fi
    
    print_info "Creating application user: ${APP_USER}..."
    
    # Check if user exists
    if id "${APP_USER}" &>/dev/null; then
        print_success "User ${APP_USER} already exists"
    else
        # Create system user with home directory
        useradd -r -m -s /bin/bash -d /home/${APP_USER} ${APP_USER} || {
            print_error "Failed to create user ${APP_USER}"
            return 1
        }
        print_success "User ${APP_USER} created"
    fi
    
    # Add to sudo group for PM2 startup (optional, only for new users)
    usermod -aG sudo ${APP_USER} 2>/dev/null || true
}

fix_permissions() {
    print_info "Fixing file permissions..."
    
    cd ${APP_DIR} || return 1
    
    # Create app user if not exists
    create_app_user
    
    # Fix ownership to app user
    print_info "Setting ownership to ${APP_USER}:${APP_GROUP}..."
    chown -R ${APP_USER}:${APP_GROUP} ${APP_DIR}
    
    # Fix file permissions (preserve execute for binaries)
    find ${APP_DIR} -type f -exec chmod 644 {} \;
    find ${APP_DIR} -type d -exec chmod 755 {} \;
    
    # Restore execute permissions for binaries
    print_info "Restoring execute permissions for binaries..."
    
    # Make scripts executable
    chmod +x ${APP_DIR}/*.sh 2>/dev/null || true
    
    # Make node_modules/.bin executable
    if [ -d "${APP_DIR}/node_modules/.bin" ]; then
        chmod +x ${APP_DIR}/node_modules/.bin/* 2>/dev/null || true
    fi
    
    # Fix Prisma engine binaries
    if [ -d "${APP_DIR}/node_modules/@prisma/engines" ]; then
        print_info "Fixing Prisma engine permissions..."
        chmod +x ${APP_DIR}/node_modules/@prisma/engines/* 2>/dev/null || true
        find ${APP_DIR}/node_modules/@prisma/engines -type f | while read engine; do
            chmod +x "$engine" 2>/dev/null || true
        done
    fi
    
    print_success "File permissions fixed (owner: ${APP_USER})"
}

generate_vapid_keys() {
    print_info "Generating VAPID keys for PWA push notifications..."

    cd ${APP_DIR} || return 1

    # web-push must be installed (node_modules present) before this runs
    local WEBPUSH_BIN="${APP_DIR}/node_modules/.bin/web-push"
    if [ ! -f "$WEBPUSH_BIN" ]; then
        print_warning "web-push binary not found — skipping VAPID generation (non-critical)"
        return 0
    fi

    # Idempotent: skip if keys already present
    if grep -q "^VAPID_PUBLIC_KEY=" "${APP_DIR}/.env" 2>/dev/null; then
        print_info "VAPID keys already in .env — skipped"
        return 0
    fi

    local VAPID_OUTPUT
    VAPID_OUTPUT=$("$WEBPUSH_BIN" generate-vapid-keys --json 2>/dev/null) || {
        print_warning "web-push generate-vapid-keys failed — skipping (non-critical)"
        return 0
    }

    local PUB_KEY PRIV_KEY
    PUB_KEY=$(echo "$VAPID_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['publicKey'])" 2>/dev/null) || true
    PRIV_KEY=$(echo "$VAPID_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['privateKey'])" 2>/dev/null) || true

    if [ -z "$PUB_KEY" ] || [ -z "$PRIV_KEY" ]; then
        print_warning "Could not parse VAPID keys — skipping (non-critical)"
        return 0
    fi

    local CONTACT_EMAIL="admin@${VPS_DOMAIN:-${VPS_IP:-localhost}}"
    # IP address is not valid as mailto domain — use generic fallback
    if [[ "$CONTACT_EMAIL" =~ ^admin@[0-9]+\. ]]; then
        CONTACT_EMAIL="admin@salfanet.local"
    fi

    cat >> "${APP_DIR}/.env" <<EOF

# VAPID Keys for PWA Push Notifications (auto-generated on install)
VAPID_PUBLIC_KEY="${PUB_KEY}"
VAPID_PRIVATE_KEY="${PRIV_KEY}"
VAPID_CONTACT_EMAIL="${CONTACT_EMAIL}"
EOF

    chmod 600 "${APP_DIR}/.env"
    save_install_info "VAPID_PUBLIC_KEY" "$PUB_KEY"
    print_success "VAPID keys generated and added to .env"
}

install_app() {
    print_step "Step 4: Setting up application and database schema"
    
    copy_application_files || return 1
    verify_critical_files || return 1
    create_app_user || return 1
    create_env_file || return 1
    install_dependencies || return 1
    generate_vapid_keys || true
    setup_prisma || return 1
    seed_database || true
    fix_permissions || true
    
    print_success "Application setup completed"
    print_info "Application owned by user: ${APP_USER}"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_app
fi
