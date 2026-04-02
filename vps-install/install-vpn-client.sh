#!/bin/bash
# ============================================================================
# SALFANET RADIUS - SSTP VPN Client Installer
# ============================================================================
# Installs SSTP VPN client tooling so VPS dapat terhubung ke MikroTik CHR
# via SSTP menggunakan credentials dari admin panel.
#
# Kenapa perlu LD_PRELOAD shim?
#   MikroTik SSTP server memakai ADH (Anonymous Diffie-Hellman) — tanpa
#   server certificate. Ubuntu 24.04 / OpenSSL 3.x memblok ADH secara
#   default. Shim memaksa cipher yang kompatibel dan membypass CRYPTO BIND.
#
# Dipanggil oleh: vps-installer.sh (Step 10 opsional)
# ============================================================================

VPN_DIR="/etc/vpn"
VPN_CONNECT_BIN="/usr/local/bin/vpn-connect"
SERVICE_FILE="/etc/systemd/system/sstp-vpn.service"
PPP_HOOK="/etc/ppp/ip-up.d/99-vpn-routes"

install_vpn_client() {
    print_step "Step 10: SSTP VPN Client Setup"

    # ─── [1] Paket yang dibutuhkan ─────────────────────────────────────
    print_info "[1/5] Menginstall paket sstpc, gcc, libssl-dev..."
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        sstp-client ppp gcc libssl-dev 2>&1 | grep -E 'install|already' || true

    if ! command -v sstpc &>/dev/null; then
        print_error "sstpc tidak terinstall. Pastikan repo Ubuntu tersedia."
        return 1
    fi
    print_success "  sstpc: $(sstpc --version 2>&1 | head -1)"
    print_success "  gcc: $(gcc --version | head -1)"

    # ─── [2] OpenSSL config (enable ADH / TLS legacy for MikroTik) ─────
    print_info "[2/5] Membuat /etc/vpn/sstp-openssl.cnf..."
    mkdir -p "${VPN_DIR}"
    cat > "${VPN_DIR}/sstp-openssl.cnf" << 'OPENSSLEOF'
openssl_conf = openssl_init

[openssl_init]
ssl_conf = ssl_sect

[ssl_sect]
system_default = system_default_sect

[system_default_sect]
MinProtocol = TLSv1
CipherString = ALL:aNULL:eNULL:ADH:AECDH:@SECLEVEL=0
Options = UnsafeLegacyRenegotiation
OPENSSLEOF
    chmod 644 "${VPN_DIR}/sstp-openssl.cnf"
    print_success "  /etc/vpn/sstp-openssl.cnf dibuat"

    # ─── [3] Build LD_PRELOAD shim ──────────────────────────────────────
    # Shim ini:
    #   - SSL_CTX_set_cipher_list → paksa ALL:aNULL:eNULL:ADH:@SECLEVEL=0
    #   - SSL_CTX_set_security_level → paksa level 0 (izinkan ADH)
    #   - SSL_get1_peer_certificate → return empty cert stub (ADH = no cert)
    #   - X509_digest → return zero SHA-256 thumbprint (SSTP CRYPTO BIND)
    print_info "[3/5] Mengcompile ssl-intercept.so (LD_PRELOAD shim)..."
    cat > /tmp/ssl-intercept-build.c << 'CEOF'
#define _GNU_SOURCE
#include <dlfcn.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>
#include <openssl/evp.h>
#include <stdio.h>
#include <string.h>

/* MikroTik SSTP uses ADH (Anonymous DH) — no server certificate.
 * Ubuntu 24.04 / OpenSSL 3.x blocks ADH by default.
 * This shim overrides sstpc's hardcoded cipher list and bypasses
 * the SSTP CRYPTO BIND certificate requirement. */

static const char *ADH_CIPHERS = "ALL:aNULL:eNULL:ADH:AECDH:@SECLEVEL=0";

/* Force ADH cipher list (sstpc hardcodes "DEFAULT" which excludes ADH) */
int SSL_CTX_set_cipher_list(SSL_CTX *ctx, const char *str) {
    typedef int (*fn_t)(SSL_CTX *, const char *);
    fn_t fn = (fn_t)dlsym(RTLD_NEXT, "SSL_CTX_set_cipher_list");
    return fn(ctx, ADH_CIPHERS);
}

/* Lower SSL security level to allow ADH */
void SSL_CTX_set_security_level(SSL_CTX *ctx, int level) {
    typedef void (*fn_t)(SSL_CTX *, int);
    fn_t fn = (fn_t)dlsym(RTLD_NEXT, "SSL_CTX_set_security_level");
    if (fn) fn(ctx, 0);
}

/* ADH sends no certificate — return empty X509 stub so sstpc can
 * proceed with SSTP CRYPTO BIND negotiation */
X509 *SSL_get1_peer_certificate(const SSL *ssl) {
    return X509_new();
}

/* Return zero thumbprint (ADH = no real cert to hash) */
int X509_digest(const X509 *x, const EVP_MD *type, unsigned char *md, unsigned int *len) {
    int mdlen = EVP_MD_get_size(type);
    memset(md, 0, (size_t)mdlen);
    if (len) *len = (unsigned int)mdlen;
    return 1;
}
CEOF

    if gcc -shared -fPIC -o "${VPN_DIR}/ssl-intercept.so" \
            /tmp/ssl-intercept-build.c -ldl -lssl -lcrypto 2>&1; then
        chmod 755 "${VPN_DIR}/ssl-intercept.so"
        rm -f /tmp/ssl-intercept-build.c
        print_success "  ${VPN_DIR}/ssl-intercept.so dikompilasi"
    else
        print_error "Gagal mengcompile ssl-intercept.so"
        return 1
    fi

    # ─── [4] vpn-connect management script ─────────────────────────────
    print_info "[4/5] Membuat vpn-connect management script..."
    cat > "${VPN_DIR}/vpn-connect.sh" << 'SCRIPTEOF'
#!/bin/bash
# vpn-connect — kelola koneksi SSTP VPN ke MikroTik CHR
# Usage: vpn-connect <start|stop|restart|status> [SERVER] [USER] [PASS]
# Atau:  vpn-connect start  (menggunakan /etc/vpn/vpn.conf jika ada)

VPN_DIR="/etc/vpn"
CONF_FILE="${VPN_DIR}/vpn.conf"

load_conf() {
    [ -f "${CONF_FILE}" ] && source "${CONF_FILE}"
}

start_vpn() {
    local SERVER="${1:-${VPN_SERVER:-}}"
    local USER="${2:-${VPN_USER:-}}"
    local PASS="${3:-${VPN_PASS:-}}"

    if [ -z "${SERVER}" ] || [ -z "${USER}" ] || [ -z "${PASS}" ]; then
        echo "ERROR: Kredensial VPN belum dikonfigurasi."
        echo "  Cara 1: vpn-connect start <SERVER> <USER> <PASS>"
        echo "  Cara 2: set VPN_SERVER/VPN_USER/VPN_PASS di ${CONF_FILE}"
        return 1
    fi

    # Update ppp chap-secrets
    mkdir -p /etc/ppp
    grep -v "^\"${USER}\"" /etc/ppp/chap-secrets > /tmp/chap-tmp 2>/dev/null || true
    mv /tmp/chap-tmp /etc/ppp/chap-secrets 2>/dev/null || true
    echo "\"${USER}\" SSTP-VPN \"${PASS}\" *" >> /etc/ppp/chap-secrets
    chmod 600 /etc/ppp/chap-secrets

    mkdir -p /var/run/sstpc
    pkill -f "sstpc.*${SERVER}" 2>/dev/null; sleep 1

    export LD_PRELOAD="${VPN_DIR}/ssl-intercept.so"
    export OPENSSL_CONF="${VPN_DIR}/sstp-openssl.cnf"

    /usr/sbin/sstpc \
        --cert-warn \
        --log-syslog /dev/log \
        "${SERVER}" \
        user "${USER}" \
        password "${PASS}" \
        remotename SSTP-VPN \
        noauth \
        nodefaultroute \
        refuse-pap \
        usepeerdns \
        lock &
    echo $! > /var/run/sstp-vpn.pid
    echo "VPN started: sstpc PID=$!"
    sleep 5
    ip addr show | grep -A4 ppp 2>/dev/null || echo "(ppp0 belum aktif — tunggu 5-10 detik)"
}

stop_vpn() {
    local SERVER="${1:-${VPN_SERVER:-}}"
    if [ -n "${SERVER}" ]; then
        pkill -f "sstpc.*${SERVER}" 2>/dev/null
    else
        pkill -f sstpc 2>/dev/null
    fi
    pkill -f "pppd.*sstp" 2>/dev/null
    rm -f /var/run/sstp-vpn.pid
    echo "VPN stopped"
}

status_vpn() {
    local SERVER="${1:-${VPN_SERVER:-}}"
    if pgrep -f "sstpc" > /dev/null; then
        echo "STATUS: RUNNING"
        ip addr show | grep -A6 ppp || echo "(ppp0: starting up...)"
        ip route | grep ppp || echo "(routes: not set yet)"
    else
        echo "STATUS: NOT RUNNING"
    fi
}

load_conf
case "${1:-status}" in
    start)   start_vpn  "${2:-}" "${3:-}" "${4:-}" ;;
    stop)    stop_vpn   "${2:-}" ;;
    restart) stop_vpn   "${2:-}"; sleep 2; start_vpn "${2:-}" "${3:-}" "${4:-}" ;;
    status)  status_vpn "${2:-}" ;;
    *) echo "Usage: vpn-connect {start|stop|restart|status} [SERVER] [USER] [PASS]" ;;
