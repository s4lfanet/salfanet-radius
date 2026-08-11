#!/bin/bash
# WireGuard Peer Watchdog — restore peers from DB if wg0.conf loses them
# Dipasang otomatis oleh salfanet-radius. Jangan hapus.
# Cron: */5 * * * * /usr/local/bin/wg-peer-watchdog.sh >> /var/log/wg-peer-watchdog.log 2>&1

LOCK=/tmp/wg-peer-watchdog.lock
exec 9>"$LOCK"
flock -n 9 || exit 0

WG_IFACE=wg0
WG_CONF=/etc/wireguard/wg0.conf
LOG=/var/log/wg-peer-watchdog.log
TS=$(date '+%Y-%m-%d %H:%M:%S')
DB_USER=salfanet_user
DB_PASS=salfanetradius123
DB_NAME=salfanet_radius

# Batas log agar tidak unbounded (~300KB)
MAX_LOG=3000
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt "$MAX_LOG" ]; then
  tail -n 2000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

# Cek WG interface running
if ! ip link show "$WG_IFACE" &>/dev/null; then
  echo "[$TS] WARNING: $WG_IFACE interface not found, skipping" >> "$LOG"
  exit 0
fi

# Ambil semua WIREGUARD clients aktif dari DB
CLIENTS=$(mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -sN -e \
  "SELECT clientPublicKey, vpnIp, description, name FROM vpn_clients WHERE vpnType='WIREGUARD' AND isActive=1 AND clientPublicKey IS NOT NULL AND clientPublicKey != '';" 2>/dev/null)

if [ -z "$CLIENTS" ]; then
  exit 0
fi

RESTORED=0
while IFS=$'\t' read -r PUBKEY VPNIP DESC NAME; do
  [ -z "$PUBKEY" ] && continue

  # Cek apakah peer sudah ada di wg0 (live kernel state)
  if wg show "$WG_IFACE" peers 2>/dev/null | grep -qF "$PUBKEY"; then
    continue  # sudah ada, skip
  fi

  # Peer hilang — restore
  echo "[$TS] RESTORE: peer '$NAME' ($VPNIP) hilang dari wg0, mengembalikan..." >> "$LOG"
  logger -t wg-peer-watchdog "RESTORE peer $NAME ($VPNIP) pubkey=${PUBKEY:0:20}..."

  # Extract localNetworks dari description (format: localNets=x.x.x.x/yy,...)
  LOCAL_NETS=""
  if echo "$DESC" | grep -q 'localNets='; then
    LOCAL_NETS=$(echo "$DESC" | sed 's/.*localNets=//;s/ .*//')
  fi

  # Build AllowedIPs
  ALLOWED="$VPNIP/32"
  if [ -n "$LOCAL_NETS" ]; then
    for NET in $(echo "$LOCAL_NETS" | tr ',' ' '); do
      ALLOWED="$ALLOWED, $NET"
    done
  fi

  # Tambah ke wg0.conf jika belum ada (idempotent)
  if ! grep -qF "$PUBKEY" "$WG_CONF"; then
    cat >> "$WG_CONF" << PEEREOF

# Peer: $NAME [auto-restored by wg-peer-watchdog $(date '+%Y-%m-%d')]
[Peer]
PublicKey = $PUBKEY
AllowedIPs = $ALLOWED
PersistentKeepalive = 25
PEEREOF
  fi

  # Apply live tanpa restart tunnel (zero-downtime)
  if wg syncconf "$WG_IFACE" <(wg-quick strip "$WG_IFACE") 2>/dev/null; then
    echo "[$TS] OK: peer '$NAME' berhasil di-restore via syncconf" >> "$LOG"
  else
    # Fallback: wg set langsung ke kernel
    ALLOWED_NOSPACE=$(echo "$ALLOWED" | tr -d ' ')
    if wg set "$WG_IFACE" peer "$PUBKEY" allowed-ips "$ALLOWED_NOSPACE" persistent-keepalive 25 2>/dev/null; then
      echo "[$TS] OK: peer '$NAME' berhasil di-restore via wg set" >> "$LOG"
    else
      echo "[$TS] ERROR: gagal restore peer '$NAME'" >> "$LOG"
    fi
  fi

  # Restore ip routes untuk local networks
  if [ -n "$LOCAL_NETS" ]; then
    for NET in $(echo "$LOCAL_NETS" | tr ',' ' '); do
      ip route show "$NET" | grep -q . || ip route add "$NET" dev "$WG_IFACE" 2>/dev/null
    done
  fi

  RESTORED=$((RESTORED+1))
done <<< "$CLIENTS"

if [ "$RESTORED" -gt 0 ]; then
  echo "[$TS] DONE: $RESTORED peer(s) di-restore ke wg0" >> "$LOG"
fi
