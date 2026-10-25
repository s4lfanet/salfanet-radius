# Proxmox VPS Setup Guide - PPPoE & Routing Configuration

## 📋 Overview

Panduan ini khusus untuk VPS yang berjalan di **Proxmox** atau **Container** environment yang memerlukan konfigurasi khusus untuk:
- PPPoE Server (FreeRADIUS + pppd)
- L2TP/IPSec VPN
- Network routing & NAT
- TUN/TAP devices

---

## ⚠️ Proxmox Container Limitations

Jika menggunakan **Proxmox LXC Container**, ada beberapa fitur kernel yang tidak available secara default:

### 1. `/dev/ppp` Device
Container tidak memiliki akses langsung ke PPP modules. Solusi:

**A. Enable di Proxmox Host**
```bash
# Di Proxmox HOST (bukan container)
modprobe ppp_generic
modprobe ppp_async
modprobe ppp_mppe
modprobe ppp_deflate

# Verifikasi
lsmod | grep ppp
```

**B. Edit Container Configuration**
```bash
# Di Proxmox HOST
nano /etc/pve/lxc/[CONTAINER_ID].conf

# Tambahkan di akhir file:
lxc.cgroup2.devices.allow: c 108:* rwm
lxc.mount.entry: /dev/ppp dev/ppp none bind,create=file,optional 0 0
```

**C. Restart Container**
```bash
pct stop [CONTAINER_ID]
pct start [CONTAINER_ID]
```

**D. Verify di Container**
```bash
# Login ke container
pct enter [CONTAINER_ID]

# Check device
ls -la /dev/ppp
# Output: crw------- 1 root root 108, 0 Dec 28 10:00 /dev/ppp

# Check modules
cat /proc/net/pppoe
cat /proc/net/dev | grep ppp
```

### 2. `/dev/net/tun` Device (for VPN)

**A. Enable TUN/TAP di Proxmox Host**
```bash
# Di Proxmox HOST
modprobe tun

# Verifikasi
lsmod | grep tun
ls -la /dev/net/tun
```

**B. Edit Container Configuration**
```bash
# Di Proxmox HOST
nano /etc/pve/lxc/[CONTAINER_ID].conf

# Tambahkan:
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0
```

**C. Restart Container & Verify**
```bash
pct stop [CONTAINER_ID]
pct start [CONTAINER_ID]

# Di container
ls -la /dev/net/tun
# Output: crw-rw-rw- 1 root root 10, 200 Dec 28 10:00 /dev/net/tun
```

---

## 🌐 Network Routing Configuration

### 1. Enable IP Forwarding

**Persistent IP Forward (Required for NAT/Routing)**
```bash
# Check current status
sysctl net.ipv4.ip_forward

# Enable permanently
cat >> /etc/sysctl.conf << 'EOF'

# Enable IP Forwarding for PPPoE/VPN
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

# Apply immediately
sysctl -p

# Verify
sysctl net.ipv4.ip_forward
# Output: net.ipv4.ip_forward = 1
```

### 2. Configure NAT/Masquerade (if needed)

**Setup iptables for NAT**
```bash
# Identify your main interface (eth0, ens3, vmbr0, etc)
ip addr show

# Setup MASQUERADE for PPPoE clients
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -A FORWARD -i ppp+ -o eth0 -j ACCEPT
iptables -A FORWARD -i eth0 -o ppp+ -m state --state RELATED,ESTABLISHED -j ACCEPT

# Save iptables rules
apt install -y iptables-persistent
netfilter-persistent save

# Verify
iptables -t nat -L -n -v
```

### 3. Configure Kernel Modules Auto-Load

**Make PPP modules persistent**
```bash
cat > /etc/modules-load.d/ppp.conf << 'EOF'
# PPP Kernel Modules - Auto-load on boot
ppp_generic
ppp_async
ppp_deflate
ppp_mppe

# L2TP Modules
l2tp_core
l2tp_ppp
l2tp_netlink

# TUN/TAP
tun
EOF

# Load immediately
systemctl restart systemd-modules-load.service

# Verify
lsmod | grep -E 'ppp|l2tp|tun'
```

