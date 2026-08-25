# Auto Changelog

Auto-generated changelog from git commit history.  
Generated on: 2026-08-26

---

## v5.15.1 — Mobile Scroll Fix (All Portals)

### 2026-08-25

- **cb06f14a** — fix: mobile scroll not reaching bottom on all portals (min-h-screen → min-h-dvh)
  - Replace `min-h-screen` with `min-h-dvh` (dynamic viewport height) in all layout components
  - Add `viewportFit: 'cover'` to viewport for iOS safe area insets
  - Add missing `.safe-area-pb` CSS class used by customer mobile bottom nav
  - Increase customer main bottom padding `pb-20` → `pb-24`
  - Bump version to 5.15.1, update CHANGELOG and README

- **730e4282** — fix: remove static manifest nginx blocks — manifests are dynamic Next.js routes
  - Nginx was serving dynamic Next.js manifest routes as static files, causing 404
  - Removed static manifest location blocks to allow proxy to Next.js

- **6f6ab940** — refactor: consolidate TR-069 parser duplication + rename apiAdmin to apiTechnician for clarity

- **25ec8030** — fix: GenieACS audit findings - field mismatch bug, rate limit, permission consistency, PII logging

- **ffa02bbe** — fix: admin dashboard System Status section light theme visibility

- **7613358c** — feat: dynamic browser tab titles & PWA manifests from company name (white-label)

---

## v5.15.0 — Semantic Color Token Migration & Responsive Layout Improvements

### 2026-08-25

- **9a36b3c8** — feat: semantic color token migration across all 5 portals + responsive layout improvements
  - Migrasi 83 file: hardcoded colors → semantic CSS variables (bg-card, text-foreground, etc.)
  - Fluid typography with `clamp()`, responsive chart heights, fullscreen map picker on mobile
  - Modal max-height with scroll overflow, aria-hidden on mobile sidebars

- **bac23cda** — feat: responsive layout improvements - fluid typography, auto-fit grids, responsive charts, mobile modal/map fullscreen

- **59d834f0** — docs: update FRONTEND_AUDIT.md with v5.15.0 fix statuses and semantic token migration section

- **c1864f3e** — docs: sync README changelog

---

## v5.14.0 — Collector Portal, APK Download Audit & Backend Security/Validation Fixes

### 2026-08-24

- **dc43007d** — v5.14.0: APK download audit (logo integration), version consistency fix, backend security/validation fixes
- **b37cf7cd** — docs: add Collector Portal documentation to README and CHANGELOG
- **c220b0ad** — audit: fix download-apk ZIP to use company logo for icons, filter qris_listener from ZIP links
- **2fd82931** — audit: fix tech profile auth, tickets search+mine filter, isolate-user transaction, isolir OVERDUE, input validation, N+1 batch fetch
- **1cda8931** — harden: transaction wrapping (mark-paid, verify), input validation, N+1 fixes, dashboard perf, route params fix, isolated badge
- **2ccb62dc** — fix: cabut-ONT task creation had no customer picker, just a raw text box
- **d4450509** — feat: dedicated Kelola Kolektor admin page
- **6f0b3af6** — fix: deploy.sh does a clean build (rm -rf .next before next build)
- **86c49102** — feat: admin management for collectors and technicians (both were missing)
- **f17a49e1** — feat: cabut-ONT task workflow (adopted from pmyhome) + 2 IDOR fixes
- **055ddfcd** — fix: deploy scripts use npm instead of pnpm, wrong ports/paths
- **1e49a387** — security: fix critical/high audit findings (auth bypass, RCE, IDOR, XSS, leaked secret)

### 2026-08-21

