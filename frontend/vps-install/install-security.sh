#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - Security Module
# ============================================================================
# Step 8: Fail2ban (brute-force protection) + UFW Firewall configuration
# + Daily disk cleanup cronjob
# ============================================================================
# Dijalankan otomatis oleh vps-installer.sh dan updater.sh
# Bisa juga dijalankan manual: bash vps-install/install-security.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load common functions jika tersedia, atau define minimal printer
if [ -f "$SCRIPT_DIR/common.sh" ]; then
    source "$SCRIPT_DIR/common.sh"
else
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'
    print_step()    { echo -e "\n${CYAN}▶ $1${NC}"; }
    print_success() { echo -e "${GREEN}✓ $1${NC}"; }
    print_info()    { echo -e "${YELLOW}  $1${NC}"; }
    print_error()   { echo -e "${RED}✗ $1${NC}" >&2; }
    print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
fi

# ============================================================================
# FAIL2BAN — Proteksi Brute-Force SSH & Nginx
# ============================================================================

install_fail2ban() {
    print_step "Step 8a: Installing fail2ban (brute-force protection)"

    # Install jika belum ada
    if ! command -v fail2ban-client &>/dev/null; then
        print_info "Installing fail2ban..."
        apt-get install -y fail2ban python3-pyinotify || {
            print_error "Failed to install fail2ban"
            return 1
        }
        print_success "fail2ban installed"
    else
        print_info "fail2ban sudah terinstall, melanjutkan konfigurasi..."
    fi

    # Konfigurasi jail
    print_info "Writing /etc/fail2ban/jail.local..."
    cat > /etc/fail2ban/jail.local << 'JAILCONF'
[DEFAULT]
# Durasi ban: 1 jam (default)
bantime  = 3600
# Jendela pantau: 10 menit
findtime = 600
# Maks percobaan gagal sebelum di-ban
maxretry = 5
# Backend
banaction = iptables-multiport
# Jangan ban jaringan lokal/private
ignoreip = 127.0.0.1/8 ::1 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
# SSH lebih ketat: ban 2 jam
bantime  = 7200

[nginx-http-auth]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 10
JAILCONF

    # Enable & restart
    systemctl enable fail2ban
    systemctl restart fail2ban
    sleep 2

    if systemctl is-active --quiet fail2ban; then
        print_success "fail2ban aktif — jail: $(fail2ban-client status 2>/dev/null | grep 'Jail list' | sed 's/.*Jail list://;s/ //g')"
    else
        print_warning "fail2ban gagal start — cek: journalctl -u fail2ban -n 20"
    fi
}

# ============================================================================
# UFW FIREWALL — Hanya untuk VPS publik (bukan LXC container)
# ============================================================================

