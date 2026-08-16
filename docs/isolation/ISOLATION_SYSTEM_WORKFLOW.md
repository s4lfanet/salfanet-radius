# 🛡️ Isolation System - Complete Workflow Analysis

**Date**: August 16, 2026  
**Version**: 5.11.0  
**Type**: Technical Documentation

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Components](#architecture-components)
3. [Database Schema](#database-schema)
4. [Isolation Workflow](#isolation-workflow)
5. [Technical Implementation](#technical-implementation)
6. [MikroTik Integration](#mikrotik-integration)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## 🎯 System Overview

### What is Isolation System?

Sistem isolasi adalah mekanisme untuk **mengontrol akses internet user yang expired** dengan cara:
- ✅ User **tetap bisa login** (autentikasi RADIUS berhasil)
- ✅ User mendapat **IP dari pool khusus** (isolir pool)
- ✅ User mendapat **bandwidth terbatas** (rate limit)
- ✅ User **di-redirect** ke halaman pembayaran
- ✅ User **tidak bisa browsing** internet (diblokir firewall)
- ✅ User **bisa akses DNS** dan **payment gateway** saja

**Perbedaan dengan SUSPENDED:**
- **SUSPENDED**: User **tidak bisa login** sama sekali (Auth-Type = Reject)
- **ISOLATED**: User **bisa login** tapi akses internet dibatasi

### Key Benefits

1. **User Experience**: User tetap online, bisa lihat halaman pembayaran
2. **Auto-Recovery**: Setelah bayar, langsung aktif kembali
3. **No Manual Intervention**: Semua otomatis via cron
4. **Flexible**: Per-router configuration untuk IP pool & rate limit

---

## 🏗️ Architecture Components

### 1. Database Layer

```
┌─────────────────────────────────────────────────────────┐
│                    MySQL Database                        │
├─────────────────────────────────────────────────────────┤
│ • pppoe_users          - User data & status             │
│ • company              - Global isolation settings       │
│ • radcheck             - RADIUS auth (password)          │
│ • radreply             - RADIUS reply (reject msg)       │
│ • radusergroup         - User group mapping              │
│ • radgroupreply        - Group attributes (pool, rate)   │
│ • radacct              - Active sessions                 │
│ • router (nas)         - NAS/Router config               │
└─────────────────────────────────────────────────────────┘
```

### 2. Application Layer

```
┌─────────────────────────────────────────────────────────┐
│                   Next.js Application                    │
├─────────────────────────────────────────────────────────┤
│ • Cron Service          - Background jobs                │
│ • CoA Service           - RADIUS CoA disconnect          │
│ • MikroTik API          - Direct router control          │
│ • Isolation API         - Settings management            │
│ • Auto-Renewal          - Balance-based renewal          │
└─────────────────────────────────────────────────────────┘
```

### 3. Network Layer

```
┌─────────────────────────────────────────────────────────┐
│                   MikroTik Router                        │
├─────────────────────────────────────────────────────────┤
│ • IP Pool (isolir)      - 192.168.200.0/24              │
│ • PPP Profile (isolir)  - Rate limit 64k/64k            │
│ • Firewall Filter       - Allow DNS + Payment only       │
│ • Firewall NAT          - Redirect HTTP to landing       │
│ • CoA Port 3799         - Accept disconnect requests     │
└─────────────────────────────────────────────────────────┘
```

### 4. RADIUS Layer

```
┌─────────────────────────────────────────────────────────┐
│                    FreeRADIUS Server                     │
├─────────────────────────────────────────────────────────┤
│ • radcheck              - Auth: SUSPENDED = Reject       │
│ • radreply              - Reply message for suspended    │
│ • radusergroup          - Assign group (isolir)          │
│ • radgroupreply         - Group attributes               │
│ • radacct               - Session tracking               │
└─────────────────────────────────────────────────────────┘
```

---

## 💾 Database Schema

### 1. Company Table (Global Settings)

```sql
CREATE TABLE companies (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255),
  
  -- Isolation Settings
  isolationEnabled BOOLEAN DEFAULT TRUE,
  isolationIpPool VARCHAR(100) DEFAULT '192.168.200.0/24',
  isolationRateLimit VARCHAR(50) DEFAULT '64k/64k',
  isolationRedirectUrl TEXT,
  isolationMessage TEXT,
  isolationAllowDns BOOLEAN DEFAULT TRUE,
  isolationAllowPayment BOOLEAN DEFAULT TRUE,
  isolationNotifyWhatsapp BOOLEAN DEFAULT TRUE,
  isolationNotifyEmail BOOLEAN DEFAULT FALSE,
  
  gracePeriodDays INT DEFAULT 0,
  baseUrl VARCHAR(255) DEFAULT 'http://localhost:3000'
);
```

### 2. PPPoE Users Table

```sql
CREATE TABLE pppoe_users (
  id VARCHAR(191) PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  password VARCHAR(255),
  status VARCHAR(50) DEFAULT 'ACTIVE',  -- ACTIVE, SUSPENDED, BLOCKED
  expiredAt DATETIME,                    -- NULL untuk POSTPAID
  
  profileId VARCHAR(191),
  routerId VARCHAR(191),
  autoIsolationEnabled BOOLEAN DEFAULT TRUE,
  subscriptionType ENUM('PREPAID', 'POSTPAID') DEFAULT 'POSTPAID',
  
  balance INT DEFAULT 0,                 -- Saldo deposit
  autoRenewal BOOLEAN DEFAULT FALSE      -- Auto renew from balance
);
```

### 3. RADIUS Tables

```sql
-- Authentication (password storage)
CREATE TABLE radcheck (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64),
  attribute VARCHAR(64),              -- 'Cleartext-Password' atau 'Auth-Type'
  op CHAR(2) DEFAULT ':=',
  value VARCHAR(253),                 -- Password atau 'Reject'
  UNIQUE KEY (username, attribute)
);

-- Reply attributes (reject message untuk SUSPENDED)
CREATE TABLE radreply (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64),
  attribute VARCHAR(64),              -- 'Reply-Message'
  op CHAR(2) DEFAULT ':=',
  value VARCHAR(253)                  -- 'Akun Ditangguhkan - Hubungi Admin'
);

-- User group mapping
CREATE TABLE radusergroup (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64),
  groupname VARCHAR(64),              -- 'isolir', 'default', etc.
  priority INT DEFAULT 1,
  UNIQUE KEY (username, groupname)
);

-- Group reply attributes (pool, rate limit)
CREATE TABLE radgroupreply (
  id INT AUTO_INCREMENT PRIMARY KEY,
  groupname VARCHAR(64),              -- 'isolir'
  attribute VARCHAR(64),              -- 'Framed-IP-Address', 'Mikrotik-Rate-Limit'
  op CHAR(2) DEFAULT ':=',
  value VARCHAR(253)                  -- 'pool-isolir', '64k/64k'
);

-- Active sessions
CREATE TABLE radacct (
  radacctid BIGINT AUTO_INCREMENT PRIMARY KEY,
  acctsessionid VARCHAR(64),
  username VARCHAR(64),
  nasipaddress VARCHAR(15),
  framedipaddress VARCHAR(15),
  acctstarttime DATETIME,
  acctstoptime DATETIME,
  acctterminatecause VARCHAR(32)
);
```

---

## 🔄 Isolation Workflow

### Phase 1: Detection (Cron Job Hourly)

```
┌──────────────────────────────────────────────────────────┐
│  Cron: PPPoE Auto-Isolir (Runs Every Hour)              │
├──────────────────────────────────────────────────────────┤
│  Location: src/server/cron/auto-isolir.ts               │
│  Function: runAutoIsolir()                               │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │  Query Expired Users           │
         │  WHERE:                        │
         │  - status = 'active'           │
         │  - expiredAt < now - graceDays │
         │  - autoIsolationEnabled = true │
         │  - PREPAID & POSTPAID handled  │
         └────────────────────────────────┘
                          │
                          ▼
                   ┌──────────┐
                   │ Found?   │
                   └──────────┘
                    │        │
               YES  │        │  NO
                    ▼        ▼
            ┌─────────┐  ┌──────────┐
            │ Process │  │ Skip     │
            │ Isolate │  │ (done)   │
            └─────────┘  └──────────┘
```

### Phase 2: Status Update (isolated)

```
┌──────────────────────────────────────────────────────────┐
│  Update User Status (atomic conditional update)          │
├──────────────────────────────────────────────────────────┤
│  UPDATE pppoe_users                                      │
│  SET status = 'isolated'                                 │
│  WHERE id = :userId AND status = 'active'                │
│  (if count=0, another instance already did it — skip)    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Update RADIUS Tables (dibungkus prisma.$transaction)    │
├──────────────────────────────────────────────────────────┤
│  1. HAPUS Auth-Type:Reject dari radcheck (allow login!) │
│  2. Keep/insert Cleartext-Password di radcheck           │
│  3. Pindah radusergroup ke 'isolir' (priority: 1)        │
│  4. HAPUS Framed-IP-Address dari radreply (pakai pool)   │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  MikroTik: Add IP aktif ke address-list 'isolir'         │
│  (Memblokir internet segera sebelum user reconnect)      │
└──────────────────────────────────────────────────────────┘
```

**Current Implementation**:
- Status = **isolated** (bukan SUSPENDED)
- Auth-Type = **dihapus** (user **BISA LOGIN** untuk dapat isolir profile)
- Reply-Message = **dihapus** (tidak diperlukan)
- RADIUS updates dibungkus **prisma.$transaction** untuk atomicity

### Phase 3: RADIUS Group Assignment

```
┌──────────────────────────────────────────────────────────┐
│  Move to Isolir Group                                    │
├──────────────────────────────────────────────────────────┤
│  DELETE FROM radusergroup                                │
│  WHERE username = :username                              │
│                                                           │
│  INSERT INTO radusergroup                                │
│  VALUES (:username, 'isolir', 1)                         │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Remove Static IP (use pool instead)                     │
├──────────────────────────────────────────────────────────┤
│  DELETE FROM radreply                                    │
│  WHERE username = :username                              │
│    AND attribute = 'Framed-IP-Address'                   │
└──────────────────────────────────────────────────────────┘
```

**radgroupreply Configuration** (per-router di UI):
```sql
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES 
  ('isolir', 'Framed-Pool', ':=', 'pool-isolir'),
  ('isolir', 'Mikrotik-Rate-Limit', ':=', '64k/64k'),
  ('isolir', 'Mikrotik-Address-List', ':=', 'isolir');
```

### Phase 4: Disconnect Active Session

```
┌──────────────────────────────────────────────────────────┐
│  Method 1: MikroTik API (Primary)                        │
├──────────────────────────────────────────────────────────┤
│  1. Get NAS IP from radacct (active session)             │
│  2. Get router config from DB                            │
│  3. Connect to MikroTik API (port 8728/8729)             │
│  4. Find PPPoE active session by username                │
│  5. Execute /ppp/active/remove                           │
│  6. Close API connection                                 │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼ (if API fails)
┌──────────────────────────────────────────────────────────┐
│  Method 2: CoA Disconnect (Fallback)                     │
├──────────────────────────────────────────────────────────┤
│  1. Get session data (sessionId, framedIp, MAC)          │
│  2. Build CoA packet attributes:                         │
│     - NAS-IP-Address                                     │
│     - Framed-IP-Address                                  │
│     - User-Name                                          │
│     - Acct-Session-Id                                    │
│  3. Send via radclient to NAS:3799                       │
│     radclient -t 2 -r 1 <NAS>:3799 disconnect <secret>   │
│  4. Wait for Disconnect-ACK                              │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  Update radacct (Mark Session Stopped)                   │
├──────────────────────────────────────────────────────────┤
│  UPDATE radacct                                          │
│  SET acctstoptime = NOW(),                               │
│      acctterminatecause = 'Admin-Reset'                  │
│  WHERE username = :username                              │
│    AND acctstoptime IS NULL                              │
└──────────────────────────────────────────────────────────┘
```

### Phase 5: User Re-Authentication

```
┌──────────────────────────────────────────────────────────┐
│  User Tries to Login Again                               │
├──────────────────────────────────────────────────────────┤
│  1. MikroTik sends RADIUS Access-Request                 │
│  2. Authorize hook (src/app/api/radius/authorize):       │
│     - status = 'isolated'? → ALLOW (204)                 │
│     - expiredAt < now AND autoIsolationEnabled=true?     │
│       → ALLOW (204) — cron akan isolir                   │
│     - expiredAt < now AND autoIsolationEnabled=false?    │
│       → ALLOW (204) — user tetap terhubung (No Action)   │
│  3. FreeRADIUS checks radcheck:                          │
│     - Cleartext-Password = <password> ✅                 │
│     - NO Auth-Type Reject                                │
│  4. FreeRADIUS checks radusergroup:                      │
│     - groupname = 'isolir'                               │
│  5. FreeRADIUS sends Access-Accept with:                 │
│     - Framed-Pool = pool-isolir                          │
│     - Mikrotik-Rate-Limit = 64k/64k                      │
│     - Mikrotik-Address-List = isolir                     │
│  6. User gets IP from 192.168.200.0/24                   │
│  7. MikroTik firewall rules apply:                       │
│     - src-address-list=isolir: Allow DNS                 │
│     - src-address-list=isolir: Allow billing server      │
│     - src-address-list=isolir: Redirect HTTP to landing  │
│     - src-address-list=isolir: Block all other internet  │
│     - CIDR fallback rules also present                    │
└──────────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Implementation

### 1. Cron Job Configuration

**File**: `src/server/cron/auto-isolir.ts`

```typescript
export async function runAutoIsolir(): Promise<{
  isolated: number; total: number; errors: string[]
}> {
  // 1. Check company settings (isolationEnabled, gracePeriodDays)
  // 2. Find expired users:
  //    PREPAID: status='active', expiredAt < now - graceDays, autoIsolationEnabled=true
  //    POSTPAID: status='active', has overdue invoice
  // 3. Per user:
  //    a. Atomic conditional update: status='active' → 'isolated'
  //       (if count=0, another instance already did it — skip)
  //    b. RADIUS updates (dibungkus prisma.$transaction):
  //       - HAPUS Auth-Type:Reject dari radcheck
  //       - INSERT/UPDATE Cleartext-Password di radcheck
  //       - DELETE + INSERT radusergroup → 'isolir' (priority: 1)
  //       - DELETE Framed-IP-Address dari radreply
  //    c. addToMikrotikAddressList: Add IP aktif ke address-list 'isolir'
  //    d. MikroTik API: enable PPP secret + change profile ke 'isolir'
  //    e. MikroTik API: kick active PPPoE session
  //    f. CoA disconnect (force re-auth)
  // 4. Auto-stop: isolated > 30 hari → stop (hapus dari semua RADIUS table)
  //    CATATAN: 30 hari dihitung dari expiredAt (known limitation)
}
```

### 2. Manual Status Change

**File**: `src/app/api/pppoe/users/status/route.ts`

```typescript
// DB status + RADIUS updates dibungkus prisma.$transaction:
// - active:  Hapus Auth-Type, restore Cleartext-Password, restore radusergroup ke group normal, restore Framed-IP
// - isolated: Hapus Auth-Type, keep Cleartext-Password, move radusergroup ke 'isolir', hapus Framed-IP
// - blocked:  Hapus semua entry dari radcheck, radusergroup, radreply
// - stop:     Sama seperti blocked (intent berbeda)
//
// Setelah transaction: MikroTik PPP secret + CoA disconnect (best-effort, di luar transaction)
```

### 3. CoA & MikroTik Disconnect

**File**: `src/server/services/radius/coa-handler.service.ts`

```typescript
// disconnectPPPoEUser(username, routerId?) — multi-pronged approach:
// 1. Mark session stopped in radacct (database first — guaranteed)
// 2. Send CoA Disconnect-Request via radclient to NAS:3799
// 3. MikroTik API: /ppp/active/remove (if router config available)
//
// addToMikrotikAddressList(nasIp, userIp, listName) — instant block:
// Connects to MikroTik API and adds IP to firewall address-list.
// Used during isolation to block internet before user reconnects.
//
// shouldManagePppSecretForSuspend(authMode) — determines if PPP secret
// management is needed (only for local auth mode, not RADIUS auth).
```

### 4. Payment Recovery (Webhook)

**File**: `src/app/api/payment/webhook/route.ts`

```typescript
// handleInvoicePayment() — called when invoice payment is confirmed:
// 1. Find invoice with user.profile AND user.router (select id, authMode)
// 2. Validate amount, check idempotency
// 3. prisma.$transaction:
//    a. Mark invoice PAID, create payment record
//    b. Update user: status='active', extend expiredAt
//    c. Restore RADIUS: radcheck (Cleartext-Password), radusergroup (priority: 1),
//       radreply (Framed-IP-Address if static)
// 4. After transaction (await, bukan fire-and-forget):
//    a. managePppSecret: restore PPP secret to normal profile
//    b. kickPppoeSession: kick active session for reconnect
//    c. CoA disconnect: force re-authentication
// 5. Send notifications (WhatsApp, email)
//
// FIX: router include ditambahkan ke query agar shouldManagePppSecretForSuspend
// bekerja dengan benar untuk local-auth users.
```

---

## 🌐 MikroTik Integration

### Router Configuration (via UI)

**Location**: Network → Routers → Click Router → Shield Icon (Isolation Config)

Per-router settings:
- **IP Pool**: `pool-isolir` (e.g., 192.168.200.2-254)
- **PPP Profile**: `isolir` with rate limit
- **RADIUS Group**: `isolir`

### MikroTik Commands (Auto-Generated)

**1. IP Pool**
```routeros
/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254 \\
    comment="IP Pool untuk user yang diisolir"
```

**2. PPP Profile**
```routeros
/ppp profile
add name=isolir \\
    local-address=pool-isolir \\
    remote-address=pool-isolir \\
    rate-limit=64k/64k \\
    comment="Profile untuk user yang diisolir"
```

**3. Firewall Filter** (Primary: address-list, Fallback: CIDR)
```routeros
/ip firewall filter
# Primary: Dynamic address-list (di-populate oleh RADIUS Mikrotik-Address-List)
add chain=forward src-address-list=isolir protocol=udp dst-port=53 action=accept comment="SALFANET-ISOLIR Allow DNS UDP"
add chain=forward src-address-list=isolir protocol=tcp dst-port=53 action=accept comment="SALFANET-ISOLIR Allow DNS TCP"
add chain=forward src-address-list=isolir dst-address=<SERVER_IP> dst-port=80,443 protocol=tcp action=accept comment="SALFANET-ISOLIR Allow billing"
add chain=forward src-address-list=isolir action=drop comment="SALFANET-ISOLIR Block internet"

# Fallback: CIDR statis (untuk sesi yang belum dapat address-list)
add chain=forward src-address=192.168.200.0/24 protocol=udp dst-port=53 action=accept comment="SALFANET-ISOLIR Allow DNS UDP (CIDR fallback)"
add chain=forward src-address=192.168.200.0/24 dst-address=<SERVER_IP> dst-port=80,443 protocol=tcp action=accept comment="SALFANET-ISOLIR Allow billing (CIDR fallback)"
add chain=forward src-address=192.168.200.0/24 action=drop comment="SALFANET-ISOLIR Block internet (CIDR fallback)"
```

**4. Firewall NAT** (Redirect HTTP to Landing Page)
```routeros
/ip firewall nat
# Primary: Dynamic address-list
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=80 action=dst-nat to-addresses=<SERVER_IP> to-ports=80 comment="SALFANET-ISOLIR Redirect HTTP to billing"

# Fallback: CIDR statis
add chain=dstnat src-address=192.168.200.0/24 protocol=tcp dst-port=80 action=dst-nat to-addresses=<SERVER_IP> to-ports=80 comment="SALFANET-ISOLIR Redirect HTTP to billing (CIDR fallback)"
```

**5. CoA Configuration**
```routeros
/radius incoming
set accept=yes
```

### RADIUS Group Reply

```sql
-- Konfigurasi group isolir di RADIUS
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES 
  ('isolir', 'Framed-Pool', ':=', 'pool-isolir'),
  ('isolir', 'Mikrotik-Rate-Limit', ':=', '64k/64k'),
  ('isolir', 'Mikrotik-Address-List', ':=', 'isolir');
```

---

## 🔍 Implementation Status (August 2026)

### ✅ Issue #1: SUSPEND vs ISOLATE — RESOLVED
System sekarang **ISOLATES** user (allow login, limit access).
Auth-Type:Reject **dihapus** saat isolasi. User boleh login dengan Cleartext-Password.
Group 'isolir' mengontrol IP pool dan rate limit via radgroupreply.
MikroTik firewall mengontrol akses internet.

### ✅ Issue #2: Status Naming — RESOLVED
Status sekarang menggunakan `isolated` (lowercase) di seluruh codebase.

### ✅ Issue #3: Grace Period — RESOLVED
Grace period sudah diimplementasi: `expiredAt < now - graceDays * 24h`.
`gracePeriodDays` diambil dari company settings.

### ✅ Additional Fixes (August 2026)
- RADIUS updates dibungkus `prisma.$transaction` (atomicity)
- `addToMikrotikAddressList` dipanggil saat isolasi (instant block)
- Firewall rules menggunakan `src-address-list=isolir` (dynamic) + CIDR fallback
- Authorize route meng-allow expired users (204) bukan reject
- Webhook payment recovery: router include untuk PPP secret restore
- Webhook: PPP restore + kick di-await (bukan fire-and-forget)
- `radusergroup` priority distandarisasi ke 1
- `/admin` dihapus dari isolated IP allowedPaths di proxy.ts

---

## 📊 Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ISOLATION SYSTEM WORKFLOW                     │
└─────────────────────────────────────────────────────────────────────┘

START: Cron Job (Every Hour)
  │
  ├─► Query Expired Users
  │   WHERE status = 'ACTIVE' AND expiredAt < CURDATE()
  │
  ├─► For Each Expired User:
  │   │
  │   ├─► 1. UPDATE pppoe_users SET status = 'SUSPENDED' ❌
  │   │   (Should be 'ISOLATED')
  │   │
  │   ├─► 2. radcheck Table:
  │   │   ├─► INSERT Cleartext-Password (keep for re-auth) ✅
  │   │   └─► INSERT Auth-Type = 'Reject' ❌ (BLOCKS LOGIN!)
  │   │       (Should REMOVE this - let user login)
  │   │
  │   ├─► 3. radreply Table:
  │   │   └─► INSERT Reply-Message = 'Akun Ditangguhkan' ❌
  │   │       (Only needed if Auth-Type = Reject)
  │   │
  │   ├─► 4. radusergroup Table:
  │   │   └─► INSERT groupname = 'isolir' ✅
  │   │
  │   ├─► 5. Remove Static IP:
  │   │   └─► DELETE Framed-IP-Address from radreply ✅
  │   │       (User will get IP from pool-isolir via group)
  │   │
  │   ├─► 6. Disconnect Session:
  │   │   ├─► Try MikroTik API: /ppp/active/remove ✅
  │   │   └─► Fallback CoA: radclient disconnect ✅
  │   │
  │   └─► 7. Close radacct:
  │       └─► UPDATE acctstoptime = NOW() ✅
  │
  └─► END

User Re-Authentication Flow (CURRENT - BROKEN):
  │
  ├─► User enters username/password
  │
  ├─► MikroTik → RADIUS Access-Request
  │
  ├─► FreeRADIUS checks radcheck:
  │   ├─► Auth-Type = 'Reject' ❌
  │   └─► Send Access-Reject
  │
  └─► User CANNOT login ❌ (not isolation, full block!)

User Re-Authentication Flow (EXPECTED - ISOLATION):
  │
  ├─► User enters username/password
  │
  ├─► MikroTik → RADIUS Access-Request
  │
  ├─► FreeRADIUS checks radcheck:
  │   ├─► Cleartext-Password matches ✅
  │   └─► NO Auth-Type Reject
  │
  ├─► FreeRADIUS checks radusergroup:
  │   └─► groupname = 'isolir'
  │
  ├─► FreeRADIUS checks radgroupreply:
  │   ├─► Framed-IP-Address = 'pool-isolir'
  │   └─► Mikrotik-Rate-Limit = '64k/64k'
  │
  ├─► Send Access-Accept with attributes ✅
  │
  ├─► MikroTik assigns:
  │   ├─► IP from 192.168.200.0/24
  │   └─► Rate limit 64k/64k
  │
  ├─► User tries to browse:
  │   ├─► DNS queries: ALLOWED ✅
  │   ├─► Payment server: ALLOWED ✅
  │   ├─► HTTP redirect: TO LANDING PAGE ✅
  │   └─► Other sites: BLOCKED ✅
  │
  └─► User sees payment page, can pay to restore ✅

Payment & Restore Flow:
  │
  ├─► User pays via isolated landing page
  │
  ├─► Payment webhook updates invoice
  │
  ├─► Auto-renewal cron detects paid invoice:
  │   ├─► Extend expiredAt (+30 days)
  │   ├─► UPDATE status = 'ACTIVE'
  │   └─► Restore in RADIUS:
  │       ├─► DELETE Auth-Type Reject
  │       ├─► DELETE Reply-Message
  │       ├─► MOVE to 'default' group
  │       └─► Optional: assign static IP
  │
  ├─► Send CoA disconnect (force re-auth)
  │
  └─► User re-login → gets normal internet ✅
```

---

## 🛠️ Troubleshooting Guide

### Problem: User cannot login after expiry

**Symptom**: User tidak bisa login sama sekali

**Root Cause**: Mungkin Auth-Type:Reject masih ada di radcheck (dari versi lama)

**Check**:
```sql
SELECT * FROM radcheck 
WHERE username = 'user123' 
  AND attribute = 'Auth-Type';
```

**Fix**:
```sql
DELETE FROM radcheck 
WHERE username = 'user123' 
  AND attribute = 'Auth-Type';
```

**Note**: Pada code terbaru, Auth-Type:Reject tidak lagi ditambahkan saat isolasi.
Jika masih ada, kemungkinan dari versi lama yang belum di-clean up.

### Problem: User can login but gets normal internet

**Symptom**: Isolated user has full internet access

**Root Cause**: Not in 'isolir' group or no firewall rules

**Check**:
```sql
SELECT * FROM radusergroup WHERE username = 'user123';
SELECT * FROM radgroupreply WHERE groupname = 'isolir';
```

**Fix**:
```sql
-- Ensure user in isolir group
INSERT INTO radusergroup (username, groupname, priority)
VALUES ('user123', 'isolir', 1);

-- Ensure group has attributes
INSERT INTO radgroupreply (groupname, attribute, value)
VALUES 
  ('isolir', 'Framed-IP-Address', 'pool-isolir'),
  ('isolir', 'Mikrotik-Rate-Limit', '64k/64k');
```

**Check MikroTik**:
```routeros
/ip firewall filter print where comment~"isolated"
/ip firewall nat print where comment~"isolation"
```

### Problem: User gets wrong IP (not from isolir pool)

**Symptom**: User gets IP from default pool

**Root Cause**: Static IP in radreply or group not applied

**Check**:
```sql
SELECT * FROM radreply 
WHERE username = 'user123' 
  AND attribute = 'Framed-IP-Address';
```

**Fix**:
```sql
-- Remove static IP
DELETE FROM radreply 
WHERE username = 'user123' 
  AND attribute = 'Framed-IP-Address';
```

### Problem: CoA disconnect not working

**Symptom**: User stays online after isolation

**Check MikroTik**:
```routeros
/radius incoming print
# Should show: accept=yes
```

**Fix**:
```routeros
/radius incoming set accept=yes
```

**Check FreeRADIUS**:
```bash
# Test CoA manually
echo "User-Name=user123" | radclient -x <NAS_IP>:3799 disconnect <SECRET>
```

### Problem: Firewall not blocking traffic

**Symptom**: Isolated user can access all sites

**Check MikroTik**:
```routeros
/ip firewall filter print where src-address~"192.168.200"
```

**Fix**: Re-apply firewall rules from isolation mikrotik page

---

## 📝 Recommendations for Future Improvement

### 1. Add `isolatedAt` field to pppoeUser

Currently auto-stop calculates 30 days from `expiredAt`, not from actual isolation date.
Adding `isolatedAt` would allow accurate tracking.

### 2. Multi-tenant isolation settings

Currently isolation settings are global (single company). Per-router or per-tenant
isolation IP pools would allow better isolation for different networks.

### 3. Webhook retry for MikroTik operations

If MikroTik API is unreachable during payment recovery, the PPP secret restore
fails silently. A retry queue would improve reliability.

---

## ✅ Success Criteria

A properly working isolation system should:

1. ✅ User can **LOGIN** after expiry (auth succeeds)
2. ✅ User gets **IP from isolation pool** (192.168.200.x)
3. ✅ User gets **limited bandwidth** (64k/64k)
4. ✅ User **can access DNS** (for domain resolution)
5. ✅ User **can access payment server** (to pay)
6. ✅ User **HTTP/HTTPS redirected** to landing page
7. ✅ User **cannot browse** other sites (blocked by firewall)
8. ✅ After payment, user **auto-restored** to normal
9. ✅ Grace period **properly calculated** before isolation
10. ✅ CoA disconnect **forces re-authentication** on status change

---

## 📚 Related Documentation

- [MIKROTIK_COA_SETUP.md](MIKROTIK_COA_SETUP.md) - CoA configuration guide
- [BALANCE_AUTO_RENEWAL.md](BALANCE_AUTO_RENEWAL.md) - Auto-renewal system
- [CRON-SYSTEM.md](CRON-SYSTEM.md) - Cron job documentation
- [FREERADIUS-SETUP.md](FREERADIUS-SETUP.md) - RADIUS server setup

---

**End of Document**

*Last Updated: August 16, 2026*
*Version: 2.0*
*Author: AI Assistant*
