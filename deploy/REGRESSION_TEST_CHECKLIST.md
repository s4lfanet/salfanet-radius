# Regression Test Checklist — Salfanet Radius Migration

This checklist must be completed on a staging/test VPS before removing
legacy Next.js API routes and cron runner.

## Test Environment

- [ ] Backend running on port 3001 (`pm2 logs salfanet-backend`)
- [ ] Frontend running on port 3000 (`pm2 logs salfanet-frontend`)
- [ ] Nginx proxying `/api/v1/*` → backend, `/` → frontend
- [ ] Database accessible from backend
- [ ] `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001` set in frontend env

## 1. Authentication

- [ ] Admin login via `/api/v1/auth/login` — returns JWT token
- [ ] Customer login (phone + OTP)
- [ ] Agent login
- [ ] Technician login (phone + OTP)
- [ ] Invalid credentials rejected (401)
- [ ] Protected routes reject missing token (401)
- [ ] Protected routes reject invalid token (401)
- [ ] Role-based access control works (admin vs customer vs agent)

## 2. Dashboard & Stats

- [ ] `GET /api/v1/dashboard` — returns admin stats
- [ ] Customer dashboard returns user-specific data
- [ ] Agent dashboard returns agent-specific data

## 3. PPPoE Management

- [ ] `GET /api/v1/pppoe` — list users
- [ ] Create PPPoE user
- [ ] Update PPPoE user
- [ ] Delete PPPoE user
- [ ] PPPoE sync to RADIUS (radcheck + radusergroup)
- [ ] PPPoE profile sync to MikroTik

## 4. Hotspot Management

- [ ] `GET /api/v1/hotspot` — list vouchers
- [ ] Create hotspot voucher
- [ ] Voucher sync to RADIUS
- [ ] Voucher status update (WAITING → ACTIVE → EXPIRED)
- [ ] Hotspot profile management

## 5. Invoices & Billing

- [ ] `GET /api/v1/invoices` — list invoices
- [ ] Create invoice
- [ ] Invoice PDF generation (`/api/v1/export/invoice/:id/pdf`)
- [ ] Invoice Excel export (`/api/v1/export/invoices/excel`)
- [ ] Invoice status update (PENDING → OVERDUE → PAID)
- [ ] Invoice reminder (WhatsApp + Email)

## 6. Payment Gateway

- [ ] `POST /api/v1/payment-gateway/create` — Midtrans payment
- [ ] `POST /api/v1/payment-gateway/create` — Xendit payment
- [ ] `POST /api/v1/payment-gateway/create` — Duitku payment
- [ ] `POST /api/v1/payment-gateway/create` — Tripay payment
- [ ] Payment webhook (`POST /api/v1/payment-gateway/webhook`)
- [ ] Webhook signature verification
- [ ] Manual payment submission
- [ ] Manual payment verification

## 7. Network & MikroTik

- [ ] `GET /api/v1/network/routers` — list routers
- [ ] Router CRUD
- [ ] MikroTik API connection test
- [ ] Router status check (identity + uptime)
- [ ] Router interfaces listing
- [ ] PPPoE session sync from MikroTik
- [ ] Hotspot session disconnect via MikroTik API
- [ ] Setup isolir script
- [ ] Setup RADIUS script

## 8. FreeRADIUS

- [ ] `GET /api/v1/freeradius/status` — service status
- [ ] FreeRADIUS config list
- [ ] FreeRADIUS config read
- [ ] FreeRADIUS config save (with backup + syntax check)
- [ ] FreeRADIUS logs
- [ ] Service start/stop/restart

## 9. OLT/ONU & GenieACS

- [ ] `GET /api/v1/olt` — list OLTs
- [ ] OLT CRUD
- [ ] `GET /api/v1/genieacs/devices` — list devices
- [ ] GenieACS device reboot
- [ ] GenieACS device factory reset
- [ ] OLT polling (ping check)

