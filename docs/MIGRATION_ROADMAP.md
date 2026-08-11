# Salfanet Radius — Migration Roadmap

> **Status**: Phase 1 ✅ | Phase 2 ✅ | Phase 3 🔄 In Progress (Batch 1-5 ✅)
> **Last updated**: 2026-08-12
> **Target**: Frontend (Next.js) + Backend (NestJS) + API contract — independently buildable & deployable

---

## Overview

Salfanet Radius adalah sistem manajemen ISP/RADIUS yang saat ini berupa monolith Next.js.
Roadmap ini mendokumentasikan migrasi bertahap menuju arsitektur terpisah:

```
salfanet-radius/ (pnpm monorepo)
├── frontend/     # Next.js — UI only, no API routes, no Prisma
├── backend/      # NestJS — API + business logic + cron
├── packages/     # Shared TypeScript types
├── api/          # OpenAPI documentation
└── deploy/       # Docker, Nginx, PM2 configs
```

### Prinsip Migrasi

1. **Setiap phase menghasilkan project yang runnable** — tidak ada "big bang" switch
2. **Next.js API routes tetap jalan** sampai diganti oleh NestJS (dual-stack via Nginx)
3. **Frontend tidak break** selama migrasi — API client switch per module
4. **Cron jobs tetap jalan** — port terakhir, runner lama tetap active
5. **Tidak ada rewrite business logic** — hanya pindah + adaptasi framework
6. **API versioning**: endpoint baru di `/api/v1/*`, endpoint lama tetap di `/api/*`

---

## Phase Status

| Phase | Nama | Status | Estimasi | Commit |
|-------|------|--------|----------|--------|
| 1 | Setup Monorepo Structure | ✅ Complete | 1 hari | `8eaab66` |
| 2 | Backend Auth Module | ✅ Complete | 3-5 hari | `92a81e5` |
| 3 | Port API Modules (399 routes) | 🔄 In Progress | 2-3 minggu | `0a98b07` (B1), `6c461b` (B2), `411bf3` (B3), `fbe4837` (B4), `253a1b5` (B5), `70b9df6` (B6), `75b48c4` (B7), `27a1fa0` (B8) |
| 4 | Port Cron Jobs (17 jobs) | ⏳ Pending | 3-5 hari | — |
| 5 | Frontend Cleanup | ⏳ Pending | 2-3 hari | — |
| 6 | Independent Build & Deploy | ⏳ Pending | 2-3 hari | — |
| 7 | Regression Test | ⏳ Pending | 3-5 hari | — |
| 8 | Cleanup & Documentation | ⏳ Pending | 2-3 hari | — |

---

## Phase 1: Setup Monorepo Structure ✅

**Status**: Complete
**Commit**: `8eaab66`
**Tanggal**: 2026-08-11

### Yang dilakukan

- [x] Install pnpm, setup `pnpm-workspace.yaml`
- [x] Move semua code existing ke `frontend/` (src, public, prisma, tests, scripts, dll)
- [x] Create `backend/` NestJS skeleton (main.ts, app.module, health module, prisma module)
- [x] Create `packages/shared-types/` dengan shared TypeScript types
- [x] Root `package.json` dengan orchestration scripts
- [x] Update `.gitignore` untuk monorepo paths
- [x] Fix `next.config.ts` turbopack.root untuk pnpm
- [x] Remove tracked temp/debug artifacts

### Verifikasi

- `pnpm install` — 3 packages install successfully
- `frontend: next dev` — Ready in 647ms
- `backend: nest build` — compiles to dist/
- `shared-types: tsc` — builds to dist/

### Struktur hasil

```
salfanet-radius/
├── frontend/              # @salfanet/frontend (Next.js, all existing code)
├── backend/               # @salfanet/backend (NestJS skeleton)
├── packages/shared-types/ # @salfanet/shared-types
├── pnpm-workspace.yaml
├── package.json           # Root orchestration
└── pnpm-lock.yaml
```

---

## Phase 2: Backend Auth Module ✅

**Status**: Complete
**Commit**: `92a81e5`
**Tanggal**: 2026-08-11
**Risiko**: TINGGI — auth harus kompatibel dengan frontend existing

### Yang dilakukan

Port sistem authentication & authorization dari Next.js ke NestJS:
- NextAuth-compatible JWT session (admin login)
- JWT strategy untuk agent & technician
- Bearer token strategy untuk customer
- Permission system (role-based + custom user permissions)
- Rate limiting

### Tasks

- [x] 2.1 Audit auth system existing (NextAuth config, permissions, JWT)
- [x] 2.2 Port Prisma schema reference ke backend
- [x] 2.3 Implement AuthModule (login, session, 2FA)
- [x] 2.4 Implement Guards (Admin, Agent, Technician, Customer, Public)
- [x] 2.5 Implement Permission system (hasPermission, requirePermission)
- [x] 2.6 Implement rate limiting (@nestjs/throttler)
- [x] 2.7 Test auth endpoints (build + bootstrap verified)
- [x] 2.8 Commit

### Auth Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/auth/login` | POST | Public | Admin login (credentials) |
| `/api/v1/auth/verify-2fa` | POST | Public | 2FA TOTP verification |
| `/api/v1/auth/me` | GET | Admin | Current user info + permissions |
| `/api/v1/auth/permissions` | GET | Admin | Current user permissions |
| `/api/v1/auth/verify` | GET | Admin | Verify token validity |
| `/api/v1/auth/logout` | POST | Admin | Logout (stateless) |

### Guards & Decorators

