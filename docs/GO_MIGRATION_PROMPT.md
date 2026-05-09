# PROMPT MIGRASI LENGKAP — Salfanet RADIUS → Go Backend

> Salin seluruh isi file ini ke chat AI baru untuk memulai migrasi.

---

# Project: Full Backend Rewrite Salfanet RADIUS ke Go

## Identitas Project

- **Nama project lama**: `salfanet-radius`
- **Repo lama**: `https://github.com/s4lfanet/salfanet-radius`
- **Repo baru (Go)**: `https://github.com/s4lfanet/salfanet-radius-go`
- **VPS**: Ubuntu, IP `103.151.140.110`, app di `/var/www/salfanet-radius`
- **Database**: MySQL (shared, schema tidak berubah)

## Stack Lama (yang akan diganti)

| Komponen | Stack Lama |
|---|---|
| Backend API | Next.js 15 API Routes (TypeScript) |
| ORM | Prisma + MySQL |
| Poller OLT | `cron-service.js` (Node.js) |
| WhatsApp | `wa-service.js` (Node.js + Baileys) — **TETAP Node.js** |
| Frontend | Next.js 15 + React + Tailwind + shadcn/ui — **TETAP** |
| Auth | NextAuth.js |
| Process manager | PM2 |

## Stack Baru (Go)

| Kebutuhan | Library |
|---|---|
| HTTP Framework | **Fiber v3** |
| ORM | **GORM** + `gorm.io/driver/mysql` |
| SNMP | **gosnmp** (`github.com/gosnmp/gosnmp`) |
| Telnet | custom (`net.Dial("tcp", ...)`) |
| SSH | `golang.org/x/crypto/ssh` |
| WebSocket | **gorilla/websocket** |
| Auth | **golang-jwt/jwt v5** + bcrypt |
| Cron/Scheduler | **robfig/cron v3** |
| Config | **godotenv** (baca file `.env` yang sama) |
| Excel | **excelize v2** |
| PDF Invoice | **go-pdf/fpdf** atau **pdfcpu** |
| DB Migration | **goose** (SQL-based, kompatibel schema Prisma) |
| Logging | **zerolog** |
| Validation | **go-playground/validator v10** |
| HTTP Client | stdlib `net/http` |

## Prinsip Arsitektur

1. **Frontend tetap Next.js** — hanya ganti base URL API dari Next.js internal ke Go server (port 8080)
2. **DB MySQL shared** — Go dan Next.js pakai DB yang sama selama transisi
3. **WhatsApp tetap Node.js** — Go memanggil wa-service via HTTP internal
4. **Go binary tunggal** — satu binary menjalankan API server + cron scheduler + WebSocket hub
5. **Graceful shutdown** — handle SIGTERM/SIGINT dengan benar
6. **Zero downtime deploy** — build → swap binary → restart

## Struktur Repo Lengkap

