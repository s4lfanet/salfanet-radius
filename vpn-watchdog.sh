#!/bin/bash
# VPN L2TP/PPP watchdog — safety net for xl2tpd reconnection + RADIUS health check
# xl2tpd.conf should have: autodial=yes, redial=yes, redial timeout=15
# This watchdog is a last-resort fallback, NOT the primary reconnect mechanism.
#
# Logic:
#   1. ppp0 UP + ping OK  → VPN fine; check RADIUS health
#   2. ppp0 UP + ping FAIL → interface stuck, just wait (redial handles it)
#   3. ppp0 DOWN + xl2tpd running → send 'c LAC' to control socket (trigger redial)
#   4. ppp0 DOWN + xl2tpd NOT running → start xl2tpd (systemd Restart handles it usually)
#   5. RADIUS (freeradius) not running → restart it automatically
#
# NEVER do: systemctl restart xl2tpd while ppp0 is connected — this kills the session
# and causes a cascade of reconnect failures (tunnel ID mismatch).
#
# Cron: */2 * * * * /usr/local/bin/vpn-watchdog.sh >> /var/log/vpn-watchdog.log 2>&1

# --- Lock: prevent concurrent runs ---
LOCK=/tmp/vpn-watchdog.lock
exec 9>"$LOCK"
flock -n 9 || exit 0

LOG_FILE=/var/log/vpn-watchdog.log
IFACE=ppp0
L2TP_CTL=/var/run/xl2tpd/l2tp-control
LAC=vpn-server
PEER_IP=10.20.30.1     # IP MikroTik di VPN tunnel (side router)
RADIUS_PORT=1812       # FreeRADIUS auth port
TS=$(date '+%Y-%m-%d %H:%M:%S')

# ============================================================
# CHECK D: WireGuard peer local-network routes
# Reads wg.conf, finds each peer's VPN IP (the /32 address) and
# any additional CIDRs (local networks behind that peer).
# If the kernel route for a local network is missing, re-adds it.
# This makes WG local routes survive interface restarts / reboots
# even if wg-quick PostUp is not yet written.
# ============================================================
WG_CONF_FILE="/etc/wireguard/wg0.conf"
WG_DEV="wg0"
# Allow override via env or wg-server-info.json
if [ -f /etc/wireguard/wg-server-info.json ]; then
  _WG_DEV=$(python3 -c "import json,sys; d=json.load(open('/etc/wireguard/wg-server-info.json')); print(d.get('interface','wg0'))" 2>/dev/null)
  [ -n "$_WG_DEV" ] && WG_DEV="$_WG_DEV"
  WG_CONF_FILE="/etc/wireguard/${WG_DEV}.conf"
fi

if [ -f "$WG_CONF_FILE" ] && ip link show "$WG_DEV" &>/dev/null; then
  CURRENT_VPN_IP=""
  while IFS= read -r rawline; do
    # Strip inline comments and leading/trailing whitespace
    line="${rawline%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    if [[ "$line" == "[Peer]" ]]; then
      CURRENT_VPN_IP=""
    elif [[ "$line" == AllowedIPs* ]]; then
      IPS="${line#*=}"
      IPS="${IPS// /}"
      FIRST_IP=1
      IFS=',' read -ra IP_LIST <<< "$IPS"
      for ip in "${IP_LIST[@]}"; do
        ip="${ip// /}"
        if [[ $FIRST_IP -eq 1 ]] && [[ "$ip" == *"/32" ]]; then
          CURRENT_VPN_IP="${ip%/32}"
          FIRST_IP=0
        elif [[ "$ip" == *"/"* ]] && [ -n "$CURRENT_VPN_IP" ]; then
          # This is a local-network CIDR behind the peer
          if ! ip route show "$ip" 2>/dev/null | grep -q .; then
            ip route replace "$ip" via "$CURRENT_VPN_IP" dev "$WG_DEV" 2>/dev/null || true
            logger -t vpn-watchdog "WG route restored: $ip via $CURRENT_VPN_IP dev $WG_DEV"
            echo "[$TS] WG route restored: $ip via $CURRENT_VPN_IP" >> "$LOG_FILE"
          fi
        fi
      done
    fi
  done < "$WG_CONF_FILE"
fi


# Batas baris log agar tidak unbounded growth (~5000 baris / ~500KB)
MAX_LOG_LINES=5000
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
  tail -n 3000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