| Guard | Token Source | Secret | Expiry |
|-------|-------------|--------|--------|
| AdminGuard | Bearer header OR NextAuth cookie | NEXTAUTH_SECRET | 30 days |
| AgentGuard | Bearer header | AGENT_JWT_SECRET | 7 days |
| TechnicianGuard | Bearer header | JWT_SECRET | 7 days |
| CustomerGuard | Bearer header | customerSession table | per session |
| PermissionsGuard | request.user (after AdminGuard) | — | — |

Decorators: `@Public()`, `@Permissions('key')`, `@CurrentUser()`

### Auth Patterns yang harus di-port

| Pattern | Current (Next.js) | Target (NestJS) |
|---------|-------------------|-----------------|
| Admin login | NextAuth CredentialsProvider + JWT cookie | AuthController + AuthService + JWT |
| 2FA | TOTP via otpauth + adminTwoFactorPending | AuthService 2FA flow |
| Admin session | NextAuth JWT (cookie `next-auth.session-token`) | JWT verify dari cookie/header |
| Permission | `requirePermission()` function | `@Permissions()` decorator + Guard |
| Agent auth | Bearer JWT (jose, 7d expiry) | AgentGuard dengan JWT verify |
| Technician auth | Custom JWT (TECH_JWT_SECRET) | TechnicianGuard |
| Customer auth | Bearer token (customerSession table) | CustomerGuard |
| Rate limit | In-memory store per IP:path | NestJS ThrottlerGuard or custom |

### Kompatibilitas Frontend

Frontend Next.js saat ini menggunakan NextAuth client-side (`useSession`, `signIn`).
Selama Phase 2, frontend TETAP menggunakan NextAuth untuk login.
Backend NestJS menyediakan endpoint `/api/v1/auth/*` untuk verifikasi session
yang akan digunakan saat API routes mulai dipindah di Phase 3.

**Strategy dual-stack**:
- Login flow: tetap via NextAuth (frontend) → Next.js API route
- API calls: gradual switch dari `/api/*` (Next.js) ke `/api/v1/*` (NestJS)
- NestJS verify NextAuth JWT cookie untuk admin endpoints

---

## Phase 3: Port API Modules 🔄

**Status**: In Progress — Batch 1 ✅ Complete
**Estimasi**: 2-3 minggu
**Risiko**: TINGGI — 399 endpoints harus dport satu per satu

### Progress

```text
Total API routes:  399
Ported:             82   (auth 6 + health 1 + company 3 + dashboard 3 + permissions 2
                          + settings 7 + users 1 + admin-users 5 + notifications 5
                          + pppoe 11 + hotspot 8 + invoices 5 + keuangan 8
                          + payment 2 + network 16 + radius 4 + sessions 4
                          + payment-gateway 2 + mikrotik 4 + freeradius 3 + session-sync 3)
  - Batch 1:          8   ✅ (health, company, dashboard, permissions)
  - Batch 2:         14   ✅ (settings, users, admin-users, notifications)
  - Batch 3:         19   ✅ (pppoe, hotspot, invoices, keuangan)
  - Batch 4:         24   ✅ (payment, network, radius, sessions)
  - Batch 5:         12   ✅ (payment-gateway, mikrotik, freeradius, session-sync)
  - Batch 6:         46   ✅ (manual-payments, registrations, voucher-templates, customer-portal, agent-portal)
  - Batch 7:         55   ✅ (technician-portal, tickets, evoucher, inventory, upload)
  - Batch 8:         39   ✅ (whatsapp, telegram, push, backup, public)
  - Batch 9:         60   ✅ (olt, vpn, network-infra, customer/agent portal extras)
  - Batch 10+:      117   ⏳
```

### Batches

| Batch | Modules | Routes | Status | Commit |
|-------|---------|--------|--------|--------|
| 1 | health, company, dashboard, permissions | 8 | ✅ Complete | `0a98b07` |
| 2 | settings, users, admin-users, notifications | 14 | ✅ Complete | `6c461b` |
| 3 | pppoe, hotspot, invoices, keuangan | 19 | ✅ Complete | `411bf3` |
| 4 | payment, network, radius, sessions | 24 | ✅ Complete | `fbe4837` |
| 5 | payment-gateway, mikrotik, freeradius, session-sync | 12 | ✅ Complete | `253a1b5` |
| 6 | manual-payments, registrations, voucher-templates, customer-portal, agent-portal | 46 | ✅ Complete | `70b9df6` |
| 7 | technician-portal, tickets, evoucher, inventory, upload | 55 | ✅ Complete | `75b48c4` |
| 8 | whatsapp, telegram, push, backup, public | 39 | ✅ Complete | `27a1fa0` |
| 9 | OLT/ONU, VPN, network trace, cables, splices, fiber-paths, customer/agent portal extras | 60 | ✅ Complete | `431adcb` |
| 10+ | Remaining routes | ~117 | ⏳ Pending | — |

### Batch 1 Detail ✅

**Commit**: `0a98b07`

| Module | Endpoints | Source |
|--------|-----------|--------|
| Health | `GET /api/v1/health` | `frontend/.../api/health` |
| Company | `GET/POST /api/v1/company`, `GET /api/v1/company/info` | `frontend/.../api/company` |
| Dashboard | `GET /api/v1/dashboard/stats`, `analytics`, `traffic` | `frontend/.../api/dashboard/*` |
| Permissions | `GET /api/v1/permissions`, `role-templates` | `frontend/.../api/permissions` |

Supporting modules created:
- `ActivityLogModule` — logActivity + getRecentActivities
- `TimezoneUtils` — nowWIB, startOfDayWIBtoUTC (backend version)

