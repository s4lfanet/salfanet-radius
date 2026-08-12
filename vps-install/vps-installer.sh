#!/bin/bash
# ============================================================================
# SALFANET RADIUS — Main Installer (Monorepo Edition)
# ============================================================================
# Architecture: pnpm monorepo
#   frontend/  — Next.js (port 3000)
#   backend/   — NestJS API + cron (port 3001)
#   packages/  — shared-types
#   deploy/    — FreeRADIUS config, Nginx, PM2 ecosystem
#
# Usage:
#   bash vps-installer.sh                    # Full interactive install
#   bash vps-installer.sh --skip-freeradius  # Skip FreeRADIUS setup
#   bash vps-installer.sh --skip-clone       # Use existing code in APP_DIR
#   bash vps-installer.sh --env lxc          # Force LXC mode (no UFW)
#
# Prerequisites:
#   - Fresh Ubuntu 22.04/24.04 VPS or LXC container
#   - Root access
#   - Internet connection
# ============================================================================

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Parse CLI args
SKIP_FREERADIUS=false
SKIP_CLONE=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --skip-freeradius) export SKIP_FREERADIUS=true; shift ;;
        --skip-clone)      export SKIP_CLONE=true;      shift ;;
        --env)             export DEPLOY_ENV="$2";       shift 2 ;;
        --app-dir)         export APP_DIR="$2";          shift 2 ;;
        --db-password)     export DB_PASSWORD="$2";      shift 2 ;;
        --help|-h)
            echo "Usage: bash vps-installer.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-freeradius   Skip FreeRADIUS setup"
            echo "  --skip-clone        Use existing code in APP_DIR (don't git clone)"
            echo "  --env lxc|vps       Force environment mode"
            echo "  --app-dir PATH      Override app directory (default: /var/www/salfanet-radius)"
            echo "  --db-password PASS  Override database password"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ============================================================================
# HEADER
# ============================================================================

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         SALFANET RADIUS — VPS Installer (Monorepo)          ║${NC}"
echo -e "${CYAN}║         frontend (Next.js) + backend (NestJS)               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  App Dir:     $APP_DIR"
echo "  VPS IP:      $VPS_IP"
echo "  DB:          $DB_NAME (user: $DB_USER)"
echo "  Frontend:    port $FRONTEND_PORT"
echo "  Backend:     port $BACKEND_PORT"
echo "  FreeRADIUS:  $([ "$SKIP_FREERADIUS" = "true" ] && echo 'SKIP' || echo 'YES')"
echo "  Clone:       $([ "$SKIP_CLONE" = "true" ] && echo 'SKIP (use existing)' || echo "YES ($GITHUB_REPO)")"
echo ""

# Detect environment
detect_environment
print_info "Detected environment: $DEPLOY_ENV"

# ============================================================================
# RUN INSTALL STEPS
# ============================================================================

# Step 1: System
source "$SCRIPT_DIR/install-system.sh"
install_system

# Step 2: MySQL
source "$SCRIPT_DIR/install-mysql.sh"
install_mysql

# Step 3: Node.js + pnpm
source "$SCRIPT_DIR/install-nodejs.sh"
install_nodejs

# Step 4: Application (clone, deps, env, migrations, build)
source "$SCRIPT_DIR/install-app.sh"
if [ "$SKIP_CLONE" = "true" ]; then
    # Skip clone, but still do deps + env + migrations + build
    install_deps
    generate_env
    run_migrations
    build_app
else
    install_app
fi

# Step 5: FreeRADIUS (optional)
if [ "$SKIP_FREERADIUS" = "false" ]; then
    source "$SCRIPT_DIR/install-freeradius.sh"
    install_freeradius
fi

# Step 6: Nginx
source "$SCRIPT_DIR/install-nginx.sh"
install_nginx

# Step 7: PM2
source "$SCRIPT_DIR/install-pm2.sh"
install_pm2

# ============================================================================
# DONE
# ============================================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Services:"
echo "    Frontend:  http://${VPS_IP}  (PM2: salfanet-frontend)"
echo "    Backend:   http://${VPS_IP}:${BACKEND_PORT}   (PM2: salfanet-backend)"
echo "    Nginx:     http://${VPS_IP}:80"
$([ "$SKIP_FREERADIUS" = "false" ] && echo "    FreeRADIUS: active (ports 1812/udp, 1813/udp)")
echo ""
echo -e "${YELLOW}  Default Admin Login:${NC}"
echo "    Username: superadmin"
echo "    Password: admin123"
echo ""
echo "  Next steps:"
echo "    1. Open http://${VPS_IP} in browser"
echo "    2. Login with superadmin / admin123"
echo "    3. CHANGE ADMIN PASSWORD immediately in Settings"
echo "    4. Configure RADIUS clients (NAS) in admin panel"
echo "    5. Create PPPoE profiles and IP pools"
echo ""
echo "  Logs:"
echo "    pm2 logs salfanet-frontend"
echo "    pm2 logs salfanet-backend"
echo "    sudo journalctl -u freeradius -f"
echo ""
echo "  Uninstall: bash vps-install/vps-uninstaller.sh"
echo ""
