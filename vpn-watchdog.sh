#!/bin/bash
# VPN L2TP/PPP watchdog — reconnects if ppp0 goes down
# Cron: */2 * * * * /usr/local/bin/vpn-watchdog.sh >> /var/log/vpn-watchdog.log 2>&1

LOG_FILE=/var/log/vpn-watchdog.log
IFACE=ppp0
L2TP_CTL=/var/run/xl2tpd/l2tp-control
LAC=vpn-server

ping_check() {
  ping -c 1 -W 2 -I "$IFACE" 10.20.30.1 &>/dev/null
}

if ip link show "$IFACE" &>/dev/null && ip link show "$IFACE" | grep -q 'LOWER_UP'; then
  if ping_check; then
    exit 0
  fi
  logger -t vpn-watchdog "$IFACE is up but not responding, forcing reconnect"
else
  logger -t vpn-watchdog "$IFACE is down, attempting reconnect"
fi

# Disconnect any stale session first
if [ -e "$L2TP_CTL" ]; then
  echo "d $LAC" > "$L2TP_CTL" 2>/dev/null || true
  sleep 2
fi

# Reconnect
if [ -e "$L2TP_CTL" ]; then
  echo "c $LAC" > "$L2TP_CTL"
  logger -t vpn-watchdog "Sent reconnect command to xl2tpd for LAC $LAC"
else
  logger -t vpn-watchdog "xl2tpd control socket not found, restarting xl2tpd service"
  systemctl restart xl2tpd
  sleep 3
  echo "c $LAC" > "$L2TP_CTL" 2>/dev/null || true
  logger -t vpn-watchdog "xl2tpd restarted, reconnect command sent"
fi

TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TS] Reconnect triggered for $IFACE" >> "$LOG_FILE"