### Batch 2 Detail ✅

**Commit**: `6c461b`

| Module | Endpoints | Source |
|--------|-----------|--------|
| Settings | `GET/POST /api/v1/settings/company`, `POST /timezone`, `GET/PUT /isolation`, `GET/PUT /map`, `GET/POST /restart-services` | `frontend/.../api/settings/*` |
| Users | `GET /api/v1/users/list` | `frontend/.../api/users/list` |
| AdminUsers | `GET/POST /api/v1/admin/users`, `GET/PUT/DELETE /:id`, `POST /:id/reset-permissions` | `frontend/.../api/admin/users` |
| Notifications | `GET/POST/DELETE /api/v1/notifications`, `POST /mark-read`, `POST /generate` | `frontend/.../api/notifications/*` |

Key behaviors preserved:
- Timezone update: modifies .env, ecosystem.config.js, MySQL timezone, system timezone (Linux)
- Isolation update: modifies radgroupreply (Mikrotik-Rate-Limit, Framed-Pool, Address-List) + VPS kernel route + iptables
- Admin user CRUD: bcrypt password hashing, phone number formatting (62 prefix), permission assignment
- Notifications: overdue invoice detection, expired user detection, pending registration detection

### Batch 3 Detail ✅

**Commit**: `411bf3`

| Module | Endpoints | Source |
|--------|-----------|--------|
| PPPoE | `GET/POST/PUT/DELETE /api/v1/pppoe/customers`, `GET/POST/PUT/DELETE /profiles`, `GET/POST/PUT/DELETE /areas` | `frontend/.../api/pppoe/{customers,profiles,areas}` |
| Hotspot | `GET/POST/PUT/DELETE /api/v1/hotspot/profiles`, `GET/POST/DELETE/PATCH /voucher`, `DELETE /voucher/bulk`, `DELETE /voucher/delete-expired` | `frontend/.../api/hotspot/{profiles,voucher}` |
| Invoices | `GET/POST/PUT/DELETE /api/v1/invoices`, `GET /invoices/counts` | `frontend/.../api/invoices` |
| Keuangan | `GET/POST/PUT/DELETE /api/v1/keuangan/transactions`, `GET/POST/PUT/DELETE /categories` | `frontend/.../api/keuangan/{transactions,categories}` |

Key behaviors preserved:
- PPPoE customers: session enrichment via radacct (online/offline/partial), phone dedup, auto customerId with prefix
- PPPoE profiles: auto-sync to radgroupreply (Mikrotik-Group, Mikrotik-Rate-Limit) + radgroupcheck (Simultaneous-Use)
- PPPoE areas: activity logging for create/update/delete, blocks delete if users exist
- Hotspot profiles: BigInt usageQuota serialization, sellingPrice = costPrice + resellerFee
- Hotspot vouchers: batch generation (max 25k, batched insert of 1000), bulk patch/delete
- Invoices: auto invoice number (INV-YYYYMM-NNNN), payment token + link, mark-as-paid atomic updateMany,
  expiredAt extension by validity unit, user activation, manual payment approval,
  Keuangan transaction sync, RADIUS radcheck + radusergroup re-sync
- Keuangan: WIB date filter conversion, income/expense stats with category breakdowns,
  filter delete, activity logging for transactions

Deferred to Batch 4:
- Payment gateway webhooks (Midtrans/Xendit/Duitku/Tripay, 1472 lines)
- PPPoE user sync-mikrotik, bulk operations, send-notification, export
- Hotspot voucher resync, send-whatsapp, rekap-voucher, agents
- Invoice generate, send-reminder, export, by-token, pdf

### Batch 4 Detail ✅

**Commit**: `fbe4837`

| Module | Endpoints | Source |
|--------|-----------|--------|
| Payment | `GET /api/v1/payment/check-order`, `GET /api/v1/payment/duitku-methods` | `frontend/.../api/payment/{check-order,duitku-methods}` |
| Network | `GET/POST/PUT/DELETE /api/v1/network/{routers,olts,odps,odcs,servers}`, `GET/POST /api/v1/network/otbs`, `GET /api/v1/network/nodes` | `frontend/.../api/network/{routers,olts,odps,odcs,otbs,nodes,servers}` |
| Radius | `POST /api/v1/radius/{authorize,post-auth,accounting,coa}` | `frontend/.../api/radius/{authorize,post-auth,accounting,coa}` |
| Sessions | `GET /api/v1/sessions`, `GET /api/v1/sessions/{realtime,export}`, `POST /api/v1/sessions/sync` | `frontend/.../api/sessions/{route,realtime,export,sync}` |

Key behaviors preserved:
- Payment check-order: agent deposit lookup, invoice number parsing (strip timestamp suffix),
  TOPUP-TEMP backward compat, webhook log fallback
- Payment duitku-methods: md5 signature, sandbox/production URLs, fallback defaults filtered by amount
- Network routers: VPN client NAS secret resolution, RADIUS server IP auto-detection,
  activity logging, duplicate nasname+port+secret check
- Network OLTs: BigInt uptime serialization, router assignments with priority,
  ONU stats (online/offline/los/dying_gasp/unconfig)
- Network ODPs: parent ODP hierarchy, blocks delete if has children
- Network ODCs: OLT validation, blocks delete if has ODPs
- Network OTBs: feeder cable validation, auto-sync to network_nodes (unified map)
- Network nodes: unified map with type/status/search filters
- Radius authorize: voucher/PPPoE status checks, expiry rejection, isolated user allow,
  radpostauth rejection logging, Cleartext-Password for vouchers
