# SALFANET RADIUS - Comprehensive Feature Guide

**Version**: 2.10.21  
**Last Updated**: March 5, 2026  
**Project**: ISP/RTRW.NET Billing & RADIUS Management System

> **Ringkasan Lengkap**: Dokumentasi ini merangkum semua fitur dan kemampuan dari SALFANET RADIUS. Konten dasar guide ini mencakup fitur hingga v2.7.5; untuk fitur baru v2.10.x–v2.11.x (Dark Mode, Admin Dashboard v2, PPPoE Session Sync, PPN Fix, Area badge, billingDay recalc, dll) lihat [`CHANGELOG.md`](getting-started/CHANGELOG.md) dan [`ROADMAP.md`](ROADMAP.md).

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Core Features](#core-features)
3. [Authentication & RADIUS](#authentication--radius)
4. [Customer Management](#customer-management)
5. [Billing & Payment](#billing--payment)
6. [Hotspot & Voucher System](#hotspot--voucher-system)
7. [Agent/Reseller System](#agentreseller-system)
8. [Notification System](#notification-system)
9. [Financial Management](#financial-management)
10. [Automation & Cron Jobs](#automation--cron-jobs)
11. [Monitoring & Reporting](#monitoring--reporting)
12. [GenieACS Integration](#genieacs-integration)
13. [Security & Permissions](#security--permissions)
14. [Deployment & Infrastructure](#deployment--infrastructure)
15. [Advanced Features](#advanced-features)

---

## 🎯 System Overview

### Platform Details
- **Framework**: Next.js 16.0.8 + React 19
- **Backend**: Node.js 20.x + Prisma ORM
- **Database**: MySQL 8.0
- **RADIUS Server**: FreeRADIUS 3.0.26
- **Process Manager**: PM2
- **Web Server**: Nginx
- **Timezone**: WIB (UTC+7) - Automatic conversion

### Supported Authentication
- PPPoE (Point-to-Point Protocol over Ethernet)
- Hotspot (Voucher-based)
- Static IP (Manual assignment)
- PAP/CHAP/MS-CHAP protocols

### Infrastructure Support
- Multi-NAS (Network Access Server) management
- VPN L2TP/IPSec for remote routers
- GenieACS for TR-069 device management
- Cross-platform deployment (Ubuntu, Windows dev)

---

## 🚀 Core Features

### 1. FreeRADIUS Integration
**Reference**: [FREERADIUS-SETUP.md](FREERADIUS-SETUP.md)

- **Full RADIUS Server**: FreeRADIUS 3.0.26 dengan MySQL backend
- **Multi-Protocol**: PAP, CHAP, MS-CHAP support
- **Dynamic NAS Loading**: NAS clients loaded from database
- **CoA (Change of Authorization)**: Real-time speed changes & disconnect
- **Session Accounting**: Complete radacct table tracking
- **Reply-Message**: Custom messages for MikroTik logs
- **BOM Detection**: Auto-remove UTF-8 BOM from config files
- **VPN Support**: L2TP/IPSec tunnel for remote routers

**Key Capabilities**:
- Authenticate PPPoE users against database
- Track active sessions in real-time
- Disconnect users via CoA when quota/time expires
- Custom reply messages ("Kode Voucher Kadaluarsa")
- Multi-router management with single RADIUS server

### 2. Multiple NAS Same IP Support
**Reference**: [MULTIPLE_NAS_SAME_IP.md](MULTIPLE_NAS_SAME_IP.md)

**Problem Solved**: Manage multiple routers behind single public IP (VPN scenario)

**Features**:
- `nasIdentifier` field untuk unique identification
- Support VPN scenarios (multiple routers, 1 IP)
- NAS selection by identifier, bukan IP
- Backward compatible dengan existing setup

**Use Cases**:
```
Public IP: 103.67.244.131
├── Router A (VPN) → nasIdentifier: "router-jakarta"
├── Router B (VPN) → nasIdentifier: "router-bandung"
└── Router C (VPN) → nasIdentifier: "router-surabaya"
```

### 3. Complete Database Seeding
**Reference**: [CHAT_HISTORY_2025-12-23.md](../CHAT_HISTORY_2025-12-23.md)

**Seed Files** (10 essential TypeScript files, 110 KB):
1. Company settings & isolation config
2. 53 permissions & 6 role templates
3. 26 GenieACS parameter configs
4. 3 isolation templates (WhatsApp, Email, HTML)
5. 5 email templates (payment workflow + extension)
6. 12 WhatsApp templates (invoice, payment, extension)
7. 2 invoice templates (overdue, notification)
8. Transaction categories (13)
9. Hotspot profiles (5)
10. Admin user & RADIUS group

**Total Templates**: 22 across 5 categories
**Seeding Steps**: 13 automated steps
**Idempotent**: Safe to run multiple times

---

## 👥 Customer Management

### 1. PPPoE User Management

**Features**:
- Create/Edit/Delete PPPoE users
- Profile assignment (bandwidth, speed limit)
- Area/wilayah grouping
- GPS location tracking (optional)
- Auto-isolation when expired
- Manual extension (perpanjangan)
- Stop langganan (unsubscribe)
- Import from MikroTik
- Bulk operations

**Status Types**:
- `active` - User dapat login
- `isolated` - Limited bandwidth, landing page redirect
- `blocked` - Tidak bisa login
- `suspended` - Temporary disabled
- `stopped` - Berhenti berlangganan

### 2. Subscription Types
**Reference**: [PREPAID_POSTPAID_IMPLEMENTATION.md](PREPAID_POSTPAID_IMPLEMENTATION.md)

#### PREPAID (Bayar Dimuka)
- Bayar sebelum masa aktif
- `expiredAt` = tanggal kadaluarsa
- Auto-isolate ketika expired
- Support auto-renewal dari balance
- Invoice generated saat renewal

#### POSTPAID (Bayar Dibelakang)
- Bayar setelah pakai
- `billingDay` = 1-28 (tanggal tagihan bulanan)
- `expiredAt` = di-set otomatis ke tanggal `billingDay` bulan berikutnya saat create/edit
- Grace period 7 hari setelah `expiredAt`
- Auto-isolate H+7 jika belum bayar

**Connection Types**:
- `PPPOE` - PPPoE authentication
- `HOTSPOT` - Voucher-based
- `STATIC_IP` - Manual IP assignment

### 3. Customer Registration & Approval

**Workflow**:
1. Customer submit pendaftaran (online form)
2. Admin receive notification
3. Admin review & approve/reject
4. If approved:
   - User created in database
   - Invoice generated (installation + monthly)
   - Notification sent (WhatsApp + Email)
5. Customer bayar invoice
6. Status changed to `active`

**GPS Location Feature**:
**Reference**: [GPS_LOCATION_FEATURE.md](GPS_LOCATION_FEATURE.md)

- Capture customer GPS coordinates saat registrasi
- Store latitude & longitude
- Display on map (admin panel)
- Useful untuk instalasi & maintenance

### 4. Area Management

- Kelompokkan customer berdasarkan wilayah
- Filter by area di semua laporan
- Area-based pricing (optional)
- Area statistics & analytics

### 5. Import PPPoE Users
**Reference**: [IMPORT_PPPOE_USERS.md](IMPORT_PPPOE_USERS.md)

**Feature**: Sync existing PPPoE secrets dari MikroTik ke database

**Process**:
1. Connect ke MikroTik via API
2. Fetch all `/ppp secret` entries
3. Match dengan database by username
4. Create users yang belum ada
5. Update existing users
6. Generate import report

**Use Case**: Migrasi dari MikroTik manual ke SALFANET RADIUS

---

## 💰 Billing & Payment

### 1. Invoice System

**Invoice Types**:
- `INSTALLATION` - Biaya pemasangan + bulan pertama
- `MONTHLY` - Tagihan bulanan
- `RENEWAL` - Perpanjangan subscription
- `ADDON` - Biaya tambahan
- `TOPUP` - Isi ulang saldo

**Invoice Components**:
```typescript
baseAmount: 100000      // Harga dasar
taxRate: 0.11           // PPN 11%
taxAmount: 11000        // Calculated
additionalFees: [       // Biaya tambahan
  { name: "Admin Fee", amount: 5000 },
  { name: "Instalasi Extra", amount: 50000 }
]
totalAmount: 166000     // Grand total
```

**Invoice Number Format**:
**Reference**: [INVOICE_NUMBER_FORMAT.md](INVOICE_NUMBER_FORMAT.md)

```
Format: INV-20251223-00001
        ^^^  ^^^^^^^^  ^^^^^
        │    │         └── Sequential number (5 digits)
        │    └── Date (YYYYMMDD)
        └── Prefix
```

**Auto-Generation** (Cron Job):
- POSTPAID: Generate setiap billingDay
- PREPAID: Generate H-7 sebelum expired
- Grace period: 7 hari
- Auto-isolate jika belum bayar

### 2. Payment Methods

#### A. Manual Payment (Upload Bukti Transfer)
**Reference**: [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md)

**Customer Side**:
1. Upload foto bukti transfer (JPG/PNG/WebP, max 5MB)
2. Submit dengan keterangan
3. Status: `PENDING` approval

**Admin Side**:
1. Review bukti transfer
2. Approve atau Reject
3. Jika approve:
   - Invoice status → `PAID`
   - User status → `ACTIVE`
   - Send WhatsApp/Email notification
4. Jika reject:
   - Send rejection reason
   - Customer dapat upload ulang

**Notification Templates**:
- `manual_payment_approval` - Payment approved
- `manual_payment_rejection` - Payment rejected with reason

#### B. Payment Gateway Integration

**Supported Gateways**:
- **Midtrans** - Credit card, bank transfer, e-wallet
- **Xendit** - Bank transfer, QRIS, e-wallet
- **Duitku** - Multi-channel payment

**Flow**:
1. Customer klik "Bayar Sekarang"
2. Select payment gateway
3. Create payment session via API
4. Redirect ke payment page
5. Webhook notifikasi → update status
6. Auto-activate user

### 3. Agent Deposit System
**Reference**: [AGENT_DEPOSIT_SYSTEM.md](AGENT_DEPOSIT_SYSTEM.md)

**Features**:
- Agent balance management
- Top-up via payment gateway
- Manual transfer request (approve/reject by admin)
- Admin bank account selection for manual transfer
- Transfer proof upload and verification
- Minimum balance threshold
- Transaction history
- Commission tracking

**Database Schema**:
```sql
agents:
  - balance: INT (saldo saat ini)
  - minBalance: INT (minimum allowed)

agent_deposits:
  - amount: Jumlah deposit
  - status: PENDING/PAID/EXPIRED
  - paymentGateway: midtrans/xendit/duitku
  - paymentUrl: Link pembayaran
  - targetBankName/Account: Rekening admin tujuan transfer manual
  - senderAccountName/Number: Data pengirim dari agent
  - receiptImage: Bukti transfer manual
  - note: Catatan agent saat request

agent_sales:
  - paymentStatus: PAID/UNPAID
  - paidAmount: Jumlah terbayar
```

**Workflow**:
1. Agent request deposit (min. Rp 10,000)
2. Pilih metode:
  - Payment gateway (Midtrans/Xendit/Duitku), atau
  - Manual transfer (pilih rekening admin + upload bukti TF)
3. Jika gateway: agent diarahkan ke payment URL
4. Jika manual: request masuk ke admin verification queue
5. Admin review bukti TF + rekening tujuan/pengirim
6. Approve/reject request manual atau tunggu webhook gateway
7. Saat status PAID, balance agent bertambah dan siap untuk generate voucher

---

## 🎫 Hotspot & Voucher System

### 1. Voucher Generation

**Features**:
- Batch generation (up to 25,000 vouchers)
- Pagination support (1000 per page)
- Custom profile assignment
- Validity period (hours/days/months)
- Price settings
- Auto-generate unique codes
- Print voucher cards

**Voucher Types**:
- Time-based (1 jam, 1 hari, 1 minggu, 1 bulan)
- Quota-based (1GB, 5GB, 10GB)
- Unlimited time with speed limit
- Custom combinations

### 2. Hotspot Sync (Cron Job)
**Reference**: [CRON-SYSTEM.md](CRON-SYSTEM.md)

**Schedule**: Every 5 minutes

**Process**:
1. Fetch active sessions from radacct
2. Find vouchers with matching username
3. Check if first login (`usedAt` is NULL)
4. If first login:
   - Set `usedAt` = now
   - Calculate `expiredAt` based on validity
   - Update voucher status to `USED`
   - Record aktivasi

**Purpose**: Auto-activate voucher on first login (support offline MikroTik)

### 3. Voucher Auto-Disconnect

**Process**:
1. Check radacct for active sessions
2. Get voucher expiredAt
3. If expired:
   - Send CoA Disconnect to NAS
   - Set session status to `EXPIRED`
   - Display "Kode Voucher Kadaluarsa" message
   - Cleanup session from radacct

**Reply-Message**: Custom message di MikroTik log

---

## 🤝 Agent/Reseller System

### 1. Agent Features

**Capabilities**:
- Balance-based voucher generation
- Multi-profile support
- Sales tracking & reporting
- Commission calculation
- Payment management
- Voucher inventory

**Agent Types**:
- `RESELLER` - Full access, beli voucher pakai balance
- `DISTRIBUTOR` - Large volume, special pricing
- `PARTNER` - Limited access

### 2. Agent Operations

**Generate Voucher**:
1. Check balance cukup?
2. Deduct balance (qty × price)
3. Generate voucher batch
4. Record in `agent_sales`
5. Update inventory

**Top-up Balance**:
- Manual (admin adds balance)
- Auto (via payment gateway)
- Transfer antar agent (optional)

### 3. Commission System

**Calculation**:
```typescript
price: 10000           // Harga voucher
commission: 1000       // 10% commission
agentPays: 9000        // Harga net agent
profit: 1000           // Keuntungan per voucher
```

**Commission Types**:
- Percentage (%)
- Fixed amount (Rp)
- Tiered (volume-based)

---

## 📢 Notification System

### 1. WhatsApp Integration

**Templates** (12 total):
1. `registration-approval` - Pendaftaran disetujui
2. `installation-invoice` - Invoice instalasi
3. `admin-create-user` - User dibuat admin
4. `invoice-reminder` - Reminder tagihan
5. `payment-success` - Pembayaran berhasil
6. `voucher-purchase-success` - Voucher terbeli
7. `outage_notification` - Notif gangguan
8. `payment_receipt` - Bukti pembayaran
9. `manual_payment_admin` - Approval needed
10. `manual-payment-approval` - Payment approved
11. `manual-payment-rejection` - Payment rejected
12. `manual-extension` - Perpanjangan manual

**Variables Supported**:
- `{{customerName}}`, `{{username}}`, `{{profileName}}`
- `{{amount}}`, `{{invoiceNumber}}`, `{{expiredDate}}`
- `{{companyName}}`, `{{companyPhone}}`, `{{paymentLink}}`

**Provider**: Any WhatsApp Gateway API compatible

### 2. Email Notifications

**Templates** (5 total):
1. `payment_confirmation_request` - Request konfirmasi
2. `payment_approval_required` - Perlu approval
3. `payment_approved` - Pembayaran disetujui
4. `payment_rejected` - Pembayaran ditolak
5. `manual-extension` - Perpanjangan manual

**Email Configuration**:
- SMTP: Gmail, Office365, Custom
- HTML templates dengan inline CSS
- Auto-retry on failure
- Delivery tracking

### 3. Broadcast Notification System
**Reference**: [BROADCAST_NOTIFICATION_SYSTEM.md](BROADCAST_NOTIFICATION_SYSTEM.md)

**Features**:
- Mass notification ke selected users
- Multi-channel (WhatsApp + Email)
- Bulk selection dengan pagination
- Filter by area/status/profile
- Send to all users
- Template selection
- Preview before send

**Use Cases**:
- Pemberitahuan gangguan jaringan
- Reminder pembayaran massal
- Promosi paket baru
- Maintenance schedule
- Festival greetings

**Channels**:
- WhatsApp only
- Email only
- WhatsApp + Email (both)

### 4. Outage Notification System
**Reference**: [OUTAGE_NOTIFICATION_SYSTEM.md](OUTAGE_NOTIFICATION_SYSTEM.md)

**API**: `POST /api/notifications/outage`

**Parameters**:
```typescript
{
  targetUsers: 'all' | 'area' | 'selected',
  areaId?: string,
  userIds?: string[],
  issueType: 'internet' | 'electric' | 'maintenance' | 'other',
  customMessage?: string,
  estimatedTime?: string,
  channels: ['whatsapp', 'email']
}
```

**Issue Types**:
- `internet` - Gangguan internet/upstream
- `electric` - Gangguan listrik PLN
- `maintenance` - Maintenance terjadwal
- `other` - Custom message

**Templates**:
- Pre-defined untuk setiap issue type
- Custom message support
- ETA (Estimated Time of Arrival)
- Auto-translate ke Bahasa Indonesia

---

## 📊 Financial Management

### 1. Transaction Categories

**Income Categories** (4):
- `cat-income-pppoe` - Pembayaran PPPoE bulanan
- `cat-income-hotspot` - Penjualan voucher hotspot
- `cat-income-instalasi` - Biaya instalasi pelanggan baru
- `cat-income-lainnya` - Pendapatan lain-lain

**Expense Categories** (9):
- `cat-expense-bandwidth` - Bandwidth & upstream
- `cat-expense-gaji` - Gaji karyawan
- `cat-expense-listrik` - Listrik operasional
- `cat-expense-maintenance` - Perawatan & repair
- `cat-expense-hardware` - Peralatan & hardware
- `cat-expense-sewa` - Sewa tempat
- `cat-expense-komisi` - Komisi agent
- `cat-expense-marketing` - Marketing & promosi
- `cat-expense-lainnya` - Operasional lainnya

### 2. Financial Reports

**Available Reports**:
- Income vs Expense (by period)
- Profit/Loss statement
- Cash flow analysis
- Category breakdown
- Agent commission summary
- Payment gateway fees
- Outstanding invoices
- Paid invoices report

**Export Formats**:
- PDF
- Excel (XLSX)
- CSV

### 3. Invoice Management

**Status Tracking**:
- `UNPAID` - Belum dibayar
- `PENDING` - Menunggu konfirmasi
- `PAID` - Sudah dibayar
- `OVERDUE` - Terlambat bayar
- `CANCELLED` - Dibatalkan

**Auto-Actions**:
- Send reminder H-3
- Send reminder H-1
- Auto-isolate H+0 (overdue)
- Mark as overdue H+7

---

## ⚙️ Automation & Cron Jobs

**Reference**: [CRON-SYSTEM.md](CRON-SYSTEM.md)

### Job Definitions (10 Jobs)

#### 1. Hotspot Sync (`hotspot_sync`)
- **Schedule**: Every 5 minutes
- **Purpose**: Auto-activate vouchers on first login
- **Actions**: Update usedAt, calculate expiredAt

#### 2. Voucher Sync (`voucher_sync`)
- **Schedule**: Every 1 minute
- **Purpose**: Disconnect expired vouchers
- **Actions**: CoA disconnect, cleanup sessions

#### 3. PPPoE Auto-Isolate (`pppoe_auto_isolate`)
- **Schedule**: Every hour (00:00)
- **Purpose**: Isolate expired PPPoE users
- **Actions**: Change status, update RADIUS group

#### 4. Generate Invoices (`generate_invoices`)
- **Schedule**: Daily at 00:00 WIB
- **Purpose**: Auto-generate monthly invoices
- **Actions**: PREPAID (H-7), POSTPAID (billingDay)

#### 5. Invoice Reminders (`invoice_reminders`)
- **Schedule**: Daily at 08:00 WIB
- **Purpose**: Send payment reminders
- **Actions**: Send WhatsApp/Email H-3, H-1

#### 6. Mark Overdue (`mark_overdue`)
- **Schedule**: Daily at 01:00 WIB
- **Purpose**: Mark unpaid invoices as overdue
- **Actions**: Update status, send notification

#### 7. Auto-Disconnect Sessions (`auto_disconnect`)
- **Schedule**: Every 10 minutes
- **Purpose**: Disconnect expired sessions
- **Actions**: CoA disconnect, update radacct

#### 8. Cleanup Old Sessions (`cleanup_sessions`)
- **Schedule**: Daily at 03:00 WIB
- **Purpose**: Delete old radacct records (>90 days)
- **Actions**: Prevent database bloat

#### 9. Sync NAS Clients (`sync_nas`)
- **Schedule**: Every 30 minutes
- **Purpose**: Update FreeRADIUS NAS table
- **Actions**: Sync from database to RADIUS

#### 10. Activity Log Cleanup (`cleanup_activity_logs`)
- **Schedule**: Daily at 04:00 WIB
- **Purpose**: Delete old activity logs (>90 days)
- **Actions**: Maintain database performance

### Cron System Architecture

**Database Tables**:
```sql
cron_jobs:
  - name, schedule, enabled
  - lastRun, nextRun, status
  
cron_executions:
  - jobName, startedAt, completedAt
  - status, result, error
```

**Execution Tracking**:
- Start time, end time, duration
- Success/failure status
- Error messages & stack traces
- Result statistics (records processed)

**Monitoring**:
- Admin dashboard
- Execution history (last 100 runs)
- Performance metrics
- Alert on failures

---

## 📈 Monitoring & Reporting

### 1. Activity Log System
**Reference**: [ACTIVITY_LOG_IMPLEMENTATION.md](ACTIVITY_LOG_IMPLEMENTATION.md)

**Features**:
- Comprehensive action tracking
- User attribution (who did what)
- IP address logging
- Timestamp (UTC+7)
- Entity tracking (type + ID)
- Auto-cleanup (90 days)

**Logged Actions**:
- User CRUD operations
- Invoice payments
- Voucher generations
- Setting changes
- Login/logout
- Permission changes
- Broadcast notifications

**Activity Categories**:
- `USER_MANAGEMENT`
- `FINANCIAL`
- `SYSTEM`
- `SECURITY`
- `NOTIFICATION`

**Usage**:
```typescript
await logActivity({
  action: 'CREATE_USER',
  category: 'USER_MANAGEMENT',
  userId: 'admin-123',
  entityType: 'pppoe_user',
  entityId: 'user-456',
  details: { username: 'john@example', profile: '10Mbps' },
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});
```

### 2. Session Monitoring

**Real-Time Sessions**:
- Active PPPoE sessions
- Active hotspot sessions
- Session duration
- Download/upload statistics
- IP address assignments
- NAS identification

**Session Actions**:
- Manual disconnect (CoA)
- Speed limit change
- Session extension
- Force logout

### 3. Dashboard Analytics

**Metrics**:
- Total customers (active/inactive)
- Revenue this month
- Outstanding invoices
- Active sessions
- Voucher sales
- Agent performance
- Payment success rate

**Charts**:
- Revenue trend (last 12 months)
- Customer growth
- Payment method distribution
- Top selling profiles
- Agent sales ranking

---

## 🔧 GenieACS Integration

**Reference**: [GENIEACS-GUIDE.md](GENIEACS-GUIDE.md)

### Overview
GenieACS = Auto Configuration Server (ACS) untuk TR-069 devices (ONT/ONU)

### Supported Devices
- Huawei ONTs (HG8145, HG8245, HG8310)
- ZTE ONUs (F660, F670L)
- Fiberhome ONTs (AN5506)
- Generic TR-069 devices

### Features

#### 1. Auto-Discovery
- CPE auto-register ketika connect ke ACS
- Device information extraction
- Serial number tracking
- MAC address logging

#### 2. Remote Configuration
- WiFi SSID/Password configuration
- Port forwarding setup
- Firewall rules
- VLAN configuration
- TR-069 parameters

#### 3. Firmware Management
- Upload firmware files
- Schedule firmware upgrades
- Rollback support
- Version tracking

#### 4. Monitoring
- Device status (online/offline)
- Signal strength (PON)
- Error logs
- Performance metrics

### Parameter Display Configuration
**26 Pre-configured Parameters**:
- Device info (model, serial, software version)
- WAN connection (IP, gateway, DNS)
- LAN settings (DHCP, IP range)
- WiFi settings (SSID, security, channel)
- PON info (OLT ID, signal strength)
- VoIP status (if supported)

**Database Schema**:
```sql
genieacs_parameter_display:
  - parameterPath: TR-069 path
  - displayName: Human-readable name
  - displayOrder: Sort order
  - isVisible: Show/hide
  - category: Grouping
```

### Provisioning Scripts

**Pre-defined Scripts**:
1. Initial setup (first boot)
2. WiFi configuration
3. Port forwarding
4. Firmware upgrade
5. Factory reset

**Custom Scripts**: JavaScript-based CPE scripting

---

## 🔐 Security & Permissions

### 1. Role-Based Access Control (RBAC)

**Permission System** (53 permissions):

**User Management**:
- `view_users`, `create_user`, `edit_user`, `delete_user`
- `view_registrations`, `approve_registration`
- `import_users`, `export_users`

**Financial**:
- `view_invoices`, `create_invoice`, `edit_invoice`, `delete_invoice`
- `approve_payment`, `reject_payment`
- `view_transactions`, `create_transaction`

**Vouchers**:
- `view_vouchers`, `generate_vouchers`, `delete_vouchers`
- `print_vouchers`, `export_vouchers`

**Agents**:
- `view_agents`, `create_agent`, `edit_agent`
- `manage_agent_balance`, `view_agent_sales`

**Settings**:
- `view_settings`, `edit_settings`
- `manage_nas`, `manage_profiles`
- `manage_templates`, `manage_notifications`

**Reports**:
- `view_reports`, `export_reports`
- `view_activity_logs`, `view_sessions`

**System**:
- `manage_users`, `manage_roles`
- `manage_cron_jobs`, `view_system_health`

### 2. Role Templates (6 Roles)

#### Super Admin
- All 53 permissions
- Full system access
- Cannot be deleted

#### Admin
- All except `manage_roles` & `delete_user`
- Standard admin tasks

#### Finance
- Invoice & payment management
- Transaction reports
- No user management

#### Support
- View-only access
- Help customers
- Generate vouchers

#### Agent
- Limited to own data
- Generate vouchers (from balance)
- View own sales

#### Viewer
- Read-only access
- No create/edit/delete
- Basic reports

### 3. Authentication

**Session Management**:
- JWT-based authentication
- Refresh token support
- Session timeout (configurable)
- Multi-device login (optional)

**Password Security**:
- Bcrypt hashing (12 rounds)
- Minimum length: 8 characters
- Complexity requirements (optional)
- Password reset via email

**2FA Support** (Planned):
- TOTP (Google Authenticator)
- SMS verification
- Email OTP

---

## 🚀 Deployment & Infrastructure

**Reference**: [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md), [VPS_OPTIMIZATION_GUIDE.md](VPS_OPTIMIZATION_GUIDE.md)

### 1. Server Requirements

**Minimum Specs**:
- OS: Ubuntu 20.04/22.04 LTS
- RAM: 2GB (4GB recommended)
- Storage: 20GB SSD
- CPU: 2 vCPU
- Network: 100 Mbps

**Recommended Specs** (500+ users):
- RAM: 8GB
- Storage: 50GB SSD
- CPU: 4 vCPU
- Network: 1 Gbps

### 2. Installation Methods

#### A. Quick Deploy (vps-install.sh)
```bash
# Upload project
scp -r salfanet-radius root@VPS_IP:/root/

# Run installer
chmod +x vps-install.sh
./vps-install.sh
```

**Auto-installs**:
- Node.js 20.x
- MySQL 8.0
- FreeRADIUS 3.0.26
- Nginx
- PM2
- SSL certificate (Let's Encrypt)

#### B. Manual Installation
Step-by-step documented in [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)

#### C. Update Existing (vps-update.sh)
```bash
chmod +x vps-update.sh
./vps-update.sh

# Select mode:
# 1 = FULL (backup, npm install, migrations, build)
# 2 = QUICK (skip backups)
# 3 = HOTFIX (code only, fastest)
```

### 3. VPS Optimization

**Build Optimization**:
- Automatic heap size detection
- Swap creation for low-memory VPS
- Turbopack for faster builds
- Memory-efficient settings

**Memory Tiers**:
```bash
< 800 MB   → Create 2GB swap + 1024MB heap
800MB-1.5GB → 1536MB heap (Low-Mem mode)
1.5GB-3GB  → 4096MB heap (Standard)
> 3GB      → 8192MB heap (High-Mem)
```

**PM2 Configuration**:
```javascript
{
  name: 'salfanet-radius',
  script: 'npm',
  args: 'start',
  instances: 1,
  exec_mode: 'fork',
  max_memory_restart: '1G',
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  }
}
```

### 4. SSL/HTTPS Setup

**Let's Encrypt** (Free):
```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d yourdomain.com

# Auto-renewal
certbot renew --dry-run
```

**Nginx Config**:
- HTTP → HTTPS redirect
- Reverse proxy to Next.js (port 3000)
- Static file serving
- Gzip compression
- Security headers

### 5. Backup Strategy

**Automated Backups**:
- Database dump daily (via cron)
- .env file backup
- FreeRADIUS config backup
- Upload folder backup

**Backup Location**: `/var/www/backups/`

**Retention**: 7 daily + 4 weekly + 3 monthly

### 6. VPN Setup for Remote Routers
**Reference**: [VPN_CLIENT_SETUP_GUIDE.md](VPN_CLIENT_SETUP_GUIDE.md)

**Scenario**: MikroTik di lokasi remote → VPN ke VPS → RADIUS authentication

**Steps**:
1. Setup L2TP/IPSec server di MikroTik central
2. Create VPN client di VPS
3. Establish tunnel
4. Add router via VPN IP
5. Test RADIUS auth

**Benefits**:
- Single public IP for all routers
- Secure tunnel
- Centralized management
- No port forwarding needed

---

## 🎨 Advanced Features

### 1. Isolation System

**Features**:
- Auto-isolate expired users
- Limited bandwidth (configurable)
- Custom landing page redirect
- WhatsApp/Email notification
- Payment link on landing page
- QR code for payment

**Isolation Templates** (3 types):
1. **WhatsApp**: Notif bahwa akun di-isolir + payment link
2. **Email**: HTML email dengan detail + CTA
3. **HTML Landing Page**: Redirect page dengan payment info

**Variables**:
- `{{customerName}}`, `{{username}}`, `{{expiredDate}}`
- `{{rateLimit}}`, `{{paymentLink}}`, `{{qrCode}}`
- `{{companyName}}`, `{{companyPhone}}`, `{{companyEmail}}`

**Configuration**:
```typescript
isolationEnabled: true
isolationIpPool: "192.168.200.0/24"
isolationRateLimit: "64k/64k"
isolationAllowDns: true
isolationAllowPayment: true
isolationNotifyWhatsapp: true
```

### 2. Multi-Tenancy Support (Planned)

**Features**:
- Multiple companies/ISPs
- Isolated databases per tenant
- Custom branding per tenant
- White-label support
- Tenant admin panel

### 3. API Integration

**Public API Endpoints**:
- `/api/radius/*` - RADIUS integration
- `/api/webhook/*` - Payment gateway webhooks
- `/api/public/check-voucher` - Voucher validation
- `/api/public/check-user` - User status check

**Authentication**: API Key or JWT token

### 4. Custom Reports

**Report Builder**:
- Drag-and-drop fields
- Custom filters
- Date range selection
- Export formats (PDF, Excel, CSV)
- Scheduled reports (email delivery)

**Pre-built Reports**:
- Revenue by period
- Customer acquisition
- Churn rate
- Agent performance
- Payment method distribution
- Top selling products
- Outstanding balances

### 5. Timezone Handling

**Architecture**:
- **Database**: All datetime in UTC
- **FreeRADIUS**: WIB (UTC+7) for session tracking
- **API**: Auto-convert UTC ↔ WIB
- **Frontend**: Display in WIB

**Helper Functions**:
```typescript
toWIB(utcDate)      // UTC → WIB
toUTC(wibDate)      // WIB → UTC
nowWIB()            // Current time in WIB
formatWIB(date)     // Format for display
```

**Benefits**:
- Consistent timezone across system
- No timezone confusion
- Accurate session tracking
- Correct invoice dates

---

## 📚 Documentation References

### Getting Started
- [README.md](../README.md) - Project overview & quick start
- [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) - Installation guide
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing procedures

### Core Systems
- [FREERADIUS-SETUP.md](FREERADIUS-SETUP.md) - RADIUS server setup
- [CRON-SYSTEM.md](CRON-SYSTEM.md) - Automation & scheduled jobs
- [ACTIVITY_LOG_IMPLEMENTATION.md](ACTIVITY_LOG_IMPLEMENTATION.md) - Logging system

### Features
- [PREPAID_POSTPAID_IMPLEMENTATION.md](PREPAID_POSTPAID_IMPLEMENTATION.md) - Billing types
- [AGENT_DEPOSIT_SYSTEM.md](AGENT_DEPOSIT_SYSTEM.md) - Agent/reseller system
- [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md) - Payment approval
- [BROADCAST_NOTIFICATION_SYSTEM.md](BROADCAST_NOTIFICATION_SYSTEM.md) - Mass notifications
- [OUTAGE_NOTIFICATION_SYSTEM.md](OUTAGE_NOTIFICATION_SYSTEM.md) - Downtime alerts
- [GENIEACS-GUIDE.md](GENIEACS-GUIDE.md) - TR-069 device management

### Technical
- [MULTIPLE_NAS_SAME_IP.md](MULTIPLE_NAS_SAME_IP.md) - VPN router support
- [IMPORT_PPPOE_USERS.md](IMPORT_PPPOE_USERS.md) - MikroTik sync
- [GPS_LOCATION_FEATURE.md](GPS_LOCATION_FEATURE.md) - Location tracking
- [INVOICE_NUMBER_FORMAT.md](INVOICE_NUMBER_FORMAT.md) - Invoice numbering
- [VPN_CLIENT_SETUP_GUIDE.md](VPN_CLIENT_SETUP_GUIDE.md) - VPN configuration
- [VPS_OPTIMIZATION_GUIDE.md](VPS_OPTIMIZATION_GUIDE.md) - Performance tuning

### Troubleshooting
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues & solutions

### Session Notes
- [SESSION_2025-12-23_BUG_FIXES.md](SESSION_2025-12-23_BUG_FIXES.md) - Recent bug fixes
- [SESSION_2025-12-23_THEME_AND_API_FIXES.md](SESSION_2025-12-23_THEME_AND_API_FIXES.md) - UI/API improvements
- [CHAT_HISTORY_2025-12-23.md](../CHAT_HISTORY_2025-12-23.md) - Development session log

---

## 🔄 Version History

### v2.7.5 (December 23, 2025) - Current
- ✅ Manual extension templates (WhatsApp + Email)
- ✅ Complete database seeding (22 templates)
- ✅ UTF-8 BOM fixes
- ✅ Windows build support (cross-env)
- ✅ Cleanup duplicate seed files
- ✅ Documentation updates

### v2.7.4 (December 2025)
- ✅ Hotspot sync improvements
- ✅ Isolation templates
- ✅ Activity log system
- ✅ Cron job execution tracking

### v2.7.3 (November 2025)
- ✅ VPS build optimization
- ✅ Memory-aware heap sizing
- ✅ Automatic swap creation

### v2.7.0 (October 2025)
- ✅ Manual payment system
- ✅ Prepaid/Postpaid implementation
- ✅ Broadcast notifications
- ✅ Outage notifications

### Earlier Versions
- v2.6.x - Agent deposit system
- v2.5.x - GenieACS integration
- v2.4.x - Multiple NAS same IP
- v2.3.x - GPS location tracking
- v2.2.x - Payment gateway integration
- v2.1.x - Email notification system
- v2.0.x - WhatsApp integration

---

## 🎯 Roadmap (Planned Features)

### Q1 2026
- [ ] Multi-tenancy support
- [ ] Mobile app (Flutter)
- [ ] Advanced analytics dashboard
- [ ] 2FA authentication

### Q2 2026
- [ ] API rate limiting
- [ ] Custom report builder
- [ ] Ticket/support system
- [ ] Live chat integration

### Q3 2026
- [ ] Inventory management
- [ ] HR & payroll module
- [ ] CRM features
- [ ] Marketing automation

### Q4 2026
- [ ] AI-powered insights
- [ ] Predictive analytics
- [ ] Auto-scaling support
- [ ] Microservices architecture

---

## 📞 Support & Contact

**Documentation**: `/docs` folder (20+ guides)  
**Issues**: GitHub Issues (jika open source)  
**Email**: support@yourdomain.com  
**WhatsApp**: +62 xxx-xxxx-xxxx

---

## 📝 License

Proprietary - All Rights Reserved  
Copyright © 2025 SALFANET RADIUS

---

**Generated**: December 23, 2025  
**Total Features**: 100+  
**Total Templates**: 22  
**Supported Users**: Unlimited  
**Documentation Pages**: 20+

**🎉 Complete Billing & RADIUS Management Solution untuk ISP/RTRW.NET Indonesia**
