#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - PM2 & Build Module
# ============================================================================
# Step 7: Install PM2, build application, start with PM2
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# PM2 INSTALLATION
# ============================================================================

fix_node_permissions() {
    print_info "Fixing Node.js execution permissions for ${APP_USER}..."
    
    # Set executable permissions on Node.js binaries
    chmod 755 /usr/bin/node 2>/dev/null || true
    chmod 755 /usr/bin/npm 2>/dev/null || true
    chmod 755 /usr/bin/npx 2>/dev/null || true
    
    # If npm is a symlink, fix the target too
    if [ -L "/usr/bin/npm" ]; then
        NPM_TARGET=$(readlink -f /usr/bin/npm)
        chmod 755 "$NPM_TARGET" 2>/dev/null || true
    fi
    
    # Fix PM2 binary and modules
    chmod 755 /usr/bin/pm2 2>/dev/null || true
    chmod -R 755 /usr/lib/node_modules/pm2 2>/dev/null || true
    
    # Test if user can execute node using su -
    if sudo su - ${APP_USER} -c 'node --version' &>/dev/null; then
        print_success "Node.js executable by ${APP_USER}"
    else
        print_warning "Node.js test failed, but continuing..."
    fi
}

install_pm2() {
    print_info "Installing PM2 globally..."
    
    npm install -g pm2 || {
        print_error "Failed to install PM2"
        return 1
    }
    
    print_success "PM2 installed: $(pm2 --version)"
    
    # Fix Node.js permissions BEFORE configuring PM2
    fix_node_permissions
    
    # Setup PM2 for app user
    print_info "Configuring PM2 for user: ${APP_USER}..."
    
    # Create PM2 directories for app user
    mkdir -p /home/${APP_USER}/.pm2/logs
    mkdir -p /home/${APP_USER}/.pm2/pids
    chown -R ${APP_USER}:${APP_GROUP} /home/${APP_USER}/.pm2
    
    # Fix PM2 binary permission too
    chmod 755 /usr/bin/pm2 2>/dev/null || true
    if [ -L "/usr/bin/pm2" ]; then
        PM2_TARGET=$(readlink -f /usr/bin/pm2)
        chmod 755 "$PM2_TARGET" 2>/dev/null || true
    fi
    
    print_success "PM2 configured for ${APP_USER}"
}

# ============================================================================
# SWAP CONFIGURATION
# ============================================================================

check_and_create_swap() {
    print_info "Checking memory and swap..."
    
    local TOTAL_MEM=$(free -m | awk 'NR==2{printf "%s", $2}')
    local AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%s", $7}')
    
    print_info "System memory: ${TOTAL_MEM}MB total, ${AVAILABLE_MEM}MB available"
    
    if [ "$TOTAL_MEM" -lt "3000" ]; then
        print_warning "Low memory system detected (< 3GB RAM) — creating swap for build safety"
        
        if [ ! -f /swapfile ]; then
            print_info "Creating 2GB swap file (one-time setup, 2-3 minutes)..."
            
            dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress 2>&1 | grep -v "records"
            chmod 600 /swapfile
            mkswap /swapfile
            swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
            
            print_success "Swap file created and activated"
            free -h
        else
            print_success "Swap file already exists"
            swapon /swapfile 2>/dev/null || true
        fi
    else
        print_success "Sufficient memory available"
    fi
}

# ============================================================================
# APPLICATION BUILD
# ============================================================================