esac
SCRIPTEOF
    chmod +x "${VPN_DIR}/vpn-connect.sh"
    ln -sf "${VPN_DIR}/vpn-connect.sh" "${VPN_CONNECT_BIN}"
    print_success "  ${VPN_CONNECT_BIN} tersedia"

    # ─── [5] PPP ip-up hook (auto routing saat ppp0 naik) ──────────────
    print_info "[5/5] Membuat PPP ip-up hook untuk auto-routing..."
    mkdir -p /etc/ppp/ip-up.d
    cat > "${PPP_HOOK}" << 'HOOK'
#!/bin/bash
# Auto-configure routes + iptables saat ppp0 aktif
# $1=iface $2=tty $3=speed $4=local_ip $5=remote_ip $6=ipparam
# PENTING: nama file HARUS tanpa ekstensi agar run-parts mengeksekusinya.
IFACE="$1"
LOCAL_IP="$4"
PEER_IP="$5"

[ -z "${IFACE}" ] && exit 0
logger -t vpn-route "PPP up: iface=${IFACE} local=${LOCAL_IP} peer=${PEER_IP}"

# Baca VPN_SUBNET dari conf jika ada
VPN_DIR="/etc/vpn"
VPN_SUBNET=""
[ -f "${VPN_DIR}/vpn.conf" ] && source "${VPN_DIR}/vpn.conf"