```
salfanet-radius-go/
├── cmd/
│   └── server/
│       └── main.go              ← Entry point tunggal (API + cron + WS)
├── internal/
│   ├── config/
│   │   └── config.go            ← Load .env, struct Config
│   ├── db/
│   │   ├── db.go                ← GORM init, connection pool
│   │   └── models/              ← GORM models (mirror Prisma schema)
│   │       ├── user.go
│   │       ├── customer.go
│   │       ├── billing.go
│   │       ├── olt.go
│   │       ├── radius.go
│   │       ├── hotspot.go
│   │       └── ...
│   ├── api/
│   │   ├── router.go            ← Fiber router, middleware setup
│   │   ├── middleware/
│   │   │   ├── auth.go          ← JWT middleware
│   │   │   └── cors.go
│   │   └── handlers/
│   │       ├── auth.go          ← Login, logout, refresh token
│   │       ├── admin.go         ← Admin dashboard stats
│   │       ├── customer.go      ← Customer CRUD
│   │       ├── pppoe.go         ← PPPoE user management
│   │       ├── billing.go       ← Invoice, payment
│   │       ├── hotspot.go       ← Voucher, hotspot profile
│   │       ├── olt.go           ← OLT monitoring endpoints
│   │       ├── radius.go        ← FreeRADIUS query/update
│   │       ├── network.go       ← Network map (OLT, ODP, ODC)
│   │       ├── whatsapp.go      ← Proxy ke wa-service
│   │       ├── agent.go         ← Agent management
│   │       ├── company.go       ← Company settings
│   │       └── cron.go          ← Cron history, manual trigger
│   ├── olt/
│   │   ├── snmp.go              ← SNMP walk/get helpers (gosnmp wrapper)
│   │   ├── telnet.go            ← Telnet session pool, auto-reconnect
│   │   ├── poller.go            ← Goroutine per OLT, poll loop
│   │   └── vendors/
│   │       ├── zte.go           ← ZTE C320 V2.1 parser
│   │       ├── huawei.go        ← Huawei MA5608T (stub)
│   │       └── fiberhome.go     ← FiberHome AN5516 (stub)
│   ├── radius/
│   │   └── radius.go            ← Direct MySQL query ke radcheck/radreply/radusergroup
│   ├── mikrotik/
│   │   └── api.go               ← MikroTik RouterOS API (go-routeros)
│   ├── cron/
│   │   └── scheduler.go         ← robfig/cron jobs: invoice, isolasi, reminder
│   ├── ws/
│   │   └── hub.go               ← WebSocket hub, broadcast ONU status
│   └── notify/
│       └── whatsapp.go          ← HTTP client ke wa-service.js
├── migrations/                  ← goose SQL (skip jika pakai schema Prisma yang ada)
├── .env.example
├── go.mod
├── go.sum
├── Makefile
├── Dockerfile
└── docker-compose.yml
```

---

## Database Schema (GORM Models — mirror Prisma)

Berikut tabel utama yang harus diimplementasikan sebagai GORM model. **Nama tabel** sesuai `@@map()` di Prisma:

### Tabel Utama

| Prisma Model | Tabel MySQL | Keterangan |
|---|---|---|
| `users` | `users` | Admin system (role: ADMIN/AGENT/USER) |
| `pppoeCustomer` | `pppoe_customers` | Data pelanggan (nama, telepon, dll) |
| `pppoeUser` | `pppoe_users` | Akun PPPoE (username, password, profil) |
| `pppoeProfile` | `pppoe_profiles` | Paket internet (harga, speed, validitas) |
| `pppoeArea` | `pppoe_areas` | Area/wilayah layanan |
| `invoice` | `invoices` | Tagihan bulanan/instalasi/addon |
| `payment` | `payments` | Pembayaran invoice |
| `manualPayment` | `manual_payments` | Pembayaran manual oleh admin |
| `registrationRequest` | `registration_requests` | Permintaan pendaftaran pelanggan baru |
| `router` | `nas` | Router MikroTik (NAS untuk RADIUS) |
| `networkOLT` | `network_olts` | Data OLT (ZTE, Huawei, FiberHome) |
| `oltOnuStatus` | `olt_onu_statuses` | Status ONU realtime |
| `oltAlert` | `olt_alerts` | Alert OLT (ONU offline, dll) |
| `hotspotProfile` | `hotspot_profiles` | Profil voucher hotspot |
| `hotspotVoucher` | `hotspot_vouchers` | Voucher hotspot individual |
| `agent` | `agents` | Data agen reseller |
| `agentSale` | `agent_sales` | Penjualan voucher oleh agen |
| `agentDeposit` | `agent_deposits` | Deposit saldo agen |
| `company` | `companies` | Konfigurasi perusahaan |
| `paymentGateway` | `payment_gateways` | Konfigurasi Midtrans/Xendit/Duitku/Tripay |
| `whatsapp_providers` | `whatsapp_providers` | Konfigurasi provider WA |
| `whatsapp_templates` | `whatsapp_templates` | Template pesan WA |
| `radcheck` | `radcheck` | FreeRADIUS check attributes |
| `radreply` | `radreply` | FreeRADIUS reply attributes |
| `radusergroup` | `radusergroup` | FreeRADIUS user-group mapping |
| `radacct` | `radacct` | FreeRADIUS accounting sessions |
| `cronHistory` | `cron_history` | Log eksekusi cron job |
| `ticket` | `tickets` | Tiket bantuan pelanggan |
| `transaction` | `transactions` | Laporan keuangan |
| `networkODC` | `network_odcs` | ODC di network map |
| `networkODP` | `network_odps` | ODP di network map |
| `network_otbs` | `network_otbs` | OTB di network map |
| `customerSession` | `customer_sessions` | Session login pelanggan (OTP) |
| `pushSubscription` | `push_subscriptions` | Web Push subscription pelanggan |
| `suspendRequest` | `suspend_requests` | Request suspend layanan |

