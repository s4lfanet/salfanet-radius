#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Common Functions
# ============================================================================
# Shared utilities, colors, logging, and configuration
# Supports: Public VPS | Proxmox LXC | Proxmox VM | Bare Metal
# ============================================================================

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export CYAN='\033[0;36m'
export BLUE='\033[0;34m'
export PURPLE='\033[0;35m'
export WHITE='\033[1;37m'
export NC='\033[0m' # No Color

# Global configuration variables
export NODE_VERSION="20"
export APP_DIR="/var/www/salfanet-radius"
# APP_USER and APP_GROUP will be set in initialize_user_selection()
export APP_USER=""
export APP_GROUP=""
export DB_NAME="salfanet_radius"
export DB_USER="salfanet_user"
export DB_PASSWORD="salfanetradius123"
export DB_ROOT_PASSWORD="root123"
export INSTALL_LOG="/var/log/salfanet-vps-install.log"
export INSTALL_INFO_FILE="${APP_DIR}/INSTALLATION_INFO.txt"
export INSTALL_RUN_ID="install-$(date +%Y%m%d-%H%M%S)-$RANDOM"

# Optional Telegram install notifications (minimal metadata only)
export INSTALL_NOTIFY_TELEGRAM="false"
export INSTALL_TELEGRAM_BOT_TOKEN=""
export INSTALL_TELEGRAM_CHAT_ID=""
export INSTALL_TELEGRAM_TOPIC_ID=""

# Environment type — akan di-set oleh detect_environment() atau pilihan user
# Nilai: vps | lxc | vm | bare
export DEPLOY_ENV="${DEPLOY_ENV:-}"
export DEPLOY_ENV_LABEL=""
export IS_CONTAINER=false
export HAS_SYSTEMD=true
export HAS_UFW=true
export SKIP_UFW=false

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

print_success() {
    echo -e "${GREEN}[OK] $1${NC}"
    echo "[OK] $1" >> "$INSTALL_LOG" 2>/dev/null || true
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
    echo "[ERROR] $1" >> "$INSTALL_LOG" 2>/dev/null || true
}

print_info() {
    echo -e "${YELLOW}[INFO] $1${NC}"
    echo "[INFO] $1" >> "$INSTALL_LOG" 2>/dev/null || true
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
    echo "[WARNING] $1" >> "$INSTALL_LOG" 2>/dev/null || true
}

print_step() {
    echo ""
    echo -e "${CYAN}=============================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}=============================================${NC}"
    echo ""
    echo "=============================================" >> "$INSTALL_LOG" 2>/dev/null || true
    echo "$1" >> "$INSTALL_LOG" 2>/dev/null || true
    echo "=============================================" >> "$INSTALL_LOG" 2>/dev/null || true
}

export -f print_success
export -f print_error
export -f print_info
export -f print_warning
export -f print_step

# ============================================================================
# ENVIRONMENT DETECTION
# ============================================================================

# Deteksi otomatis apakah berjalan di LXC container
is_proxmox_lxc() {
    # Cek /proc/1/environ untuk container flag
    if [ -f /proc/1/environ ] && grep -q "container=lxc" /proc/1/environ 2>/dev/null; then
        return 0
    fi
    # Cek systemd-detect-virt
    if command -v systemd-detect-virt &>/dev/null; then
        local virt
        virt=$(systemd-detect-virt 2>/dev/null)
        if [[ "$virt" == "lxc" ]] || [[ "$virt" == "lxc-libvirt" ]]; then
            return 0
        fi
    fi
    # Cek /proc/vz atau /proc/bc (OpenVZ/LXC)
    if [ -f /.dockerenv ] || [ -f /run/.containerenv ]; then
        return 0
    fi
    # Cek cgroup
    if grep -q "lxc" /proc/1/cgroup 2>/dev/null; then
        return 0
    fi
    return 1
}

# Deteksi apakah berjalan di VM (KVM/QEMU/VMware/VirtualBox)
is_virtual_machine() {
    if command -v systemd-detect-virt &>/dev/null; then
        local virt
        virt=$(systemd-detect-virt 2>/dev/null)
        if [[ "$virt" =~ ^(kvm|qemu|vmware|virtualbox|xen|hyperv|oracle)$ ]]; then
            return 0
        fi
    fi
    # Cek DMI
    if [ -f /sys/class/dmi/id/product_name ]; then
        local prod
        prod=$(cat /sys/class/dmi/id/product_name 2>/dev/null | tr '[:upper:]' '[:lower:]')
        if [[ "$prod" =~ (kvm|qemu|vmware|virtualbox|virtual) ]]; then
            return 0
        fi
    fi
    return 1
}