- Radius post-auth: firstLoginAt + expiresAt calculation by validity unit,
  Keuangan income sync (sellingPrice), agent commission expense sync (resellerFee)
- Radius accounting: logging only (radacct handled by FreeRADIUS SQL module)
- Sessions list: stale session cleanup (8h idle, clock-skew-safe),
  radacct active sessions with PPPoE/hotspot type detection,
  synthetic hotspot sessions for orphaned ACTIVE vouchers,
  duration calculation (DB-based, NAS-clock-skew-corrected),
  historical MAC fallback, stats + all-time radacct aggregates

Deferred to Batch 5 (integration batch):
- Payment create + webhook (Midtrans/Xendit/Duitku/Tripay, 1472+522 lines)
- MikroTik API integration (node-routeros): router connection test,
  realtime sessions, CoA execution, live traffic overlay
- FreeRADIUS reload service
- Session sync jobs (syncPPPoESessions, syncHotspotWithRadius)
- Excel/PDF export generation (exceljs/pdfkit)
- VPN management routes (vpn-server, vpn-client, vpn-routing, l2tp/pptp/sstp control)
- Network trace, cables, splices, joint-closures, fiber-paths, auto-connect
- OLT chassis/ONU management, ONU register/reboot/delete

### Batch 5 Detail ✅

**Commit**: `253a1b5`

| Module | Endpoints | Source |
|--------|-----------|--------|
| PaymentGateway | `POST /api/v1/payment/create`, `POST /api/v1/payment/webhook` | `frontend/.../api/payment/{create,webhook}` |
| Mikrotik | `POST /api/v1/mikrotik/test-connection`, `GET /api/v1/mikrotik/{hotspot-sessions,pppoe-sessions}`, `POST /api/v1/mikrotik/disconnect` | `frontend/.../api/network/routers`, `frontend/.../api/sessions/realtime`, `frontend/.../server/services/radius/coa-handler.service` |
| Freeradius | `POST /api/v1/freeradius/reload`, `GET /api/v1/freeradius/radclient-status`, `POST /api/v1/freeradius/coa-disconnect` | `frontend/.../server/services/radius/freeradius.service`, `frontend/.../server/services/radius/coa-handler.service` |
| SessionSync | `POST /api/v1/session-sync/{pppoe,hotspot,all}` | `frontend/.../server/jobs/{pppoe-session-sync,hotspot-sync}` |

New modules created:
- `PaymentGatewayModule` — payment create + unified webhook handler
  - `gateway-clients.ts` — Midtrans/Xendit/Duitku/Tripay client wrappers
  - `payment-create.service.ts` — invoice & voucher payment creation
  - `payment-webhook.service.ts` — gateway detection, signature verification,
    order-type dispatch (invoice/voucher/topup/agent-deposit), idempotency,
    atomic settlement, Keuangan sync, RADIUS restoration, referral bonus
- `MikrotikModule` — node-routeros integration
  - Router connection testing, live hotspot/PPPoE session retrieval,
    live traffic overlay, CoA disconnect via MikroTik API
- `FreeradiusModule` — FreeRADIUS config sync & CoA
  - NAS client config generation (clients.d/nas-from-db.conf),
    include-file verification, conditional restart with cooldown,
    radclient CoA disconnect
- `SessionSyncModule` — cron job porting
  - PPPoE session sync (stale close, blocked user close, orphan import,
    acctsessiontime update, cronHistory logging)
  - Hotspot voucher sync (WAITING→ACTIVE on first login, ACTIVE→EXPIRED,
    MikroTik API disconnect + CoA fallback, FreeRADIUS cleanup)

Sessions module upgraded:
- `export.service.ts` — Excel export via exceljs, PDF export (basic),
  shared session fetch with filters
- `sessions.controller.ts` — Excel/PDF download responses
- `sessions.service.ts` — realtime via MikrotikService, sync via SessionSyncService

Dependencies added:
- `midtrans-client@^1.4.3`, `xendit-node@^7.0.0`, `exceljs@^4.4.0`,
  `date-fns@^4.4.0`, `date-fns-tz@^3.2.0`

Key behaviors preserved:
- Payment create: invoice & voucher flows, gateway activation check,
  dynamic base URL resolution, gateway-specific payment URL/snap token/QR string,
  payment record + pending webhook log persistence
- Payment webhook: content-type detection (JSON + form-urlencoded for Duitku),
  gateway detection (Midtrans/Xendit/Xendit-FVA/Duitku/Tripay),
  signature verification (SHA-512/M MD5/HMAC-SHA256/token),
  status normalization (settlement/capture/pending/expire/cancel/deny/failed),
  idempotency guard, atomic invoice settlement (updateMany),
  amount mismatch validation, payment record creation,
  Keuangan income transaction sync, user expiry extension & reactivation,
  RADIUS radcheck/radusergroup/radreply restoration for isolated users,
  referral bonus processing (FIRST_PAYMENT), agent deposit balance increment,
  voucher order settlement with unique code generation
- MikroTik: uptime string parsing (1w2d3h4m5s), bytes-in=upload, bytes-out=download,
  hotspot /ip/hotspot/active/print, PPPoE /ppp/active/print,
  disconnect via /ip/hotspot/active/remove and /ppp/active/remove
- FreeRADIUS: NAS config generation with VPN gateway clients,
  secret mismatch skip warning, clients.conf include verification,
  3-second restart cooldown, non-fatal restart failure handling