build_application() {
    print_step "Building Next.js application (5-10 minutes)"
    
    cd ${APP_DIR} || {
        print_error "Failed to change to ${APP_DIR}"
        return 1
    }
    
    # Verify prerequisites
    if [ ! -d "node_modules" ]; then
        print_error "node_modules not found! Run install-app.sh first"
        return 1
    fi
    
    # Fix tsconfig.json: remove expo extend that breaks Next.js build
    if grep -q '"extends": "expo/tsconfig.base"' tsconfig.json 2>/dev/null; then
        print_info "Removing invalid expo tsconfig extend from root tsconfig.json..."
        # Remove the "extends" line and fix trailing comma on "exclude" block
        python3 -c "
import json, re, sys
with open('tsconfig.json', 'r') as f:
    content = f.read()
# Remove the extends line
content = re.sub(r',?\s*\"extends\"\s*:\s*\"expo/tsconfig.base\"\s*', '', content)
# Also ensure mobile-app is excluded
try:
    data = json.loads(content)
    excl = data.get('exclude', [])
    if 'mobile-app' not in excl:
        excl.append('mobile-app')
    data['exclude'] = excl
    # Remove extends key if still present
    data.pop('extends', None)
    with open('tsconfig.json', 'w') as f:
        json.dump(data, f, indent=2)
    print('tsconfig.json fixed successfully')
except Exception as e:
    print(f'JSON fix failed: {e}, trying raw replace')
    with open('tsconfig.json', 'w') as f:
        f.write(content)
" 2>&1 || sed -i '/"extends": "expo\/tsconfig.base"/d' tsconfig.json
        print_success "tsconfig.json fixed"
    fi

    # Clean previous build
    print_info "Cleaning previous build artifacts..."
    rm -rf .next .turbo node_modules/.cache 2>/dev/null || true
    print_success "Build cache cleared"
    
    # Free memory before build (critical for 2GB RAM VPS)
    print_info "Freeing memory before build..."
    pm2 stop all 2>/dev/null || true
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    local FREE_MEM=$(free -m | awk 'NR==2{printf "%s", $7}')
    print_info "Available memory: ${FREE_MEM}MB"
    
    # Build with optimizations
    print_info "Starting Next.js build process..."
    print_info "Building with Node.js memory limit: 1.5GB"
    echo ""
    
    if NEXT_TELEMETRY_DISABLED=1 \
       PRISMA_HIDE_UPDATE_MESSAGE=true \
       npm run build:vps 2>&1 | tee /tmp/build.log; then
        print_success "Build completed successfully!"
    else
        print_error "Build failed!"
        echo ""
        print_info "Build error details:"
        echo "=========================================="
        grep -i "error" /tmp/build.log | tail -20 || tail -30 /tmp/build.log
        echo "=========================================="
        echo ""
        print_info "Common solutions:"
        echo "  1. Ensure you have enough memory/swap"
        echo "  2. Check full log: cat /tmp/build.log"
        echo "  3. Try manual build: cd ${APP_DIR} && npm run build"
        return 1
    fi
    
    # Verify build output
    if [ ! -d ".next" ]; then
        print_error ".next directory not created! Build may have failed."
        return 1
    fi
    
    print_success ".next build directory verified"
}

# ============================================================================
# PM2 CONFIGURATION
# ============================================================================

create_pm2_config() {
    print_info "Creating PM2 ecosystem file..."

    # Prefer the production-tuned config shipped with the app
    if [ -f "${APP_DIR}/production/ecosystem.config.js" ]; then
        cp "${APP_DIR}/production/ecosystem.config.js" "${APP_DIR}/ecosystem.config.js"
        print_success "PM2 ecosystem file copied from production/ecosystem.config.js"
    else
        # Fallback: generate a complete config with all required settings
        print_info "production/ecosystem.config.js not found, generating fallback..."
        cat > ${APP_DIR}/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'salfanet-radius',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: process.env.APP_DIR || '/var/www/salfanet-radius',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '400M',
      node_args: [
        '--max-old-space-size=350',
        '--max-semi-space-size=8',
        '--optimize-for-size'
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=350',
        PORT: 3000,
        TZ: 'Asia/Jakarta'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 */6 * * *'
    },
    {
      name: 'salfanet-cron',
      script: './cron-service.js',
      cwd: process.env.APP_DIR || '/var/www/salfanet-radius',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '150M',
      node_args: [
        '--max-old-space-size=120',
        '--max-semi-space-size=4',
        '--optimize-for-size'
      ],
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--max-old-space-size=120',
        API_URL: 'http://localhost:3000',
        TZ: 'Asia/Jakarta'
      },
      error_file: './logs/cron-error.log',
      out_file: './logs/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 5000
    }
  ]
};
EOF
        print_success "PM2 ecosystem file generated (fallback)"
    fi

    mkdir -p ${APP_DIR}/logs
    print_success "PM2 ecosystem configured (salfanet-radius + salfanet-cron)"
}

