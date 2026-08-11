#!/bin/bash
# =============================================================================
# SALFANET RADIUS — Redundant VPN Connectivity Setup
# =============================================================================
# Konfigurasi VPS sebagai L2TP/IPsec LNS (server) sebagai jalur backup RADIUS.
#
# Topologi setelah setup:
#   MikroTik (wg0: 172.16.212.11)
#     ├─ PRIMARY : WireGuard → 172.16.212.1 (FreeRADIUS) [distance=1, check-gateway]
#     └─ BACKUP  : L2TP/IPsec → 103.151.140.110 → 172.16.212.1 (FreeRADIUS) [distance=10]
#
#   VPS Watchdog:
#     - Ping 172.16.212.11 via wg0 setiap 15 detik
#     - Jika WireGuard peer DOWN & L2TP UP:
#         ip route replace 172.16.212.11/32 dev pppX  ← reply via L2TP
#     - Jika WireGuard peer UP:
#         ip route del 172.16.212.11/32               ← kembali via wg0
#
# RADIUS script MikroTik TIDAK PERLU DIUBAH.
#
# Usage:
#   bash setup-radius-redundancy.sh <mikrotik-name> <mikrotik-wg-ip>
# Example:
#   bash setup-radius-redundancy.sh paskatest 172.16.212.11
# =============================================================================

set -euo pipefail

# ── Parameters ────────────────────────────────────────────────────────────────
MIKROTIK_NAME="${1:-paskatest}"
MIKROTIK_WG_IP="${2:-172.16.212.11}"
VPS_PUBLIC_IP="${3:-103.151.140.110}"
WG_IFACE="wg0"
WG_SERVER_IP="172.16.212.1"       # VPS WireGuard IP (RADIUS server IP di MikroTik)

# L2TP pool — gunakan subnet berbeda dari WireGuard
L2TP_LOCAL_IP="172.16.211.1"      # IP VPS pada ppp interface sisi server
L2TP_POOL_START="172.16.211.100"
L2TP_POOL_END="172.16.211.150"

# Directories & files
STATE_DIR="/etc/salfanet/l2tp-redundancy"
STATE_FILE="${STATE_DIR}/${MIKROTIK_NAME}.conf"
WATCHDOG_SCRIPT="/usr/local/sbin/salfanet-radius-watchdog.sh"
WATCHDOG_SERVICE="/etc/systemd/system/salfanet-radius-watchdog.service"
IP_UP_SCRIPT="/etc/ppp/ip-up.d/50-salfanet-l2tp"
IP_DOWN_SCRIPT="/etc/ppp/ip-down.d/50-salfanet-l2tp"
PPP_OPTS_LNS="/etc/ppp/options.xl2tpd.lns"

# ── Credential generation ─────────────────────────────────────────────────────
# Jika state file sudah ada (re-run), pakai credentials yang sama
if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  L2TP_USERNAME="${L2TP_USERNAME}"
  L2TP_PASSWORD="${L2TP_PASSWORD}"
  IPSEC_PSK="${IPSEC_PSK}"
  echo "♻️  State file ditemukan — menggunakan credentials yang sudah ada"
else
  L2TP_USERNAME="l2tp-${MIKROTIK_NAME}"
  L2TP_PASSWORD=$(tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c 18 || openssl rand -hex 9)
  IPSEC_PSK=$(tr -dc 'A-Za-z0-9!@#$' < /dev/urandom 2>/dev/null | head -c 22 || openssl rand -hex 11)
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     SALFANET RADIUS Redundancy Setup                     ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  MikroTik Name  : %-38s ║\n" "$MIKROTIK_NAME"
printf "║  WireGuard IP   : %-38s ║\n" "$MIKROTIK_WG_IP"
printf "║  VPS Public IP  : %-38s ║\n" "$VPS_PUBLIC_IP"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Dependency check ──────────────────────────────────────────────────────────
for cmd in xl2tpd ipsec pppd ip systemctl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌  Dependency tidak ditemukan: $cmd"
    echo "    Jalankan: apt-get install -y xl2tpd strongswan ppp"
    exit 1
  fi
done
echo "✔  Dependencies OK"

# ── 1. State directory ────────────────────────────────────────────────────────
mkdir -p "$STATE_DIR"

# ── 2. xl2tpd — tambah [lns default] jika belum ada ─────────────────────────
if grep -q '\[lns default\]' /etc/xl2tpd/xl2tpd.conf 2>/dev/null; then
  echo "✔  xl2tpd LNS section sudah ada"