### Enum Penting

```go
type UsersRole string
const (
    RoleAdmin UsersRole = "ADMIN"
    RoleAgent UsersRole = "AGENT"
    RoleUser  UsersRole = "USER"
)

type InvoiceStatus string
const (
    InvoicePending   InvoiceStatus = "PENDING"
    InvoicePaid      InvoiceStatus = "PAID"
    InvoiceOverdue   InvoiceStatus = "OVERDUE"
    InvoiceCancelled InvoiceStatus = "CANCELLED"
)

type InvoiceType string
const (
    InvoiceMonthly      InvoiceType = "MONTHLY"
    InvoiceInstallation InvoiceType = "INSTALLATION"
    InvoiceAddon        InvoiceType = "ADDON"
    InvoiceTopup        InvoiceType = "TOPUP"
    InvoiceRenewal      InvoiceType = "RENEWAL"
)

type OltOnuStatus string
const (
    OnuOnline       OltOnuStatus = "online"
    OnuOffline      OltOnuStatus = "offline"
    OnuAuthFailed   OltOnuStatus = "auth_failed"
    OnuLOS          OltOnuStatus = "los"
    OnuDyingGasp    OltOnuStatus = "dying_gasp"
    OnuUnregistered OltOnuStatus = "unregistered"
)

type SubscriptionType string
const (
    Postpaid SubscriptionType = "POSTPAID"
    Prepaid  SubscriptionType = "PREPAID"
)

type ConnectionType string
const (
    ConnPPPoE    ConnectionType = "PPPOE"
    ConnHotspot  ConnectionType = "HOTSPOT"
    ConnStaticIP ConnectionType = "STATIC_IP"
)
```

---

## API Endpoints Lengkap (semua harus diimplementasikan)

### Auth
```
POST /api/auth/login              ← username/password → JWT
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/session            ← cek session aktif
POST /api/auth/customer/login     ← customer login via OTP WhatsApp
POST /api/auth/customer/verify-otp
POST /api/auth/agent/login
```

### Dashboard
```
GET  /api/admin/stats             ← total pelanggan, revenue, ONU online, dll
GET  /api/admin/revenue-chart     ← data grafik pendapatan per bulan
GET  /api/admin/activity          ← log aktivitas terbaru
```

### Customer & PPPoE
```
GET    /api/pppoe/users           ← list + filter + pagination
POST   /api/pppoe/users           ← create pelanggan baru
GET    /api/pppoe/users/:id
PUT    /api/pppoe/users/:id
DELETE /api/pppoe/users/:id
POST   /api/pppoe/users/:id/suspend
POST   /api/pppoe/users/:id/activate
POST   /api/pppoe/users/:id/isolate
POST   /api/pppoe/users/:id/unisolate
GET    /api/pppoe/users/:id/sessions ← riwayat sesi PPPoE
GET    /api/pppoe/users/:id/invoices
POST   /api/pppoe/users/:id/sync-radius ← sync ke FreeRADIUS

GET    /api/pppoe/profiles        ← daftar paket internet
POST   /api/pppoe/profiles
PUT    /api/pppoe/profiles/:id
DELETE /api/pppoe/profiles/:id
POST   /api/pppoe/profiles/:id/sync-mikrotik

GET    /api/pppoe/areas
POST   /api/pppoe/areas
PUT    /api/pppoe/areas/:id
DELETE /api/pppoe/areas/:id

GET    /api/pppoe/customers        ← pppoeCustomer (data fisik pelanggan)
POST   /api/pppoe/customers
GET    /api/pppoe/customers/:id
PUT    /api/pppoe/customers/:id

GET    /api/pppoe/registrations    ← permintaan pendaftaran baru
POST   /api/pppoe/registrations/:id/approve
POST   /api/pppoe/registrations/:id/reject
```