check_port_conflict() {
    print_info "Checking for port conflicts on port 3000..."
    
    # Check if port 3000 is in use
    local PORT_CHECK=$(lsof -ti:3000 2>/dev/null || netstat -tlnp 2>/dev/null | grep :3000 | awk '{print $7}' | cut -d'/' -f1)
    
    if [ -n "$PORT_CHECK" ]; then
        print_warning "Port 3000 is already in use by PID(s): $PORT_CHECK"
        
        # Show process details
        echo ""
        print_info "Process details:"
        ps aux | grep -E "$PORT_CHECK|PID" | grep -v grep
        echo ""
        
        read -p "Kill conflicting processes? [Y/n]: " KILL_CONFIRM
        if [[ ! "$KILL_CONFIRM" =~ ^[Nn]$ ]]; then
            kill_conflicting_processes
        else
            print_error "Cannot start application with port 3000 in use"
            print_info "Please manually kill the process or change the application port"
            return 1
        fi
    else
        print_success "Port 3000 is available"
    fi
}

kill_conflicting_processes() {
    print_info "Killing processes using port 3000..."
    
    # Get all PIDs using port 3000
    local PIDS=$(lsof -ti:3000 2>/dev/null)
    
    if [ -z "$PIDS" ]; then
        # Try netstat method
        PIDS=$(netstat -tlnp 2>/dev/null | grep :3000 | awk '{print $7}' | cut -d'/' -f1 | grep -v '-')
    fi
    
    if [ -n "$PIDS" ]; then
        for PID in $PIDS; do
            print_info "Killing PID $PID..."
            
            # Force kill immediately with sudo (no graceful kill during install)
            kill -9 $PID 2>/dev/null || sudo kill -9 $PID 2>/dev/null || true
        done
        
        # Verify port is free
        sleep 2
        if lsof -ti:3000 >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q :3000; then
            print_error "Failed to free port 3000!"
            print_info "Try manually: sudo lsof -ti:3000 | xargs sudo kill -9"
            return 1
        else
            print_success "Port 3000 is now free"
        fi
    else
        print_success "No processes to kill"
    fi
}

cleanup_pm2_processes() {
    print_info "Cleaning up old PM2 processes..."
    
    # Kill any processes on port 3000 first
    print_info "Ensuring port 3000 is free..."
    lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    
    # Cleanup root PM2 processes
    pm2 delete all 2>/dev/null || true
    pm2 delete salfanet-radius 2>/dev/null || true
    pm2 delete salfanet-cron 2>/dev/null || true
    pm2 kill 2>/dev/null || true

    # Remove stale root PM2 dump so old processes don't resurrect on reboot
    rm -f /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak 2>/dev/null || true

    # Cleanup app user PM2 processes using su - for proper environment
    sudo su - ${APP_USER} -c 'pm2 delete all 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-radius 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-cron 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 kill 2>/dev/null || true'

    # Remove stale PM2 dumps for app user as well
    sudo su - ${APP_USER} -c 'rm -f ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.bak 2>/dev/null || true'

    # Stop root PM2 startup service if app should run as non-root to avoid duplicate resurrection
    if [ -n "${APP_USER}" ] && [ "${APP_USER}" != "root" ]; then
        systemctl stop pm2-root 2>/dev/null || true
        systemctl disable pm2-root 2>/dev/null || true
    fi
    
    # Kill any Node processes that might be lingering
    pkill -9 -f "node.*next-server" 2>/dev/null || true
    pkill -9 -f "PM2.*salfanet" 2>/dev/null || true
    pkill -9 -f "/root/salfanet-radius" 2>/dev/null || true
    pkill -9 -f "/home/.*/salfanet-radius" 2>/dev/null || true
    pkill -9 -f "/var/www/salfanet-radius" 2>/dev/null || true
    
    # Final check on port 3000
    lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    
    # Wait for cleanup
    sleep 2

    # Best-effort visibility for troubleshooting duplicate instances
    print_info "Remaining salfanet-related processes after cleanup:"
    ps -ef | grep -i salfanet | grep -v grep || true
    
    print_success "PM2 processes cleaned"
}

