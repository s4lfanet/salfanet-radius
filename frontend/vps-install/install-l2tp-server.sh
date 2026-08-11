#!/bin/bash
# ============================================================================
# SALFANET RADIUS — L2TP/IPsec VPN SERVER Installer
# ============================================================================
# Mengkonfigurasi VPS sebagai L2TP/IPsec VPN SERVER (strongSwan + xl2tpd)
# Cocok untuk NAS RouterOS 6.x yang tidak support WireGuard.
#
# Arsitektur:
#   NAS (MikroTik RouterOS 6+) ← L2TP/IPsec client → VPS (xl2tpd/strongswan)
#   VPS assign IP pool 10.201.0.x per NAS → FreeRADIUS sees NAS by VP IP
#
# Dipanggil oleh: vps-installer.sh (Step opsional) atau manual
#
# Usage:
#   bash install-l2tp-server.sh [--subnet 10.201.0.0/24] [--ipsec-psk "my-psk"]
#   Variabel lingkungan:
#     L2TP_SUBNET    — IP pool untuk klien L2TP (default: 10.201.0.0/24)
#     L2TP_PSK       — IPsec Pre-Shared Key (default: auto-generated)
#     L2TP_LOCAL_IP  — IP VPS di dalam tunnel (default: derived dari subnet .1)
# ============================================================================

set -euo pipefail

# ── Nilai default ──────────────────────────────────────────────────────────
L2TP_SUBNET="${L2TP_SUBNET:-10.201.0.0/24}"
L2TP_PSK="${L2TP_PSK:-}"           # Dikosongkan = auto-generate
L2TP_CONF_DIR="/etc/salfanet/l2tp"
INFO_FILE="${L2TP_CONF_DIR}/l2tp-server-info.json"

# Parse CLI args
while [[ $# -gt 0 ]]; do
  case $1 in
    --subnet)    L2TP_SUBNET="$2";  shift 2 ;;
    --ipsec-psk) L2TP_PSK="$2";     shift 2 ;;
    *) shift ;;
  esac
done

# ── Helper functions ───────────────────────────────────────────────────────
print_header() { echo ""; echo "╔══════════════════════════════════════════╗"; echo "║  L2TP/IPsec VPN Server — SALFANET RADIUS ║"; echo "╚══════════════════════════════════════════╝"; echo ""; }
print_info()    { echo "[INFO]  $*"; }
print_ok()      { echo "[OK]    $*"; }
print_warn()    { echo "[WARN]  $*"; }
print_error()   { echo "[ERROR] $*" >&2; }

gen_password() { tr -dc 'A-Za-z0-9!@#%^&*' < /dev/urandom | head -c 24 || true; }

# Derive IP dari subnet
derive_ip() {
  local subnet="$1" octet="$2"
  local base="${subnet%/*}"
  echo "$(echo "$base" | cut -d. -f1-3).${octet}"
}

# ── Root check ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  print_error "Harus dijalankan sebagai root"
  exit 1
fi

print_header

# ── Derive IPs ─────────────────────────────────────────────────────────────
L2TP_LOCAL_IP="${L2TP_LOCAL_IP:-$(derive_ip "${L2TP_SUBNET}" 1)}"
L2TP_POOL_START="$(derive_ip "${L2TP_SUBNET}" 10)"
L2TP_POOL_END="$(derive_ip "${L2TP_SUBNET}" 254)"
SUBNET_MASK="${L2TP_SUBNET#*/}"

if [[ -z "${L2TP_PSK}" ]]; then
  # Auto-generate PSK jika tidak diisi, tapi simpan agar konsisten
  PSK_FILE="/etc/salfanet/l2tp/ipsec.psk"
  if [[ -f "${PSK_FILE}" ]]; then
    L2TP_PSK="$(cat "${PSK_FILE}")"
  else
    L2TP_PSK="$(gen_password)"
  fi
fi