### Billing & Invoice
```
GET    /api/billing/invoices       ← list invoice + filter status
POST   /api/billing/invoices       ← buat invoice manual
GET    /api/billing/invoices/:id
PUT    /api/billing/invoices/:id
DELETE /api/billing/invoices/:id
POST   /api/billing/invoices/:id/pay ← record pembayaran manual
POST   /api/billing/invoices/:id/send-wa ← kirim reminder WA
GET    /api/billing/invoices/:id/pdf ← generate PDF invoice
POST   /api/billing/generate-monthly ← generate invoice bulanan semua pelanggan

GET    /api/billing/payments
POST   /api/billing/payments
GET    /api/billing/manual-payments

GET    /api/billing/transactions   ← laporan keuangan
POST   /api/billing/transactions
GET    /api/billing/transaction-categories
POST   /api/billing/transaction-categories

POST   /api/billing/payment-gateway/webhook/:provider ← Midtrans/Xendit/Duitku webhook
```

### OLT & ONU Monitoring
```
GET    /api/olt                    ← list OLT
POST   /api/olt                    ← tambah OLT baru
GET    /api/olt/:id                ← detail OLT + ONU list dari DB
PUT    /api/olt/:id
DELETE /api/olt/:id
POST   /api/olt/:id/sync           ← trigger poll manual
GET    /api/olt/:id/onus           ← list ONU status dari DB
GET    /api/olt/:id/onus/:onuId    ← detail ONU
POST   /api/olt/:id/onus/:onuId/register  ← register ONU via Telnet
DELETE /api/olt/:id/onus/:onuId    ← deregister ONU via Telnet
POST   /api/olt/:id/onus/:onuId/assign    ← assign ke pelanggan
GET    /api/olt/:id/onus/register  ← GET: metadata (ONU types, profil TCONT/traffic)
GET    /api/olt/:id/chassis        ← port map/chassis view
GET    /api/olt/:id/alerts         ← alert list
GET    /api/olt/:id/performance    ← metrik performa historis
GET    /api/olt/template/download  ← download Excel template import
POST   /api/olt/import             ← import OLT dari Excel

WS     /ws/olt/:id                 ← WebSocket realtime ONU status push
```

### FreeRADIUS
```
GET    /api/radius/users           ← query radcheck aktif
POST   /api/radius/users           ← tambah/update radcheck + radreply + radusergroup
DELETE /api/radius/users/:username
GET    /api/radius/sessions        ← query radacct online sessions
GET    /api/radius/stats           ← total session aktif
POST   /api/radius/disconnect/:username ← kirim CoA disconnect ke NAS
```

### Hotspot & Voucher
```
GET    /api/hotspot/profiles
POST   /api/hotspot/profiles
PUT    /api/hotspot/profiles/:id
DELETE /api/hotspot/profiles/:id

GET    /api/hotspot/vouchers       ← list + filter status/batch
POST   /api/hotspot/vouchers/generate ← generate batch voucher
DELETE /api/hotspot/vouchers/:id
GET    /api/hotspot/vouchers/export ← export Excel
POST   /api/hotspot/vouchers/print-template ← generate PDF print

GET    /api/hotspot/orders         ← voucher order online
POST   /api/hotspot/orders/:id/confirm-payment
```

### Agent
```
GET    /api/agents
POST   /api/agents
GET    /api/agents/:id
PUT    /api/agents/:id
DELETE /api/agents/:id
GET    /api/agents/:id/sales
GET    /api/agents/:id/deposits
POST   /api/agents/:id/topup-balance
GET    /api/agents/vouchers        ← agent portal: lihat voucher milik agent
```

### Network Map
```
GET    /api/network/olts           ← OLT untuk peta
GET    /api/network/odcs
POST   /api/network/odcs
PUT    /api/network/odcs/:id
DELETE /api/network/odcs/:id
GET    /api/network/odps
POST   /api/network/odps
PUT    /api/network/odps/:id
DELETE /api/network/odps/:id
GET    /api/network/otbs
POST   /api/network/otbs
GET    /api/network/routers
POST   /api/network/routers
```