else
  cat >> /etc/xl2tpd/xl2tpd.conf << EOF

[lns default]
ip range = ${L2TP_POOL_START}-${L2TP_POOL_END}
local ip = ${L2TP_LOCAL_IP}
require authentication = yes
pass peer = yes
ppp debug = no
pppoptfile = ${PPP_OPTS_LNS}
length bit = yes
EOF
  echo "✔  xl2tpd LNS section ditambahkan"
fi

# ── 3. PPP options untuk LNS ─────────────────────────────────────────────────
cat > "$PPP_OPTS_LNS" << 'EOF'
ipcp-accept-local
ipcp-accept-remote
ms-dns 8.8.8.8
noccp
auth
require-mschap-v2
nodefaultroute
lock
proxyarp
mtu 1400
mru 1400
lcp-echo-interval 30
lcp-echo-failure 4
EOF
echo "✔  PPP LNS options dikonfigurasi"

# ── 4. CHAP secrets ───────────────────────────────────────────────────────────
# Hapus entry lama jika ada, lalu tambah yang baru
sed -i "/^${L2TP_USERNAME} /d" /etc/ppp/chap-secrets 2>/dev/null || true
echo "${L2TP_USERNAME} * ${L2TP_PASSWORD} *" >> /etc/ppp/chap-secrets
echo "✔  L2TP credentials dikonfigurasi"

# ── 5. IPsec PSK ──────────────────────────────────────────────────────────────
# Hapus entry lama untuk MikroTik ini
sed -i "/SALFANET-REDUNDANCY-${MIKROTIK_NAME}/,+1d" /etc/ipsec.secrets 2>/dev/null || true

cat >> /etc/ipsec.secrets << EOF

# SALFANET-REDUNDANCY-${MIKROTIK_NAME}
%any %any : PSK "${IPSEC_PSK}"
EOF
echo "✔  IPsec PSK dikonfigurasi"

# Pastikan ipsec.conf menerima L2TP/IPsec incoming
if ! grep -q 'conn L2TP-PSK' /etc/ipsec.conf 2>/dev/null; then
  cat >> /etc/ipsec.conf << 'EOF'

conn L2TP-PSK
  keyexchange=ikev1
  left=%defaultroute
  leftprotoport=17/1701
  right=%any
  rightprotoport=17/%any
  type=transport
  authby=secret
  auto=add
EOF
  echo "✔  IPsec L2TP-PSK conn ditambahkan"
else
  # Pastikan auto=add bukan auto=ignore
  sed -i '/conn L2TP-PSK/,/^$/ s/auto=ignore/auto=add/' /etc/ipsec.conf
  echo "✔  IPsec L2TP-PSK conn sudah ada"
fi

# ── 6. ip-up script ───────────────────────────────────────────────────────────
mkdir -p /etc/ppp/ip-up.d /etc/ppp/ip-down.d

cat > "$IP_UP_SCRIPT" << 'EOF'
#!/bin/bash
# Dipanggil pppd saat L2TP connection naik
# Args: $1=iface $2=tty $3=speed $4=local_ip $5=remote_ip
IFACE="$1"
REMOTE_IP="$5"
STATE_DIR="/etc/salfanet/l2tp-redundancy"

# Simpan info ppp interface aktif
echo "${IFACE} ${REMOTE_IP}" > "${STATE_DIR}/active-ppp"
logger "SALFANET-L2TP: UP - iface=${IFACE} remote=${REMOTE_IP}"