- Session sync: 90-minute stale threshold, blocked/stop user session close,
  orphan RADIUS session auto-import to pppoe_users,
  voucher first-login activation with validity-based expiry,
  expired voucher disconnect + radacct stop + radcheck EXPIRED + radreply message

Deferred to Batch 6+:
- WhatsApp/Email/Push notifications in webhook handler (currently logged only)
- VPN management routes (vpn-server, vpn-client, vpn-routing)
- Network trace, cables, splices, joint-closures, fiber-paths, auto-connect
- OLT chassis/ONU management, ONU register/reboot/delete
- WhatsApp, Telegram, push notification, upload, backup routes

### Batch 6 Detail ✅

**Commit**: `70b9df6`

| Module | Endpoints | Source |
|--------|-----------|--------|
| ManualPayments | `GET/POST /api/v1/manual-payments`, `GET/PATCH/DELETE /api/v1/manual-payments/:id` | `frontend/.../api/manual-payments` |
| Registrations | `POST /api/v1/registrations` (public), `GET /api/v1/registrations` (admin) | `frontend/.../api/registrations` |
| VoucherTemplates | `GET/POST /api/v1/voucher-templates`, `GET/PUT/DELETE /api/v1/voucher-templates/:id` | `frontend/.../api/voucher-templates` |
| CustomerPortal | `POST /api/v1/customer/auth/{login,send-otp,verify-otp}`, `GET /api/v1/customer/{dashboard,me,profile,invoices,payments,packages,usage,notifications,referral,suspend-request}`, `PATCH /api/v1/customer/profile`, `POST /api/v1/customer/{referral,auto-renewal,suspend-request}`, `DELETE /api/v1/customer/suspend-request` | `frontend/.../api/customer/*` |
| AgentPortal | `POST /api/v1/agent/login`, `GET /api/v1/agent/{dashboard,notifications,sessions}`, `POST /api/v1/agent/deposit/create`, `GET /api/v1/agent/deposit/check`, `PUT /api/v1/agent/notifications/read`, `DELETE /api/v1/agent/notifications` | `frontend/.../api/agent/*` |

New modules created:
- `ManualPaymentsModule` — manual payment submission + admin approval/rejection
  - List with filters (userId, status, month), single fetch
  - Submit (public — customer portal): invoice validation, pending-check,
    admin notification creation
  - Approve: atomic transaction (manualPayment + invoice + pppoeUser + payment),
    package-change detection from invoice additionalFees metadata,
    RADIUS radcheck/radusergroup/radreply restoration, expiry extension
  - Reject: status update + admin notification
  - Delete (admin only)
- `RegistrationsModule` — public registration request
  - Phone uniqueness check, profile validation, referral code validation
  - Creates PENDING registrationRequest
  - Admin list with pagination
- `VoucherTemplatesModule` — CRUD for voucher print templates
  - isDefault toggle (unsets others), isActive flag
- `CustomerPortalModule` — customer self-service portal
  - Auth: phone or 8-digit customerId login, OTP (rate-limited 3/15min),
    session token (64-char hex, 7-day expiry)
  - Dashboard: active RADIUS session, monthly usage aggregation,
    unpaid invoice summary
  - Profile: get/update with phone normalization (08→62)
  - Invoices: paginated list with payment source detection
    (gateway/manual/admin), status filter
  - Payments: paid invoice history with method detection
  - Packages: current package only (no browsing)
  - Usage: monthly upload/download/total from radacct
  - Notifications: paid invoices + rejected payments event feed
  - Referral: code stats, generate unique 8-char code (no I/O/0/1),
    company referral config
  - Auto-renewal: boolean toggle
  - Suspend-request: create (max 90 days, date validation),
    cancel (PENDING only), get latest
- `AgentPortalModule` — agent/reseller portal
  - Auth: phone login, JWT via AuthService.signAgentToken (7-day expiry)
  - Dashboard: paginated voucher listing with filters (status/search/profileId),
    stats (currentMonth/allTime/today income + counts, generated/waiting/sold/used),
    profiles with agentAccess, recent deposits, active payment gateways,
    voucher stock count
  - Deposit create: gateway validation, payment token generation,
    PENDING deposit record (payment URL deferred to payment-gateway integration)
  - Deposit check: public status lookup by token or orderId
  - Notifications: list with unread count, mark-read (all or specific),
    delete (ownership verified)
  - Sessions: active hotspot vouchers cross-referenced with radacct,
    synthetic sessions for ACTIVE vouchers without radacct,
    router name mapping

Key behaviors preserved:
- Customer auth: phone normalization (08xxx→62xxx), OTP rate limiting,
  customerSession table with verified flag
- Manual payment approval: atomic transaction, package change detection,
  RADIUS restoration, expiry extension by validity unit
- Agent dashboard: WIB timezone stats, voucher stock, profile agentAccess filter
- Referral code: 8-char alphanumeric (excludes I/O/0/1), 10 retry attempts

Deferred to Batch 9+:
- WhatsApp/Email notifications in webhook/broadcast (currently logged only)
- Customer portal: invoice payment creation, topup-direct, upgrade-package,
  renewal, wifi/ONT management
- Agent portal: generate-voucher, record-sales, manual-deposit-request,
  payment-methods, deposit webhook
- OLT/ONU management (15 routes), GenieACS device detail
- VPN management, network trace, cables, splices, fiber-paths
- web-push npm dependency (push module degrades gracefully if not installed)

### Batch 8 Detail ✅

**Commit**: `27a1fa0`