### WhatsApp
```
GET    /api/whatsapp/providers
POST   /api/whatsapp/providers
PUT    /api/whatsapp/providers/:id
GET    /api/whatsapp/templates
PUT    /api/whatsapp/templates/:type
POST   /api/whatsapp/send          ← kirim pesan manual
GET    /api/whatsapp/history
GET    /api/whatsapp/reminder-settings
PUT    /api/whatsapp/reminder-settings
```

### Tiket & Support
```
GET    /api/tickets
POST   /api/tickets
GET    /api/tickets/:id
PUT    /api/tickets/:id
POST   /api/tickets/:id/reply
POST   /api/tickets/:id/close
```

### Company Settings
```
GET    /api/company
PUT    /api/company
POST   /api/company/logo           ← upload logo
```

### Cron & System
```
GET    /api/cron/history           ← log cron job
POST   /api/cron/trigger/:job      ← trigger manual: invoice_generate, invoice_reminder, olt_poll, radius_sync, isolate_expired
GET    /api/system/health          ← health check
GET    /api/system/version
```

### Customer Portal (untuk portal self-service pelanggan)
```
POST   /api/customer/login         ← OTP via WA
POST   /api/customer/verify-otp
GET    /api/customer/profile       ← profil pelanggan login
GET    /api/customer/invoices      ← tagihan pelanggan login
POST   /api/customer/invoices/:id/pay ← bayar via payment gateway
POST   /api/customer/push-subscribe ← subscribe Web Push
```

---

## OLT Monitoring — Detail Implementasi ZTE C320 V2.1

### SNMP OID Reference (VERIFIED dari live device)

```
Base OID: 1.3.6.1.4.1.3902.1012

# zxAnGponOnuCfgTable — indexed: .col.ponIndex.onuId
Description: .3.28.1.1.2
Serial:      .3.28.1.1.5   ← Hex-STRING 8 bytes: 4 ASCII vendor + 4 hex SN

# zxAnGponOnuRegTable — indexed: .col.ponIndex.onuSlot.onuId
RegStatus:   .3.50.12.1.1.1  ← INTEGER: 1=registered/active
OperState:   .3.50.12.1.1.6  ← INTEGER: 5=online(working), 4=online, 0=unknown, else=offline
RxPower:     .3.50.12.1.1.10 ← INTEGER raw, dBm = -(raw / 1000)
Distance:    .3.50.12.1.1.21 ← INTEGER meters

# Seen ONU table — JANGAN gunakan sebagai sumber unregistered jika Telnet tersedia
SeenTable:   1.3.6.1.4.1.3902.1012.3.27.4.1.1
# (berisi stale entries — ONU yang pernah konek tapi tidak aktif)

# PON port discovery
PonTable:    1.3.6.1.4.1.3902.1012.3.11.3.1.1

# ponIndex calculation
board1Base = 268500992  # pon1 = board1Base + 1*256 = 268501248
board2Base = 268509184
ponIncrement = 256
ponIndex(board, pon) = boardXBase + pon * ponIncrement
```

### Serial Hex Parsing

```go
// SNMP returns Hex-STRING: "5a 54 45 47 da 59 18 ac"
// Format: 4 bytes ASCII vendor + 4 bytes hex ID
// Result: "ZTEG" + "DA5918AC" = "ZTEGDA5918AC"
func HexBytesToSerial(hexStr string) string {
    // Split by space → 8 hex values
    // bytes[0..3] → ASCII chars (vendor prefix)
    // bytes[4..7] → hex string (uppercase)
}
```

### PON Discovery — Walk Concurrent

```go
// Untuk setiap PON port, walk 7 OID secara PARALLEL (goroutine):
// 1. RegStatus walk   → registered ONU IDs
// 2. OperState walk   → online/offline
// 3. Serial walk      → serial number
// 4. RxPower walk     → signal strength
// 5. Description walk → nama/deskripsi ONU
// 6. Distance walk    → jarak dari OLT
// 7. SeenTable walk   → seen ONU IDs (hanya sebagai fallback)
//
// KUNCI: semua 7 walk dijalankan parallel dengan sync.WaitGroup atau errgroup
// Jangan sequential — itu penyebab polling lambat di implementasi lama
```