# ============================================================
# CHECK A: RADIUS (FreeRADIUS) service health
# ============================================================
if ! systemctl is-active --quiet freeradius; then
  logger -t vpn-watchdog "CRITICAL: freeradius service is NOT running — restarting"
  echo "[$TS] CRITICAL: freeradius down — attempting restart" >> "$LOG_FILE"
  systemctl start freeradius
  sleep 3
  if systemctl is-active --quiet freeradius; then
    logger -t vpn-watchdog "freeradius restarted OK"
    echo "[$TS] freeradius restarted successfully" >> "$LOG_FILE"
  else
    logger -t vpn-watchdog "ERROR: freeradius failed to restart — check logs"
    echo "[$TS] ERROR: freeradius restart failed — run: journalctl -u freeradius -n 50" >> "$LOG_FILE"
  fi
fi

# ============================================================
# CHECK B: RADIUS port reachable from localhost
# (ensures FreeRADIUS is actually listening, not just 'running')
# ============================================================
if ! ss -ulnp | grep -q ":${RADIUS_PORT} "; then
  logger -t vpn-watchdog "WARNING: freeradius service up but UDP port ${RADIUS_PORT} not listening"
  echo "[$TS] WARNING: freeradius running but port ${RADIUS_PORT}/udp not open" >> "$LOG_FILE"
fi

# ============================================================
# CHECK C: VPN interface (ppp0)
# ============================================================
if ip link show "$IFACE" &>/dev/null && ip link show "$IFACE" | grep -q 'LOWER_UP'; then
  if ping -c 2 -W 3 -I "$IFACE" "$PEER_IP" &>/dev/null; then
    # VPN connected and peer reachable — restore any missing L2TP local-network routes

    # CHECK E: L2TP peer local-network routes (written by vps-l2tp-peer API)
    L2TP_ROUTES_FILE="/etc/salfanet/l2tp/peer-routes.conf"
    if [ -f "$L2TP_ROUTES_FILE" ]; then
      # Resolve the PPP remote (Mikrotik-side) IP from the ppp0 route table
      REMOTE_PPP_IP=$(ip route show dev "$IFACE" | awk '/via/{print $3; exit}')
      while IFS= read -r rline; do
        rline="${rline%%#*}"
        rline="${rline#"${rline%%[![:space:]]*}"}"
        rline="${rline%"${rline##*[![:space:]]}"}"
        [ -z "$rline" ] && continue
        # Format: "192.168.1.0/24 via 10.201.0.2"
        NET=$(echo "$rline" | awk '{print $1}')
        VIA_IP=$(echo "$rline" | awk '{print $3}')
        [ -z "$NET" ] || [ -z "$VIA_IP" ] && continue
        if ! ip route show "$NET" 2>/dev/null | grep -q .; then
          GW="${REMOTE_PPP_IP:-$VIA_IP}"
          ip route replace "$NET" via "$GW" dev "$IFACE" metric 100 2>/dev/null || true
          logger -t vpn-watchdog "L2TP route restored: $NET via $GW dev $IFACE"
          echo "[$TS] L2TP route restored: $NET via $GW" >> "$LOG_FILE"
        fi
      done < "$L2TP_ROUTES_FILE"
    fi

    exit 0
  fi
  # ppp0 up but ping to MikroTik fails — transient or MikroTik rebooting.
  # Do NOT disconnect; let xl2tpd LCP keepalive handle it.
  logger -t vpn-watchdog "WARNING: $IFACE up but ping to $PEER_IP failed (transient?). Not touching connection."
  echo "[$TS] WARNING: $IFACE up but $PEER_IP unreachable (VPN tunnel might be degraded)" >> "$LOG_FILE"
  exit 0
fi

# --- ppp0 is DOWN ---
logger -t vpn-watchdog "$IFACE is down"
echo "[$TS] $IFACE down detected — attempting VPN reconnect" >> "$LOG_FILE"

# --- Check: Is xl2tpd service running? ---
if ! systemctl is-active --quiet xl2tpd; then
  logger -t vpn-watchdog "xl2tpd service is not running, starting it"
  systemctl start xl2tpd
  sleep 5
  echo "[$TS] xl2tpd service started" >> "$LOG_FILE"
fi

# --- Send connect command to xl2tpd control socket ---
# With autodial=yes xl2tpd will have already dialed on start.
# If control socket exists but no connection, force a new dial.
if [ -e "$L2TP_CTL" ]; then
  echo "c $LAC" > "$L2TP_CTL" 2>/dev/null && \
    logger -t vpn-watchdog "Sent 'c $LAC' to xl2tpd control socket" && \
    echo "[$TS] Reconnect command sent to xl2tpd (LAC: $LAC)" >> "$LOG_FILE"
else
  logger -t vpn-watchdog "Control socket $L2TP_CTL not found yet — xl2tpd may still be starting"
  echo "[$TS] Control socket not available — waiting for xl2tpd to initialize" >> "$LOG_FILE"
fi