PUBLIC_IP=""
PUBLIC_IP=$(curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || \
            curl -4 -s --connect-timeout 5 api.ipify.org 2>/dev/null || \
            hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

print_info "Subnet      : ${L2TP_SUBNET}"
print_info "VPS local IP: ${L2TP_LOCAL_IP}"
print_info "Pool        : ${L2TP_POOL_START} – ${L2TP_POOL_END}"
print_info "Public IP   : ${PUBLIC_IP}"

# ── [1] Install packages ───────────────────────────────────────────────────
print_info "[1/6] Install strongswan + xl2tpd..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  strongswan strongswan-pki libcharon-extra-plugins \
  xl2tpd ppp iptables || { print_error "apt-get install gagal"; exit 1; }

for bin in xl2tpd ipsec; do
  if ! command -v "$bin" &>/dev/null; then
    print_error "$bin tidak terinstall"
    exit 1
  fi
done
print_ok "strongSwan: $(ipsec --version 2>&1 | head -1)"
print_ok "xl2tpd   : $(xl2tpd --version 2>&1 | head -1 || echo 'installed')"

# ── [2] IPsec / strongSwan config ─────────────────────────────────────────
print_info "[2/6] Konfigurasi strongSwan..."
mkdir -p "${L2TP_CONF_DIR}"
chmod 700 "${L2TP_CONF_DIR}"

# Simpan PSK
echo "${L2TP_PSK}" > "${L2TP_CONF_DIR}/ipsec.psk"
chmod 600 "${L2TP_CONF_DIR}/ipsec.psk"

cat > /etc/ipsec.conf << IPSECEOF
# SALFANET RADIUS — strongSwan L2TP/IPsec Server
# managed by salfanet-radius app

config setup
  uniqueIDs=no

conn %default
  ikelifetime=60m
  keylife=20m
  rekeymargin=3m
  keyingtries=1
  authby=secret
  ike=aes256-sha256-modp2048,aes256-sha1-modp1024!
  esp=aes256-sha256,aes256-sha1!

conn L2TP-PSK
  keyexchange=ikev1
  left=%defaultroute
  leftprotoport=17/1701
  right=%any
  rightprotoport=17/%any
  type=transport
  auto=add
IPSECEOF

# IPsec secrets (PSK wildcard — berlaku untuk IP mana pun)
cat > /etc/ipsec.secrets << SECREOF
# SALFANET RADIUS — IPsec PSK
# Format: local remote : PSK "secret"
%any  %any  : PSK "${L2TP_PSK}"
SECREOF
chmod 600 /etc/ipsec.secrets

print_ok "strongSwan dikonfigurasi (PSK: ${L2TP_PSK:0:8}...)"

# ── [3] xl2tpd server config ───────────────────────────────────────────────
print_info "[3/6] Konfigurasi xl2tpd server..."

cat > /etc/xl2tpd/xl2tpd.conf << XEOF
[global]
port = 1701
auth file = /etc/ppp/chap-secrets
access control = no

[lns default]
ip range = ${L2TP_POOL_START}-${L2TP_POOL_END}
local ip = ${L2TP_LOCAL_IP}
require chap = yes
refuse pap = yes
require authentication = yes
ppp debug = yes
pppoptfile = /etc/ppp/options.xl2tpd.server
length bit = yes
XEOF

cat > /etc/ppp/options.xl2tpd.server << PPPEOF
# PPP options for xl2tpd server (SALFANET RADIUS)
ipcp-accept-local
ipcp-accept-remote
ms-dns 8.8.8.8
ms-dns 8.8.4.4
noccp
auth
mtu 1280
mru 1280
nodefaultroute
persist
lock
proxyarp
connect-delay 5000
# LCP keepalive
lcp-echo-interval 30
lcp-echo-failure 4
PPPEOF

print_ok "xl2tpd server dikonfigurasi"

# ── [4] IP forwarding + iptables ──────────────────────────────────────────
print_info "[4/6] Aktifkan IP forwarding + firewall rules..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null

SYSCTL_FILE="/etc/sysctl.d/99-l2tp-forward.conf"
if [[ ! -f "${SYSCTL_FILE}" ]]; then
  echo "net.ipv4.ip_forward = 1" > "${SYSCTL_FILE}"
fi

# UFW atau iptables
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 500/udp  comment "IPsec IKE"     > /dev/null 2>&1 || true
  ufw allow 4500/udp comment "IPsec NAT-T"   > /dev/null 2>&1 || true
  ufw allow 1701/udp comment "L2TP"          > /dev/null 2>&1 || true
  print_ok "UFW: 500/4500/1701 udp dibuka"
else
  for port in 500 4500 1701; do
    iptables -C INPUT -p udp --dport "${port}" -j ACCEPT 2>/dev/null || \
      iptables -I INPUT -p udp --dport "${port}" -j ACCEPT
  done
  print_ok "iptables: 500/4500/1701 udp dibuka"
fi

# RADIUS dari L2TP pool
for port in 1812 1813 3799; do
  iptables -C INPUT -s "${L2TP_SUBNET}" -p udp --dport "${port}" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -s "${L2TP_SUBNET}" -p udp --dport "${port}" -j ACCEPT
done
print_ok "RADIUS ports terbuka dari L2TP subnet"

# ── [5] Enable + start services ───────────────────────────────────────────
print_info "[5/6] Aktifkan dan start services..."

systemctl enable strongswan-starter 2>/dev/null || systemctl enable ipsec 2>/dev/null || true
systemctl enable xl2tpd 2>/dev/null || true

# Restart strongSwan
if systemctl is-active --quiet strongswan-starter 2>/dev/null; then
  systemctl restart strongswan-starter
elif systemctl is-active --quiet ipsec 2>/dev/null; then
  systemctl restart ipsec
else
  systemctl start strongswan-starter 2>/dev/null || systemctl start ipsec 2>/dev/null || true
fi

# Restart xl2tpd
if systemctl is-active --quiet xl2tpd; then
  systemctl restart xl2tpd
else
  systemctl start xl2tpd
fi

sleep 1
if systemctl is-active --quiet xl2tpd; then
  print_ok "xl2tpd running"
else
  print_warn "xl2tpd mungkin tidak jalan — cek: systemctl status xl2tpd"
fi

# ── [6] Simpan server info ─────────────────────────────────────────────────
print_info "[6/6] Simpan server info..."

cat > "${INFO_FILE}" << JSONEOF
{
  "type": "l2tp-ipsec",
  "localIp": "${L2TP_LOCAL_IP}",
  "subnet": "${L2TP_SUBNET}",
  "poolStart": "${L2TP_POOL_START}",
  "poolEnd": "${L2TP_POOL_END}",
  "ipsecPsk": "${L2TP_PSK}",
  "publicIp": "${PUBLIC_IP}",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONEOF
chmod 640 "${INFO_FILE}"

# ── Helper script: tambah/hapus NAS credentials ────────────────────────────
# Dipanggil oleh salfanet-radius app via shell exec untuk manage NAS peers
cat > /usr/local/bin/salfanet-l2tp-peer << 'PEEREOF'
#!/bin/bash
# Usage:
#   salfanet-l2tp-peer add <username> <password> <vpn_ip>
#   salfanet-l2tp-peer remove <username>
#   salfanet-l2tp-peer list

set -euo pipefail
CMD="${1:-list}"
CHAP_FILE="/etc/ppp/chap-secrets"

case "${CMD}" in
  add)
    USER="$2"; PASS="$3"; VPN_IP="${4:-*}"
    CHAP_TMP=$(mktemp)
    # Hapus entry lama dengan username yang sama dulu
    grep -v "^\"${USER}\"" "${CHAP_FILE}" > "${CHAP_TMP}" 2>/dev/null || true
    mv "${CHAP_TMP}" "${CHAP_FILE}" 2>/dev/null || true
    # Tambah baru
    echo "\"${USER}\" * \"${PASS}\" ${VPN_IP}" >> "${CHAP_FILE}"
    chmod 600 "${CHAP_FILE}"
    # Restart xl2tpd agar baca chap-secrets baru
    systemctl reload xl2tpd 2>/dev/null || systemctl restart xl2tpd 2>/dev/null || true
    echo "OK: peer ${USER} ditambahkan"
    ;;
  remove)
    USER="$2"
    CHAP_TMP=$(mktemp)
    grep -v "^\"${USER}\"" "${CHAP_FILE}" > "${CHAP_TMP}" 2>/dev/null || true
    mv "${CHAP_TMP}" "${CHAP_FILE}" 2>/dev/null || true
    chmod 600 "${CHAP_FILE}"
    systemctl reload xl2tpd 2>/dev/null || true
    echo "OK: peer ${USER} dihapus"
    ;;
  list)
    echo "=== L2TP NAS Peers ==="
    cat "${CHAP_FILE}" 2>/dev/null || echo "(kosong)"
    ;;
  *) echo "Usage: $0 add|remove|list"; exit 1 ;;
esac
PEEREOF
chmod +x /usr/local/bin/salfanet-l2tp-peer
print_ok "Helper /usr/local/bin/salfanet-l2tp-peer dibuat"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          L2TP/IPsec Server INSTALLED ✅                   ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  Public IP   : %-41s ║\n" "${PUBLIC_IP}"
printf "║  VPS local IP: %-41s ║\n" "${L2TP_LOCAL_IP}"
printf "║  Pool        : %-41s ║\n" "${L2TP_POOL_START} – ${L2TP_POOL_END}"
printf "║  IPsec PSK   : %-41s ║\n" "${L2TP_PSK}"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  MikroTik setup (RouterOS):                              ║"
printf "║  server: %-47s ║\n" "${PUBLIC_IP}"
printf "║  ipsec-secret: %-41s ║\n" "${L2TP_PSK}"
echo "║  (gunakan script otomatis dari admin panel)              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
