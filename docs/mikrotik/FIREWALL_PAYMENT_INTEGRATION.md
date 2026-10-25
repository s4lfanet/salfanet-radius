# 🔥 Firewall MikroTik & Payment Gateway Integration

**Date**: February 2, 2026  
**Version**: 2.9.x  
**Type**: Technical Analysis & Configuration Guide

---

## 📋 Table of Contents

1. [Firewall MikroTik Analysis](#firewall-mikrotik-analysis)
2. [VPN/NAT Scenarios](#vpn-nat-scenarios)
3. [Payment Gateway Integration](#payment-gateway-integration)
4. [Complete Workflow](#complete-workflow)
5. [Configuration Examples](#configuration-examples)

---

## 🔥 Firewall MikroTik Analysis

### Current Script Configuration

**Generated Script Location**: Admin → Settings → Isolation → MikroTik Setup

**Current Implementation**:
```routeros
# Allow akses ke server (payment page)
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=YOUR_SERVER_IP \
    action=accept \
    comment="Allow access to payment server"
```

### ⚠️ Issues with Current Script

#### Issue #1: Hostname Resolution
```routeros
dst-address=${settings.baseUrl ? new URL(settings.baseUrl).hostname : 'YOUR_SERVER_IP'}
```

**Problem**: MikroTik firewall `dst-address` **hanya menerima IP address**, TIDAK bisa hostname!

**Example**:
- ❌ `dst-address=billing.yourdomain.com` → **TIDAK AKAN WORK**
- ✅ `dst-address=103.xxx.xxx.xxx` → **WORK**

**Why?**: Firewall bekerja di layer 3 (IP), bukan layer 7 (HTTP/hostname)

#### Issue #2: Single IP Only
```routeros
dst-address=!YOUR_SERVER_IP
```

**Problem**: Hanya allow 1 IP, padahal payment gateway punya multiple IP:
- Midtrans: `api.midtrans.com` → Multiple CDN IPs
- Xendit: `api.xendit.co` → Multiple IPs
- Duitku: `passport.duitku.com` → Multiple IPs

### ✅ Solution untuk Berbagai Scenario

---

## 🌐 VPN/NAT Scenarios

### Scenario 1: Direct IP Public (Paling Simple)

```
Internet ←→ Router MikroTik (IP Public) ←→ Server (Internal)
            - IP Public: 103.xxx.xxx.xxx
            - Port Forward: 80/443 → Server Internal
```

**MikroTik Configuration**:
```routeros
# 1. IP Pool
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254

# 2. PPP Profile
/ppp profile
add name=isolir \
    local-address=pool-isolir \
    remote-address=pool-isolir \
    rate-limit=64k/64k

# 3. Firewall Filter
/ip firewall filter

# Allow DNS
add chain=forward \
    src-address=192.168.200.0/24 \
    protocol=udp dst-port=53 \
    action=accept \
    comment="Allow DNS for isolated users"

# Allow ICMP (ping)
add chain=forward \
    src-address=192.168.200.0/24 \
    protocol=icmp \
    action=accept \
    comment="Allow ICMP for isolated users"

# Allow akses ke SERVER (ganti dengan IP PUBLIC router)
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=103.xxx.xxx.xxx \
    action=accept \
    comment="Allow access to billing server"

# Allow akses ke payment gateway domain (via DNS)
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address-list=payment-gateways \
    action=accept \
    comment="Allow access to payment gateways"

# Block semua internet lainnya
add chain=forward \
    src-address=192.168.200.0/24 \
    action=drop \
    comment="Block internet for isolated users"

# 4. Address List untuk Payment Gateway IPs
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com comment="Midtrans API"
add list=payment-gateways address=app.midtrans.com comment="Midtrans Snap"
add list=payment-gateways address=api.xendit.co comment="Xendit API"
add list=payment-gateways address=passport.duitku.com comment="Duitku"

# 5. NAT Redirect ke Landing Page
/ip firewall nat

# Redirect HTTP (kecuali ke server sendiri & payment gateway)
add chain=dstnat \
    src-address=192.168.200.0/24 \
    protocol=tcp dst-port=80 \
    dst-address=!103.xxx.xxx.xxx \
    dst-address-list=!payment-gateways \
    action=dst-nat \
    to-addresses=103.xxx.xxx.xxx \
    to-ports=80 \
    comment="Redirect HTTP to isolation page"

# Redirect HTTPS (kecuali ke server sendiri & payment gateway)
add chain=dstnat \
    src-address=192.168.200.0/24 \
    protocol=tcp dst-port=443 \
    dst-address=!103.xxx.xxx.xxx \
    dst-address-list=!payment-gateways \
    action=dst-nat \
    to-addresses=103.xxx.xxx.xxx \
    to-ports=443 \
    comment="Redirect HTTPS to isolation page"
```

**Cara Dapat IP Public Router**:
```bash
# Dari MikroTik terminal
/ip address print where interface=ether1
```

---

### Scenario 2: VPN Server CHR (Cloudflare Tunnel / VPN)

```
Internet ←→ VPN Server CHR (IP Public) ←→ VPN Tunnel ←→ Router MikroTik ←→ Server
            - IP Public: 103.xxx.xxx.xxx                   - IP Internal: 10.x.x.x
            - Cloudflare Tunnel / WireGuard
```

**MikroTik Configuration** (sama dengan scenario 1, tapi tambahan):

```routeros
# Jika pakai Cloudflare Tunnel, allow Cloudflare IPs
/ip firewall address-list
add list=cloudflare address=173.245.48.0/20 comment="Cloudflare IPs"
add list=cloudflare address=103.21.244.0/22 comment="Cloudflare IPs"
add list=cloudflare address=103.22.200.0/22 comment="Cloudflare IPs"
add list=cloudflare address=103.31.4.0/22 comment="Cloudflare IPs"
add list=cloudflare address=141.101.64.0/18 comment="Cloudflare IPs"
add list=cloudflare address=108.162.192.0/18 comment="Cloudflare IPs"
add list=cloudflare address=190.93.240.0/20 comment="Cloudflare IPs"
add list=cloudflare address=188.114.96.0/20 comment="Cloudflare IPs"
add list=cloudflare address=197.234.240.0/22 comment="Cloudflare IPs"
add list=cloudflare address=198.41.128.0/17 comment="Cloudflare IPs"

# Allow isolated users akses Cloudflare
/ip firewall filter
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address-list=cloudflare \
    action=accept \
    comment="Allow Cloudflare for isolated users"

# Allow akses ke VPN Server IP (untuk reach billing via tunnel)
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=103.xxx.xxx.xxx \
    action=accept \
    comment="Allow VPN server IP (billing access via tunnel)"
```

**Key Point**: User akses billing via **domain** yang di-route via Cloudflare Tunnel, bukan langsung ke IP internal server.

---

### Scenario 3: Multiple NAS dengan Central Server

```
Internet ←→ Router NAS 1 (IP Public: 103.1.1.1) ─┐
          ↓                                       ├─→ Central Server (IP Public: 103.2.2.2)
          └→ Router NAS 2 (IP Public: 103.3.3.3) ┘
```

**MikroTik Configuration** (per NAS):

```routeros
# Router NAS 1
/ip firewall filter
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=103.2.2.2 \
    action=accept \
    comment="Allow central billing server"

# Router NAS 2 (sama, tapi dari lokasi berbeda)
/ip firewall filter
add chain=forward \
    src-address=192.168.200.0/24 \
    dst-address=103.2.2.2 \
    action=accept \
    comment="Allow central billing server"
```

---

## 💳 Payment Gateway Integration

### Current Implementation Analysis

**Halaman Isolasi**: `/isolated?username=user123`

**File**: `src/app/isolated/page.tsx`

**Features**:
1. ✅ Display user info (username, name, phone, expired date)
2. ✅ Display unpaid invoices
3. ✅ Payment link per invoice
4. ✅ Company contact (WhatsApp, Email)

**Invoice Structure**:
```typescript
interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  paymentLink: string;  // ← PAYMENT LINK!
}
```

### Payment Link Generation

**File**: `src/lib/payment-utils.ts`

```typescript
export function generatePaymentLink(invoice: Invoice, baseUrl: string): string {
  const paymentToken = generateSecureToken(invoice.id);
  
  // Store token in database
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { paymentToken }
  });
  
  // Generate link: https://billing.domain.com/pay/<token>
  const paymentLink = `${baseUrl}/pay/${paymentToken}`;
  
  return paymentLink;
}
```

### Payment Page Flow

**URL**: `/pay/[token]`

**File**: `src/app/pay/[token]/page.tsx` (need to check if exists)

**Expected Flow**:
```
1. User click "Bayar Sekarang" di halaman isolasi
2. Redirect ke: /pay/<token>
3. Show invoice details + payment gateway options:
   - Midtrans (QRIS, VA, E-Wallet)
   - Xendit (QRIS, VA, E-Wallet)
   - Duitku (QRIS, VA, E-Wallet)
4. User pilih payment method
5. Redirect ke payment gateway
6. User bayar
7. Webhook dari payment gateway → /api/payment/webhook (satu endpoint, gateway dikenali dari isi permintaan)
8. Update invoice status → PAID
9. Trigger auto-renewal cron
10. User status → ACTIVE
11. User re-login → normal internet
```

### ✅ Payment Integration Already Exists!

**Evidence**:
1. **Invoice Table** has `paymentLink` column
2. **Isolated Page** displays `invoice.paymentLink`
3. **Payment Gateways** configured in `/admin/payment-gateway`
4. **Webhook** ada di `/api/payment/webhook` (Midtrans, Xendit, Duitku, dan Tripay masuk ke endpoint yang sama)

### Payment Gateway IPs (untuk Firewall)

**Midtrans**:
```routeros
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com comment="Midtrans API"
add list=payment-gateways address=app.midtrans.com comment="Midtrans Snap"
add list=payment-gateways address=app.sandbox.midtrans.com comment="Midtrans Sandbox"
```

**Xendit**:
```routeros
add list=payment-gateways address=api.xendit.co comment="Xendit API"
add list=payment-gateways address=checkout.xendit.co comment="Xendit Checkout"
```

**Duitku**:
```routeros
add list=payment-gateways address=passport.duitku.com comment="Duitku API"
add list=payment-gateways address=merchant.duitku.com comment="Duitku Merchant"
```

**Important**: MikroTik akan resolve domain ke IP secara otomatis dan update address-list!

---

## 🔄 Complete Workflow: Isolation → Payment → Restore

### Phase 1: User Expiry & Isolation

```
┌─────────────────────────────────────────────────────────┐
│  DAY 0: User Expired (expiredAt < TODAY)               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Cron Job (Hourly): autoIsolatePPPoEUsers()            │
│  1. UPDATE pppoe_users SET status = 'ISOLATED'         │
│  2. radusergroup → 'isolir'                            │
│  3. Remove static IP                                    │
│  4. Disconnect session (MikroTik API / CoA)            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  User Re-Login (PPPoE)                                  │
│  1. RADIUS: Auth-Type = Accept (password OK) ✅        │
│  2. RADIUS: radusergroup = 'isolir'                    │
│  3. RADIUS: Framed-IP-Address = 'pool-isolir'          │
│  4. RADIUS: Mikrotik-Rate-Limit = '64k/64k'            │
│  5. MikroTik: Assign IP 192.168.200.x                  │
└─────────────────────────────────────────────────────────┘
```

### Phase 2: User Browsing (Isolated Network)

```
┌─────────────────────────────────────────────────────────┐
│  User tries to browse: http://google.com               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  MikroTik Firewall: NAT Chain = dstnat                  │
│  Match:                                                 │
│  - src-address = 192.168.200.x (isolated pool)         │
│  - protocol = tcp                                       │
│  - dst-port = 80                                        │
│  - dst-address != YOUR_SERVER_IP                       │
│  - dst-address-list != payment-gateways                │
│                                                          │
│  Action: dst-nat                                        │
│  - to-addresses = YOUR_SERVER_IP                       │
│  - to-ports = 80                                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  HTTP Request redirected to:                            │
│  http://YOUR_SERVER_IP/                                │
│                                                          │
│  Next.js detects user from isolated pool               │
│  → Serve /isolated page instead of normal page         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  /isolated?username=user123                             │
│  1. Fetch user info from API                            │
│  2. Fetch unpaid invoices                               │
│  3. Display:                                            │
│     - Alert message                                     │
│     - User info (name, phone, expired date)            │
│     - Unpaid invoices with "Bayar Sekarang" button    │
│     - Contact support (WhatsApp, Email)                │
└─────────────────────────────────────────────────────────┘
```

**MikroTik Detection (Optional)**:
```nginx
# Nginx/Traefik can detect source IP and auto-redirect
location / {
  if ($remote_addr ~* "^192\.168\.200\.") {
    return 302 /isolated?username=$http_x_username;
  }
}
```

Or via **MikroTik Hotspot** (simpler):
```routeros
/ip hotspot
add interface=bridge-local \
    address-pool=pool-isolir \
    profile=isolated-profile

/ip hotspot profile
set isolated-profile \
    login-by=http-chap \
    http-proxy=127.0.0.1:8080

/ip proxy
set enabled=yes port=8080
access enabled=yes

/ip proxy access
add action=deny \
    dst-host=!billing.yourdomain.com \
    redirect-to=http://billing.yourdomain.com/isolated
```

### Phase 3: Payment Process

```
┌─────────────────────────────────────────────────────────┐
│  User clicks "Bayar Sekarang" on invoice                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Redirect to: /pay/<paymentToken>                       │
│                                                          │
│  MikroTik Firewall allows:                              │
│  - src-address = 192.168.200.x                         │
│  - dst-address = YOUR_SERVER_IP ✅                     │
│  - dst-port = 80/443                                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Payment Page: /pay/<token>                             │
│  1. Verify token validity                               │
│  2. Fetch invoice details                               │
│  3. Show payment gateway options:                       │
│     [ ] Midtrans (QRIS, VA, E-Wallet)                  │
│     [ ] Xendit (QRIS, VA, E-Wallet)                    │
│     [ ] Duitku (QRIS, VA, E-Wallet)                    │
│  4. User selects payment method                         │
│  5. Generate payment gateway transaction                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Redirect to Payment Gateway                            │
│  URL: https://app.midtrans.com/snap/v3/...             │
│                                                          │
│  MikroTik Firewall allows:                              │
│  - src-address = 192.168.200.x                         │
│  - dst-address-list = payment-gateways ✅              │
│  - dst-port = 443                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  User Completes Payment                                 │
│  1. Scan QRIS / Input VA / Login E-Wallet              │
│  2. Confirm payment                                     │
│  3. Payment gateway processes transaction               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Payment Gateway sends Webhook                          │
│  POST /api/payment/webhook                              │
│  {                                                       │
│    "transaction_status": "settlement",                  │
│    "order_id": "INV-2026-001",                         │
│    "gross_amount": "200000"                            │
│  }                                                       │
│                                                          │
│  Webhook Handler:                                       │
│  1. Verify signature                                    │
│  2. Find invoice by order_id                            │
│  3. UPDATE invoice SET status = 'PAID'                 │
│  4. Create payment record                               │
│  5. Log activity                                        │
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Auto-Restoration

```
┌─────────────────────────────────────────────────────────┐
│  Cron Job (Every 5 minutes): Auto-Renewal               │
│  Location: src/lib/cron/auto-renewal.ts                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Query: Find users with paid invoice but still isolated │
│  WHERE:                                                 │
│  - status IN ('isolated', 'ISOLATED', 'SUSPENDED')     │
│  - EXISTS (invoice WHERE status = 'PAID' and           │
│            createdAt > user.lastPaymentDate)           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  For Each User with Paid Invoice:                       │
│                                                          │
│  1. Extend expiredAt:                                   │
│     expiredAt = NOW() + profile.duration               │
│                                                          │
│  2. Update status:                                      │
│     UPDATE pppoe_users SET status = 'ACTIVE'           │
│                                                          │
│  3. Update RADIUS:                                      │
│     - DELETE Auth-Type = 'Reject' from radcheck        │
│     - DELETE Reply-Message from radreply               │
│     - UPDATE radusergroup SET groupname = 'default'    │
│     - RESTORE static IP (if configured)                │
│                                                          │
│  4. Disconnect session (force re-auth):                │
│     - MikroTik API: /ppp/active/remove                 │
│     - CoA: radclient disconnect                        │
│     - UPDATE radacct SET acctstoptime = NOW()          │
│                                                          │
│  5. Send notification:                                  │
│     - WhatsApp: "Layanan telah aktif kembali"         │
│     - Email: "Perpanjanan berhasil"                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  User Re-Login (PPPoE)                                  │
│  1. RADIUS: radusergroup = 'default'                   │
│  2. RADIUS: Framed-IP-Address = static IP (if any)     │
│  3. RADIUS: Mikrotik-Rate-Limit = profile rate limit   │
│  4. MikroTik: Assign normal IP from normal pool        │
│  5. MikroTik: Apply normal firewall rules              │
│  6. User gets FULL internet access ✅                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Configuration Examples

### Example 1: Simple Setup (1 Router, Direct IP)

**Company Settings** (`/admin/settings/company`):
```
Base URL: http://103.50.100.150
```

**Isolation Settings** (`/admin/settings/isolation`):
```
Isolation IP Pool: 192.168.200.0/24
Rate Limit: 64k/64k
Base URL: http://103.50.100.150
Allow DNS: ✅
Allow Payment: ✅
```

**MikroTik Script** (copy from `/admin/settings/isolation/mikrotik`):
```routeros
# IP Pool
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254

# PPP Profile
/ppp profile
add name=isolir \
    local-address=pool-isolir \
    remote-address=pool-isolir \
    rate-limit=64k/64k

# Firewall
/ip firewall filter
add chain=forward src-address=192.168.200.0/24 protocol=udp dst-port=53 action=accept
add chain=forward src-address=192.168.200.0/24 dst-address=103.50.100.150 action=accept
add chain=forward src-address=192.168.200.0/24 action=drop

# NAT
/ip firewall nat
add chain=dstnat src-address=192.168.200.0/24 protocol=tcp dst-port=80 \
    dst-address=!103.50.100.150 action=dst-nat to-addresses=103.50.100.150
```

### Example 2: Domain with Cloudflare (Recommended)

**Company Settings**:
```
Base URL: https://billing.isp-provider.com
```

**Isolation Settings**:
```
Isolation IP Pool: 192.168.200.0/24
Rate Limit: 128k/128k
Base URL: https://billing.isp-provider.com
```

**Cloudflare Tunnel Setup**:
```bash
# On server
cloudflared tunnel create salfanet-radius
cloudflared tunnel route dns salfanet-radius billing.isp-provider.com
cloudflared tunnel run salfanet-radius
```

**MikroTik Script**:
```routeros
# IP Pool
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254

# PPP Profile  
/ppp profile
add name=isolir \
    local-address=pool-isolir \
    remote-address=pool-isolir \
    rate-limit=128k/128k

# Cloudflare IPs (untuk allow billing via CF tunnel)
/ip firewall address-list
add list=cloudflare address=173.245.48.0/20
add list=cloudflare address=103.21.244.0/22
add list=cloudflare address=103.22.200.0/22
add list=cloudflare address=103.31.4.0/22
add list=cloudflare address=141.101.64.0/18
add list=cloudflare address=108.162.192.0/18
add list=cloudflare address=190.93.240.0/20
add list=cloudflare address=188.114.96.0/20
add list=cloudflare address=197.234.240.0/22
add list=cloudflare address=198.41.128.0/17

# Payment Gateway IPs
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com
add list=payment-gateways address=app.midtrans.com
add list=payment-gateways address=api.xendit.co
add list=payment-gateways address=checkout.xendit.co
add list=payment-gateways address=passport.duitku.com

# Firewall Filter
/ip firewall filter
# Allow DNS
add chain=forward src-address=192.168.200.0/24 protocol=udp dst-port=53 action=accept

# Allow Cloudflare (untuk akses billing via CF tunnel)
add chain=forward src-address=192.168.200.0/24 dst-address-list=cloudflare action=accept

# Allow Payment Gateways
add chain=forward src-address=192.168.200.0/24 dst-address-list=payment-gateways action=accept

# Block semua internet lainnya
add chain=forward src-address=192.168.200.0/24 action=drop

# NAT Redirect (via Cloudflare, tidak perlu dst-nat karena via domain)
# User akan tetap bisa akses billing.isp-provider.com via Cloudflare
```

**Key Advantage**: 
- ✅ No IP hardcoding
- ✅ SSL/HTTPS automatic
- ✅ DDoS protection
- ✅ Global CDN
- ✅ Domain-based, easier to manage

---

## 📊 Troubleshooting

### Problem: User tidak bisa bayar (payment gateway blocked)

**Symptom**: User bisa akses /isolated, tapi setelah klik "Bayar", tidak bisa load payment gateway

**Check**:
```routeros
# Lihat apakah ada hit di drop rule
/ip firewall filter print stats where comment~"Block internet"

# Test dari isolated user
ping api.midtrans.com
# Harus bisa reply
```

**Fix**:
```routeros
# Pastikan address-list payment-gateways ada SEBELUM drop rule
/ip firewall filter
move [find comment="Allow access to payment gateways"] \
     [find comment="Block internet"]
```

### Problem: User bisa akses semua site (tidak ter-isolasi)

**Symptom**: User masih bisa browsing Google, Facebook, etc.

**Check**:
```routeros
/ppp active print where name=<username>
# Cek address nya, apakah dari pool-isolir?

/ip firewall filter print where src-address~"192.168.200"
# Pastikan ada rule drop
```

**Fix**:
```routeros
# Pastikan user pakai profile isolir
/ppp active print
/ppp active remove [find name=<username>]

# User re-login, RADIUS akan assign profile isolir
```

### Problem: Setelah bayar, user masih ter-isolasi

**Symptom**: Invoice sudah PAID, tapi user masih dapat IP isolir

**Check**:
```sql
-- Cek status user
SELECT username, status, expiredAt FROM pppoe_users WHERE username = 'user123';

-- Cek invoice
SELECT invoiceNumber, status, paidAt FROM invoice WHERE userId = '<userId>';

-- Cek radusergroup
SELECT * FROM radusergroup WHERE username = 'user123';
```

**Fix**:
```bash
# Trigger auto-renewal cron manually
curl http://localhost:3000/api/cron/auto-renewal
```

---

## 🎯 Recommendations

### 1. Use Domain + Cloudflare (Best Practice)

**Why?**
- ✅ No IP hardcoding in scripts
- ✅ Automatic SSL/HTTPS
- ✅ Global CDN (faster access)
- ✅ DDoS protection
- ✅ Easy to change server IP (just update Cloudflare)

**Setup**:
1. Point domain to Cloudflare
2. Install `cloudflared` on server
3. Create tunnel: `cloudflared tunnel create billing`
4. Route DNS: `cloudflared tunnel route dns billing billing.domain.com`
5. Run tunnel: `cloudflared tunnel run billing`
6. Update `baseUrl` in settings: `https://billing.domain.com`

### 2. Separate Payment Gateway Access List

**Why?**: Payment gateways sering ganti IP, lebih mudah manage via address-list

```routeros
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com
add list=payment-gateways address=api.xendit.co
add list=payment-gateways address=passport.duitku.com

/ip firewall filter
add chain=forward src-address-list=isolated-users \
    dst-address-list=payment-gateways action=accept
```

### 3. Monitor Isolation System

**Dashboard Metrics**:
- Total isolated users
- Total unpaid invoices
- Payment conversion rate (paid/isolated)
- Average time to pay (isolation → payment)

**Alerts**:
- Alert jika > 50 users isolated
- Alert jika payment gateway down
- Alert jika CoA disconnect rate < 80%

### 4. Auto-Redirect via MikroTik Hotspot (Optional)

Instead of NAT redirect, use MikroTik Hotspot:

```routeros
/ip hotspot
add interface=bridge-local \
    address-pool=pool-isolir \
    profile=isolated-profile

/ip hotspot profile
set isolated-profile \
    html-directory=flash/hotspot/isolated \
    http-proxy=127.0.0.1:8080 \
    login-by=http-pap

# Custom login page yang auto-redirect ke billing
```

---

## ✅ Summary

### Firewall Script Issues

| Issue | Current | Should Be |
|-------|---------|-----------|
| dst-address | Hostname | IP Address |
| Payment Gateway | Single IP | Address List (Multiple IPs) |
| VPN/Tunnel | Not handled | Allow Cloudflare IPs |
| NAT Redirect | All traffic | Except billing & payment |

### Payment Integration

| Component | Status | Notes |
|-----------|--------|-------|
| Isolated Page | ✅ Exists | `/isolated?username=user123` |
| Invoice Display | ✅ Working | Shows unpaid invoices |
| Payment Link | ✅ Generated | Per invoice |
| Payment Gateway | ✅ Configured | Midtrans, Xendit, Duitku |
| Webhook | ✅ Implemented | Auto-update invoice |
| Auto-Restore | ✅ Implemented | Cron every 5 min |

### Complete Workflow

```
User Expired → Isolated (Cron Hourly)
           ↓
User Re-Login → Get Isolated IP (192.168.200.x)
           ↓
User Browse → Redirect to /isolated page
           ↓
User See Unpaid Invoice → Click "Bayar Sekarang"
           ↓
Redirect to /pay/<token> → Select Payment Gateway
           ↓
Redirect to Payment Gateway → User Pay
           ↓
Webhook Received → Invoice status = PAID
           ↓
Auto-Renewal Cron → User status = ACTIVE
           ↓
User Re-Login → Get Normal IP + Full Internet ✅
```

---

**End of Document**

*Last Updated: February 2, 2026*
*Version: 1.0*
*Author: AI Assistant*
