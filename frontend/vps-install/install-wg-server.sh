#!/bin/bash
# ============================================================================
# SALFANET RADIUS — WireGuard VPN Server Installer
# ============================================================================
# Mengkonfigurasi VPS sebagai WireGuard VPN SERVER sehingga NAS/router
# (MikroTik) bisa terhubung langsung ke VPS tanpa perlu CHR forwarder.
#
# Arsitektur:
#   NAS (MikroTik) ← WireGuard client → VPS (wg0) ← FreeRADIUS
#
# Keuntungan vs L2TP-via-CHR:
#   - Tidak perlu MikroTik CHR sebagai forwarder
#   - Setiap NAS punya VPN IP unik → FreeRADIUS auth per-NAS tanpa masquerade
#   - WireGuard: overhead minimal, koneksi stabil, kernel-native di Ubuntu 20+
#   - Peer management: tambah/hapus NAS tanpa restart tunnel (wg syncconf)
#
# Dipanggil oleh: vps-installer.sh (Step opsional) atau manual
# Juga dipanggil oleh salfanet-radius app saat klik "Setup WireGuard" di UI
#
# Usage:
#   bash install-wg-server.sh [--subnet 10.200.0.0/24] [--port 51820]
#   Variabel lingkungan:
#     WG_SUBNET   — subnet WireGuard (default: 10.200.0.0/24)
#     WG_PORT     — UDP port listen (default: 51820)
#     WG_IFACE    — nama interface (default: wg0)
# ============================================================================

set -euo pipefail

# ── Nilai default ──────────────────────────────────────────────────────────
WG_IFACE="${WG_IFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.200.0.0/24}"
WG_CONF="/etc/wireguard/${WG_IFACE}.conf"
WG_KEYS_DIR="/etc/wireguard/keys"
SERVER_PUBKEY_FILE="${WG_KEYS_DIR}/server.pub"
SERVER_PRIVKEY_FILE="${WG_KEYS_DIR}/server.priv"
INFO_FILE="/etc/wireguard/wg-server-info.json"

# Parse CLI args
while [[ $# -gt 0 ]]; do
  case $1 in
    --subnet) WG_SUBNET="$2"; shift 2 ;;
    --port)   WG_PORT="$2";   shift 2 ;;
    --iface)  WG_IFACE="$2";  shift 2 ;;
    *) shift ;;
  esac
done

# ── Helper functions ───────────────────────────────────────────────────────
print_header() { echo ""; echo "╔══════════════════════════════════════════╗"; echo "║  WireGuard VPN Server — SALFANET RADIUS  ║"; echo "╚══════════════════════════════════════════╝"; echo ""; }
print_info()    { echo "[INFO]  $*"; }
print_ok()      { echo "[OK]    $*"; }
print_warn()    { echo "[WARN]  $*"; }
print_error()   { echo "[ERROR] $*" >&2; }

# Derive VPS gateway IP dari subnet (x.x.x.1)
derive_gateway() {
  local subnet="$1"
  local base="${subnet%/*}"
  echo "$(echo "$base" | cut -d. -f1-3).1"
}

# ── Root check ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  print_error "Harus dijalankan sebagai root"
  exit 1
fi

print_header

# ── [1] Install WireGuard ──────────────────────────────────────────────────
print_info "[1/7] Install wireguard..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools iproute2 iptables 2>&1 | \
  grep -E 'install|already|upgrade' || true

if ! command -v wg &>/dev/null; then
  print_error "wg command tidak ditemukan. Periksa koneksi internet dan repo Ubuntu."
  exit 1
fi
print_ok "WireGuard: $(wg --version)"

# ── [2] Generate server keypair (idempotent) ───────────────────────────────
print_info "[2/7] Generate server keypair..."
mkdir -p "${WG_KEYS_DIR}"
chmod 700 "${WG_KEYS_DIR}"

if [[ ! -f "${SERVER_PRIVKEY_FILE}" ]]; then
  wg genkey | tee "${SERVER_PRIVKEY_FILE}" | wg pubkey > "${SERVER_PUBKEY_FILE}"
  chmod 600 "${SERVER_PRIVKEY_FILE}"
  print_ok "Keypair baru dibuat"
