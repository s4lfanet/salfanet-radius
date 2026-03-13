#!/bin/bash
# L2TP VPN Watchdog - auto reconnect if VPN tunnel is down
LOG_TAG="l2tp-watchdog"
VPN_PEER="10.20.30.1"
LNS="103.146.202.131"

# Find active ppp interface connected to VPN peer
PPP_IFACE=$(ip route show | grep "10\.20\.30" | awk '{print $3}' | head -1)

if [ -n "$PPP_IFACE" ]; then
    # Ping the peer
    if ping -c 2 -W 5 $VPN_PEER &>/dev/null; then
        logger -t $LOG_TAG "VPN OK on $PPP_IFACE, peer $VPN_PEER reachable"
        exit 0
    else
        logger -t $LOG_TAG "VPN interface $PPP_IFACE UP but peer unreachable, reconnecting"
    fi
else
    logger -t $LOG_TAG "No VPN interface found, attempting reconnect"
fi

# Kill stale pppd and reconnect
pkill -f 'pppd plugin pppol2tp' 2>/dev/null
sleep 3
systemctl restart xl2tpd
sleep 5
echo 'c vpn-server' > /var/run/xl2tpd/l2tp-control 2>/dev/null || true
logger -t $LOG_TAG "Reconnect triggered to $LNS"
