# Frontend API Contract — Phase 6A Audit

> Source of truth: actual backend route implementations under `backend/src/app/api/`.
> All field names are **camelCase** (matches Prisma schema).
> This document was produced by auditing real backend `route.ts` files, not by inferring from frontend code.

## Response Wrapper Patterns

The backend uses **three different response patterns** (inconsistent):

| Pattern | Shape | Used by |
|---------|-------|---------|
| `ok(data)` helper | Raw data, no `success` field | `/api/pppoe/users` (GET), `/api/invoices` (GET/POST/PUT), `/api/notifications`, `/api/company` |
| `created(data)` helper | Raw data, HTTP 201 | `/api/pppoe/users` (POST), `/api/invoices` (POST) |
| Explicit `{ success: true, ... }` | Has `success` field | `/api/manual-payments`, `/api/keuangan/transactions`, `/api/network/olts`, `/api/admin/users`, `/api/customer/*` |

## Error Contract

Two error shapes exist (inconsistent):

| Shape | Used by |
|-------|---------|
| `{ error: string }` | Most endpoints (from `badRequest()`, `unauthorized()`, `notFound()`, `serverError()` helpers) |
| `{ success: false, error: string }` | `/api/manual-payments`, `/api/keuangan/transactions`, `/api/customer/*`, `/api/network/olts` |

Frontend `apiAdmin()` handles both via `error.message || error.error` fallback in `client.ts`.

## Pagination Contract

Three pagination patterns exist:

| Pattern | Shape | Used by |
|---------|-------|---------|
| `{ total, page, limit, totalPages }` | Standard | `/api/keuangan/transactions`, `/api/customer/invoices` |
| `{ total, hasMore }` | Offset-based | `/api/admin/activity-logs` |
| `{ count }` | Count only (no pagination) | `/api/pppoe/users`, `/api/pppoe/profiles`, `/api/pppoe/areas` |

---

## Authentication Endpoints

### POST /api/admin/auth/verify
- **Auth**: None (login)
- **Request**: `{ username, password, twoFactorCode? }`
- **Response**: `AuthVerifyResponse | AuthVerify2faResponse | AuthVerifyError`
- **Error**: `{ error: string }`

### GET /api/admin/auth/verify
- **Auth**: NextAuth session cookie
- **Response**: `AuthVerifyResponse`
- **Error**: `{ error: string }` (401)

---

## PPPoE Endpoints

### GET /api/pppoe/users
- **Auth**: NextAuth admin
- **Query**: `?status, profileId, areaId, routerId, search, month`
- **Response**: `PppoeUserListResponse` = `{ users: PppoeUser[], count: number }`
- **Error**: `{ error: string }`

### POST /api/pppoe/users
- **Auth**: NextAuth admin
- **Request**: `CreatePppoeUserPayload`
- **Response**: `PppoeUserCreateResponse` = `{ success: true, user?, secrets? }`
- **Error**: `{ error: string }` (400/409/404/500)

### PUT /api/pppoe/users
- **Auth**: NextAuth admin
- **Request**: `UpdatePppoeUserPayload` = `{ id, ...fields }`
- **Response**: `PppoeUserResponse` = `{ success: true, user }`
- **Error**: `{ error: string }`

### DELETE /api/pppoe/users
- **Auth**: NextAuth admin
- **Query**: `?id=xxx`
- **Request body**: `{ confirmPassword }`
- **Response**: `PppoeUserDeleteResponse` = `{ success: true, message }`
- **Error**: `{ error: string }`

### GET /api/pppoe/users/[id]
- **Auth**: NextAuth admin
- **Response**: Raw `PppoeUser` object (no wrapper)
- **Error**: `{ error: string }` (404)

### GET /api/pppoe/users/online-status
- **Auth**: NextAuth admin
- **Query**: `?usernames=user1,user2,...`
- **Response**: `PppoeOnlineStatusResponse` = `{ online: string[], onlineCount, total, timestamp }`
- **Error**: `{ error: string }`

### GET /api/pppoe/users/sync-mikrotik
- **Auth**: NextAuth admin
- **Query**: `?routerId=xxx`
- **Response**: `SyncPreviewResponse` = `{ success, router, data: { total, new, existing, secrets } }`
- **Error**: `{ success: false, error }`

### POST /api/pppoe/users/sync-mikrotik
- **Auth**: NextAuth admin
- **Request**: `{ routerId, profileId, selectedUsernames?, syncToRadius, defaultPhone }`
- **Response**: `SyncMikrotikImportResponse` = `{ success, message, stats, imported, skipped, errors }`
- **Error**: `{ success: false, error }`