# Fallback: turunkan /24 subnet dari peer IP jika VPN_SUBNET belum dikonfigurasi
# Contoh: PEER_IP=10.20.30.1 -> VPN_SUBNET=10.20.30.0/24
if [ -z "${VPN_SUBNET:-}" ] && [ -n "${PEER_IP}" ]; then
    VPN_SUBNET="$(echo "${PEER_IP}" | cut -d. -f1-3).0/24"
    logger -t vpn-route "VPN_SUBNET tidak dikonfigurasi, gunakan fallback: ${VPN_SUBNET}"
fi

if [ -n "${VPN_SUBNET:-}" ]; then
    ip route replace "${VPN_SUBNET}" via "${PEER_IP}" dev "${IFACE}" metric 100 2>/dev/null || true
    iptables -C INPUT -s "${VPN_SUBNET}" -p udp --dport 1812 -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 1 -s "${VPN_SUBNET}" -p udp --dport 1812 -j ACCEPT
    iptables -C INPUT -s "${VPN_SUBNET}" -p udp --dport 1813 -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 1 -s "${VPN_SUBNET}" -p udp --dport 1813 -j ACCEPT
    iptables -C INPUT -s "${VPN_SUBNET}" -p udp --dport 3799 -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 1 -s "${VPN_SUBNET}" -p udp --dport 3799 -j ACCEPT
    iptables -C INPUT -s "${VPN_SUBNET}" -p icmp -j ACCEPT 2>/dev/null || \
        iptables -I INPUT 1 -s "${VPN_SUBNET}" -p icmp -j ACCEPT
    iptables -C FORWARD -s "${VPN_SUBNET}" -j ACCEPT 2>/dev/null || \
        iptables -I FORWARD 1 -s "${VPN_SUBNET}" -j ACCEPT
    iptables -C FORWARD -d "${VPN_SUBNET}" -j ACCEPT 2>/dev/null || \
        iptables -I FORWARD 1 -d "${VPN_SUBNET}" -j ACCEPT
    logger -t vpn-route "Routes OK: ${VPN_SUBNET} via ${PEER_IP} on ${IFACE}"
