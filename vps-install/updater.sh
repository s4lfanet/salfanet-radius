#!/bin/bash
# ============================================================================
# SALFANET RADIUS - VPS Updater
# ============================================================================
# Update existing installation to the latest GitHub release.
#
# Usage:
#   bash updater.sh                         # Update to latest release
#   bash updater.sh --version v2.12.0       # Update to specific version
#   bash updater.sh --branch master         # Update from git branch (no build)
#   bash updater.sh --skip-backup           # Skip pre-update backup
# ============================================================================

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Colors ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'

print_step()    { echo -e "\n${CYAN}▶ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info()    { echo -e "${YELLOW}  $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}" >&2; }

# ─── Config ────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
GITHUB_REPO="s4lfanet/salfanet-radius"
PM2_APP_NAME="salfanet-radius"
PM2_CRON_NAME="salfanet-cron"
BACKUP_BASE="/root/salfanet-backups"
TARGET_VERSION=""
USE_BRANCH=""
SKIP_BACKUP=false
ARCH="amd64"

# Detect architecture
if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then
    ARCH="arm64"
fi

# ─── Parse args ────────────────────────────────────────────────────────────
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --version)     TARGET_VERSION="$2"; shift ;;
        --branch)      USE_BRANCH="$2"; shift ;;
        --skip-backup) SKIP_BACKUP=true ;;
        --app-dir)     APP_DIR="$2"; shift ;;
        --help|-h)
            echo "Usage: bash updater.sh [--version vX.Y.Z] [--branch master] [--skip-backup]"
            exit 0 ;;
    esac
    shift
done

# ─── Sanity checks ─────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    print_error "Run as root: sudo bash updater.sh"
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    print_error "App not found at $APP_DIR. Run the installer first."
    exit 1
fi

# ─── Show current version ──────────────────────────────────────────────────
CURRENT_VERSION="unknown"
if [ -f "$APP_DIR/VERSION" ]; then
    CURRENT_VERSION=$(cat "$APP_DIR/VERSION")
elif [ -f "$APP_DIR/package.json" ]; then
    CURRENT_VERSION=$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo "unknown")
fi

echo ""
echo -e "${WHITE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║      SALFANET RADIUS — VPS Updater               ║${NC}"
echo -e "${WHITE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
print_info "App dir      : $APP_DIR"
print_info "Current ver  : $CURRENT_VERSION"
print_info "Architecture : $ARCH"
echo ""

# ──────────────────────────────────────────────────────────────────────────
# MODE A: Update via git pull (branch mode, no build download)
# ──────────────────────────────────────────────────────────────────────────
if [ -n "$USE_BRANCH" ]; then
    print_step "Updating via git branch: $USE_BRANCH"

    if [ ! -d "$APP_DIR/.git" ]; then
        print_error "Not a git repo at $APP_DIR. Use release mode instead."
        exit 1
    fi

    cd "$APP_DIR"

    # Backup
    if [ "$SKIP_BACKUP" = false ]; then
        print_step "Creating backup"
        BACKUP_DIR="$BACKUP_BASE/$(date +%Y%m%d-%H%M%S)-git"
        mkdir -p "$BACKUP_DIR"
        cp -r "$APP_DIR" "$BACKUP_DIR/app" 2>/dev/null || true
        print_success "Backup saved to $BACKUP_DIR"
    fi

    # ─── Preserve user-uploaded files (logos, KTP, payment proofs, dll) ───
    # git reset --hard + git clean -fd akan menghapus file yang tidak di-track git.
    # Meski public/uploads/ ada di .gitignore, kita tetap backup manual agar aman.
    UPLOADS_GIT_TMP=""
    if [ -d "$APP_DIR/public/uploads" ]; then
        UPLOADS_GIT_TMP=$(mktemp -d)
        cp -r "$APP_DIR/public/uploads/." "$UPLOADS_GIT_TMP/"
        print_info "uploads/ saved — will be restored after git sync"
    fi

    git fetch origin
    git reset --hard "origin/$USE_BRANCH"
    git clean -fd

    # Restore uploads (logos, foto KTP pelanggan, bukti bayar, dll)
    if [ -n "$UPLOADS_GIT_TMP" ]; then
        mkdir -p "$APP_DIR/public/uploads"
        cp -r "$UPLOADS_GIT_TMP/." "$APP_DIR/public/uploads/"
        rm -rf "$UPLOADS_GIT_TMP"
        print_success "uploads/ restored (logos, foto KTP, bukti bayar aman)"
    fi

    print_step "Installing dependencies"
    npm ci --omit=dev

    print_step "Generating Prisma client"
    node_modules/.bin/prisma generate

    print_step "Running database migrations"
    node_modules/.bin/prisma db push --accept-data-loss 2>/dev/null || node_modules/.bin/prisma db push

    print_step "Building application"
    NODE_OPTIONS="--max-old-space-size=1536" NEXT_TELEMETRY_DISABLED=1 npm run build

    print_step "Restarting services"
    pm2 restart "$PM2_APP_NAME" 2>/dev/null || true
    pm2 restart "$PM2_CRON_NAME" 2>/dev/null || true
    pm2 save

    NEW_VERSION=$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo "unknown")
    echo ""
    print_success "Update complete! ${CURRENT_VERSION} → ${NEW_VERSION}"
    exit 0
fi

# ──────────────────────────────────────────────────────────────────────────
# MODE B: Update via GitHub Release webupload ZIP
# ──────────────────────────────────────────────────────────────────────────
print_step "Fetching release information"