### PUT /api/pppoe/users/status
- **Auth**: NextAuth admin
- **Request**: `{ userId, status: 'active'|'isolated'|'blocked'|'stop' }`
- **Response**: `UpdateUserStatusResponse` = `{ success, user, coa? }`
- **Error**: `{ error }`

### PUT /api/pppoe/users/bulk-status
- **Auth**: NextAuth admin
- **Request**: `{ userIds: string[], status }`
- **Response**: `BulkUpdateStatusResponse` = `{ success, updated, status, coa? }`
- **Error**: `{ error }`

### GET /api/pppoe/profiles
- **Auth**: NextAuth admin
- **Response**: `PppoeProfileListResponse` = `{ profiles: PppoeProfile[], count }`
- **Error**: `{ error }`

### POST /api/pppoe/profiles
- **Auth**: NextAuth admin
- **Request**: `{ name, description, groupName, mikrotikProfileName, ipPoolName, radiusPoolName, price, downloadSpeed, uploadSpeed, rateLimit, validityValue, validityUnit, sharedUser, hpp, ppnActive, ppnRate }`
- **Response**: `PppoeProfileResponse` = `{ success: true, profile }` (HTTP 201)
- **Error**: `{ error }`

### PUT /api/pppoe/profiles
- **Auth**: NextAuth admin
- **Request**: `{ id, ...profileFields }`
- **Response**: `PppoeProfileResponse` = `{ success: true, profile }`
- **Error**: `{ error }`

### DELETE /api/pppoe/profiles
- **Auth**: NextAuth admin
- **Query**: `?id=xxx`
- **Response**: `{ success: true, message }`
- **Error**: `{ error }`

### GET /api/pppoe/areas
- **Auth**: NextAuth admin
- **Response**: `PppoeAreaListResponse` = `{ areas: PppoeArea[], count }`
- **Error**: `{ error }`

### POST /api/pppoe/areas
- **Auth**: NextAuth admin
- **Request**: `{ name, description, isActive }`
- **Response**: `PppoeAreaResponse` = `{ area, success: true }`
- **Error**: `{ error }`

### PUT /api/pppoe/areas
- **Auth**: NextAuth admin
- **Request**: `{ id, name, description, isActive }`
- **Response**: `PppoeAreaResponse` = `{ area, success: true }`
- **Error**: `{ error }`

### DELETE /api/pppoe/areas
- **Auth**: NextAuth admin
- **Query**: `?id=xxx`
- **Response**: `{ success: true, message }`
- **Error**: `{ error }`

---

## Invoice & Billing Endpoints

### GET /api/invoices
- **Auth**: NextAuth admin
- **Query**: `?status, userId, limit, month`
- **Response**: `InvoiceListResponse` = `{ invoices: Invoice[], stats: InvoiceListStats }`
- **Error**: `{ error }`

### POST /api/invoices
- **Auth**: NextAuth admin
- **Request**: `{ userId, amount, dueDate, notes }`
- **Response**: `InvoiceResponse` = `{ invoice }` (HTTP 201, no success field)
- **Error**: `{ error }`

### PUT /api/invoices
- **Auth**: NextAuth admin
- **Request**: `{ id, status, paidAt }`
- **Response**: `InvoiceResponse` = `{ invoice }`
- **Error**: `{ error }`

### DELETE /api/invoices
- **Auth**: NextAuth admin
- **Query**: `?id=xxx` or `?ids=x,y,z`
- **Response**: `InvoiceDeleteResponse` = `{ success, message, deletedCount? }`
- **Error**: `{ error }`

### POST /api/invoices/generate
- **Auth**: NextAuth admin
- **Request**: `{ targetMonth: 'YYYY-MM', scope: 'all'|'single', userId?, skipExisting, sendWa }`
- **Response**: `InvoiceGenerateResponse` = `{ success, generated, skipped, errors, message }`
- **Error**: `{ success: false, error }`

### POST /api/invoices/send-reminder
- **Auth**: NextAuth admin
- **Request**: `{ invoiceId, channel: 'whatsapp'|'email'|'both' }`
- **Response**: `InvoiceSendReminderResponse` = `{ success, message, results: { whatsapp?, email? } }`
- **Error**: `{ success: false, error, results? }`

---

## Manual Payment Endpoints

### GET /api/manual-payments
- **Auth**: NextAuth admin
- **Query**: `?userId, status, month`
- **Response**: `ManualPaymentListResponse` = `{ success: true, data: ManualPayment[] }`
- **Error**: `{ success: false, error }`