| Module | Endpoints | Source |
|--------|-----------|--------|
| WhatsApp | `POST /api/v1/whatsapp/send`, `GET/POST /api/v1/whatsapp/templates`, `PUT/DELETE /api/v1/whatsapp/templates/:id`, `GET/POST /api/v1/whatsapp/providers`, `PUT/DELETE /api/v1/whatsapp/providers/:id`, `GET /api/v1/whatsapp/providers/:id/{status,qr}`, `POST /api/v1/whatsapp/providers/:id/{restart,test}`, `GET /api/v1/whatsapp/history`, `GET/PUT /api/v1/whatsapp/reminder-settings`, `POST /api/v1/whatsapp/{broadcast,broadcast-invoice}`, `GET/POST /api/v1/whatsapp/webhook` | `frontend/.../api/whatsapp/*` |
| Telegram | `GET/POST /api/v1/telegram/settings`, `POST /api/v1/telegram/{test,send-backup,send-health,test-backup}` | `frontend/.../api/telegram/*` |
| Push | `GET /api/v1/push/vapid-public-key`, `POST /api/v1/push/{subscribe,unsubscribe,agent-subscribe,agent-unsubscribe,technician-subscribe,technician-unsubscribe}`, `GET/POST /api/v1/push/send` | `frontend/.../api/push/*` |
| Backup | `GET /api/v1/backup`, `GET /api/v1/backup/history`, `POST /api/v1/backup/create`, `GET /api/v1/backup/download/:id`, `DELETE /api/v1/backup/delete/:id`, `POST /api/v1/backup/restore`, `GET /api/v1/backup/health` | `frontend/.../api/backup/*` |
| Public | `GET /api/v1/public/{company,areas,profiles,stats,payment-gateways}` | `frontend/.../api/public/*` |

New modules created:
- `WhatsAppModule` — WhatsApp messaging and provider management
  - Send: failover across providers, phone normalization (62 prefix),
    history logging per attempt
  - Templates: CRUD, auto-seeds 17 default templates on first list
  - Providers: CRUD, status check, QR fetch, session restart, test send
  - History: paginated with stats (sent/failed/incoming counts)
  - Reminder settings: singleton get/update
  - Broadcast: template variable replacement, per-user send
  - Broadcast invoice: invoice reminder template, per-invoice send
  - Webhook: incoming message normalization (Kirimi/Wablas/Fonnte/WAHA/Meta),
    logs to history as "incoming"
- `TelegramModule` — Telegram backup integration
  - Settings: get (masked token), update
  - Test: sends to general chat, backup topic, health topic
  - Send backup: attaches SQL file to Telegram document
  - Send health: DB size, table count, user counts report
  - Test backup: creates real mysqldump, sends to Telegram, logs to history
- `PushModule` — Web push notifications
  - VAPID public key retrieval
  - Customer/agent/technician subscribe/unsubscribe (synthetic userIds
    for agent_ and tech_ prefixes)
  - Broadcast: targeted or all, web-push library with graceful degradation
    if not installed, auto-deactivates 410/404 subscriptions
  - Send to user, send to all technicians
  - Broadcast history and stats
- `BackupModule` — Database backup management
  - List/history: last 100 backups
  - Create: mysqldump with --single-transaction, logs to backupHistory
  - Download: file stream by backup ID
  - Delete: removes file from disk + history record
  - Restore: mysql import from uploaded SQL file (500MB limit)
  - Health: table count, DB size, last backup timestamp
- `PublicModule` — Public-facing endpoints
  - Company info (no sensitive fields)
  - Active areas for registration form
  - Active profiles with speed/validity
  - Public stats (rounded for privacy, no revenue)
  - Active payment gateways

Key behaviors preserved:
- WhatsApp phone normalization: 0 prefix → 62, no prefix → 62
- WhatsApp failover: tries providers by priority desc, logs each attempt
- WhatsApp template seeding: 17 default templates on first GET
- Telegram message threading: backup/health topic support
- Push subscription deactivation: 410/404 → isActive=false
- Backup: mysqldump --opt --single-transaction for consistent snapshot
- Public stats: rounded to nearest 10 for privacy

### Batch 7 Detail ✅

**Commit**: `75b48c4`

| Module | Endpoints | Source |
|--------|-----------|--------|
| TechnicianPortal | `GET /api/v1/technician/{customers,form-data,sessions,monitor,offline,isolated,profile,genieacs,genieacs/devices,work-orders,tasks}`, `PUT /api/v1/technician/{profile,tasks}`, `POST /api/v1/technician/work-orders` | `frontend/.../api/technician/*` |
| Tickets | `GET/POST/PUT/DELETE /api/v1/tickets`, `GET/POST /api/v1/tickets/categories`, `PUT/DELETE /api/v1/tickets/categories`, `GET/POST /api/v1/tickets/messages`, `GET /api/v1/tickets/stats` | `frontend/.../api/tickets/*` |
| Evoucher | `GET /api/v1/evoucher/profiles`, `GET /api/v1/evoucher/order/:token`, `POST /api/v1/evoucher/purchase` | `frontend/.../api/evoucher/*` |
| Inventory | `GET/POST/PUT/DELETE /api/v1/inventory/{items,categories,suppliers,movements}` | `frontend/.../api/inventory/*` |
| Upload | `POST /api/v1/upload/{payment-proof,logo,pppoe-customer,ticket}` | `frontend/.../api/upload/*`, `frontend/.../api/technician/upload` |