## 10. VPN Management

- [ ] `GET /api/v1/vpn` — list VPN servers/clients
- [ ] VPN server CRUD
- [ ] VPN client CRUD
- [ ] VPN setup on MikroTik (L2TP/PPTP/SSTP)
- [ ] VPN routing via SSH

## 11. Notifications

- [ ] WhatsApp send (`POST /api/v1/whatsapp/send`)
- [ ] WhatsApp templates CRUD
- [ ] Email send (test email)
- [ ] Email settings update
- [ ] Email templates CRUD
- [ ] Push notification subscribe
- [ ] Push notification send
- [ ] Telegram backup
- [ ] Telegram health check

## 12. Cron Jobs (17 total)

- [ ] `hotspot_sync` — voucher status updates
- [ ] `pppoe_auto_isolir` — expired users isolated
- [ ] `agent_sales` — sales recorded
- [ ] `invoice_generate` — monthly invoices created
- [ ] `invoice_reminder` — WhatsApp + Email sent
- [ ] `invoice_status_update` — PENDING → OVERDUE
- [ ] `notification_check` — counts correct
- [ ] `session_monitor` — active session count
- [ ] `disconnect_sessions` — MikroTik disconnect works
- [ ] `activity_log_cleanup` — old logs deleted
- [ ] `auto_renewal` — balance deducted, expiry extended
- [ ] `webhook_log_cleanup` — old logs deleted
- [ ] `freeradius_health` — service check + auto-restart
- [ ] `pppoe_session_sync` — MikroTik ↔ radacct sync
- [ ] `suspend_check` — suspends activated/restored
- [ ] `cron_history_cleanup` — old history deleted
- [ ] `olt_poll` — OLT reachability checked
- [ ] Verify: no duplicate cron execution (backend + legacy)
- [ ] Verify: `pm2 logs salfanet-backend` shows cron job logs

## 13. Customer Portal

- [ ] Customer login
- [ ] View invoices
- [ ] Pay invoice (payment gateway redirect)
- [ ] View usage history
- [ ] ONT reboot request
- [ ] Suspend request
- [ ] Push notification subscription

## 14. Agent Portal

- [ ] Agent login
- [ ] Generate voucher
- [ ] View voucher list
- [ ] View sales history
- [ ] View commission
- [ ] Deposit management

## 15. Technician Portal

- [ ] Technician login (OTP)
- [ ] View assigned tickets
- [ ] Update ticket status
- [ ] View customer info
- [ ] Upload work order photos

## 16. Settings & Admin

- [ ] Company settings CRUD
- [ ] User management
- [ ] Permission management
- [ ] Isolation settings
- [ ] GenieACS settings
- [ ] Email settings
- [ ] WhatsApp provider management
- [ ] Payment gateway settings
- [ ] Map settings

## 17. Export & Reports

- [ ] Invoice PDF download
- [ ] Invoice Excel export
- [ ] PPPoE users Excel export
- [ ] Hotspot vouchers Excel export
- [ ] Hotspot rekap Excel export

## 18. Activity Logs

- [ ] `GET /api/v1/activity-log` — list logs
- [ ] Activity log created on key actions (login, CRUD, etc.)
- [ ] Activity log cleanup works

## Post-Test Actions

After all tests pass:

- [ ] Stop legacy cron runner: `pm2 stop salfanet-cron`
- [ ] Verify backend cron still runs: `pm2 logs salfanet-backend | grep CRON`
- [ ] Remove `src/app/api/` from frontend
- [ ] Remove `src/server/` from frontend
- [ ] Remove `src/cron/` from frontend
- [ ] Move `prisma/` to backend or shared package
- [ ] Update `frontend/package.json` — remove server-only deps
- [ ] Frontend build without Prisma
- [ ] Full deploy test: `./deploy/deploy.sh`
- [ ] Update PM2 config — remove `salfanet-cron` process
- [ ] Update documentation