### PATCH /api/manual-payments/[id]
- **Auth**: NextAuth admin
- **Request**: `{ action: 'APPROVE' | 'REJECT', rejectionReason? }`
- **Response**: `ManualPaymentResponse` = `{ success, payment?, message? }`
- **Error**: `{ success: false, error }`

> **NOTE**: Frontend `billingApi.approveManualPayment()` and `rejectManualPayment()` were updated to use PATCH (not POST) with `{ action }` body.

---

## Finance (Keuangan) Endpoints

### GET /api/keuangan/transactions
- **Auth**: NextAuth admin
- **Query**: `?type, categoryId, startDate, endDate, search, page, limit`
- **Response**: `TransactionListResponse` = `{ success, transactions, total, pagination: { total, page, limit, totalPages }, stats: TransactionStats }`
- **Error**: `{ success: false, error }`

> **NOTE**: Frontend `billingApi.listTransactions()` was updated to use `/api/keuangan/transactions` (not `/api/transactions`).

---

## Network Endpoints

### GET /api/network/routers
- **Auth**: NextAuth admin
- **Response**: `RouterListResponse` = `{ routers: Router[], vpnClients?, radiusServerIp? }`
- **Error**: `{ error }`

### POST /api/network/routers
- **Auth**: NextAuth admin
- **Request**: `{ name, ipAddress, nasIpAddress, username, password, port, secret, latitude, longitude, vpnClientId, type, authMode }`
- **Response**: `RouterResponse` = `{ success, router, message? }`
- **Error**: `{ error }`

### PUT /api/network/routers
- **Auth**: NextAuth admin
- **Request**: `{ id, ...routerFields }`
- **Response**: `RouterResponse` = `{ success, router, vpnClientChanged? }`
- **Error**: `{ error }`

### DELETE /api/network/routers
- **Auth**: NextAuth admin
- **Query**: `?id=xxx`
- **Response**: `{ success, message }`
- **Error**: `{ error }`

### GET /api/network/olts
- **Auth**: NextAuth admin
- **Response**: `OLTListResponse` = `{ success: true, olts: OLT[] }`
- **Error**: `{ success: false, error, code? }`

### POST /api/network/olts
- **Auth**: NextAuth admin
- **Request**: `{ name, ipAddress, latitude, longitude, status, routerIds, followRoad, vendor, model, firmwareVersion, username, password, snmpCommunity, sshEnabled, telnetEnabled, sshPort, telnetPort, snmpPort }`
- **Response**: `OLTResponse` = `{ success: true, olt }`
- **Error**: `{ success: false, error }`

### PUT /api/network/olts
- **Auth**: NextAuth admin
- **Request**: `{ id, ...oltFields }`
- **Response**: `OLTResponse` = `{ success: true, olt }`
- **Error**: `{ success: false, error }`

### DELETE /api/network/olts
- **Auth**: NextAuth admin
- **Query**: `?id=xxx`
- **Response**: `{ success, message }`
- **Error**: `{ success: false, error }`

---

## Dashboard Endpoints

### GET /api/dashboard/stats
- **Auth**: NextAuth admin
- **Query**: `?month=YYYY-MM`
- **Response**: `DashboardStats` (large object, no success wrapper)
- **Error**: `{ error }`

### GET /api/dashboard/analytics
- **Auth**: NextAuth admin
- **Query**: `?type=all|revenue|users|hotspot|sessions|financial`
- **Response**: `DashboardAnalytics` = `{ success, data: { revenue?, users?, hotspot?, sessions?, financial? } }`
- **Error**: `{ success: false, error }`

### GET /api/admin/activity-logs
- **Auth**: NextAuth admin
- **Query**: `?module, limit, offset, search`
- **Response**: `ActivityLogListResponse` = `{ success, activities: ActivityLog[], total, hasMore }`
- **Error**: `{ success: false, error }`

---

## Admin User Endpoints

### GET /api/admin/users
- **Auth**: NextAuth admin
- **Response**: `AdminUserListResponse` = `{ success: true, users: AdminUser[] }`
- **Error**: `{ success: false, error }`

### POST /api/admin/users
- **Auth**: NextAuth admin
- **Request**: `{ username, email, password, name, role, phone, isActive, permissions }`
- **Response**: `AdminUserResponse` = `{ success, user }`
- **Error**: `{ success: false, error }`