# Cek apakah systemd berfungsi normal
check_systemd() {
    if ! command -v systemctl &>/dev/null; then
        export HAS_SYSTEMD=false
        return 1
    fi
    if ! systemctl list-units &>/dev/null 2>&1; then
        export HAS_SYSTEMD=false
        return 1
    fi
    export HAS_SYSTEMD=true
    return 0
}

# Deteksi environment secara otomatis
detect_environment() {
    if [ -n "$DEPLOY_ENV" ]; then
        # Sudah di-set manual, validasi saja
        apply_environment_settings
        return 0
    fi

    print_info "Mendeteksi environment..."

    if is_proxmox_lxc; then
        export DEPLOY_ENV="lxc"
    elif is_virtual_machine; then
        export DEPLOY_ENV="vm"
    else
        # Cek apakah ada public IP
        local pub_ip
        pub_ip=$(curl -s --connect-timeout 3 https://api.ipify.org 2>/dev/null || echo "")
        if [[ "$pub_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && \
           [[ ! "$pub_ip" =~ ^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.) ]]; then
            export DEPLOY_ENV="vps"
        else
            export DEPLOY_ENV="bare"
        fi
    fi

    apply_environment_settings
}

# Apply settings berdasarkan DEPLOY_ENV
apply_environment_settings() {
    case "$DEPLOY_ENV" in
        lxc)
            export DEPLOY_ENV_LABEL="Proxmox LXC Container"
            export IS_CONTAINER=true
            export SKIP_UFW=true        # UFW tidak support di LXC unprivileged
            check_systemd || true       # LXC bisa jalan tanpa full systemd
            ;;
        vm)
            export DEPLOY_ENV_LABEL="Proxmox VM / Local VM"
            export IS_CONTAINER=false
            export SKIP_UFW=false
            export HAS_SYSTEMD=true
            ;;
        vps)
            export DEPLOY_ENV_LABEL="Public VPS / Cloud Server"
            export IS_CONTAINER=false
            export SKIP_UFW=false
            export HAS_SYSTEMD=true
            ;;
        bare)
            export DEPLOY_ENV_LABEL="Bare Metal / Local Server"
            export IS_CONTAINER=false
            export SKIP_UFW=false
            export HAS_SYSTEMD=true
            ;;
        *)
            export DEPLOY_ENV="vps"
            export DEPLOY_ENV_LABEL="Public VPS / Cloud Server"
            export IS_CONTAINER=false
            export SKIP_UFW=false
            export HAS_SYSTEMD=true
            ;;
    esac
}

export -f is_proxmox_lxc
export -f is_virtual_machine
export -f check_systemd
export -f detect_environment
export -f apply_environment_settings

# ============================================================================
# IP ADDRESS DETECTION
# ============================================================================

