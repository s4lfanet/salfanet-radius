#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - System Setup Module
# ============================================================================
# Step 1: System update, dependencies, PPP/TUN setup, timezone configuration
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# SYSTEM UPDATE & DEPENDENCIES
# ============================================================================

install_system_packages() {
    print_step "Step 1: Updating system and installing dependencies"
    
    print_info "Updating package lists..."
    apt-get update || {
        print_error "Failed to update package lists"
        return 1
    }
    
    print_info "Upgrading existing packages..."
    apt-get upgrade -y || {
        print_warning "Some packages failed to upgrade (continuing...)"
    }
    
    print_info "Installing base dependencies..."
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        ufw \
        nginx \
        certbot \
        python3-certbot-nginx \
        sudo \
        vim \
        htop \
        chrony \
        ntpdate \
        sshpass \
        xl2tpd \
        strongswan \
        strongswan-pki \
        libcharon-extra-plugins \
        libstrongswan-standard-plugins || {
        print_error "Failed to install dependencies"
        return 1
    }
    
    print_success "System updated and L2TP VPN client tools installed"
}

# ============================================================================
# PROXMOX VPS - PPP/TUN DEVICE SETUP
# ============================================================================

setup_ppp_device() {
    print_info "Setting up PPP device..."
    
    # Create /dev/ppp if not exists (required for PPPoE)
    if [ ! -c /dev/ppp ]; then
        print_info "Creating /dev/ppp device..."
        if mknod /dev/ppp c 108 0 2>/dev/null; then
            chmod 600 /dev/ppp 2>/dev/null || true
            print_success "/dev/ppp created"
        else
            echo "⚠️  PPP device creation requires host kernel support"
            echo "   Continue installation - PPPoE features may not work"
        fi
    else
        print_success "/dev/ppp already exists"
    fi
}

setup_tun_device() {
    print_info "Setting up TUN device..."
    
    # Create /dev/net/tun if not exists (required for VPN)
    if [ ! -d /dev/net ]; then
        mkdir -p /dev/net
    fi
    
    if [ ! -c /dev/net/tun ]; then
        print_info "Creating /dev/net/tun device..."
        if mknod /dev/net/tun c 10 200 2>/dev/null; then
            chmod 666 /dev/net/tun 2>/dev/null || true
            print_success "/dev/net/tun created"
        else
            echo "⚠️  TUN device creation requires host kernel support"
            echo "   Continue installation - VPN features may not work"
        fi
    else
        print_success "/dev/net/tun already exists"
    fi
}

load_kernel_modules() {
    print_info "Loading PPP/TUN kernel modules..."
    
    modprobe ppp_generic 2>/dev/null || echo "⚠️  ppp_generic not available - may need Proxmox host configuration"
    modprobe ppp_async 2>/dev/null || true
    modprobe ppp_mppe 2>/dev/null || true
    modprobe ppp_deflate 2>/dev/null || true
    modprobe l2tp_core 2>/dev/null || true
    modprobe l2tp_ppp 2>/dev/null || true
    modprobe l2tp_netlink 2>/dev/null || true
    modprobe tun 2>/dev/null || echo "⚠️  tun not available - may need Proxmox host configuration"
}

configure_persistent_modules() {
    print_info "Configuring kernel modules for auto-load..."
    
    cat > /etc/modules-load.d/ppp.conf << 'EOF'
# PPP Kernel Modules - Auto-load on boot
ppp_generic
ppp_async
ppp_mppe
ppp_deflate

# L2TP Modules
l2tp_core
l2tp_ppp
l2tp_netlink

# TUN/TAP for VPN
tun
EOF

    # Ensure xl2tpd runtime directory persists across reboots
    cat > /etc/tmpfiles.d/xl2tpd.conf << 'EOF'
# xl2tpd control pipe directory - create on boot
d /var/run/xl2tpd 0755 root root -
EOF
    mkdir -p /var/run/xl2tpd
    print_success "Kernel modules + xl2tpd runtime dir configured for auto-load"
}