start_pm2_app() {
    print_info "Starting applications (radius + cron) with PM2 as user: ${APP_USER}..."
    
    cd ${APP_DIR} || return 1
    
    # Ensure ownership is correct
    chown -R ${APP_USER}:${APP_GROUP} ${APP_DIR}
    
    # Check and fix port conflicts
    check_port_conflict || return 1
    
    # Cleanup old PM2 processes
    cleanup_pm2_processes
    
    # Start both apps with PM2 as app user using su - for proper environment
    print_info "Launching applications (radius + cron) as ${APP_USER}..."
    if ! sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 start ecosystem.config.js" 2>&1 | tee /tmp/pm2-start.log; then
        print_error "PM2 start failed!"
        cat /tmp/pm2-start.log
        return 1
    fi

    # Validate app cwd points to the intended APP_DIR only
    print_info "Verifying PM2 working directories..."
    sudo su - ${APP_USER} -c 'pm2 jlist' 2>/dev/null | grep -E '"name"|"pm_cwd"' || true
    
    # Save PM2 configuration for app user
    sudo su - ${APP_USER} -c 'pm2 save'
    
    # Setup PM2 startup for app user
    print_info "Configuring PM2 startup for ${APP_USER}..."
    
    # Handle root user or empty user: pm2 startup without -u/--hp flags
    if [ -z "${APP_USER}" ] || [ "${APP_USER}" = "root" ]; then
        # Running as root - use standard startup without user flags
        env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root || \
        pm2 startup systemd || true
    else
        # Dedicated user - pass user and home path
        sudo /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER} || true
    fi
    
    # Wait for app to stabilize
    print_info "Waiting for applications to stabilize..."
    sleep 5
    
    # Check if apps are running using su -
    if sudo su - ${APP_USER} -c 'pm2 list' | grep -q "salfanet-radius.*online"; then
        print_success "Applications started successfully!"
        echo ""
        print_info "Application status:"
        sudo su - ${APP_USER} -c 'pm2 list'
        echo ""
        print_info "Application URLs:"
        echo "  Main App: http://${VPS_IP} (via Nginx port 80)"
        echo "  Cron Service: Running in background"
        echo ""
        print_info "Monitor logs:"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-radius'"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-cron'"
        echo ""
        print_info "Restart apps:"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-radius'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-cron'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
    else
        print_error "Applications failed to start!"
        echo ""
        print_info "Recent logs:"
        sudo su - ${APP_USER} -c 'pm2 logs --lines 30 --nostream'
        echo ""
        print_info "Troubleshooting commands:"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
        echo "  lsof -i:3000"
        echo "  cd ${APP_DIR} && sudo su - ${APP_USER} -c 'npm start'"
        return 1
    fi
}

start_cron_service() {
    print_info "Cron service will be started via ecosystem.config.js"
    
    # Check if cron-service.js exists
    if [ ! -f "${APP_DIR}/cron-service.js" ]; then
        print_warning "cron-service.js not found (cron service will be skipped)"
        return 0
    fi
    
    print_success "Cron service configured in ecosystem.config.js"
}

run_post_install_fixes() {
    print_step "Running post-installation fixes"
    
    cd ${APP_DIR} || return 1
    
    # Fix emoji encoding
    if [ -f "prisma/seeds/fix-emoji.js" ]; then
        print_info "Fixing emoji encoding..."
        node prisma/seeds/fix-emoji.js && print_success "Emoji template fixed" || print_warning "Failed to fix emoji"
    fi
    
    # Seed notification templates
    if [ -f "prisma/seeds/seed-templates.js" ]; then
        print_info "Seeding notification templates..."
        node prisma/seeds/seed-templates.js && print_success "Notification templates seeded" || print_warning "Failed to seed templates"
    fi
    
    # Update voucher template
    if [ -f "prisma/seeds/seed-voucher.js" ]; then
        print_info "Updating voucher template..."
        node prisma/seeds/seed-voucher.js && print_success "Voucher template updated" || print_warning "Failed to update voucher"
    fi
    
    # Enable FreeRADIUS REST module now that app is running
    print_info "Enabling FreeRADIUS REST module..."
    local FR_CONFIG_DIR="/etc/freeradius/3.0"
    if [ ! -d "$FR_CONFIG_DIR" ]; then
        FR_CONFIG_DIR="/etc/freeradius"
    fi
    
    if [ -f "${FR_CONFIG_DIR}/mods-available/rest" ]; then
        ln -sf ${FR_CONFIG_DIR}/mods-available/rest ${FR_CONFIG_DIR}/mods-enabled/rest
        print_info "Restarting FreeRADIUS to apply REST module..."
        systemctl restart freeradius 2>/dev/null && print_success "FreeRADIUS REST module enabled" || print_warning "Failed to restart FreeRADIUS"
    fi
    
    print_success "Post-installation fixes completed"
}