configure_ufw() {
    # LXC container: UFW/iptables biasanya tidak didukung di container unprivileged,
    # jadi secara default kita skip dan asumsikan firewall diatur di Proxmox host.
    # NAMUN: beberapa LXC (privileged, atau unprivileged dengan capability yang cukup)
    # tetap punya UFW aktif dari base image. Jika itu terjadi dan kita skip total,
    # admin bisa terkunci — port 80/443 tidak pernah dibuka meski Nginx sudah jalan.
    # Jadi: kalau UFW sudah aktif, tetap tambahkan rules (best-effort), tapi jangan
    # coba enable/ubah default policy (itu yang paling mungkin gagal di container).
    if [ "${IS_CONTAINER:-false}" = "true" ] || [ "${SKIP_UFW:-false}" = "true" ]; then
        if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
            print_warning "UFW terdeteksi AKTIF di container ini meski environment=LXC — menambahkan rules agar tidak terkunci"
            ufw allow 22/tcp   comment 'SSH'                    2>/dev/null || true
            ufw allow 80/tcp   comment 'HTTP'                   2>/dev/null || true
            ufw allow 443/tcp  comment 'HTTPS'                  2>/dev/null || true
            ufw allow 1812/udp comment 'RADIUS Authentication'  2>/dev/null || true
            ufw allow 1813/udp comment 'RADIUS Accounting'      2>/dev/null || true
            ufw allow 3799/udp comment 'RADIUS CoA'             2>/dev/null || true
            print_success "UFW rules ditambahkan (UFW sudah aktif sebelumnya)"
            ufw status | head -10
        else
            print_info "Skipping UFW (LXC container mode — gunakan Proxmox host firewall)"
        fi
        return 0
    fi

    print_step "Step 8b: Configuring UFW firewall"

    # Pastikan ufw terinstall
    if ! command -v ufw &>/dev/null; then
        apt-get install -y ufw || { print_error "UFW installation failed"; return 1; }
    fi

    # Tambah rules yang diperlukan
    print_info "Adding UFW rules..."
    ufw allow 22/tcp   comment 'SSH'               2>/dev/null || true
    ufw allow 80/tcp   comment 'HTTP'              2>/dev/null || true
    ufw allow 443/tcp  comment 'HTTPS'             2>/dev/null || true
    ufw allow 1812/udp comment 'RADIUS Authentication' 2>/dev/null || true
    ufw allow 1813/udp comment 'RADIUS Accounting' 2>/dev/null || true
    ufw allow 3799/udp comment 'RADIUS CoA'        2>/dev/null || true

    # Default policy: deny incoming, allow outgoing
    ufw default deny incoming  2>/dev/null || true
    ufw default allow outgoing 2>/dev/null || true

    # Enable tanpa prompt interaktif
    echo "y" | ufw enable 2>/dev/null || ufw --force enable

    print_success "UFW aktif"
    ufw status | head -5
}

# ============================================================================
# DISK CLEANUP CRONJOB — Hapus log lama otomatis setiap hari jam 02:00
# ============================================================================

setup_cleanup_cron() {
    print_step "Step 8c: Setting up daily disk cleanup"

    # Tulis cleanup script ke /usr/local/bin/
    print_info "Writing /usr/local/bin/salfanet-cleanup.sh..."
    cat > /usr/local/bin/salfanet-cleanup.sh << 'CLEANUPSCRIPT'
#!/bin/bash
# ============================================================
# Salfanet VPS Disk Cleanup Script
# Berjalan via cron setiap hari jam 02:00 WIB
# Log di /var/log/salfanet-cleanup.log
# ============================================================

LOG=/var/log/salfanet-cleanup.log
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] === Salfanet Cleanup Start ===" >> $LOG
echo "[$TIMESTAMP] Disk before: $(df -h / | tail -1)" >> $LOG

# 1. Systemd journal - simpan max 200MB / 7 hari
journalctl --vacuum-size=200M --vacuum-time=7d >> $LOG 2>&1

# 2. Syslog rotated lama (> 7 hari)
find /var/log -name "syslog.*" -mtime +7 -delete 2>/dev/null
find /var/log -name "*.gz" -mtime +30 -delete 2>/dev/null

# 3. btmp (failed login log) - truncate jika > 50MB
BTMP_SIZE=$(stat -c%s /var/log/btmp 2>/dev/null || echo 0)
if [ "$BTMP_SIZE" -gt 52428800 ]; then
    echo "[$TIMESTAMP] Truncating btmp (${BTMP_SIZE} bytes)" >> $LOG
    > /var/log/btmp
fi
find /var/log -name "btmp.*" -delete 2>/dev/null

# 4. APT cache
apt-get clean -y >> $LOG 2>&1

# 5. /tmp - hapus file sampah > 3 hari
find /tmp -maxdepth 1 -mtime +3 -name "*.zip" -delete 2>/dev/null
find /tmp -maxdepth 1 -mtime +3 -name "*.log" -delete 2>/dev/null
find /tmp -maxdepth 1 -mtime +3 -name "kotlin-daemon.*" -delete 2>/dev/null
find /tmp -maxdepth 1 -mtime +1 -name "salfanet-build-*" -type d -exec rm -rf {} + 2>/dev/null
find /tmp -maxdepth 1 -mtime +1 -name "salfanet-next-build*" -delete 2>/dev/null

