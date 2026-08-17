# Auto Changelog

Auto-generated changelog from git commit history.  
Generated on: 2026-08-17

---

## Recent Commits (v5.13.0 — MikroTik Local-Only Voucher Sync)

### 2026-08-17

- **e1fccc2f** — fix: add MikroTik cleanup to delete-multiple and [id] routes
  - delete-multiple route: add `removeBatchVouchersFromMikrotik` per router
  - [id] route: add `removeVoucherFromAllMikrotik` after DB delete
  - Both routes were missing MikroTik cleanup entirely (root cause of deletion issue)

- **7889a309** — fix: batch delete MikroTik cleanup now awaited + single connection per router
  - Add `removeBatchVouchersFromMikrotik`: removes all vouchers in one connection
  - Batch delete now awaits MikroTik cleanup instead of fire-and-forget
  - Fetches users/schedulers/active sessions once, then removes all matches

- **da1efa03** — fix: add `salfanet:` comment marker to identify system-generated vouchers
  - Voucher users in MikroTik now get comment `salfanet:agent-phone-name` or `salfanet:admin`
  - Cleanup only removes users with `salfanet:` comment prefix
  - Prevents accidental deletion of manually created MikroTik users

- **43bc1d89** — feat: add cleanup-mikrotik endpoint to remove orphaned hotspot users
  - `cleanupOrphanedMikrotikUsers`: removes MikroTik users not in DB
  - `cleanupAllOrphanedMikrotikUsers`: runs across all local-only routers
  - `POST /api/hotspot/voucher/cleanup-mikrotik` API endpoint
  - Supports dryRun mode and profileName filter
  - Also removes active sessions + schedulers for orphaned users

- **34c892f7** — fix: MikroTik voucher sync — uncaughtException handler, safeWrite, fetch-all + JS filter
  - Global `uncaughtException` handler for `!empty` errors (node-routeros)
  - `safeWrite` helper for MikroTik API calls
  - Replace filter-based queries with fetch-all + JS filter
  - Fire-and-forget MikroTik sync on voucher generate
  - Add `routerId` to batch delete select query
  - Detailed `[MT_REMOVE]` and `[MT_BATCH_REMOVE]` logging
  - Add `hotspot_voucher_sync` cron job case

---

## Statistics

- Total commits in this release: 5
- Files changed: 8
- Lines added: ~400+
- Lines modified: ~50+