---

## 🔧 Proxmox Container Configuration Template

**Complete Container Config (`/etc/pve/lxc/[ID].conf`)**
```bash
arch: amd64
cores: 2
hostname: salfanet-radius
memory: 2048
net0: name=eth0,bridge=vmbr0,firewall=1,gw=192.168.1.1,hwaddr=XX:XX:XX:XX:XX:XX,ip=192.168.1.100/24,type=veth
ostype: ubuntu
rootfs: local-lvm:vm-100-disk-0,size=20G
swap: 512

# PPPoE Support - /dev/ppp device
lxc.cgroup2.devices.allow: c 108:* rwm
lxc.mount.entry: /dev/ppp dev/ppp none bind,create=file,optional 0 0

# TUN/TAP Support - VPN
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0

# Enable nesting (for Docker/systemd)
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: a
lxc.cap.drop:

# Kernel modules access
lxc.mount.auto: proc:rw sys:rw cgroup:rw

# Security - enable raw sockets (for ping, traceroute)
lxc.cgroup2.devices.allow: c 1:5 rwm
```

**⚠️ Security Note:** 
- `lxc.apparmor.profile: unconfined` mengurangi security container
- Hanya gunakan di environment terpercaya
- Untuk production, gunakan dedicated VM bukan container

---

## ✅ Verification Checklist

Setelah konfigurasi, jalankan checklist berikut:

### 1. Device Checks
```bash
# PPP device
ls -la /dev/ppp
# Should show: crw------- 1 root root 108, 0

# TUN device
ls -la /dev/net/tun
# Should show: crw-rw-rw- 1 root root 10, 200

# Verify in /proc
cat /proc/net/pppoe
cat /proc/devices | grep ppp
```

### 2. Kernel Module Checks
```bash
lsmod | grep -E 'ppp|l2tp|tun'

# Should show:
# ppp_generic
# ppp_async
# ppp_deflate
# ppp_mppe
# l2tp_core
# l2tp_ppp
# tun
```

### 3. Network Forwarding Check
```bash
# IP Forward enabled?
sysctl net.ipv4.ip_forward
# Output: net.ipv4.ip_forward = 1

# NAT rules?
iptables -t nat -L -n -v | grep MASQUERADE
```

### 4. FreeRADIUS PPPoE Test
```bash
# Check FreeRADIUS status
systemctl status freeradius

# Test PPPoE module
radiusd -X | grep ppp

# Check if pppd is working
pppd --version
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "Cannot create /dev/ppp"
**Error:**
```
pppd: This system lacks kernel support for PPP
```

**Solution:**
```bash
# 1. Load module di HOST Proxmox
ssh root@proxmox-host
modprobe ppp_generic

# 2. Add device permission ke container
nano /etc/pve/lxc/[ID].conf
# Add: lxc.cgroup2.devices.allow: c 108:* rwm

# 3. Restart container
pct stop [ID] && pct start [ID]
```

### Issue 2: "TUN/TAP not available"
**Error:**
```
/dev/net/tun: No such file or directory
```

**Solution:**
```bash
# Di Proxmox Host
modprobe tun
nano /etc/pve/lxc/[ID].conf
# Add: lxc.cgroup2.devices.allow: c 10:200 rwm
# Add: lxc.mount.entry: /dev/net dev/net none bind,create=dir 0 0

pct stop [ID] && pct start [ID]
```

### Issue 3: "IP forwarding not working"
**Symptom:** PPPoE clients connect but no internet

**Solution:**
```bash
# 1. Enable IP forward
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

# 2. Check NAT rules
iptables -t nat -L -n -v

# 3. Add MASQUERADE if missing
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
netfilter-persistent save
```

### Issue 4: "Permission denied" on /dev/ppp
**Solution:**
```bash
chmod 600 /dev/ppp
chown root:root /dev/ppp

