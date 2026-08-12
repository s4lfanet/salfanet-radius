#!/bin/bash
# ============================================================================
# SALFANET RADIUS — Common Functions (Monorepo Edition)
# ============================================================================
# Shared utilities for installer/uninstaller.
# Architecture: pnpm monorepo (frontend/ + backend/ + packages/)
# ============================================================================

# Colors
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export CYAN='\033[0;36m'
export WHITE='\033[1;37m'
export NC='\033[0m'

# Global config (defaults — can be overridden by env vars)
export NODE_VERSION="${NODE_VERSION:-20}"
export APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
export APP_USER="${APP_USER:-root}"
export DB_NAME="${DB_NAME:-salfanet_radius}"
export DB_USER="${DB_USER:-salfanet_user}"
export DB_PASSWORD="${DB_PASSWORD:-salfanetradius123}"
export DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root123}"
export SYSTEM_TIMEZONE="${SYSTEM_TIMEZONE:-Asia/Jakarta}"
export INSTALL_LOG="${INSTALL_LOG:-/var/log/salfanet-install.log}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"
export BACKEND_PORT="${BACKEND_PORT:-3001}"
export WA_PORT="${WA_PORT:-4000}"
export GITHUB_REPO="${GITHUB_REPO:-https://github.com/s4lfanet/salfanet-radius.git}"
export GITHUB_BRANCH="${GITHUB_BRANCH:-master}"

# Environment detection
export DEPLOY_ENV="${DEPLOY_ENV:-}"
export IS_CONTAINER="${IS_CONTAINER:-false}"

# ============================================================================
# LOGGING
# ============================================================================

print_step()   { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; echo "[STEP] $1" >> "$INSTALL_LOG" 2>/dev/null || true; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; echo "[OK] $1" >> "$INSTALL_LOG" 2>/dev/null || true; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; echo "[ERROR] $1" >> "$INSTALL_LOG" 2>/dev/null || true; }
print_info()    { echo -e "${YELLOW}[INFO]${NC} $1"; echo "[INFO] $1" >> "$INSTALL_LOG" 2>/dev/null || true; }
print_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; echo "[WARN] $1" >> "$INSTALL_LOG" 2>/dev/null || true; }

die() { print_error "$1"; exit 1; }

# ============================================================================
# ENVIRONMENT DETECTION
# ============================================================================

detect_environment() {
    if [ -f /.dockerenv ] || grep -qaE 'lxc|container' /proc/1/cgroup 2>/dev/null; then
        export DEPLOY_ENV="lxc"
        export IS_CONTAINER="true"
    elif systemctl is-active --quiet systemd 2>/dev/null; then
        export DEPLOY_ENV="vps"
    else
        export DEPLOY_ENV="vps"
    fi
}

# ============================================================================
# HELPERS
# ============================================================================

command_exists() { command -v "$1" >/dev/null 2>&1; }

wait_for_mysql() {
    local max=30
    for i in $(seq 1 $max); do
        if mysqladmin ping -h localhost --silent 2>/dev/null; then
            return 0
        fi
        print_info "Waiting for MySQL... ($i/$max)"
        sleep 2
    done
    die "MySQL did not start within ${max} attempts"
}

generate_secret() {
    openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64
}
