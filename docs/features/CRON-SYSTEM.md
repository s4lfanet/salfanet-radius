# SALFANET RADIUS - Cron Job System Documentation

## Overview

SALFANET RADIUS menjalankan **27 job terjadwal** untuk perawatan dan operasional otomatis (isolir, invoice, pengingat, sinkronisasi RADIUS/MikroTik, pembersihan log, backup). Penjadwal adalah proses PM2 terpisah (`salfanet-cron`) yang hanya memanggil API; logika tiap job ada di backend.

## Architecture

```
backend/
├── cron-runner.ts                    # Penjadwal (node-cron) + lock + riwayat + catch-up
└── src/
    ├── app/api/cron/
    │   ├── route.ts                  # POST: jalankan satu job. GET: riwayat
    │   ├── status/route.ts           # Status semua job untuk halaman Cron
    │   └── schedules/route.ts        # Ubah jadwal atau nonaktifkan job
    └── server/
        ├── cron/
        │   ├── jobs.ts               # Daftar job, jadwal bawaan, status, jadwal efektif
        │   ├── invoice-jobs.ts       # Invoice, pengingat, auto renewal, suspend
        │   ├── auto-isolir.ts        # Isolir dan auto stop
        │   ├── additional-jobs.ts    # Hotspot, agen, sesi
        │   ├── financial-reconciliation.ts
        │   └── telegram-backup.ts
        └── services/cron-lock.service.ts   # Lock terdistribusi (tabel cronLock)

prisma/schema.prisma: cronHistory (riwayat), cronScheduleConfig (jadwal yang diubah admin), cronLock
```

### Alur satu run terjadwal

1. node-cron memicu job pada waktunya, dalam **zona waktu perusahaan** (bukan zona VPS).
2. Runner mengambil **lock** di database (TTL 10 menit, diperpanjang tiap 3 menit selama job berjalan). Kalau lock dipegang proses lain, run dilewati.
3. Runner menulis satu baris `cronHistory` berstatus `running`.
4. Runner memanggil `POST http://127.0.0.1:3001/api/cron` dengan header `x-cron-secret`. Alamat IPv4 dipakai langsung karena `localhost` bisa mengarah ke IPv6 lebih dulu sementara API hanya mendengarkan di IPv4. Bila sambungan gagal sebelum terhubung (`ECONNREFUSED`, `ETIMEDOUT`, dan sejenisnya), runner mencoba sekali lagi setelah 2 detik; kegagalan lain tidak diulang supaya job tidak jalan dua kali.
5. API menjalankan job. Pada panggilan dari runner, API **tidak** mengambil lock lagi dan **tidak** menulis baris riwayat kedua.
6. Runner mengisi baris riwayat: `success` atau `error`, durasi, dan hasil (maksimal 1000 karakter). Bila lock hilang di tengah jalan, run dicatat `error` (`LOCK_LOST`) agar tidak dianggap sah.

Timeout per job (detik): `invoice_reminder` 3300, `telegram_backup` dan `radpostauth_cleanup` 900, `invoice_generate`, `radius_reconciliation`, dan `external_task_processor` 300, `radius_sync_retry`, `pppoe_session_sync`, `auto_renewal`, `auto_stop`, `notification_check`, dan `session_monitor` 180, selain itu 120.

## Daftar Job