create_deployment_script() {
    print_info "Creating deployment script..."
    
    cat > ${APP_DIR}/deploy.sh <<'EOFSCRIPT'
#!/bin/bash
set -e

echo "[*] Deploying SALFANET RADIUS..."

APP_DIR="/var/www/salfanet-radius"
APP_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo salfanet)"
SOURCE_DIR=""
DEFAULT_BRANCH=""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "[ERROR] This script must be run as root"
    echo "Run with: sudo $0"
    exit 1
fi

for candidate in "$APP_DIR" "/root/salfanet-radius" "/root/SALFANET-RADIUS-main"; do
    if [ -f "$candidate/package.json" ]; then
        SOURCE_DIR="$candidate"
        break
    fi
done

if [ -z "$SOURCE_DIR" ]; then
    echo "[ERROR] Source directory not found"
    exit 1
fi

echo ">> Source directory: $SOURCE_DIR"
echo ">> Active directory: $APP_DIR"

# Pull latest code from source repo if available
if [ -d "$SOURCE_DIR/.git" ]; then
    echo ">> Pulling latest code from git source..."
    DEFAULT_BRANCH=$(git -C "$SOURCE_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')

    if [ -z "$DEFAULT_BRANCH" ]; then
        if git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/master; then
            DEFAULT_BRANCH="master"
        elif git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/main; then
            DEFAULT_BRANCH="main"
        else
            DEFAULT_BRANCH="master"
        fi
    fi

    git -C "$SOURCE_DIR" fetch origin
    git -C "$SOURCE_DIR" checkout "$DEFAULT_BRANCH"
    git -C "$SOURCE_DIR" pull --ff-only origin "$DEFAULT_BRANCH"
fi

# Sync latest source into active app dir when source repo is separate
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
    echo ">> Syncing source into active app directory..."
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete \
            --exclude='.git' \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='logs' \
            "$SOURCE_DIR/" "$APP_DIR/"
    else
        cp -a "$SOURCE_DIR/." "$APP_DIR/"
    fi
fi

cd ${APP_DIR}

# Install dependencies
echo ">> Installing dependencies..."
npm install --production=false

# Generate Prisma Client
echo "[>] Generating Prisma Client..."
npx prisma generate

# Push database schema
echo "[>] Updating database schema..."
npx prisma db push --accept-data-loss

# Build application
echo "[>] Building application..."
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# Fix ownership
echo "[>] Fixing permissions..."
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# Refresh ecosystem.config.js from production/ (rsync --delete erases root copy)
if [ -f "${APP_DIR}/production/ecosystem.config.js" ]; then
    cp "${APP_DIR}/production/ecosystem.config.js" "${APP_DIR}/ecosystem.config.js"
    echo "[>] ecosystem.config.js refreshed from production/"
fi

# Restart PM2 as salfanet user
echo "[>] Restarting application..."
sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 reload ecosystem.config.js --update-env || pm2 start ${APP_DIR}/ecosystem.config.js"
sudo su - ${APP_USER} -c 'pm2 save'

echo "[OK] Deployment completed!"
echo ">> Note: PM2 may show 2 salfanet-radius processes because cluster instances=2 is intentional."
echo ""
echo ">> Application status:"
sudo su - ${APP_USER} -c 'pm2 list'
EOFSCRIPT

    chmod +x ${APP_DIR}/deploy.sh
    print_success "Deployment script created: ${APP_DIR}/deploy.sh"
}

install_pm2_and_build() {
    print_step "Step 7: Install PM2, Build & Start Application"
    
    install_pm2
    check_and_create_swap
    create_pm2_config
    build_application
    start_pm2_app
    start_cron_service
    run_post_install_fixes
    create_deployment_script
    
    print_success "PM2 installation and application deployment completed"
    
    echo ""
    print_info "Application Status (as ${APP_USER}):"
    sudo su - ${APP_USER} -c 'pm2 list'
    echo ""
    print_info "View logs:"
    echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-radius'"
    echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-cron'"
    echo ""
    print_info "Restart application:"
    echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-radius'"
    echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_pm2_and_build
fi