else
  # Pastikan pubkey sinkron dengan privkey
  wg pubkey < "${SERVER_PRIVKEY_FILE}" > "${SERVER_PUBKEY_FILE}"
  print_ok "Keypair sudah ada (digunakan kembali)"
fi

SERVER_PRIVKEY="$(cat "${SERVER_PRIVKEY_FILE}")"
SERVER_PUBKEY="$(cat "${SERVER_PUBKEY_FILE}")"
VPS_GW="$(derive_gateway "${WG_SUBNET}")"

print_ok "Public key: ${SERVER_PUBKEY}"
print_ok "VPS gateway IP: ${VPS_GW}/${WG_SUBNET#*/}"

# ── [3] Buat wg0.conf (skip jika sudah ada dan running) ───────────────────
print_info "[3/7] Buat ${WG_CONF}..."

# Cek apakah interface sudah aktif
WG_RUNNING=false
if ip link show "${WG_IFACE}" &>/dev/null; then
  WG_RUNNING=true
  print_warn "${WG_IFACE} sudah aktif — akan reload peers saja"
fi

if [[ ! -f "${WG_CONF}" ]]; then
  # Buat config baru
  cat > "${WG_CONF}" << WGEOF
# WireGuard VPN Server — SALFANET RADIUS
# Auto-generated oleh install-wg-server.sh
# Peers dikelola oleh salfanet-radius app via /api/network/vps-wg-peer
# JANGAN edit [Interface] section secara manual