### Unregistered ONU — Sumber Data

```go
// PRIORITAS (dari paling authoritative):
// 1. Global "show gpon onu uncfg" via Telnet (1 sesi, semua port)
//    → parse: "gpon-onu_1/1/1:2  ZTEGDA5918AC  unknown"
//    → format: [OnuIndex] [SN] [State] (3 kolom, SN di index 1)
// 2. Per-port "show gpon onu uncfg gpon-olt_1/1/1" via Telnet (fallback)
// 3. SNMP seen-table (HANYA jika Telnet benar-benar tidak tersedia)
//
// PENTING: Jika Telnet berhasil, ABAIKAN seen-table SNMP
// Seen-table berisi stale entries → ghost ONU "N/A" di UI
```

### ONU Registration via Telnet

```go
// ZTE Basic Template:
commands := []string{
    "configure terminal",
    fmt.Sprintf("interface gpon-olt_%d/%d/%d", frame, slot, port),
    fmt.Sprintf("onu %d type %s sn %s", onuId, onuType, serialNumber),
    "exit",
    fmt.Sprintf("interface gpon-onu_%d/%d/%d:%d", frame, slot, port, onuId),
    fmt.Sprintf("tcont 1 profile %s", tcontProfile),
    "gemport 1 tcont 1",
    fmt.Sprintf("service-port 1 vport 1 user-vlan %d vlan %d", vlan, vlan),
    "exit",
    "end",
}

// Error detection setelah eksekusi (PENTING):
// - Match baris yang DIMULAI dengan "%" → CLI error (contoh: "% Invalid input")
// - Match "invalid input", "invalid command", "already exist"
// - JANGAN match "failure" → OLT MOTD berisi "0 authentication failures happened"
// - JANGAN match "error" tanpa prefix "%" → bisa muncul di teks normal
```

### Telnet Session Pool

```go
// MASALAH di implementasi lama: buka sesi Telnet baru untuk setiap request
// SOLUSI: persistent session pool per OLT
//
// Pool behavior:
// - Minimal 1 sesi per OLT selalu aktif (keepalive dengan enter tiap 30s)
// - Max 3 sesi concurrent per OLT
// - Auto-reconnect jika sesi putus
// - Queue request jika semua sesi busy
// - Timeout per command: 10 detik
// - Login sequence: username → password → ZXAN# prompt
```

---

## Cron Jobs (ganti cron-service.js)

```go
// 1. OLT Poller — interval per OLT (default 60s, configurable)
//    → SNMP walk semua PON port (parallel)
//    → Update oltOnuStatus di DB
//    → Broadcast ke WebSocket clients
//    → Generate alert jika ONU offline/LOS

// 2. Invoice Generator — daily 00:01 WIB
//    → Cek pelanggan yang invoiceGenerateDays hari lagi expired
//    → Generate invoice MONTHLY otomatis
//    → Kirim notifikasi WA (via wa-service)

// 3. Invoice Reminder — daily per jam (cek reminderDays setting)
//    → Kirim WA reminder ke pelanggan yang belum bayar
//    → Respektasi batchSize dan batchDelay

// 4. Auto Isolasi — daily 00:05 WIB
//    → Cek pelanggan POSTPAID yang sudah expired + grace period habis
//    → Set status = "isolated" di pppoe_users
//    → Update radcheck di FreeRADIUS (ganti password → invalid)
//    → Kirim notifikasi WA

// 5. Voucher Sync — setiap 5 menit
//    → Cek voucher ACTIVE yang sudah expired
//    → Update status ke EXPIRED

// 6. RADIUS Sync — setiap 15 menit
//    → Cek sesi radacct yang masih "online" tapi sudah lama tidak update
//    → Update sessions DB

// 7. Referral Reward — daily 01:00 WIB
//    → Proses reward referral yang eligible
```

---

## WhatsApp Integration