fi

# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1 &>/dev/null || true
HOOK
    chmod +x "${PPP_HOOK}"
    print_success "  ${PPP_HOOK} dibuat"

    # ─── [6] Systemd service template ──────────────────────────────────
    # Service tidak langsung start — credentials dikonfigurasi via admin panel
    cat > "${SERVICE_FILE}" << 'SVCEOF'
[Unit]
Description=SSTP VPN Client to MikroTik CHR
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
EnvironmentFile=/etc/vpn/vpn.conf
Environment=LD_PRELOAD=/etc/vpn/ssl-intercept.so
Environment=OPENSSL_CONF=/etc/vpn/sstp-openssl.cnf
ExecStartPre=/bin/mkdir -p /var/run/sstpc
ExecStartPre=/bin/bash -c 'echo "\"${VPN_USER}\" SSTP-VPN \"${VPN_PASS}\" *" > /etc/ppp/chap-secrets && chmod 600 /etc/ppp/chap-secrets'
ExecStart=/usr/sbin/sstpc --cert-warn --log-syslog /dev/log \
    ${VPN_SERVER} \
    user ${VPN_USER} \
    password ${VPN_PASS} \
    remotename SSTP-VPN \
    noauth nodefaultroute refuse-pap usepeerdns lock
Restart=on-failure
RestartSec=15

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    print_success "  sstp-vpn.service dibuat (belum aktif — konfigurasi dulu via admin panel)"

    # ─── Ringkasan ──────────────────────────────────────────────────────
    echo ""
    echo -e "${WHITE}=====================================================${NC}"
    echo -e "${GREEN}  SSTP VPN Client Tools Terinstall${NC}"
    echo -e "${WHITE}=====================================================${NC}"
    echo ""
    echo "  File:"
    echo "    /etc/vpn/ssl-intercept.so   — TLS/ADH shim"
    echo "    /etc/vpn/sstp-openssl.cnf   — OpenSSL legacy TLS config"
    echo "    /etc/vpn/vpn.conf           — Konfigurasi kredensial (dibuat manual)"
    echo "    /usr/local/bin/vpn-connect  — Management script"
    echo "    /etc/systemd/system/sstp-vpn.service"
    echo ""
    echo "  Setup koneksi:"
    echo "    1. Buat VPN Client di admin panel: /admin/network/vpn-client"
    echo "    2. Pilih tipe SSTP, salin kredensial yang ditampilkan"
    echo "    3. Edit /etc/vpn/vpn.conf:"
    echo "         VPN_SERVER=<IP MikroTik>"
    echo "         VPN_USER=<username>"
    echo "         VPN_PASS=<password>"
    echo "         VPN_SUBNET=<subnet VPN, misal 10.20.30.0/24>"
    echo ""
    echo "    4. Jalankan: vpn-connect start"
    echo "       Atau:     systemctl start sstp-vpn && systemctl enable sstp-vpn"
    echo ""
}

# Jalankan langsung jika dipanggil sebagai script
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Load common.sh jika tersedia
    SCRIPT_DIR_VPN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "${SCRIPT_DIR_VPN}/common.sh" ]; then
        source "${SCRIPT_DIR_VPN}/common.sh"
    else
        # Fallback print functions jika tidak ada common.sh
        print_step()   { echo ""; echo "=== $1 ==="; }
        print_info()   { echo "[INFO] $1"; }
        print_success(){ echo "[OK]   $1"; }
        print_error()  { echo "[ERR]  $1" >&2; }
        print_warning(){ echo "[WARN] $1"; }
        WHITE=""; GREEN=""; CYAN=""; YELLOW=""; NC=""
    fi
    install_vpn_client
fi
