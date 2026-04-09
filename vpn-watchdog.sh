#!/bin/bash
# VPN L2TP/PPP watchdog — safety net for xl2tpd reconnection
# xl2tpd.conf should have: autodial=yes, redial=yes, redial timeout=15
# This watchdog is a last-resort fallback, NOT the primary reconnect mechanism.
#
# Logic:
#   1. ppp0 UP + ping OK  → everything fine, exit 0
#   2. ppp0 UP + ping FAIL → interface stuck, just wait (redial handles it)
#   3. ppp0 DOWN + xl2tpd running → send 'c LAC' to control socket (trigger redial)
#   4. ppp0 DOWN + xl2tpd NOT running → start xl2tpd (systemd Restart handles it usually)
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
PEER_IP=10.20.30.1
TS=$(date '+%Y-%m-%d %H:%M:%S')

# --- Check 1: Is ppp0 up and reachable? ---
if ip link show "$IFACE" &>/dev/null && ip link show "$IFACE" | grep -q 'LOWER_UP'; then
  if ping -c 2 -W 3 -I "$IFACE" "$PEER_IP" &>/dev/null; then
    # All good — VPN connected and reachable
    exit 0
  fi
  # ppp0 exists but ping fails — could be transient packet loss.
  # Do NOT disconnect here; let xl2tpd LCP keepalive handle it.
  logger -t vpn-watchdog "WARNING: $IFACE up but ping to $PEER_IP failed (transient?). Not touching connection."
  exit 0
fi

# --- ppp0 is DOWN ---
logger -t vpn-watchdog "$IFACE is down"
echo "[$TS] $IFACE down detected" >> "$LOG_FILE"

# --- Check 2: Is xl2tpd service running? ---
if ! systemctl is-active --quiet xl2tpd; then
  logger -t vpn-watchdog "xl2tpd service is not running, starting it"
  systemctl start xl2tpd
  sleep 5
  echo "[$TS] xl2tpd service started" >> "$LOG_FILE"
fi

# --- Check 3: Send connect command to control socket ---
# With autodial=yes xl2tpd will have already dialed on start.
# If control socket exists but no connection, force a new dial.
if [ -e "$L2TP_CTL" ]; then
  echo "c $LAC" > "$L2TP_CTL" 2>/dev/null && \
    logger -t vpn-watchdog "Sent 'c $LAC' to xl2tpd control socket" && \
    echo "[$TS] Reconnect command sent to xl2tpd" >> "$LOG_FILE"
else
  logger -t vpn-watchdog "Control socket $L2TP_CTL not found yet — xl2tpd may still be starting"
  echo "[$TS] Control socket not available, waiting for xl2tpd to initialize" >> "$LOG_FILE"
fi
