#!/bin/bash
# L2TP VPN Watchdog — auto-reconnect when tunnel drops
# Install: */2 * * * * /usr/local/bin/l2tp-watchdog >> /var/log/l2tp-watchdog.log 2>&1
LOG_TAG="l2tp-watchdog"

# Dynamically find the active PPP interface instead of hardcoding peer/LNS
PPP_IFACE=$(ip addr show 2>/dev/null | grep -o 'ppp[0-9]*' | head -1)

if [ -n "$PPP_IFACE" ]; then
    # Get the remote peer address from the PPP interface
    VPN_PEER=$(ip addr show "$PPP_IFACE" 2>/dev/null | grep 'inet ' | awk '{print $4}')
    if [ -n "$VPN_PEER" ] && ping -c 2 -W 5 "$VPN_PEER" &>/dev/null; then
        logger -t $LOG_TAG "VPN OK on $PPP_IFACE peer=$VPN_PEER"
        exit 0
    fi
    logger -t $LOG_TAG "Peer $VPN_PEER unreachable on $PPP_IFACE — reconnecting"
else
    logger -t $LOG_TAG "No PPP interface found — reconnecting"
fi

# Kill stale pppd processes
pkill -f 'pppd plugin pppol2tp' 2>/dev/null || true
sleep 2

# Ensure xl2tpd service is running
if ! systemctl is-active xl2tpd &>/dev/null; then
    logger -t $LOG_TAG "xl2tpd not running — starting..."
    systemctl start xl2tpd
    sleep 3
fi

# Trigger reconnect via xl2tpd control pipe
mkdir -p /var/run/xl2tpd
echo "d vpn-server" > /var/run/xl2tpd/l2tp-control 2>/dev/null || true
sleep 1
echo "c vpn-server" > /var/run/xl2tpd/l2tp-control 2>/dev/null || true
logger -t $LOG_TAG "Reconnect triggered"