```go
// wa-service.js tetap jalan sebagai sidecar (Node.js + Baileys)
// Go memanggil wa-service via HTTP internal:

// Endpoint wa-service (internal):
// POST http://localhost:3001/send
// Body: {"phone": "628xxx", "message": "text"}

// Template WA yang ada:
// - invoice_reminder    ← tagihan H-7, H-5, H-3, H-0
// - payment_success     ← konfirmasi pembayaran
// - isolation_notice    ← notif isolasi
// - activation_notice   ← notif aktivasi
// - otp_login          ← kode OTP login pelanggan
// - registration_approved/rejected

// Variabel template contoh:
// {{name}}, {{invoice_number}}, {{amount}}, {{due_date}}, {{payment_link}}
```

---

## Auth & Session

```go
// Admin auth:
// - JWT HS256, secret dari .env JWT_SECRET
// - Access token: 24 jam
// - Refresh token: 30 hari
// - Store refresh token di memory atau Redis (simple: DB table)
// - Role: ADMIN (full access), AGENT (akses terbatas)

// Customer auth:
// - OTP 6 digit via WhatsApp
// - OTP expires: 5 menit (configurable)
// - Session token: 7 hari
// - Store di customer_sessions table

// Agent auth:
// - Phone + PIN (simple)
// - Session: JWT 24 jam
```

---

## Payment Gateway Integration

```go
// Provider yang harus diimplementasikan:
// 1. Midtrans (snap.js + Core API)
//    - Endpoint create transaction: POST ke Midtrans API
//    - Webhook: POST /api/billing/payment-gateway/webhook/midtrans
//    - Verifikasi signature: SHA512(order_id + status_code + gross_amount + server_key)

// 2. Xendit
//    - Invoice API
//    - Webhook: POST /api/billing/payment-gateway/webhook/xendit
//    - Verifikasi: header x-callback-token

// 3. Duitku
//    - Payment request API
//    - Webhook: POST /api/billing/payment-gateway/webhook/duitku

// 4. Tripay
//    - Closed payment API
//    - Webhook: POST /api/billing/payment-gateway/webhook/tripay
```

---

## FreeRADIUS Integration

```go
// Go langsung query MySQL FreeRADIUS tables (bukan via radius protocol)
// Database sama dengan app DB

// Isolasi pelanggan:
// UPDATE radcheck SET value = 'WRONG_PASSWORD_ISOLATED' 
// WHERE username = ? AND attribute = 'Cleartext-Password'

// Aktivasi pelanggan:
// UPDATE radcheck SET value = <real_password>
// WHERE username = ? AND attribute = 'Cleartext-Password'

// Ganti profil/rate-limit:
// UPDATE radreply SET value = <rate_limit>
// WHERE username = ? AND attribute = 'Mikrotik-Rate-Limit'
// UPDATE radusergroup SET groupname = <new_group>
// WHERE username = ?
```

---

## Environment Variables (.env)

```env
# Database
DATABASE_URL=mysql://user:pass@localhost:3306/salfanet_radius

# Server
PORT=8080
JWT_SECRET=your_jwt_secret_here
CORS_ORIGINS=http://localhost:3000,https://radius.hotspotapp.net

# WhatsApp service internal
WA_SERVICE_URL=http://localhost:3001

# Payment gateways (dari DB company settings, tapi bisa override di .env)
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
XENDIT_API_KEY=
DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
TRIPAY_API_KEY=
TRIPAY_PRIVATE_KEY=
TRIPAY_MERCHANT_CODE=

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=

# App
APP_BASE_URL=https://radius.hotspotapp.net
APP_TIMEZONE=Asia/Jakarta
```

---

## Makefile

```makefile
.PHONY: build run dev test

build:
	go build -o bin/server ./cmd/server

run:
	./bin/server

dev:
	air -c .air.toml   # hot reload dengan air

test:
	go test ./...

migrate-up:
	goose -dir migrations mysql "$(DATABASE_URL)" up

migrate-down:
	goose -dir migrations mysql "$(DATABASE_URL)" down

lint:
	golangci-lint run
```

---

## Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
    env_file: .env
    depends_on:
      - db
    restart: unless-stopped

  wa-service:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./wa-service:/app
    command: node wa-service.js
    ports:
      - "3001:3001"
    restart: unless-stopped

  # db: pakai MySQL existing di VPS, tidak di Docker