### PUT /api/admin/users/[id]
- **Auth**: NextAuth admin
- **Request**: `{ email, password, name, role, phone, isActive, permissions }`
- **Response**: `AdminUserResponse` = `{ success, user }`
- **Error**: `{ success: false, error }`

### DELETE /api/admin/users/[id]
- **Auth**: NextAuth admin
- **Response**: `{ success, message }`
- **Error**: `{ success: false, error }`

### GET /api/admin/users/[id]/permissions
- **Auth**: NextAuth admin
- **Response**: `UserPermissionsResponse` = `{ success, permissions: string[] }`
- **Error**: `{ success: false, error, permissions: [] }`

---

## Settings & Company Endpoints

### GET /api/company
- **Auth**: None (public)
- **Response**: `CompanyResponse` = raw `Company` object (no wrapper)
- **Error**: `{ error }`

### POST /api/company
- **Auth**: NextAuth admin
- **Request**: Company fields
- **Response**: `SettingsUpdateResponse` = `{ success, message? }`
- **Error**: `{ error }`

> **NOTE**: There is no generic `/api/settings` endpoint. Settings are scattered across:
> - `/api/company` (GET, POST)
> - `/api/settings/isolation` (GET, PUT)
> - `/api/settings/email` (GET, PUT)
> - `/api/settings/genieacs` (GET, PUT)
> - `/api/telegram/settings` (GET, PUT)
>
> Frontend `settingsApi.getSettings()` was updated to use `/api/company`.

---

## Cron Endpoints

### GET /api/cron/status
- **Auth**: NextAuth admin
- **Response**: `CronStatusResponse` = `{ success: true, jobs: CronJob[] }`
- **Error**: `{ success: false, error }`

### GET /api/cron/history
- **Auth**: NextAuth admin
- **Query**: `?limit, offset`
- **Response**: `CronHistoryResponse` = `{ success: true, history: CronHistoryEntry[] }`
- **Error**: `{ success: false, error }`

---

## Notification Endpoints

### GET /api/notifications
- **Auth**: NextAuth admin
- **Query**: `?unreadOnly, type, limit, since`
- **Response**: `NotificationListResponse` = `{ success, notifications, unreadCount, categoryCounts }`
- **Error**: `{ error }`

---

## Customer Portal Endpoints

### GET /api/customer/me
- **Auth**: Bearer token (`customer_token`)
- **Response**: `CustomerMeResponse` = `{ success, user: CustomerUser }`
- **Error**: `{ success: false, error }`

### GET /api/customer/invoices
- **Auth**: Bearer token
- **Query**: `?page, limit, status`
- **Response**: `CustomerInvoiceListResponse` = `{ success, data: { invoices, pagination: { page, limit, total, totalPages } } }`
- **Error**: `{ success: false, error }`

### GET /api/customer/wifi
- **Auth**: Bearer token
- **Response**: `CustomerWifiResponse` = `{ success, wifi? }`
- **Error**: `{ success: false, error }`

### POST /api/customer/renewal
- **Auth**: Bearer token
- **Request**: `CustomerRenewPayload`
- **Response**: `CustomerActionResponse` = `{ success, message? }`
- **Error**: `{ success: false, error }`

### POST /api/customer/upgrade
- **Auth**: Bearer token
- **Request**: `CustomerUpgradePayload`
- **Response**: `CustomerActionResponse`
- **Error**: `{ success: false, error }`

### POST /api/customer/topup-direct
- **Auth**: Bearer token
- **Request**: `CustomerTopupDirectPayload`
- **Response**: `CustomerActionResponse`
- **Error**: `{ success: false, error }`

### POST /api/customer/topup-request
- **Auth**: Bearer token
- **Request**: `CustomerTopupRequestPayload`
- **Response**: `CustomerActionResponse`
- **Error**: `{ success: false, error }`

### POST /api/customer/suspend
- **Auth**: Bearer token
- **Response**: `CustomerActionResponse`
- **Error**: `{ success: false, error }`

### GET /api/customer/notifications
- **Auth**: Bearer token
- **Response**: `CustomerNotificationListResponse` = `{ success, notifications }`
- **Error**: `{ success: false, error }`

---

## Agent Portal Endpoints

### GET /api/agent/dashboard
- **Auth**: Bearer token (`agentToken`)
- **Response**: `AgentDashboardResponse` = `{ success, agent, stats?, vouchers?, sessions? }`
- **Error**: `{ success: false, error }`

> **NOTE**: There is no `/api/agent/me` or `/api/agent/vouchers` endpoint. Agent profile and vouchers are returned by `/api/agent/dashboard`. Frontend `agentApi.me()`, `vouchers()`, and `sessions()` were updated to use `/api/agent/dashboard`.

