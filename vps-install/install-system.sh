#!/bin/bash
# ============================================================================
# SALFANET RADIUS — System Prerequisites
# ============================================================================
# Installs: base packages, timezone, swap (for low-RAM VPS)
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_system() {
    print_step "System Packages & Timezone"

    export DEBIAN_FRONTEND=noninteractive

    # Update repos
    apt-get update -qq
    apt-get upgrade -yqq

    # Base packages
    apt-get install -yqq \
        curl wget git build-essential \
        ca-certificates gnupg lsb-release \
        software-properties-common \
        unzip jq htop vim \
        ufw fail2ban \
        chrony 2>/dev/null || true

    # Timezone
    timedatectl set-timezone "$SYSTEM_TIMEZONE" 2>/dev/null || true
    print_success "Timezone set to $SYSTEM_TIMEZONE"

    # Swap (if < 2GB RAM)
    local ram_kb
    ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    if [ "$ram_kb" -lt 2097152 ] && [ ! -f /swapfile ]; then
        print_info "Low RAM detected — creating 2GB swap..."
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        print_success "Swap enabled (2GB)"
    fi

    # Chrony (NTP)
    systemctl enable chrony 2>/dev/null || true
    systemctl start chrony 2>/dev/null || true

    print_success "System packages installed"
}