New modules created:
- `TechnicianPortalModule` — field technician self-service portal
  - Customers: paginated list with search/filter, profile/area/router includes
  - Form-data: dropdown data (profiles, routers, areas)
  - Sessions: active radacct sessions cross-referenced with PPPoE users,
    duration/bytes formatting, client-side search + pagination
  - Monitor: status group counts, online count from radacct, active sessions,
    isolated customers list
  - Offline: active/isolated users filtered against online radacct sessions
  - Isolated: isolated users with unpaid invoices, online status check,
    total unpaid amount stats
  - Profile: dual support (adminUser + technician), bcrypt password change
  - Tasks: work orders assigned to technician, status update with completedAt
  - Work-orders: list with filters, actions (ASSIGN/START/COMPLETE/CANCEL)
  - GenieACS: settings (masked password), devices from external API
    with 30s timeout, online/offline based on lastInform
- `TicketsModule` — support ticket system
  - CRUD: list with filters (customer/admin scoped), create with unique
    ticket number (TKTYYMMRRRR, 10 retries), update with auto
    resolvedAt/closedAt, delete
  - Categories: CRUD with item-count check before delete
  - Messages: list by ticket, create with lastResponseAt update
  - Stats: open/in-progress/resolved/closed/total counts
- `EvoucherModule` — public e-voucher purchase flow
  - Profiles: active profiles with eVoucherAccess, sorted by price
  - Order by token: includes profile, vouchers, payment gateways, company
  - Purchase: order number (EVC-YYYYMMDD-NNNN), secure payment token,
    payment link generation, PENDING voucherOrder creation
- `InventoryModule` — stock management
  - Items: list with filters (category/supplier/search/lowStock),
    stock status (out_of_stock/low_stock/in_stock),
    create with initial stock movement, update, delete (cascade)
  - Categories: CRUD with item-count check
  - Suppliers: CRUD with item-count check
  - Movements: list, create (IN/OUT/ADJUSTMENT with atomic stock update),
    delete (reverse with stock restoration)
- `UploadModule` — file upload handling via multer (memoryStorage)
  - Payment proof: public, JPG/PNG/WebP, 5MB
  - Logo: admin, PNG/JPG/SVG/WebP/AVIF/GIF, 2MB
  - PPPoE customer: admin, idCard/installation subfolders
  - Ticket attachment: technician, JPG/PNG/WebP/GIF, 5MB

Dependencies added:
- `multer@^2.2.0`, `@types/multer@^2.2.0`

Key behaviors preserved:
- Technician auth: dual support (adminUser + technician), JWT via
  AuthService.signTechnicianToken, 7-day expiry
- Ticket number: TKTYYMMRRRR format with 10 retry attempts
- E-voucher order: EVC-YYYYMMDD-NNNN format, 32-byte hex payment token
- Inventory movement: atomic transaction (movement + stock update),
  ADJUSTMENT sets absolute value, OUT validates sufficient stock
- Upload: file type validation, size limits, unique filename generation

### Batch 9 Detail ✅

**Commit**: `431adcb`

| Module | Endpoints | Source |
|--------|-----------|--------|
| Olt | `GET/PUT /api/v1/olt/:id`, `GET /:id/chassis`, `GET /:id/onus`, `GET/POST /:id/onus/register`, `GET /:id/onus/:onuId/detail`, `DELETE /:id/onus/:onuId/delete`, `GET /:id/alerts`, `POST /:id/alerts/:alertId/resolve`, `GET /:id/metrics`, `GET/PUT /api/v1/olt/alert-settings` | `frontend/.../api/olt/[id]/*` |
| Vpn | `GET/POST/PUT/DELETE /api/v1/network/vpn/servers`, `GET/POST/PATCH /api/v1/network/vpn/clients` | `frontend/.../api/network/vpn-{server,client}` |
| NetworkInfra | `GET /api/v1/network/trace`, `GET/POST/PUT/DELETE /cables`, `GET/POST/DELETE /splices`, `GET/POST/PUT/DELETE /joint-closures`, `GET/POST/PUT/DELETE /fiber-paths`, `POST /auto-connect`, `GET/PUT /map-settings` | `frontend/.../api/network/*` |
| CustomerPortal extras | `GET /invoices/payment`, `POST /topup-direct`, `POST /upgrade`, `GET/POST /renewal`, `GET /ont`, `GET/POST /wifi` | `frontend/.../api/customer/*` |
| AgentPortal extras | `POST /generate-voucher`, `POST /record-sales`, `GET /deposit/payment-methods`, `POST /deposit/manual-request`, `POST /deposit/webhook` | `frontend/.../api/agent/*` |

New modules created:
- `OltModule` — OLT detail, chassis, ONU register/detail/delete, alerts, metrics, alert settings
- `VpnModule` — VPN servers CRUD, VPN clients with NAS auto-creation and credential generation
- `NetworkInfraModule` — trace, cables, splices, joint-closures, fiber-paths, auto-connect, map-settings

Customer portal extras added to existing `CustomerPortalModule`:
- Invoice payment link, top-up direct, package upgrade, renewal check/create
- ONT info and WiFi config via GenieACS

Agent portal extras added to existing `AgentPortalModule`:
- Generate voucher (balance deduction, batch code, sales recording)
- Record sales (cron endpoint)
- Deposit payment-methods, manual-request, webhook handler

Key behaviors preserved:
- OLT detail: includes routers, ONU statuses (filterable), alerts, metrics, monitoring logs
- OLT update: router assignments replaced in transaction
- VPN client creation: auto IP allocation from subnet pool, credential generation,
  NAS entry auto-created with secret for RADIUS