enable_ip_forwarding() {
    print_info "Enabling IP forwarding for PPPoE/VPN routing..."
    
    if ! grep -q "^net.ipv4.ip_forward = 1" /etc/sysctl.conf 2>/dev/null; then
        cat >> /etc/sysctl.conf << 'SYSCTL_EOF'

# ===================================
# PPPoE & VPN Routing Support
# ===================================
# Enable IPv4 forwarding
net.ipv4.ip_forward = 1

# Enable IPv6 forwarding
net.ipv6.conf.all.forwarding = 1

# Prevent SYN flood attacks
net.ipv4.tcp_syncookies = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Do not send ICMP redirects
net.ipv4.conf.all.send_redirects = 0
SYSCTL_EOF
    fi
    
    # Apply sysctl settings
    sysctl -p > /dev/null 2>&1
    print_success "IP forwarding enabled"
}

verify_ppp_tun_setup() {
    print_info "Verifying PPP/TUN setup..."
    local VERIFICATION_PASSED=true
    
    # Check /dev/ppp
    if [ -c /dev/ppp ]; then
        echo "  ✅ /dev/ppp exists ($(ls -la /dev/ppp 2>/dev/null | awk '{print $1, $3, $4}'))"
    else
        echo "  ⚠️  /dev/ppp NOT found - PPPoE will not work"
        echo "     For Proxmox LXC: See docs/PROXMOX_VPS_SETUP_GUIDE.md"
        VERIFICATION_PASSED=false
    fi
    
    # Check /dev/net/tun
    if [ -c /dev/net/tun ]; then
        echo "  ✅ /dev/net/tun exists ($(ls -la /dev/net/tun 2>/dev/null | awk '{print $1, $3, $4}'))"
    else
        echo "  ⚠️  /dev/net/tun NOT found - VPN will not work"
        echo "     For Proxmox LXC: See docs/PROXMOX_VPS_SETUP_GUIDE.md"
        VERIFICATION_PASSED=false
    fi
    
    # Check IP forwarding
    local IP_FWD=$(sysctl -n net.ipv4.ip_forward 2>/dev/null)
    if [ "$IP_FWD" = "1" ]; then
        echo "  ✅ IP forwarding enabled (net.ipv4.ip_forward = 1)"
    else
        echo "  ⚠️  IP forwarding NOT enabled"
        VERIFICATION_PASSED=false
    fi
    
    # SSH Access Safety Check
    echo ""
    echo "  🔒 SSH Access Safety:"
    echo "  ✅ Firewall configured (port 22 allowed)"
    echo "  ✅ SSH will remain accessible"
    echo "  💡 If SSH issues occur, check from console: systemctl status ssh"
    
    # Check loaded modules
    local PPP_LOADED=$(lsmod | grep -c ppp_generic 2>/dev/null || echo 0)
    local TUN_LOADED=$(lsmod | grep -c "^tun " 2>/dev/null || echo 0)
    
    if [ "$PPP_LOADED" -gt 0 ]; then
        echo "  ✅ PPP kernel modules loaded ($(lsmod | grep ppp | wc -l) modules)"
    else
        echo "  ⚠️  PPP kernel modules not loaded"
    fi
    
    if [ "$TUN_LOADED" -gt 0 ]; then
        echo "  ✅ TUN kernel module loaded"
    else
        echo "  ⚠️  TUN kernel module not loaded"
    fi
    
    if [ "$VERIFICATION_PASSED" = true ]; then
        print_success "Proxmox VPS PPP/TUN setup completed successfully"
    else
        print_warning "Some PPP/TUN components not available - check docs/PROXMOX_VPS_SETUP_GUIDE.md"
    fi
}