detect_ip_address() {
    local PUBLIC_IP=""
    local LOCAL_IP=""
    
    # Try to get public IP from various services
    echo -e "${YELLOW}[INFO] Detecting IP address...${NC}" >&2
    
    # Method 1: Try curl to external services
    if command -v curl &> /dev/null; then
        PUBLIC_IP=$(curl -s --connect-timeout 5 https://api.ipify.org 2>/dev/null) || \
        PUBLIC_IP=$(curl -s --connect-timeout 5 https://ifconfig.me 2>/dev/null) || \
        PUBLIC_IP=$(curl -s --connect-timeout 5 https://icanhazip.com 2>/dev/null) || \
        PUBLIC_IP=$(curl -s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null) || \
        PUBLIC_IP=""
    fi
    
    # Method 2: Try wget if curl failed
    if [ -z "$PUBLIC_IP" ] && command -v wget &> /dev/null; then
        PUBLIC_IP=$(wget -qO- --timeout=5 https://api.ipify.org 2>/dev/null) || \
        PUBLIC_IP=$(wget -qO- --timeout=5 https://ifconfig.me 2>/dev/null) || \
        PUBLIC_IP=""
    fi
    
    # Get local/private IP
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}') || \
    LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}') || \
    LOCAL_IP="127.0.0.1"
    
    # Validate public IP format (basic IPv4 check)
    if [[ $PUBLIC_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        # Check if public IP is actually public (not private range)
        if [[ ! $PUBLIC_IP =~ ^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.) ]]; then
            echo "$PUBLIC_IP"
            return 0
        fi
    fi
    
    # Fallback to local IP
    echo "$LOCAL_IP"
    return 0
}

export -f detect_ip_address

# ============================================================================
# SYSTEM CHECKS
# ============================================================================

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "Please run as root (use sudo)"
        exit 1
    fi
}

export -f check_root

check_directory() {
    local CURRENT_DIR=$(pwd)
    if [[ "$CURRENT_DIR" != *"salfanet-radius"* ]] && [[ "$CURRENT_DIR" != *"SALFANET-RADIUS-main"* ]]; then
        print_error "Please run this script from the source directory"
        echo "   Current directory: $CURRENT_DIR"
        echo ""
        echo "   Expected: /root/salfanet-radius or /root/SALFANET-RADIUS-main"
        exit 1
    fi
}

export -f check_directory

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_NAME=$NAME
        OS_VERSION=$VERSION_ID
        
        if [[ "$OS_NAME" =~ "Ubuntu" ]]; then
            if [[ "$OS_VERSION" == "20.04" ]] || [[ "$OS_VERSION" == "22.04" ]] || [[ "$OS_VERSION" == "24.04" ]]; then
                print_success "Detected: Ubuntu $OS_VERSION"
                return 0
            else
                print_warning "Ubuntu version $OS_VERSION detected (recommended: 20.04, 22.04, or 24.04)"
            fi
        elif [[ "$OS_NAME" =~ "Debian" ]]; then
            print_info "Detected: Debian $OS_VERSION (Ubuntu packages will be used)"
            return 0
        else
            print_warning "OS: $OS_NAME $OS_VERSION (not tested, may have issues)"
        fi
    else
        print_warning "Cannot detect OS version"
    fi
}

export -f detect_os

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

generate_secret() {
    # Generate random secret using /dev/urandom
    head -c 32 /dev/urandom | base64 | tr -d '\n'
}

export -f generate_secret

save_install_info() {
    local KEY="$1"
    local VALUE="$2"
    
    if [ -n "$INSTALL_INFO_FILE" ]; then
        # Create directory if it doesn't exist
        local INFO_DIR=$(dirname "$INSTALL_INFO_FILE")
        if [ ! -d "$INFO_DIR" ]; then
            mkdir -p "$INFO_DIR" 2>/dev/null || true
        fi
        echo "${KEY}=${VALUE}" >> "$INSTALL_INFO_FILE" 2>/dev/null || true
    fi
}

export -f save_install_info

create_backup() {
    local SOURCE="$1"
    local BACKUP_DIR="/root/backups/$(date +%Y%m%d_%H%M%S)"
    
    if [ -e "$SOURCE" ]; then
        print_info "Creating backup of $SOURCE..."
        mkdir -p "$BACKUP_DIR"
        cp -r "$SOURCE" "$BACKUP_DIR/" 2>/dev/null || true
        print_success "Backup created: $BACKUP_DIR"
    fi
}

export -f create_backup

wait_for_service() {
    local SERVICE_NAME="$1"
    local MAX_WAIT=${2:-30}
    local COUNTER=0
    
    print_info "Waiting for $SERVICE_NAME to start..."
    
    while [ $COUNTER -lt $MAX_WAIT ]; do
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            print_success "$SERVICE_NAME is running"
            return 0
        fi
        sleep 1
        COUNTER=$((COUNTER + 1))
    done
    
    print_error "$SERVICE_NAME failed to start within ${MAX_WAIT}s"
    return 1
}

export -f wait_for_service

verify_installation() {
    local COMPONENT="$1"
    local CHECK_COMMAND="$2"
    
    if eval "$CHECK_COMMAND" &>/dev/null; then
        print_success "$COMPONENT is installed"
        return 0
    else
        print_error "$COMPONENT is NOT installed"
        return 1
    fi
}

export -f verify_installation

configure_install_telegram_notifications() {
    echo ""
    print_info "Opsional: Kirim notifikasi install ke Telegram (start/success/failed)"
    print_info "Tidak mengirim password/token/.env/data sensitif."

    local ENABLE_TELEGRAM="n"
    read -t 20 -p "Aktifkan notifikasi Telegram installer? [y/N]: " ENABLE_TELEGRAM </dev/tty || ENABLE_TELEGRAM="n"
    echo ""

    if [[ ! "$ENABLE_TELEGRAM" =~ ^[Yy]$ ]]; then
        export INSTALL_NOTIFY_TELEGRAM="false"
        print_info "Notifikasi Telegram installer: nonaktif"
        return 0
    fi

    local BOT_TOKEN=""
    local CHAT_ID=""
    local TOPIC_ID=""

    read -t 60 -p "Telegram Bot Token: " BOT_TOKEN </dev/tty || BOT_TOKEN=""
    read -t 60 -p "Telegram Chat ID: " CHAT_ID </dev/tty || CHAT_ID=""
    read -t 30 -p "Telegram Topic ID (opsional, Enter untuk skip): " TOPIC_ID </dev/tty || TOPIC_ID=""
    echo ""

    if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
        export INSTALL_NOTIFY_TELEGRAM="false"
        print_warning "Bot Token/Chat ID kosong, notifikasi Telegram dinonaktifkan"
        return 0
    fi

    export INSTALL_NOTIFY_TELEGRAM="true"
    export INSTALL_TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
    export INSTALL_TELEGRAM_CHAT_ID="$CHAT_ID"
    export INSTALL_TELEGRAM_TOPIC_ID="$TOPIC_ID"

    print_success "Notifikasi Telegram installer: aktif"
}

export -f configure_install_telegram_notifications

send_install_telegram_notification() {
    local EVENT="$1"   # started | success | failed
    local STATUS="$2"  # STARTED | SUCCESS | FAILED
    local DETAIL="$3"

    if [ "${INSTALL_NOTIFY_TELEGRAM:-false}" != "true" ]; then
        return 0
    fi

    if [ -z "${INSTALL_TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${INSTALL_TELEGRAM_CHAT_ID:-}" ]; then
        return 0
    fi

    if ! command -v curl &>/dev/null; then
        print_warning "curl tidak ditemukan, skip notifikasi Telegram installer"
        return 0
    fi

    local HOSTNAME_VALUE
    HOSTNAME_VALUE=$(hostname 2>/dev/null || echo "unknown-host")

    local ACCESS_TARGET
    ACCESS_TARGET="${VPS_DOMAIN:-${VPS_IP:-unknown}}"

    local TIME_NOW
    TIME_NOW=$(date '+%Y-%m-%d %H:%M:%S %Z')

    local MESSAGE
    MESSAGE=$(cat <<EOF
[SALFANET-RADIUS INSTALL]
Status  : ${STATUS}
Event   : ${EVENT}
Run ID  : ${INSTALL_RUN_ID}
Host    : ${HOSTNAME_VALUE}
Target  : ${ACCESS_TARGET}
Env     : ${DEPLOY_ENV_LABEL:-unknown}
Time    : ${TIME_NOW}
Detail  : ${DETAIL:-n/a}
EOF
)

    local TELEGRAM_URL="https://api.telegram.org/bot${INSTALL_TELEGRAM_BOT_TOKEN}/sendMessage"
    local RESPONSE=""

    if [ -n "${INSTALL_TELEGRAM_TOPIC_ID:-}" ]; then
        RESPONSE=$(curl -sS --max-time 10 -X POST "$TELEGRAM_URL" \
            -d "chat_id=${INSTALL_TELEGRAM_CHAT_ID}" \
            -d "message_thread_id=${INSTALL_TELEGRAM_TOPIC_ID}" \
            --data-urlencode "text=${MESSAGE}" 2>/dev/null || true)
    else
        RESPONSE=$(curl -sS --max-time 10 -X POST "$TELEGRAM_URL" \
            -d "chat_id=${INSTALL_TELEGRAM_CHAT_ID}" \
            --data-urlencode "text=${MESSAGE}" 2>/dev/null || true)
    fi

    if [[ "$RESPONSE" != *'"ok":true'* ]]; then
        print_warning "Telegram notifikasi installer gagal dikirim (install tetap lanjut)"
        return 0
    fi

    print_info "Telegram notifikasi installer terkirim: ${STATUS}"
    return 0
}

export -f send_install_telegram_notification

# ============================================================================
# BANNER FUNCTION
# ============================================================================

print_banner() {
    clear
    echo ""
    echo -e "${CYAN}=============================================${NC}"
    echo -e "${CYAN}  SALFANET RADIUS - Installer v2.10.9${NC}"
    echo -e "${CYAN}  Supports: Public VPS | Proxmox LXC/VM${NC}"
    echo -e "${CYAN}=============================================${NC}"
    if [ -n "$DEPLOY_ENV_LABEL" ]; then
        echo -e "  Environment: ${GREEN}${DEPLOY_ENV_LABEL}${NC}"
        if [ "$SKIP_UFW" = "true" ]; then
            echo -e "  ${YELLOW}[!] UFW Firewall: DILEWATI (tidak support di LXC)${NC}"
        fi
    fi
    echo ""
}

export -f print_banner

show_installation_info() {
    local DETECTED_IP="$1"
    local IP_TYPE="$2"
    
    echo -e "  Environment : ${CYAN}${DEPLOY_ENV_LABEL:-Public VPS}${NC}"
    echo -e "  Detected IP : ${CYAN}${DETECTED_IP}${NC} (${IP_TYPE})"
    echo ""
    echo "  Directory Structure:"
    echo "    Source Code: $(pwd)"
    echo "    Application: ${APP_DIR}"
    echo "    Logs: ${APP_DIR}/logs"
    echo ""
    echo "  Estimasi waktu: 20-35 menit"
    echo "  Steps:"
    echo "    1. System Update & Dependencies    (2-3 menit)"
    echo "    2. Install Node.js ${NODE_VERSION} LTS             (2 menit)"
    echo "    3. Install & Configure MySQL       (2 menit)"
    echo "    4. Setup Application & Database    (10 menit)"
    echo "    5. Install & Configure FreeRADIUS  (2 menit)"
    echo "    6. Configure Nginx Reverse Proxy   (1 menit)"
    echo "    7. Build & Start App (PM2)         (5-10 menit)"
    echo "    8. [Opsional] Build Customer APK   (20-40 menit)"
    if [ "${SKIP_UFW:-false}" = "true" ]; then
        echo ""
        echo -e "  ${YELLOW}[!] UFW firewall dilewati (Proxmox LXC).${NC}"
        echo -e "  ${YELLOW}    Konfigurasi firewall di Proxmox host.${NC}"
    fi
    echo ""
    echo -e "${YELLOW}[!] PENTING: Jangan hentikan proses ini!${NC}"
    echo ""
}

export -f show_installation_info

# ============================================================================
# USER SELECTION
# ============================================================================

initialize_user_selection() {
    print_step "Application User Configuration"
    
    # Detect current login user (not root)
    local CURRENT_USER=$(who am i | awk '{print $1}')
    if [ -z "$CURRENT_USER" ] || [ "$CURRENT_USER" = "root" ]; then
        CURRENT_USER=$(logname 2>/dev/null || whoami 2>/dev/null || echo "root")
        # If logname returned root or empty (non-interactive SSH), keep root
        if [ -z "$CURRENT_USER" ]; then
            CURRENT_USER="root"
        fi
    fi
    
    echo -e "${CYAN}Application User Options:${NC}"
    echo "  1) Use existing user: ${GREEN}$CURRENT_USER${NC} (recommended for single-user VPS)"
    echo "  2) Create dedicated user: ${YELLOW}salfanet${NC} (recommended for security/multi-user)"
    echo ""
    
    read -t 15 -p "Select option [1/2] (default: 1): " USER_CHOICE || USER_CHOICE="1"
    echo ""
    
    if [[ "$USER_CHOICE" == "2" ]]; then
        export APP_USER="salfanet"
        export APP_GROUP="salfanet"
        export CREATE_NEW_USER=true
        print_success "Will create dedicated user: salfanet"
    else
        export APP_USER="$CURRENT_USER"
        export APP_GROUP="$CURRENT_USER"
        export CREATE_NEW_USER=false
        print_success "Will use existing user: $APP_USER"
    fi
    
    echo ""
    print_info "Application will run as user: ${APP_USER}"
    print_info "Application directory: ${APP_DIR}"
    echo ""
}

export -f initialize_user_selection

# ============================================================================
# INITIALIZATION
# ============================================================================

initialize_logging() {
    # Create log directory
    mkdir -p /var/log
    
    # Create/truncate log file
    : > "$INSTALL_LOG"
    
    print_info "Logging to: $INSTALL_LOG"
}

export -f initialize_logging

# ============================================================================
# AUTO-EXECUTE ON SOURCE
# ============================================================================

# Initialize logging when this script is sourced
if [ "${BASH_SOURCE[0]}" != "${0}" ]; then
    # Being sourced
    initialize_logging
fi