- **45e0e4f1** — fix: collector isolir API now includes 'isolated' status, not just 'suspended'
- **5889735a** — fix: collector proofs API (no relation query), history API (allow collector auth), admin proofs API
- **fc5df6d5** — feat: add paymentProof model, admin proof verification (approve/reject), fix collector proof status flow
- **c6a81466** — fix: change collectorProof column to MediumText for larger base64 images
- **96d46a76** — feat: add proof of transfer upload in collector billing payment modal
- **dc879b91** — feat: add collector proofs, my-collections, admin collector-settlements pages
- **fee12042** — fix: collector dashboard - include isolated status and OVERDUE invoices in counts
- **086508e1** — fix: collector users API - remove status filter to show all users in area
- **1ba679fe** — fix: remove inventory module (pages, API routes, nav entry)
- **48d1e8e3** — fix: remove admin technicians management page, technicians added via admin users with TECHNICIAN role
- **d6d73e67** — fix: remove admin login href from customer login page
- **aa3f280e** — fix: collector login layout consistency, sidebar company name+logo, dark mode init
- **a4aca27c** — feat: add collector portal with login, billing, settlements, isolir, ONT removal
- **86efe42b** — feat: add Restart Cron Runner button on cron settings page
- **b1761401** — fix: PM2 restart --update-env + make it non-fatal (stderr is informational)
- **0d043312** — fix: skip frontend TS type-check during build (pnpm workspace @types/react hoisting issue)
- **0faf48c3** — fix: use --force on pnpm install to recreate node_modules symlinks for @types/react
- **dcc119c6** — fix: remove CI=true (was skipping dev deps) + hide Update button when up-to-date
- **2151dcc3** — fix: run pnpm install from workspace root instead of subdirectories
- **6ada2bf0** — fix: use clean minimal env for build commands to avoid PM2 interference
- **b4795e31** — fix: clear NODE_OPTIONS entirely for build commands to avoid PM2 conflicts
- **2fbd542e** — fix: override NODE_OPTIONS to 1024MB for build commands (PM2 limits to 400MB)
- **4cf7a740** — fix: find prisma binary in pnpm store dynamically for system update
- **7e07fbc8** — fix: use direct ./node_modules/.bin/prisma path instead of pnpm exec
- **4665c4cb** — fix: use pnpm exec prisma instead of npx + add prisma generate before build
- **d7ebcffd** — fix: increase build timeout to 300s + maxDuration 600s for system update API
- **a5f18d41** — fix: set CI=true for pnpm commands to skip interactive prompts in non-TTY
- **427d67fb** — fix: use bash shell + capture full stderr in system update API for better error debugging
- **7f446c4e** — fix: add explicit PATH env to execAsync in system update API for PM2 standalone
- **ef55b272** — feat: always show Update button on system page + remove tmp file
- **c3b27c3d** — remove: delete subdomain routing feature — page, middleware rewrite, nav link, locale
- **8a62fb4b** — fix: add baseUrl to company API + fix subdomain page to read correct response shape
- **ea1ebbb4** — fix: cron-lock.service.ts use relative imports instead of @/ aliases for tsx compatibility
- **42d187c8** — perf: remove hotspot live traffic monitoring — CPU optimization, keep online/offline + sync only
- **c258a822** — fix: Router type fix in PPPoE stats card
- **5ddd0f00** — perf: remove PPPoE live traffic monitoring — CPU optimization, keep online/offline + sync only
- **f1ac675c** — fix: PPPoE download/upload swapped (rx=upload, tx=download) + move live overlay after MikroTik merge
- **ad84d710** — fix: PPPoE live traffic overlay from MikroTik API — download/upload now updates in real-time
- **2d12067f** — feat: QRIS V2 signature (HMAC-SHA256), collision-safe unique amount, server-side dedup, atomic settlement, APK V2 signing + watchdog fix
- **aad5661b** — fix: PPPoE byte counters — fetch from /interface/print (pppoe-in) since /ppp/active/print has no rx-byte/tx-byte
- **5f3ef9e0** — fix: uptime format — add days support across all session pages (admin + technician)
- **4eac59ed** — fix: technician monitor — fetch local-auth MikroTik sessions (download/upload data) and fix uptime format to support days
- **c84918a1** — fix: rate limiter EXPIRE NX not supported on Redis 6 (caused permanent login lockout) — use Lua script for atomic INCR+EXPIRE, skip localhost rate limiting
- **064350f4** — fix: remove hardcoded SALFANET RADIUS fallback in public company endpoint
- **0a16cb33** — fix: logo 401 (remove auth) + hardcoded company name in sidebar (fetch all company fields on init)