# Check FreeRADIUS user
ls -la /dev/ppp
groups freerad  # Should have access
```

---

## 📝 Integration with Installation Scripts

### Update vps-install.sh

Tambahkan section berikut di vps-install.sh setelah system update:

```bash
# ===================================
# PROXMOX VPS - PPP/TUN DEVICE SETUP
# ===================================
print_info "Setting up PPP and TUN devices for Proxmox VPS..."

# Create /dev/ppp if not exists
if [ ! -c /dev/ppp ]; then
    print_info "Creating /dev/ppp device..."
    mknod /dev/ppp c 108 0 2>/dev/null || echo "PPP device may need host support"
    chmod 600 /dev/ppp
    print_success "/dev/ppp created"
else
    print_success "/dev/ppp already exists"
fi

# Create /dev/net/tun if not exists
if [ ! -d /dev/net ]; then
    mkdir -p /dev/net
fi
if [ ! -c /dev/net/tun ]; then
    print_info "Creating /dev/net/tun device..."
    mknod /dev/net/tun c 10 200 2>/dev/null || echo "TUN device may need host support"
    chmod 666 /dev/net/tun
    print_success "/dev/net/tun created"
else
    print_success "/dev/net/tun already exists"
fi

# Load kernel modules
print_info "Loading PPP/TUN kernel modules..."
modprobe ppp_generic 2>/dev/null || echo "⚠️  ppp_generic not available - may need Proxmox host configuration"
modprobe ppp_async 2>/dev/null || true
modprobe ppp_mppe 2>/dev/null || true
modprobe ppp_deflate 2>/dev/null || true
modprobe l2tp_core 2>/dev/null || true
modprobe l2tp_ppp 2>/dev/null || true
modprobe tun 2>/dev/null || echo "⚠️  tun not available - may need Proxmox host configuration"

# Make modules persistent
cat > /etc/modules-load.d/ppp.conf << 'EOF'
ppp_generic
ppp_async
ppp_mppe
ppp_deflate
l2tp_core
l2tp_ppp
tun
EOF

# Enable IP forwarding
print_info "Enabling IP forwarding..."
cat >> /etc/sysctl.conf << 'SYSCTL_EOF'

# PPPoE & VPN Routing Support
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
SYSCTL_EOF

sysctl -p > /dev/null 2>&1
print_success "IP forwarding enabled"

# Verify setup
print_info "Verifying PPP/TUN setup..."
if [ -c /dev/ppp ]; then
    echo "  ✅ /dev/ppp exists"
else
    echo "  ⚠️  /dev/ppp NOT found - check Proxmox host config"
fi

if [ -c /dev/net/tun ]; then
    echo "  ✅ /dev/net/tun exists"
else
    echo "  ⚠️  /dev/net/tun NOT found - check Proxmox host config"
fi

IP_FWD=$(sysctl -n net.ipv4.ip_forward)
if [ "$IP_FWD" = "1" ]; then
    echo "  ✅ IP forwarding enabled"
else
    echo "  ⚠️  IP forwarding NOT enabled"
fi

print_success "Proxmox VPS PPP/TUN setup completed"
```

---

## 🔗 Related Documentation

- [FREERADIUS-SETUP.md](FREERADIUS-SETUP.md) - FreeRADIUS configuration
- [VPN_CLIENT_SETUP_GUIDE.md](VPN_CLIENT_SETUP_GUIDE.md) - L2TP/IPSec setup
- [DEPLOYMENT-GUIDE.md](../../deploy/README.md) - General deployment guide
- [TROUBLESHOOTING.md](../getting-started/TROUBLESHOOTING.md) - Common issues

---

## 📞 Support

Jika masih ada issue setelah mengikuti guide ini:

1. **Check Proxmox Forum** - Proxmox-specific issues
2. **Verify Container Type** - LXC vs KVM (KVM tidak butuh konfigurasi khusus)
3. **Check Host Kernel** - `uname -r` di host, pastikan support PPP/TUN
4. **Contact Support** - Dengan log lengkap dari verification checklist

---

**Last Updated:** December 28, 2025  
**Version:** 1.0  
**Author:** SALFANET RADIUS Team