| Job | Jadwal bawaan | Fungsi |
|-----|---------------|--------|
| hotspot_sync | `* * * * *` | Sinkronisasi voucher hotspot aktif dan kedaluwarsa |
| external_task_processor | `* * * * *` | Memproses antrean tugas keluar (MikroTik, WhatsApp, email, CoA) |
| agent_sales | `*/5 * * * *` | Mencatat penjualan voucher agen |
| disconnect_sessions | `*/5 * * * *` | Memutus sesi pelanggan isolir atau stop |
| pppoe_session_sync | `*/5 * * * *` | Sinkronisasi sesi PPPoE MikroTik ke radacct |
| radius_sync_retry | `*/5 * * * *` | Mengulang sinkronisasi FreeRADIUS yang gagal |
| freeradius_health | `*/5 * * * *` | Cek layanan FreeRADIUS |
| hotspot_voucher_sync | `*/5 * * * *` | Status voucher dari router mode local-only |
| olt_poll | `*/5 * * * *` | Polling semua OLT (status, ONU, daya optik) |
| telegram_backup | `*/5 * * * *` | Backup database ke Telegram sesuai jadwal di Pengaturan Telegram (job memeriksa jadwal itu tiap 5 menit) |
| acs_alert | `*/3 * * * *` | Penurunan RX dan ONU offline dari GenieACS |
| session_monitor | `*/15 * * * *` | Sesi mencurigakan |
| pppoe_auto_isolir | `0 * * * *` | Isolir pelanggan prabayar yang kedaluwarsa |
| invoice_reminder | `0 * * * *` | Pengingat invoice lewat WhatsApp, email, dan push (lihat di bawah) |
| invoice_status_update | `0 * * * *` | PENDING menjadi OVERDUE setelah jatuh tempo |
| suspend_check | `0 * * * *` | Pelanggan yang perlu disuspend |
| notification_check | `0 */6 * * *` | Notifikasi admin: invoice terlambat, pelanggan kedaluwarsa, pendaftaran menunggu |
| activity_log_cleanup | `0 2 * * *` | Hapus log aktivitas lebih dari 30 hari, dan notifikasi kolektor (dibaca lebih dari 30 hari, atau belum dibaca lebih dari 60 hari) |
| webhook_log_cleanup | `0 3 * * *` | Hapus log webhook lebih dari 7 hari |
| radpostauth_cleanup | `30 3 * * *` | Hapus log autentikasi RADIUS lebih dari 30 hari, per batch |
| cron_history_cleanup | `0 4 * * *` | Hapus riwayat cron lebih dari 30 hari |
| financial_reconciliation | `0 5 * * *` | Kecocokan invoice dan pembayaran |
| auto_stop | `0 5 * * *` | Menghentikan pelanggan yang terisolir lebih dari 30 hari dan menghapusnya dari RADIUS. **Nonaktif bawaan**, diaktifkan admin di halaman Cron |
| invoice_auto_cancel | `0 6 * * *` | Batalkan invoice basi bila pelanggan sudah memperpanjang |
| radius_reconciliation | `0 6 * * *` | Selisih data SalfaNet dan FreeRADIUS, dan perbaikan profil yang tertinggal di isolir |
| invoice_generate | `0 7 * * *` | Buat invoice bulanan pelanggan pascabayar |
| auto_renewal | `0 8 * * *` | Perpanjang otomatis pelanggan prabayar dari saldo |

Daftar dan jadwal bawaan ada di `backend/src/server/cron/jobs.ts` (`CRON_JOB_DEFS`). Penjadwal membaca daftar yang sama di `backend/cron-runner.ts`; job baru harus ada di kedua tempat, dan `defaultEnabled: false` menandai job yang mati sampai admin menyalakannya.

## Jadwal dan Pengaturan

- **Settings > Cron** menampilkan status, jadwal berikutnya, dan riwayat tiap job. Jadwal bisa diubah atau job dinonaktifkan; perubahan disimpan di `cronScheduleConfig` dan dibaca runner saat start, jadi gunakan tombol restart cron di halaman itu (atau `pm2 restart salfanet-cron`) agar jadwal baru berlaku.
- Jam dan hari dalam jadwal mengikuti zona waktu perusahaan (Pengaturan Perusahaan).

## Mengejar Job yang Terlewat

Penjadwal hanya berjalan saat prosesnya hidup. Saat runner mulai, job harian penting yang jamnya sudah lewat dan belum berhasil hari ini dijalankan sekali: `invoice_generate` (07:00), `auto_renewal` (08:00), `auto_stop` (05:00), `radius_reconciliation` (06:00), `financial_reconciliation` (05:00). Job yang sering berjalan tidak dikejar karena akan sembuh sendiri di putaran berikutnya.

## Pengingat Invoice (`invoice_reminder`)