### 2026-08-18

- **e48bf10e** — refactor: move agent-report nav to Agen submenu, use hotspot.view permission
- **c285e762** — fix: calculate expiresAt on MikroTik local mode voucher activation
- **4aa3e528** — fix: voucher status sync & agent sales recording
- **5d78e16b** — feat: add agent/reseller daily & monthly report page
- **881ed66d** — fix: timezone consistency — use nowWIB() in RADIUS routes & MikroTik sync
- **21369d29** — fix: ecosystem cron use tsx binary with interpreter none

---

## v5.13.0 — MikroTik Local-Only Voucher Sync

### 2026-08-17

- **ad4f43e8** — fix: add MikroTik cleanup to delete-multiple and [id] routes
- **abb8210a** — fix: batch delete MikroTik cleanup now awaited + single connection per router
- **b47bd444** — fix: add salfanet: comment marker to identify system-generated vouchers
- **d84e3474** — feat: add cleanup-mikrotik endpoint to remove orphaned hotspot users
- **86f14867** — fix: batch delete missing routerId for MikroTik cleanup + add trace logging
- **55078089** — fix: node-routeros !empty crashes process — fetch all + JS filter instead
- **0d3b2d28** — fix: voucher generation blocking + node-routeros !empty exception
- **5f5c331b** — feat: add MikroTik local voucher sync + status tracking cron job
- **275e2b8a** — feat: add MikroTik local router sync for hotspot profiles
- **c281671a** — feat: add configurable unique amount (angka unik) settings for QRIS Mandiri
- **82a2077f** — fix: add server-side amount parsing fallback for QRIS notify
- **c124792b** — fix: correct placeholder URL to /api/payment/qris-notify, add POST_NOTIFICATIONS permission
- **439ec1b9** — fix: add missing Intent import in QrisNotificationListener and QrisWatchdogWorker generators
- **ef309d65** — feat: replace QRIS listener generators with mature version
- **9aa8c132** — feat: add WatchdogService (foreground service + AlarmManager + requestRebind) to QRIS Listener
- **ab2b6b65** — fix: orderId ReferenceError in qris_own block + add manual/cash/transfer offline payment support
- **6a779d63** — fix: APK build timestamps now use WIB (+7 offset) to match formatWIB display
- **f6dd403d** — fix: Kotlin regex escaping, newline escaping, String? type mismatch in QRIS Listener
- **0ee8489d** — fix: escape Kotlin dollar-brace interpolation in template literals to prevent JS eval
- **ee4f35ba** — fix: Kotlin string interpolation escaping in QRIS Listener generators
- **57edc409** — fix: hardcode absolute path for gradle-wrapper.jar — PM2 cwd is standalone/backend
- **33a91796** — fix: gradle-wrapper.jar path for APK build
- **ec799803** — fix: APK status/file 400 for qris_listener + subdomain routing middleware + nginx config
- **71bdd1fb** — feat: QRIS Mandiri end-to-end — frontend QR display+polling, admin config API, QRIS Listener APK
- **f2b0e3c9** — feat: add forceSyncMikrotik checkbox in edit pelanggan — sync PPPoE secret to MikroTik on demand
- **4b5bcbab** — fix: sync-radius 500 on empty body — sync all profiles when no id provided
- **f4f54df4** — release: v5.12.0 — QRIS Mandiri, Auto-Update System, Installer Fixes
- **8a38f01d** — chore: remove debug scripts from repo
- **f2cff088** — feat: auto-version from git commit count + show branch, total commits, behind count in system page
- **4fe67338** — fix: showConfirm signature and regex flag for TS compatibility
- **f3479445** — feat: add auto-changelog and manual update from admin/system page
- **196a68cb** — fix: add port 8080 to UFW firewall rules in all installer scripts

---

## Statistics

- Total commits since v5.13.0: 80+
- Versions covered: v5.13.0 → v5.14.0 → v5.15.0 → v5.15.1
- Current version: 5.15.1
- Last generated: 2026-08-26