# 6. PM2 logs - truncate jika > 20MB per file
find /root/.pm2/logs -name "*.log" -size +20M -exec truncate -s 10M {} \; 2>/dev/null

# 7. Gradle cache lama (> 30 hari tidak dipakai)
find /var/data/salfanet/gradle-cache -type f -atime +30 -delete 2>/dev/null
find /var/data/salfanet/gradle-cache -type d -empty -delete 2>/dev/null

# 8. APK build temp > 1 hari
find /tmp -maxdepth 1 -name "salfanet-apk-*" -type d -mtime +1 -exec rm -rf {} + 2>/dev/null

# 9. FreeRADIUS old logs
find /var/log/freeradius -name "*.log.*" -mtime +30 -delete 2>/dev/null

# 10. Prune old update backups — keep only 2 most recent
BACKUP_BASE=/root/salfanet-backups
if [ -d "$BACKUP_BASE" ]; then
    BACKUP_COUNT=$(ls -1t "$BACKUP_BASE" 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 2 ]; then
        ls -1t "$BACKUP_BASE" | tail -n +3 | while read -r OLD; do
            rm -rf "${BACKUP_BASE:?}/$OLD"
            echo "[$TIMESTAMP] Removed old backup: $OLD" >> $LOG
        done
    fi
fi

# 11. NPM cache — hapus jika > 1GB
NPM_CACHE_SIZE=$(du -sb /root/.npm 2>/dev/null | cut -f1 || echo 0)
if [ "$NPM_CACHE_SIZE" -gt 1073741824 ]; then
    npm cache clean --force >> $LOG 2>&1
    echo "[$TIMESTAMP] NPM cache cleaned (was $(( NPM_CACHE_SIZE / 1048576 ))MB)" >> $LOG
fi

# 12. Cleanup log file sendiri jika > 5MB
SELF_SIZE=$(stat -c%s $LOG 2>/dev/null || echo 0)
if [ "$SELF_SIZE" -gt 5242880 ]; then
    tail -200 $LOG > /tmp/cleanup-log-trim && mv /tmp/cleanup-log-trim $LOG
fi

TIMESTAMP_END=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP_END] Disk after: $(df -h / | tail -1)" >> $LOG
echo "[$TIMESTAMP_END] === Cleanup Done ===" >> $LOG
echo "" >> $LOG
CLEANUPSCRIPT

    chmod +x /usr/local/bin/salfanet-cleanup.sh

    # Pasang cronjob harian jam 02:00 (idempotent — hapus entry lama dulu)
    ( crontab -l 2>/dev/null | grep -v salfanet-cleanup
      echo "0 2 * * * /usr/local/bin/salfanet-cleanup.sh"
    ) | crontab -

    print_success "Cleanup script terpasang di /usr/local/bin/salfanet-cleanup.sh"
    print_success "Cronjob: setiap hari jam 02:00 WIB"
    print_info "Log: /var/log/salfanet-cleanup.log"
}

# ============================================================================
# MAIN — Jalankan semua langkah security
# ============================================================================

install_security() {
    install_fail2ban
    configure_ufw
    setup_cleanup_cron

    echo ""
    print_success "Security setup selesai:"
    print_info "  • fail2ban aktif — ban SSH brute-force setelah 5x gagal (ban 2 jam)"
    print_info "  • UFW firewall aktif — default deny, only allow 22/80/443/1812-1813/3799"
    print_info "  • Disk cleanup cronjob — setiap hari jam 02:00 (log, tmp, apt cache)"
    echo ""
    print_info "Perintah berguna:"
    print_info "  fail2ban-client status sshd          # Lihat IP yang di-ban"
    print_info "  fail2ban-client set sshd unbanip IP  # Buka ban IP tertentu"
    print_info "  ufw status verbose                   # Status firewall"
    print_info "  bash /usr/local/bin/salfanet-cleanup.sh  # Cleanup manual"
}

# Jika dijalankan langsung (bukan di-source)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ "$EUID" -ne 0 ]; then
        echo "Jalankan sebagai root: sudo bash vps-install/install-security.sh"
        exit 1
    fi
    install_security
fi