Jadwalnya diatur di **Pengaturan WhatsApp > Notifikasi**: hari pengingat (selisih dari jatuh tempo: -7 berarti 7 hari sebelumnya, 0 hari H, 3 berarti 3 hari sesudahnya), jam kirim, ukuran batch dan jeda antar batch, serta urutan acak. Satu jadwal dipakai untuk WhatsApp, email (bila Notifikasi invoice menyala di pengaturan email), dan push aplikasi pelanggan.

- Job berjalan tiap jam, tetapi tidak mengirim sebelum jam kirim.
- Setiap invoice menerima tiap saluran paling banyak **sekali per hari pengingat**. Tanda terkirim disimpan di `invoice.sentReminders` (`w:` WhatsApp, `e:` email, `p:` push).
- Bila semua provider WhatsApp gagal, tanda itu dilepas sehingga putaran berikutnya mencoba lagi.
- Hanya invoice yang jatuh tempo tepat pada salah satu hari pengingat yang dikirimi. **Invoice yang sudah lewat jatuh tempo tidak diingatkan bila pengaturan tidak punya hari H+** (misalnya H+1 atau H+3).
- Run memakai anggaran 50 menit; sisa pekerjaan dilanjutkan di putaran berikutnya.

Hasil run (di riwayat dan di notifikasi hasil test manual) memuat `sent`, `skipped`, `total`, dan `note` berisi alasan bila tidak ada yang terkirim: tidak ada invoice di hari pengingat (disertai jumlah invoice belum lunas dan tanggal pengingat berikutnya), sudah dikirim hari ini, tanpa nomor HP, template `invoice-reminder` atau `invoice-overdue` tidak aktif, provider WhatsApp gagal, atau tidak ada provider aktif.

## Menjalankan Manual

### Dari panel admin

Settings > Cron, tombol **Jalankan Sekarang** pada job (khusus Super Admin). Hasilnya muncul sebagai notifikasi singkat yang menyebut ringkasan, misalnya "terkirim 0 dari 1; 1 gagal dikirim provider WhatsApp".

- Run manual mengambil lock sendiri (jika job sedang berjalan, jawabannya 409) dan menulis baris riwayatnya sendiri.
- Khusus `invoice_reminder`, run manual tidak menunggu jam kirim, tetapi tetap hanya untuk invoice di hari pengingat dan tetap maksimal sekali per hari.

### Dari API

```bash
curl -X POST http://127.0.0.1:3001/api/cron \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"type":"invoice_reminder"}'
```

`CRON_SECRET` wajib di produksi; tanpa itu API menolak. Nilainya dibandingkan dengan perbandingan waktu-konstan dan tidak pernah ditampilkan.

### Dari server

```bash
npx tsx backend/cron-runner.ts --job=invoice_reminder
```

## Riwayat Eksekusi

Tabel `cronHistory`: `jobType`, `status` (`running`, `success`, `error`), `startedAt`, `completedAt`, `duration`, `result`, `error`.

- Satu baris per run terjadwal (ditulis runner) dan satu baris per run manual (ditulis API).
- Baris yang tertinggal `running` karena proses dimulai ulang di tengah job (misalnya saat update) ditandai `error` dengan pesan *Interrupted (process restarted before job finished)* oleh runner saat start dan tiap 15 menit sesudahnya, bila umurnya melebihi timeout job terpanjang.
- `cron_history_cleanup` menghapus riwayat lebih dari 30 hari.


## Troubleshooting

### Cron Jobs Not Running

**Pastikan proses penjadwal hidup dan jobnya terdaftar:**
```bash
pm2 status salfanet-cron
pm2 logs salfanet-cron --lines 50
```
Saat start, runner mencetak satu baris per job (`[OK]` terjadwal, `[SKIP]` nonaktif, `[ERR]` jadwal tidak valid) dan jumlah job yang terjadwal.

**Pesan di riwayat:**