```

---

## Instruksi untuk AI

**Mulai dari Phase 1 — OLT Monitoring dulu** karena ini prioritas tertinggi.

### Urutan implementasi yang direkomendasikan:

**Step 1**: Setup repo
- `go.mod` dengan semua dependencies
- `Makefile`
- `.env.example`
- Folder structure lengkap

**Step 2**: `internal/config/config.go`
- Load semua env vars
- Struct Config dengan validasi

**Step 3**: `internal/db/db.go` + `internal/db/models/`
- GORM init dengan connection pool
- Semua model penting (minimal: networkOLT, oltOnuStatus, pppoeUser, users)

**Step 4**: `internal/olt/snmp.go`
- Wrapper gosnmp untuk `Walk(config, oid)` dan `Get(config, oid)`
- Return typed result, bukan raw interface{}
- Timeout dan retry handling

**Step 5**: `internal/olt/telnet.go`
- Struct `SessionPool` dengan mutex
- `Connect()`, `Execute(command)`, `ExecuteMultiple(commands)`
- Keepalive goroutine
- Auto-reconnect dengan backoff

**Step 6**: `internal/olt/vendors/zte.go`
- `DiscoverONUsSNMP(ctx, snmpConfig, telnetConfig)` → concurrent walk 7 OID per PON
- `ParseSerial(hexStr)` → convert hex bytes ke ASCII serial
- `ParseUncfgOutput(output)` → parse `show gpon onu uncfg`
- `RegisterONU(ctx, telnetConfig, params)` → send commands + error detection yang benar
- `GetONUTypes(ctx, telnetConfig)` → `show onu-type` (BUKAN `show gpon onu-type`)

**Step 7**: `internal/olt/poller.go`
- `Poller` struct dengan map `oltId → cancel func`
- `Start(oltId)` / `Stop(oltId)` / `Poll(ctx, olt)`
- Tulis hasil ke DB dengan upsert

**Step 8**: `internal/ws/hub.go`
- `Hub` dengan map `oltId → []WebSocket connections`
- `Register(conn, oltId)`, `Unregister(conn)`, `Broadcast(oltId, data)`

**Step 9**: `internal/api/handlers/olt.go`
- Semua OLT endpoint
- WebSocket upgrade handler

**Step 10**: `cmd/server/main.go`
- Init semua komponen
- Start Fiber server
- Start cron scheduler
- Graceful shutdown

**Setelah Phase 1 selesai dan terbukti bekerja**, lanjut Phase 2 (Auth + Customer), Phase 3 (Billing), dst.

---

## Bug yang Harus DIHINDARI (ditemukan di implementasi TypeScript lama)

1. **Ghost ONU N/A**: SNMP seen-table berisi stale entries. Jika Telnet tersedia, jangan tambahkan ID dari seen-table. Telnet adalah sumber otoritatif.

2. **Format output `show gpon onu uncfg`**: 3 kolom (`OnuIndex SN State`), SN ada di index 1 (bukan 2). Jangan bingung dengan format per-port yang punya kolom `OnuType` tambahan.

3. **Error detection setelah register**: MOTD login OLT berisi teks "0 authentication failures happened". Jangan match kata "failure" atau "error" secara bebas. Hanya match baris yang DIMULAI dengan `%`.

4. **Telnet sesi baru per request**: Jangan buka/tutup sesi Telnet untuk setiap request. Gunakan session pool — sesi persistent dengan keepalive.

5. **SNMP walk sequential**: Jangan walk OID satu per satu untuk setiap ONU. Walk per-PON-port dengan 7 OID parallel, lalu build lookup map.

6. **Fallback ke 2×8 ports**: Jika SNMP PON table walk gagal, fallback ke 16 port (2 board × 8 port) menyebabkan 15 SNMP walk sia-sia. Gunakan data DB sebagai fallback (port yang pernah punya ONU).

7. **`show gpon onu-type`** adalah perintah yang SALAH untuk ZTE C320 V2.1. Perintah yang benar adalah **`show onu-type`**.
```