### GET /api/agent/notifications
- **Auth**: Bearer token
- **Query**: `?limit`
- **Response**: `AgentNotificationListResponse` = `{ success, notifications }`
- **Error**: `{ success: false, error }`

### PUT /api/agent/notifications
- **Auth**: Bearer token
- **Request**: `{ id }`
- **Response**: `AgentNotificationActionResponse` = `{ success, message? }`
- **Error**: `{ success: false, error }`

### DELETE /api/agent/notifications
- **Auth**: Bearer token
- **Query**: `?id=xxx`
- **Response**: `AgentNotificationActionResponse`
- **Error**: `{ success: false, error }`

---

## System Endpoints

### GET /api/system/radius
- **Auth**: NextAuth admin
- **Response**: `RadiusStatus` (raw object, may include `success`)
- **Error**: `{ error }`

### POST /api/system/radius
- **Auth**: NextAuth admin
- **Response**: `{ success, message? }`
- **Error**: `{ error }`

---

## BACKEND ISSUES FOUND

### 1. Missing endpoint: /api/pppoe/users/bulk-delete
- **Problem**: Frontend `pppoeApi.bulkDelete()` calls `DELETE /api/pppoe/users/bulk-delete` but this endpoint does not exist in backend.
- **Expected**: `DELETE /api/pppoe/users/bulk-delete` accepting `{ userIds: string[] }`
- **Actual**: 404 — endpoint not found
- **Recommended backend fix**: Add `bulk-delete` route handler, or document that bulk delete should be done via individual `DELETE /api/pppoe/users?id=xxx` calls.

### 2. Missing endpoint: /api/invoices/[id]/pdf
- **Problem**: Frontend `invoiceApi.getPdf()` calls `GET /api/invoices/[id]/pdf` but this endpoint does not exist.
- **Expected**: `GET /api/invoices/[id]/pdf` returning PDF data or `{ success, data }`
- **Actual**: 404 — endpoint not found
- **Recommended backend fix**: Add PDF generation route, or remove frontend call if PDF is generated client-side.

### 3. Missing endpoint: /api/settings (generic)
- **Problem**: Frontend `settingsApi.getSettings()` previously called `/api/settings` but no such route exists.
- **Expected**: A generic settings endpoint or documented scatter of settings endpoints.
- **Actual**: Settings are scattered across `/api/company`, `/api/settings/isolation`, `/api/settings/email`, `/api/settings/genieacs`, `/api/telegram/settings`.
- **Recommended backend fix**: Document the settings endpoint structure. Frontend was updated to use `/api/company`.
- **Status**: Fixed in frontend (Phase 6A).

### 4. Missing endpoint: /api/agent/me and /api/agent/vouchers
- **Problem**: Frontend `agentApi.me()` called `/api/agent/me` and `agentApi.vouchers()` called `/api/agent/vouchers` but these don't exist.
- **Expected**: Agent profile and voucher endpoints.
- **Actual**: Only `/api/agent/dashboard` exists, returning combined data.
- **Recommended backend fix**: Add separate endpoints or document that `/api/agent/dashboard` is the only agent data source.
- **Status**: Fixed in frontend (Phase 6A) — all three methods now call `/api/agent/dashboard`.

### 5. Inconsistent response wrappers
- **Problem**: Backend uses `ok(data)` (no success field) for some endpoints and `{ success: true, data }` for others.
- **Expected**: Consistent response wrapper across all endpoints.
- **Actual**: Mixed — PPPoE/invoices use raw data, manual-payments/transactions/customer use success wrapper.
- **Recommended backend fix**: Standardize on one pattern. Prefer `{ success: true, data }` for consistency.
- **Status**: Frontend types updated to handle both patterns via optional `success?` fields.

### 6. Inconsistent error shapes
- **Problem**: Some endpoints return `{ error }`, others return `{ success: false, error }`.
- **Expected**: Consistent error shape.
- **Actual**: Mixed.
- **Recommended backend fix**: Standardize on `{ success: false, error: string }`.
- **Status**: Frontend `apiAdmin()` handles both via `error.message || error.error` fallback.

### 7. Inconsistent pagination
- **Problem**: Three different pagination patterns exist.
- **Expected**: Consistent `{ total, page, limit, totalPages }`.
- **Actual**: Mixed (standard, offset-based, count-only).
- **Recommended backend fix**: Standardize on `{ total, page, limit, totalPages }`.
- **Status**: Frontend types updated to match each endpoint's actual pattern.