[Interface]
Address = ${VPS_GW}/${WG_SUBNET#*/}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVKEY}

# PostUp/PostDown: iptables untuk forward RADIUS dari NAS ke loopback
PostUp = iptables -I INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT; iptables -I INPUT -i ${WG_IFACE} -p icmp -j ACCEPT; iptables -I INPUT -p udp --dport ${WG_PORT} -j ACCEPT; iptables -I FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -I FORWARD -o ${WG_IFACE} -j ACCEPT
PostDown = iptables -D INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT; iptables -D INPUT -i ${WG_IFACE} -p icmp -j ACCEPT; iptables -D INPUT -p udp --dport ${WG_PORT} -j ACCEPT; iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT; iptables -D FORWARD -o ${WG_IFACE} -j ACCEPT

# ── NAS Peers ──────────────────────────────────────────────────────────────
# Peers di bawah ini dikelola otomatis oleh salfanet-radius.
# Setiap NAS/router yang terhubung via WireGuard akan punya blok [Peer] sendiri.
# Tambah/hapus peer via admin panel → Network → VPN Clients (type: wireguard)
# atau via API: POST /api/network/vps-wg-peer
WGEOF
  chmod 640 "${WG_CONF}"
  print_ok "${WG_CONF} dibuat"
else
  # Config sudah ada — update listen port dan PrivateKey saja di [Interface] section
  # (Peers tetap dipertahankan)
  print_ok "${WG_CONF} sudah ada — Interface section dipertahankan"
fi

# ── [4] Aktifkan IP forwarding ─────────────────────────────────────────────
print_info "[4/7] Aktifkan IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null

# Persist di /etc/sysctl.d/
SYSCTL_FILE="/etc/sysctl.d/99-wg-forward.conf"
if [[ ! -f "${SYSCTL_FILE}" ]]; then
  echo "net.ipv4.ip_forward = 1" > "${SYSCTL_FILE}"
fi
print_ok "IP forwarding aktif"

# ── [5] UFW / iptables rules ───────────────────────────────────────────────
print_info "[5/7] Buka UDP port ${WG_PORT} di firewall..."

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "${WG_PORT}/udp" comment "WireGuard VPN Server" > /dev/null 2>&1 || true
  print_ok "UFW rule ditambahkan: ${WG_PORT}/udp"
else
  iptables -C INPUT -p udp --dport "${WG_PORT}" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p udp --dport "${WG_PORT}" -j ACCEPT
  print_ok "iptables rule ditambahkan: ${WG_PORT}/udp"
fi

# Juga buka RADIUS ports dari WG subnet
iptables -C INPUT -s "${WG_SUBNET}" -p udp --dport 1812 -j ACCEPT 2>/dev/null || \
  iptables -I INPUT -s "${WG_SUBNET}" -p udp --dport 1812 -j ACCEPT
iptables -C INPUT -s "${WG_SUBNET}" -p udp --dport 1813 -j ACCEPT 2>/dev/null || \
  iptables -I INPUT -s "${WG_SUBNET}" -p udp --dport 1813 -j ACCEPT
iptables -C INPUT -s "${WG_SUBNET}" -p udp --dport 3799 -j ACCEPT 2>/dev/null || \
  iptables -I INPUT -s "${WG_SUBNET}" -p udp --dport 3799 -j ACCEPT
print_ok "RADIUS ports (1812/1813/3799) terbuka dari WG subnet"

# ── [6] Start / reload WireGuard ──────────────────────────────────────────
print_info "[6/7] Start / reload WireGuard..."
systemctl enable "wg-quick@${WG_IFACE}" > /dev/null 2>&1 || true

if ${WG_RUNNING}; then
  # Interface sudah aktif — reload config tanpa disconnect klien
  wg syncconf "${WG_IFACE}" <(wg-quick strip "${WG_IFACE}") 2>/dev/null || \
    systemctl reload "wg-quick@${WG_IFACE}" 2>/dev/null || \
    wg-quick down "${WG_IFACE}" && wg-quick up "${WG_IFACE}"
  print_ok "${WG_IFACE} di-reload (koneksi aktif tidak terputus)"
else
  systemctl start "wg-quick@${WG_IFACE}" 2>/dev/null || wg-quick up "${WG_IFACE}"
  print_ok "${WG_IFACE} dimulai"
fi

# Tunggu sebentar lalu cek
sleep 1
if ip link show "${WG_IFACE}" 2>/dev/null | grep -q "UP"; then
  print_ok "${WG_IFACE} UP — $(ip addr show "${WG_IFACE}" | grep "inet " | awk '{print $2}')"
else
  print_warn "${WG_IFACE} mungkin belum UP — cek: systemctl status wg-quick@${WG_IFACE}"
fi

# ── [7] Simpan info server ke JSON (dibaca app) ────────────────────────────
print_info "[7/7] Simpan server info ke ${INFO_FILE}..."

PUBLIC_IP=""
PUBLIC_IP=$(curl -4 -s --connect-timeout 5 ifconfig.me 2>/dev/null || \
            curl -4 -s --connect-timeout 5 api.ipify.org 2>/dev/null || \
            hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

cat > "${INFO_FILE}" << JSONEOF
{
  "interface": "${WG_IFACE}",
  "listenPort": ${WG_PORT},
  "subnet": "${WG_SUBNET}",
  "gatewayIp": "${VPS_GW}",
  "publicIp": "${PUBLIC_IP}",
  "publicKey": "${SERVER_PUBKEY}",
  "privateKeyFile": "${SERVER_PRIVKEY_FILE}",
  "configFile": "${WG_CONF}",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONEOF
chmod 640 "${INFO_FILE}"
print_ok "Info disimpan ke ${INFO_FILE}"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          WireGuard Server INSTALLED ✅                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  Public IP     : %-39s ║\n" "${PUBLIC_IP}"
printf "║  Interface     : %-39s ║\n" "${WG_IFACE}"
printf "║  Listen Port   : %-39s ║\n" "${WG_PORT}/udp"
printf "║  Subnet        : %-39s ║\n" "${WG_SUBNET}"
printf "║  VPS Gateway   : %-39s ║\n" "${VPS_GW}"
printf "║  Server Pubkey : %-39s ║\n" "${SERVER_PUBKEY:0:36}..."
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Langkah selanjutnya di admin panel:                     ║"
echo "║  Network → VPN Server → klik ikon WG → Setup WireGuard  ║"
echo "║  Lalu tambah NAS via Network → VPN Clients (type: wg)   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
