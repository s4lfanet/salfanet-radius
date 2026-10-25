# Timezone Consistency & Voucher Expiration Fix

**Date:** December 28, 2025  
**Version:** 2.9.2  
**Issue:** Vouchers yang sudah expired masih menampilkan status "AKTIF" di sistem  
**Root Cause:** Timezone inconsistency antara database storage (WIB) dan query comparison (UTC)

---

## 🏗️ Timezone Consistency Architecture

### Overview
Untuk memastikan waktu konsisten di seluruh sistem, SEMUA komponen harus menggunakan timezone yang sama:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIMEZONE CONSISTENCY                          │
├─────────────────────────────────────────────────────────────────┤
│  1. SYSTEM (timedatectl)     →  Asia/Jakarta (WIB, UTC+7)       │
│  2. MySQL (time_zone)        →  +07:00 (matching system)        │
│  3. Node.js/PM2 (TZ env)     →  Asia/Jakarta                    │
│  4. FreeRADIUS (uses system) →  Asia/Jakarta (automatic)        │
│  5. Application (.env)       →  NEXT_PUBLIC_TIMEZONE=Asia/Jakarta│
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Locations

| Component | Config File | Setting |
|-----------|-------------|---------|
| System | timedatectl | `timedatectl set-timezone Asia/Jakarta` |
| MySQL | `/etc/mysql/mysql.conf.d/timezone.cnf` | `default-time-zone = '+07:00'` |
| Node.js | `.env` | `TZ="Asia/Jakarta"` |
| PM2 | `ecosystem.config.js` | `env: { TZ: 'Asia/Jakarta' }` |
| App | `.env` | `NEXT_PUBLIC_TIMEZONE="Asia/Jakarta"` |
| NTP | `/etc/chrony/chrony.conf` | Indonesian NTP servers |

---

## Problem Analysis

### Symptom
- Voucher dengan `expiresAt` yang sudah lewat masih menunjukkan status `ACTIVE`
- User melaporkan voucher dengan "Berlaku Sampai" yang sudah lewat masih tampil sebagai "AKTIF"

### Root Cause
1. **Database timezone**: MySQL menggunakan `SYSTEM` timezone = WIB (UTC+7)
2. **Storage behavior**: `firstLoginAt` dan `expiresAt` disimpan dalam WIB (server local time)
   - Line 59-90 di `src/lib/cron/voucher-sync.ts`
   - Data dari FreeRADIUS `radacct.acctstarttime` sudah dalam WIB
3. **Query comparison**: Line 262-265 menggunakan `UTC_TIMESTAMP()` untuk check expiration
   - Membandingkan WIB datetime dengan UTC datetime
   - Selisih 7 jam menyebabkan voucher kelihatan belum expired

### Example
Voucher `ELRQNC`:
- First Login: `2025-12-28 05:23:16` (WIB)
- Expires At: `2025-12-28 07:23:16` (WIB) 
- Current Time: `2025-12-28 09:41` (WIB)
- UTC Time: `2025-12-28 02:41` (UTC)

**OLD Query (SALAH):**
```sql
WHERE expiresAt < UTC_TIMESTAMP()
-- 07:23 < 02:41 = FALSE ❌
```

**NEW Query (BENAR):**
```sql
WHERE expiresAt < NOW()
-- 07:23 < 09:41 = TRUE ✅
```

## Solution

### File Changed
**`src/lib/cron/voucher-sync.ts`** - Line 259-267

### Change Made
```diff
-    // Method 1: Expired by validity time (expiresAt < NOW)
+    // Method 1: Expired by validity time (expiresAt < NOW)
+    // IMPORTANT: Use NOW() not UTC_TIMESTAMP() because expiresAt is stored in server local time (WIB)
+    // firstLoginAt comes from FreeRADIUS radacct which uses server local time
     const expiredByValidity = await prisma.$queryRaw<Array<{code: string; id: string}>>`
       SELECT code, id FROM hotspot_vouchers
       WHERE status = 'ACTIVE'
-        AND expiresAt < UTC_TIMESTAMP()
+        AND expiresAt < NOW()
     `
```

## Testing Results

### Before Fix
```sql
SELECT code, status, expiresAt FROM hotspot_vouchers WHERE code = 'ELRQNC';
-- code   | status | expiresAt
-- ELRQNC | ACTIVE | 2025-12-28 07:23:16.000
-- (Status masih ACTIVE padahal sudah expired 2+ jam!)
```

### After Fix
```sql
SELECT code, status, expiresAt FROM hotspot_vouchers WHERE code = 'ELRQNC';
-- code   | status  | expiresAt
-- ELRQNC | EXPIRED | 2025-12-28 07:23:16.000
-- ✅ Status sudah EXPIRED dengan benar!
```

### Verification Query
```sql
-- Test query untuk menemukan expired vouchers
SELECT code, status, expiresAt, NOW() as now_time
FROM hotspot_vouchers
WHERE status = 'ACTIVE'
  AND expiresAt < NOW();
-- ✅ Query ini sekarang menemukan vouchers yang benar-benar expired
```

## Deployment Steps

1. **Update source code:**
   ```bash
   # Edit src/lib/cron/voucher-sync.ts (line 259-267)
   ```

2. **Upload to VPS:**
   ```powershell
   pscp -pw "your-password" src/lib/cron/voucher-sync.ts root@103.151.140.110:/var/www/salfanet-radius/src/lib/cron/
   ```

3. **Rebuild aplikasi:**
   ```bash
   cd /var/www/salfanet-radius
   npm run build
   ```

4. **Restart PM2:**
   ```bash
   pm2 restart salfanet-backend
   ```

5. **Verify:**
   ```bash
   # Check cron logs
   pm2 logs salfanet-backend --lines 50
   
   # Or manually check database
   mysql -usalfanet_user -psalfanetradius123 salfanet_radius \
     -e "SELECT COUNT(*) FROM hotspot_vouchers WHERE status='ACTIVE' AND expiresAt < NOW()"
   ```

## Impact

✅ **Fixed Issues:**
- Vouchers yang expired akan otomatis diupdate statusnya menjadi EXPIRED setiap cron run (setiap menit)
- Status yang ditampilkan di UI sekarang akurat
- User tidak bisa login dengan voucher expired
- Disconnect otomatis via CoA untuk session yang masih aktif

✅ **No Breaking Changes:**
- Existing voucher data tidak perlu diubah
- Cron schedule tetap sama (every minute)
- API endpoints tetap berfungsi normal

## Notes

### Timezone Consistency Rules
Untuk menghindari issue serupa di masa depan:

1. **Database Storage:**
   - MySQL timezone = SYSTEM (WIB)
   - Store datetime AS-IS dari FreeRADIUS (sudah WIB)
   - Use `NOW()` for local time comparisons

2. **Date Comparisons:**
   - Always use `NOW()` when comparing with stored datetimes
   - Use `UTC_TIMESTAMP()` only if storing UTC explicitly
   - Document timezone in code comments

3. **FreeRADIUS Integration:**
   - `radacct.acctstarttime` is in server local time (WIB)
   - No conversion needed when storing to database
   - Use directly for `firstLoginAt` and `expiresAt` calculation

### Related Files
- `src/lib/cron/voucher-sync.ts` - Main voucher sync cron (FIXED)
- `src/lib/timezone.ts` - Timezone utility functions
- `src/app/api/hotspot/vouchers/validate/route.ts` - Voucher validation API

## Author
Fixed by: GitHub Copilot  
Date: December 28, 2025  
VPS: 103.151.140.110  
Application Path: `/var/www/salfanet-radius`