- Network trace: splice traversal with attenuation calculation and signal budget
- Cable creation: tubes and cores auto-generated in transaction with color coding
- Splice creation: marks cores as ASSIGNED, deletion releases cores with history
- Joint closure: auto-syncs to network_nodes for unified map
- Auto-connect: creates cable + segment between two devices
- Customer renewal: checks unpaid invoices, calculates new expiry from validity unit
- Agent voucher generation: balance deduction in transaction, batch code, sales records
- Agent webhook: handles common gateway payload formats (Midtrans/Xendit/Duitku/Tripay)

Deferred integrations (DB-based fallbacks implemented):
- Telnet/SNMP-based OLT chassis scan and ONU registration (DB-based slot layout)
- MikroTik API connection for VPN clients (DB + NAS entry created)
- Payment gateway integration for invoice/topup/upgrade/renewal payment links
- GenieACS parameter update for WiFi config
- Webhook signature verification (gateway-specific)

Backend module count: 37 → 40
Build verified with `pnpm build`.

### Per-batch workflow

1. Port routes ke NestJS controller + service
2. Test NestJS endpoint dengan curl
3. Update frontend fetch calls (via centralized API client)
4. Remove Next.js API route
5. Verify regression

---

## Phase 4: Port Cron Jobs ⏳

**Status**: Pending
**Estimasi**: 3-5 hari

### Jobs to port (17 total)

1. hotspot_sync, pppoe_auto_isolir, agent_sales, invoice_generate
2. invoice_reminder, notification_check, disconnect_sessions
3. telegram_backup, telegram_health, activity_log_cleanup
4. auto_renewal, webhook_log_cleanup, invoice_status_update
5. session_monitor, pppoe_session_sync, suspend_check, freeradius_health

### Strategy

- Port ke NestJS `@nestjs/schedule` dengan `@Cron()` decorator
- Update PM2 config: `salfanet-cron` → run backend cron
- Runner lama tetap jalan sampai semua jobs verified

---

## Phase 5: Frontend Cleanup ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] Remove all `src/app/api/` dari frontend
- [ ] Remove `src/server/` dari frontend
- [ ] Remove `src/cron/` dari frontend
- [ ] Remove `prisma/` dari frontend
- [ ] Update 5 layout files — remove prisma import, ganti dengan API call
- [ ] Centralize API client: `NEXT_PUBLIC_API_URL` env var
- [ ] Verify: frontend build tidak butuh Prisma

---

## Phase 6: Independent Build & Deploy ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] `frontend/package.json` — hanya UI deps
- [ ] `backend/package.json` — hanya server deps
- [ ] PM2 config: 4 processes (frontend, backend, cron, wa)
- [ ] Nginx: `/api/` → backend, `/` → frontend
- [ ] Docker configs (optional)

### PM2 Architecture

```
salfanet-frontend  → Next.js standalone (port 3000)
salfanet-backend   → NestJS (port 3001)
salfanet-cron      → NestJS cron runner
salfanet-wa        → WhatsApp service (port 4000)
```

### Nginx

```nginx
location /api/ { proxy_pass http://127.0.0.1:3001; }
location / { proxy_pass http://127.0.0.1:3000; }
```

---

## Phase 7: Regression Test ⏳

**Status**: Pending
**Estimasi**: 3-5 hari

### Test checklist

- [ ] Login (admin, customer, agent, technician)
- [ ] Role & permission
- [ ] Customer CRUD
- [ ] PPPoE sync
- [ ] FreeRADIUS sync
- [ ] MikroTik integration
- [ ] OLT/ONU management
- [ ] GenieACS
- [ ] Billing & invoice
- [ ] Payment gateway webhook
- [ ] WhatsApp send
- [ ] Telegram backup
- [ ] Email notification
- [ ] Push notification
- [ ] Cron jobs (all 17)
- [ ] Backup & restore
- [ ] Settings
- [ ] Dashboard stats
- [ ] Activity logs

---

## Phase 8: Cleanup & Documentation ⏳

**Status**: Pending
**Estimasi**: 2-3 hari

### Tasks

- [ ] Remove old empty directories
- [ ] Update README.md
- [ ] Update CHANGELOG.md
- [ ] Create ARCHITECTURE.md
- [ ] Create API.md (OpenAPI auto-generated)
- [ ] Create DEVELOPMENT.md
- [ ] Create DEPLOYMENT.md
- [ ] Update vps-install scripts untuk monorepo

---

## Key Decisions

| Decision | Pilihan | Alasan |
|----------|---------|--------|
| Backend framework | NestJS 11 | Enterprise-grade, TypeScript-first, DI container, decorator pattern |
| Repo structure | Monorepo (pnpm) | Shared types, atomic commits, gradual migration |
| API versioning | `/api/v1/*` | Endpoint lama tetap jalan selama transisi |
| Auth strategy | Dual-stack | NextAuth tetap untuk login, NestJS verify JWT |
| Frontend framework | Tetap Next.js | 162 pages, 70 components — tidak perlu rewrite |
| Database | Prisma + MySQL | Tetap sama, schema dipindah ke backend |
| Cron | @nestjs/schedule | Native NestJS integration |

---

## Risk Mitigation

| Risiko | Mitigasi |
|--------|----------|
| Auth break | Dual-stack NextAuth + NestJS JWT verify |
| 399 endpoints break | Port per batch, dual-stack via Nginx |
| Cron jobs break | Port terakhir, runner lama tetap jalan |
| Prisma path issues | Build di VPS, bukan cross-platform |
| WhatsApp Baileys | Port wa-service.js ke backend module |
| Payment webhooks | Pastikan URL webhook tidak berubah |
| Frontend fetch paths | Centralize API client dengan env var |
| VPS 4GB RAM | Backend NestJS lebih ringan dari Next.js build |