if [ -z "$TARGET_VERSION" ]; then
    # Get latest release tag from GitHub API
    LATEST=$(curl -sSf "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
        | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    if [ -z "$LATEST" ]; then
        print_error "Could not fetch latest release from GitHub. Check internet connectivity."
        exit 1
    fi
    TARGET_VERSION="$LATEST"
fi

print_info "Target version : $TARGET_VERSION"

# Check if already on target version
if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ] || [ "v$CURRENT_VERSION" = "$TARGET_VERSION" ]; then
    echo ""
    print_success "Already on version $TARGET_VERSION — nothing to update."
    echo "Use --version to force a specific version or --branch to update from git."
    exit 0
fi

# ─── Download webupload ZIP ────────────────────────────────────────────────
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${TARGET_VERSION}/webupload-${ARCH}.zip"
WORK_DIR=$(mktemp -d)
ZIP_PATH="$WORK_DIR/webupload.zip"

print_step "Downloading webupload-${ARCH}.zip (${TARGET_VERSION})"
print_info "URL: $DOWNLOAD_URL"

if ! curl -sSfL --progress-bar -o "$ZIP_PATH" "$DOWNLOAD_URL"; then
    print_error "Download failed. Check the version tag and network."
    rm -rf "$WORK_DIR"
    exit 1
fi

print_success "Downloaded $(du -sh "$ZIP_PATH" | cut -f1)"

# ─── Backup current app ────────────────────────────────────────────────────
if [ "$SKIP_BACKUP" = false ]; then
    print_step "Backing up current installation"
    BACKUP_DIR="$BACKUP_BASE/$(date +%Y%m%d-%H%M%S)-${CURRENT_VERSION}"
    mkdir -p "$BACKUP_DIR"

    # Only backup app code (skip uploads/ and node_modules/ — too large)
    rsync -a --exclude='node_modules' --exclude='uploads' \
        "$APP_DIR/" "$BACKUP_DIR/app/" 2>/dev/null || \
        cp -r "$APP_DIR" "$BACKUP_DIR/app"

    print_success "Backup saved to $BACKUP_DIR"
fi

# ─── Extract & stage ───────────────────────────────────────────────────────
print_step "Extracting new build"
EXTRACT_DIR="$WORK_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"

# The zip contains webupload-staging/ as root dir
STAGED_DIR=$(find "$EXTRACT_DIR" -maxdepth 1 -type d | grep -v "^$EXTRACT_DIR$" | head -1)
if [ -z "$STAGED_DIR" ]; then
    print_error "Unexpected zip structure."
    rm -rf "$WORK_DIR"
    exit 1
fi

# ─── Stop services ────────────────────────────────────────────────────────
print_step "Stopping PM2 processes"
pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
pm2 stop "$PM2_CRON_NAME" 2>/dev/null || true
print_success "Services stopped"

# ─── Deploy new build ─────────────────────────────────────────────────────
print_step "Deploying new build"

# Preserve .env from current installation
ENV_FILE=""
if [ -f "$APP_DIR/.env" ]; then
    ENV_FILE=$(mktemp)
    cp "$APP_DIR/.env" "$ENV_FILE"
fi

# Preserve uploads/
UPLOADS_TMP=""
if [ -d "$APP_DIR/public/uploads" ]; then
    UPLOADS_TMP=$(mktemp -d)
    cp -r "$APP_DIR/public/uploads/." "$UPLOADS_TMP/"
fi

# Replace app files (keep a few runtime dirs)
rsync -a --delete \
    --exclude='.env' \
    --exclude='public/uploads' \
    "$STAGED_DIR/" "$APP_DIR/"

# Restore .env
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$APP_DIR/.env"
    rm -f "$ENV_FILE"
    print_success ".env restored"
fi

# Restore uploads
if [ -n "$UPLOADS_TMP" ]; then
    mkdir -p "$APP_DIR/public/uploads"
    cp -r "$UPLOADS_TMP/." "$APP_DIR/public/uploads/"
    rm -rf "$UPLOADS_TMP"
    print_success "uploads/ restored"
fi

# ─── Run DB migrations ────────────────────────────────────────────────────
print_step "Running database migrations (prisma db push)"
cd "$APP_DIR"

if [ -f "$APP_DIR/.env" ]; then
    export $(grep -v '^#' "$APP_DIR/.env" | grep 'DATABASE_URL' | xargs) 2>/dev/null || true
fi

node_modules/.bin/prisma generate 2>/dev/null || true
node_modules/.bin/prisma db push --accept-data-loss 2>/dev/null || \
    node_modules/.bin/prisma db push || \
    print_info "DB push skipped (check manually)"

# ─── Restart services ─────────────────────────────────────────────────────
print_step "Starting PM2 processes"
pm2 start "$PM2_APP_NAME" 2>/dev/null || true
pm2 start "$PM2_CRON_NAME" 2>/dev/null || true
pm2 save

# ─── Cleanup ──────────────────────────────────────────────────────────────
rm -rf "$WORK_DIR"

# ─── Done ─────────────────────────────────────────────────────────────────
NEW_VERSION=$(cat "$APP_DIR/VERSION" 2>/dev/null || echo "$TARGET_VERSION")
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Update berhasil!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
print_success "${CURRENT_VERSION}  →  ${NEW_VERSION}"
echo ""
print_info "Cek status   : pm2 status"
print_info "Cek log      : pm2 logs ${PM2_APP_NAME}"
print_info "Backup ada di: $BACKUP_BASE"
echo ""