| Pesan | Artinya |
|-------|---------|
| `HTTP request failed: ECONNREFUSED ...` | API (`salfanet-backend`, port 3001) belum atau tidak hidup saat job dipicu. Periksa `pm2 status` dan `CRON_API_URL` |
| `Job timeout after Ns` | Job melewati batas waktunya (lihat daftar timeout di atas) |
| `Interrupted (process restarted before job finished)` | Proses dimulai ulang di tengah job, misalnya saat update. Wajar, run berikutnya berjalan normal |
| `LOCK_LOST ...` | Lock job hilang di tengah run; hasilnya tidak dianggap sah |
| `DB lock failed (production)` | Runner tidak bisa mengambil lock; di produksi job tidak dijalankan |
| `Server configuration error` | `CRON_SECRET` belum diisi di `.env` backend |

### "nowWIB is not defined" Error

**Fixed in v2.3.1**

**Solution:** Ensure all cron files import timezone utilities:
```typescript
import { nowWIB, formatWIB, startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone'
```

### Cron History Not Recording

**Check function pattern:**
```typescript
// ✅ CORRECT - Records history
export async function myCronJob() {
  const history = await prisma.cronHistory.create({ ... })
  // ... job logic ...
  await prisma.cronHistory.update({ ... })
}

// ❌ WRONG - No history recording
export async function myCronJob() {
  // ... job logic only ...
  return result
}
```

### CoA Disconnect Not Working

**Check FreeRADIUS CoA configuration:**
```bash
# Verify CoA port open
netstat -tulpn | grep 3799

# Check clients.conf
cat /etc/freeradius/3.0/clients.conf
# Must have: coa_server = 127.0.0.1:3799
```

**Check router NAS configuration:**
```sql
SELECT * FROM nas WHERE coa_port IS NOT NULL;
```

**Test CoA manually:**
```bash
echo "User-Name=vouchercode" | radclient -x 127.0.0.1:3799 disconnect testing123
```

## Multi-Timezone Support

### Indonesia Timezone Regions

Indonesia memiliki 3 timezone berbeda:

| Zona | Nama | UTC Offset | Wilayah | TZ Identifier |
|------|------|------------|---------|---------------|
| **WIB** | Waktu Indonesia Barat | UTC+7 | Sumatera, Jawa, Kalimantan Barat/Tengah | `Asia/Jakarta` |
| **WITA** | Waktu Indonesia Tengah | UTC+8 | Kalimantan Selatan/Timur, Sulawesi, Bali, NTB, NTT | `Asia/Makassar` |
| **WIT** | Waktu Indonesia Timur | UTC+9 | Maluku, Papua | `Asia/Jayapura` |

### Configuration Steps for Different Timezone

#### 1. Update Server System Timezone

```bash
# Untuk WIB (Jakarta, Sumatera, Jawa)
sudo timedatectl set-timezone Asia/Jakarta

# Untuk WITA (Makassar, Bali, Sulawesi)
sudo timedatectl set-timezone Asia/Makassar

# Untuk WIT (Papua, Maluku)
sudo timedatectl set-timezone Asia/Jayapura

# Verifikasi
timedatectl
```

#### 2. Update PM2 Environment

Edit `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'salfanet-radius',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Pilih sesuai wilayah:
      TZ: 'Asia/Jakarta'   // WIB (UTC+7)
      // TZ: 'Asia/Makassar'  // WITA (UTC+8)
      // TZ: 'Asia/Jayapura'  // WIT (UTC+9)
    }
  }]
}
```

#### 3. Update Application Environment Variables

Edit `.env`:

```bash
# Timezone Configuration
TZ="Asia/Jakarta"                    # Sesuaikan: Jakarta/Makassar/Jayapura
NEXT_PUBLIC_TIMEZONE="Asia/Jakarta"  # Untuk display di frontend

# Date-fns timezone identifier
TIMEZONE_IDENTIFIER="Asia/Jakarta"   # Sesuaikan dengan wilayah
```

#### 4. Update Timezone Utility Constants

Edit `src/lib/timezone.ts`:

```typescript
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

// Pilih timezone sesuai wilayah:
export const LOCAL_TIMEZONE = 'Asia/Jakarta'   // WIB
// export const LOCAL_TIMEZONE = 'Asia/Makassar'  // WITA
// export const LOCAL_TIMEZONE = 'Asia/Jayapura'  // WIT

// Alias untuk backward compatibility
export const WIB_TIMEZONE = LOCAL_TIMEZONE

// Timezone-aware helper functions
export function nowLocal() {
  return toZonedTime(new Date(), LOCAL_TIMEZONE)
}

export function formatLocal(date: Date, format: string = 'yyyy-MM-dd HH:mm:ss') {
  return formatInTimeZone(date, LOCAL_TIMEZONE, format)
}
```

#### 5. Update API Routes (Contoh: Voucher)

Edit `src/app/api/hotspot/voucher/route.ts`:

```typescript
import { formatInTimeZone } from 'date-fns-tz'
import { LOCAL_TIMEZONE } from '@/lib/timezone'  // Akan otomatis menggunakan timezone yang di-set

const vouchersWithLocalTime = vouchers.map(v => ({
  ...v,
  // Convert UTC → Local Timezone (Jakarta/Makassar/Jayapura)
  createdAt: formatInTimeZone(v.createdAt, LOCAL_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
  updatedAt: formatInTimeZone(v.updatedAt, LOCAL_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
  // FreeRADIUS already stores in local timezone
  firstLoginAt: v.firstLoginAt ? v.firstLoginAt.toISOString().replace('Z', '') : null,
  expiresAt: v.expiresAt ? v.expiresAt.toISOString().replace('Z', '') : null,
}))
```

#### 6. Restart Services

```bash
# Restart PM2 dengan environment baru
pm2 restart ecosystem.config.js --update-env
pm2 save

# Restart FreeRADIUS
sudo systemctl restart freeradius

# Verify timezone
pm2 env 0 | grep TZ
date
```

### International Timezone Examples

Untuk deployment di luar Indonesia:

| Negara | Timezone | TZ Identifier |
|--------|----------|---------------|
| Singapura | SGT (UTC+8) | `Asia/Singapore` |
| Malaysia | MYT (UTC+8) | `Asia/Kuala_Lumpur` |
| Thailand | ICT (UTC+7) | `Asia/Bangkok` |
| Filipina | PHT (UTC+8) | `Asia/Manila` |
| Vietnam | ICT (UTC+7) | `Asia/Ho_Chi_Minh` |
| Australia (Sydney) | AEDT (UTC+11) | `Australia/Sydney` |
| India | IST (UTC+5:30) | `Asia/Kolkata` |

### Testing Timezone Configuration

```bash
# 1. Test system timezone
date
timedatectl

# 2. Test PM2 environment
pm2 env 0 | grep TZ

# 3. Test Node.js timezone
node -e "console.log(new Date().toString())"

# 4. Test database timezone
mysql -u salfanet_user -psalfanetradius123 salfanet_radius -e "SELECT NOW(), UTC_TIMESTAMP();"

# 5. Test FreeRADIUS logs
tail -f /var/log/freeradius/radius.log
# Log timestamps should match server timezone
```

### Multi-Region Deployment

Jika Anda deploy di multiple region dengan timezone berbeda:

**Option 1: Separate Instances (Recommended)**
```bash
# VPS Jakarta (WIB)
TZ=Asia/Jakarta pm2 start ecosystem.config.js --name SALFANET-wib

# VPS Makassar (WITA)
TZ=Asia/Makassar pm2 start ecosystem.config.js --name SALFANET-wita

# VPS Papua (WIT)
TZ=Asia/Jayapura pm2 start ecosystem.config.js --name SALFANET-wit
```

**Option 2: Single Instance with Dynamic Timezone**
```typescript
// src/lib/timezone.ts
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

// Get timezone from environment or default to Jakarta
export const LOCAL_TIMEZONE = process.env.TZ || 
                              process.env.TIMEZONE_IDENTIFIER || 
                              'Asia/Jakarta'

console.log(`[TIMEZONE] Using ${LOCAL_TIMEZONE}`)
```

### Troubleshooting Timezone Issues

#### Issue 1: Times still showing wrong after timezone change