# Load semua konfigurasi MikroTik
for conf in "${STATE_DIR}"/*.conf; do
  [ -f "$conf" ] || continue
  # shellcheck disable=SC1090
  source "$conf"
  # Tambah route MikroTik WG IP via ppp dengan metric tinggi (backup)
  ip route add "${MIKROTIK_WG_IP}/32" dev "$IFACE" metric 200 2>/dev/null || true
  logger "SALFANET-L2TP: Added backup route ${MIKROTIK_WG_IP}/32 dev ${IFACE}"
done
EOF
chmod +x "$IP_UP_SCRIPT"
echo "✔  ip-up script dikonfigurasi"

# ── 7. ip-down script ─────────────────────────────────────────────────────────
cat > "$IP_DOWN_SCRIPT" << 'EOF'
#!/bin/bash
# Dipanggil pppd saat L2TP connection turun
# Args: $1=iface $5=remote_ip
IFACE="$1"
STATE_DIR="/etc/salfanet/l2tp-redundancy"

for conf in "${STATE_DIR}"/*.conf; do
  [ -f "$conf" ] || continue
  # shellcheck disable=SC1090
  source "$conf"
  ip route del "${MIKROTIK_WG_IP}/32" dev "$IFACE" metric 200 2>/dev/null || true
  logger "SALFANET-L2TP: DOWN - removed backup route ${MIKROTIK_WG_IP}/32"
done

rm -f "${STATE_DIR}/active-ppp"
EOF
chmod +x "$IP_DOWN_SCRIPT"
echo "✔  ip-down script dikonfigurasi"

# ── 8. Watchdog script ────────────────────────────────────────────────────────
cat > "$WATCHDOG_SCRIPT" << 'WATCHDOG_EOF'
#!/bin/bash
# =============================================================================
# SALFANET RADIUS Failover Watchdog
# Monitor WireGuard peer connectivity → failover routing via L2TP backup
# =============================================================================
STATE_DIR="/etc/salfanet/l2tp-redundancy"
WG_IFACE="wg0"
CHECK_INTERVAL=15       # detik antar check
PING_COUNT=3
PING_TIMEOUT=4

log() { logger "SALFANET-WATCHDOG: $*"; echo "[$(date '+%H:%M:%S')] $*"; }

while true; do
  for conf in "${STATE_DIR}"/*.conf; do
    [ -f "$conf" ] || continue
    # shellcheck disable=SC1090
    source "$conf"

    WG_IP="${MIKROTIK_WG_IP:-}"
    [ -z "$WG_IP" ] && continue

    # ── Test WireGuard peer ──────────────────────────────────────────────────
    WG_UP=0
    if ping -c "$PING_COUNT" -W "$PING_TIMEOUT" -I "$WG_IFACE" "$WG_IP" &>/dev/null 2>&1; then
      WG_UP=1
    fi

    # ── Get active L2TP ppp interface ────────────────────────────────────────
    PPP_IFACE=""
    if [ -f "${STATE_DIR}/active-ppp" ]; then
      read -r PPP_IFACE _REST < "${STATE_DIR}/active-ppp" 2>/dev/null || true
      # Verifikasi interface masih ada
      if ! ip link show "$PPP_IFACE" &>/dev/null 2>&1; then
        PPP_IFACE=""
        rm -f "${STATE_DIR}/active-ppp"
      fi
    fi

    # ── Failover logic ───────────────────────────────────────────────────────
    if [ "$WG_UP" -eq 1 ]; then
      # WireGuard UP: pastikan tidak ada /32 route yang override wg0 /24
      if ip route show exact "${WG_IP}/32" 2>/dev/null | grep -q 'metric 200'; then
        ip route del "${WG_IP}/32" metric 200 2>/dev/null || true
        log "WireGuard UP — removed L2TP failover route for $WG_IP"
      fi
    else
      # WireGuard DOWN
      if [ -n "$PPP_IFACE" ]; then
        # L2TP backup tersedia — aktifkan /32 route via ppp
        if ! ip route show exact "${WG_IP}/32" 2>/dev/null | grep -q 'metric 200'; then
          ip route replace "${WG_IP}/32" dev "$PPP_IFACE" metric 200 2>/dev/null || true
          log "WireGuard DOWN — routing $WG_IP via $PPP_IFACE (L2TP backup)"
        fi
      else
        log "WireGuard DOWN & L2TP backup tidak tersedia untuk $WG_IP"
      fi
    fi
  done

  sleep "$CHECK_INTERVAL"
done
WATCHDOG_EOF
chmod +x "$WATCHDOG_SCRIPT"
echo "✔  Watchdog script dikonfigurasi"

# ── 9. Systemd service ────────────────────────────────────────────────────────
cat > "$WATCHDOG_SERVICE" << EOF
[Unit]
Description=SALFANET RADIUS Failover Watchdog
Documentation=https://github.com/s4lfanet/salfanet-radius
After=network-online.target wg-quick@wg0.service xl2tpd.service freeradius.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${WATCHDOG_SCRIPT}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=salfanet-watchdog

[Install]
WantedBy=multi-user.target
EOF
echo "✔  Systemd service dikonfigurasi"

# ── 10. Simpan state file ─────────────────────────────────────────────────────
cat > "$STATE_FILE" << EOF
# SALFANET RADIUS Redundancy — state file untuk ${MIKROTIK_NAME}
# Dibuat: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
MIKROTIK_NAME="${MIKROTIK_NAME}"
MIKROTIK_WG_IP="${MIKROTIK_WG_IP}"
L2TP_USERNAME="${L2TP_USERNAME}"
L2TP_PASSWORD="${L2TP_PASSWORD}"
IPSEC_PSK="${IPSEC_PSK}"
VPS_PUBLIC_IP="${VPS_PUBLIC_IP}"
WG_SERVER_IP="${WG_SERVER_IP}"
L2TP_LOCAL_IP="${L2TP_LOCAL_IP}"
L2TP_POOL_START="${L2TP_POOL_START}"
L2TP_POOL_END="${L2TP_POOL_END}"
EOF
chmod 600 "$STATE_FILE"
echo "✔  State file disimpan: $STATE_FILE"

# ── 11. Enable & restart services ────────────────────────────────────────────
echo ""
echo "── Restart services..."
systemctl daemon-reload
systemctl enable salfanet-radius-watchdog.service
systemctl restart xl2tpd
systemctl restart ipsec
systemctl restart salfanet-radius-watchdog.service

# Verifikasi
sleep 2
echo ""
echo "── Status services:"
systemctl is-active xl2tpd    && echo "✔  xl2tpd: active" || echo "❌  xl2tpd: inactive"
systemctl is-active ipsec      && echo "✔  ipsec: active"  || echo "❌  ipsec: inactive"
systemctl is-active salfanet-radius-watchdog && echo "✔  watchdog: active" || echo "❌  watchdog: inactive"

# ── 12. Print MikroTik commands ───────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     SETUP COMPLETE — Jalankan perintah ini di MikroTik          ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  1. Tambah L2TP client (backup VPN):                            ║"
echo "║                                                                  ║"
printf "║     /interface/l2tp-client/add                              \\\\ ║\n"
printf "║       name=l2tp-vps-backup                                  \\\\ ║\n"
printf "║       connect-to=%-46s \\\\ ║\n" "${VPS_PUBLIC_IP}"
printf "║       user=\"%-53s\" \\\\ ║\n" "${L2TP_USERNAME}"
printf "║       password=\"%-50s\" \\\\ ║\n" "${L2TP_PASSWORD}"
printf "║       use-ipsec=yes                                         \\\\ ║\n"
printf "║       ipsec-secret=\"%-47s\" \\\\ ║\n" "${IPSEC_PSK}"
printf "║       profile=default-encryption                            \\\\ ║\n"
printf "║       disabled=no                                               ║\n"
echo "║                                                                  ║"
echo "║  2. Tambah backup route ke RADIUS server via L2TP:              ║"
echo "║     (Route primary via WireGuard sudah ada dengan distance=1)   ║"
echo "║                                                                  ║"
printf "║     /ip/route/add dst-address=${WG_SERVER_IP}/32            \\\\ ║\n"
printf "║       gateway=l2tp-vps-backup                               \\\\ ║\n"
printf "║       distance=10                                           \\\\ ║\n"
printf "║       check-gateway=ping                                    \\\\ ║\n"
printf "║       comment=RADIUS-BACKUP-L2TP                                ║\n"
echo "║                                                                  ║"
echo "║  3. Tambah check-gateway pada route WireGuard yang ada:         ║"
echo "║                                                                  ║"
printf "║     /ip/route/set [find where comment=~\"RADIUS\"] \\\\ ║\n"
printf "║       check-gateway=ping                                        ║\n"
echo "║     -- atau edit route via Winbox: check-gateway = ping --      ║"
echo "║                                                                  ║"
echo "║  CATATAN:                                                        ║"
echo "║  - RADIUS script MikroTik TIDAK perlu diubah                    ║"
echo "║  - src-address 172.16.212.11 tetap valid (wg0 IP selalu ada)    ║"
echo "║  - Saat WireGuard drop: route ke 172.16.212.1 otomatis via L2TP ║"
echo "║  - Failover time: ~30-60 detik (LCP echo + check-gateway)       ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Log watchdog: journalctl -f -u salfanet-radius-watchdog"
echo "Test koneksi: ping -I wg0 ${MIKROTIK_WG_IP}"