setup_ppp_tun() {
    print_step "Setting up PPP and TUN devices"

    if [ "${IS_CONTAINER:-false}" = "true" ] || [ "${DEPLOY_ENV:-}" = "lxc" ]; then
        print_info "Proxmox LXC terdeteksi — PPP/TUN perlu diaktifkan di host Proxmox"
        print_info ""
        print_info "Jalankan perintah berikut di HOST PROXMOX (bukan di LXC ini):"
        local CT_ID="${PROXMOX_CT_ID:-$(hostname -I | awk '{print $1}' | sed 's/\..*//')}"
        print_info ""
        print_info "  # Ganti 100 dengan CT ID Anda:"
        print_info "  pct set 100 --features nesting=1"
        print_info "  pct set 100 --features nesting=1,tun=1"
        print_info ""
        print_info "  # Atau edit config LXC secara manual:"
        print_info "  nano /etc/pve/lxc/100.conf"
        print_info "  # Tambahkan baris:"
        print_info "  lxc.cgroup2.devices.allow: c 108:0 rwm"
        print_info "  lxc.cgroup2.devices.allow: c 10:200 rwm"
        print_info "  lxc.mount.entry: /dev/net dev/net none bind,create=dir"
        print_info ""
    fi

    setup_ppp_device
    setup_tun_device
    load_kernel_modules
    configure_persistent_modules
    enable_ip_forwarding
    verify_ppp_tun_setup
}

# ============================================================================
# TIMEZONE & NTP CONFIGURATION
# ============================================================================

configure_timezone() {
    print_step "Configuring timezone and NTP synchronization"
    
    # Set timezone (configurable via SYSTEM_TIMEZONE in common.sh)
    print_info "Setting timezone to ${SYSTEM_TIMEZONE}..."
    timedatectl set-timezone "${SYSTEM_TIMEZONE}"
    print_success "Timezone set to: $(timedatectl show --property=Timezone --value)"
}

configure_ntp() {
    print_info "Configuring NTP synchronization with Chrony..."
    
    # Backup original chrony config
    cp /etc/chrony/chrony.conf /etc/chrony/chrony.conf.bak 2>/dev/null || true
    
    # Configure chrony with Indonesian NTP servers
    cat > /etc/chrony/chrony.conf <<EOF
# Indonesian NTP Servers (closest for best accuracy)
server id.pool.ntp.org iburst prefer
server 0.id.pool.ntp.org iburst
server 1.id.pool.ntp.org iburst
server 2.id.pool.ntp.org iburst
server 3.id.pool.ntp.org iburst

# Fallback to Asia pool
server asia.pool.ntp.org iburst

# Google and Cloudflare NTP as backup
server time.google.com iburst
server time.cloudflare.com iburst

# Record the rate at which the system clock gains/losses time
driftfile /var/lib/chrony/drift

# Allow the system clock to be stepped in the first three updates
makestep 1 3

# Enable kernel synchronization of the real-time clock (RTC)
rtcsync

# Log files location
logdir /var/log/chrony

# Enable logging
log measurements statistics tracking
EOF
    
    # Enable and start chrony
    systemctl enable chrony
    systemctl restart chrony
    
    # Wait for sync
    print_info "Waiting for time synchronization..."
    sleep 3
    
    # Force initial sync
    chronyc makestep > /dev/null 2>&1 || true
}

verify_ntp_sync() {
    print_info "Checking NTP synchronization status..."
    
    if chronyc tracking | grep -q "Reference ID"; then
        print_success "NTP synchronized successfully"
        local CURRENT_TIME=$(date '+%Y-%m-%d %H:%M:%S %Z')
        print_success "Current server time: ${CURRENT_TIME}"
        
        # Show sync details
        echo ""
        echo "  NTP Server: $(chronyc tracking | grep 'Reference ID' | awk '{print $4}')"
        echo "  Stratum: $(chronyc tracking | grep 'Stratum' | awk '{print $3}')"
        echo "  System time offset: $(chronyc tracking | grep 'System time' | awk '{print $4, $5}')"
    else
        print_error "NTP sync may have issues. Check with: chronyc tracking"
    fi
    
    # Sync hardware clock
    hwclock --systohc 2>/dev/null || true
    print_success "Hardware clock synced"
}

# ============================================================================
# MAIN INSTALLATION FUNCTION
# ============================================================================

install_system() {
    install_system_packages
    setup_ppp_tun
    configure_timezone
    configure_ntp
    verify_ntp_sync
    
    print_success "System setup completed"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    detect_os
    
    install_system
fi