**Solution:**
```bash
# 1. Clear PM2 cache
pm2 delete all
pm2 kill

# 2. Update ecosystem.config.js with new TZ
# 3. Restart fresh
pm2 start ecosystem.config.js
pm2 save

# 4. Clear browser cache
# Press Ctrl+Shift+Delete, clear all cache
```

#### Issue 2: Cron jobs running at wrong time

**Cause:** Cron schedule uses server local time, but PM2 environment might be different.

**Solution:**
```bash
# Make sure server timezone matches PM2 TZ
sudo timedatectl set-timezone Asia/Jakarta  # Or your timezone
pm2 restart ecosystem.config.js --update-env

# Verify both match
date
pm2 env 0 | grep TZ
```

#### Issue 3: Database and display times don't match

**Cause:** Database stores UTC, but conversion to local timezone is incorrect.

**Solution:**
```typescript
// Always use formatInTimeZone for UTC → Local conversion
import { formatInTimeZone } from 'date-fns-tz'
import { LOCAL_TIMEZONE } from '@/lib/timezone'

// ✅ CORRECT
const localTime = formatInTimeZone(utcDate, LOCAL_TIMEZONE, 'yyyy-MM-dd HH:mm:ss')

// ❌ WRONG - Assumes WIB
const localTime = formatInTimeZone(utcDate, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
```

### Configuration Checklist

When deploying to a new timezone:

- [ ] Set server system timezone (`timedatectl set-timezone`)
- [ ] Update `ecosystem.config.js` TZ environment variable
- [ ] Update `.env` TZ and NEXT_PUBLIC_TIMEZONE
- [ ] Update `src/lib/timezone.ts` LOCAL_TIMEZONE constant
- [ ] Restart PM2 with `--update-env` flag
- [ ] Restart FreeRADIUS service
- [ ] Test voucher generation time
- [ ] Test dashboard statistics date ranges
- [ ] Test cron job execution times
- [ ] Verify all displayed times match server local time
- [ ] Clear browser cache and re-login

## Best Practices

### 1. Always Record History

Every cron job must create and update `cronHistory` records for visibility and debugging.

### 2. Use Timezone Utilities

Always use timezone-aware functions:
```typescript
import { nowLocal, formatLocal, LOCAL_TIMEZONE } from '@/lib/timezone'

// ✅ CORRECT - Works for any timezone
const now = nowLocal()
const formatted = formatLocal(date, 'yyyy-MM-dd HH:mm:ss')

// ❌ WRONG - Hardcoded WIB
const now = nowWIB()  // Only works for Jakarta timezone
```

### 3. Handle Errors Gracefully

```typescript
try {
  const result = await riskyOperation()
  return { success: true, ...result }
} catch (error: any) {
  console.error('[CRON ERROR]', error)
  return { success: false, error: error.message }
}
```

### 4. Use Batching for Large Operations

```typescript
// Process in batches to prevent memory issues
const BATCH_SIZE = 1000
const total = await prisma.model.count()

for (let offset = 0; offset < total; offset += BATCH_SIZE) {
  const batch = await prisma.model.findMany({
    skip: offset,
    take: BATCH_SIZE
  })
  await processBatch(batch)
}
```

### 5. Add Result Messages

```typescript
// ✅ GOOD - Descriptive result
result: `Disconnected ${count} expired sessions`

// ❌ BAD - Generic result
result: 'Success'
```

## Future Enhancements

- [x] Enable/disable toggle for each job in UI (Settings > Cron)
- [x] Custom schedule configuration via admin panel
- [ ] Email notifications for cron failures
- [ ] Job dependency management (run job B after job A)
- [ ] Parallel execution for independent jobs
- [ ] Retry mechanism for failed jobs
- [ ] Job execution statistics (average duration, success rate)

## Related Documentation

- [Timezone Architecture](../README.md#-timezone--date-handling)
- [Activity Log System](./ACTIVITY_LOG_IMPLEMENTATION.md)
- [FreeRADIUS Setup](./FREERADIUS-SETUP.md)
- [Deployment Guide](./DEPLOYMENT-GUIDE.md)

---

**Last Updated:** October 25, 2026  
**Version:** 5.24.0
