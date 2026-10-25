# Deploy Configuration — Salfanet Radius

Konfigurasi deploy untuk dua aplikasi Next.js (frontend dan backend), penjadwal cron, dan gateway WhatsApp. Untuk memasang server dari nol, pakai installer ([frontend/vps-install/README.md](../frontend/vps-install/README.md)); folder ini berisi berkas yang dipakai installer dan skrip perbaikan untuk server yang sudah terpasang.

## Arsitektur

```
                    ┌─────────────┐
                    │   Nginx     │ :80 / :443
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     /api/auth/*        /api/*             /*
          │                │                │
          ▼                ▼                ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  Frontend    │ │  Backend     │ │  Frontend    │
   │  Next.js     │ │  Next.js     │ │  Next.js     │
   │  :3000       │ │  API  :3001  │ │  :3000       │
   │  (NextAuth)  │ │  + Prisma    │ │  (UI)        │
   └──────────────┘ └──────┬───────┘ └──────────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
           ┌──────────┐      ┌──────────────┐
           │  MySQL   │      │  FreeRADIUS  │
           └──────────┘      │  (REST ke    │
                             │  backend)    │
                             └──────────────┘

   salfanet-cron  ──HTTP──▶  backend :3001 /api/cron      (penjadwal)
   salfanet-wa    :4000      Baileys WhatsApp (dipanggil backend)
```

Rute `/api/auth/*` (NextAuth) dilayani frontend; semua `/api/*` lainnya dilayani backend. Rincian arsitektur: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Proses PM2

| Proses | Port | Fungsi |
|--------|------|--------|
| `salfanet-frontend` | 3000 | Next.js standalone: UI semua portal dan NextAuth |
| `salfanet-backend` | 3001 | Next.js standalone: API, Prisma, layanan notifikasi |
| `salfanet-cron` | — | Penjadwal (`backend/cron-runner.ts`), memanggil `POST /api/cron` di backend. Lihat [CRON-SYSTEM.md](../docs/features/CRON-SYSTEM.md) |
| `salfanet-wa` | 4000 | Gateway WhatsApp Baileys |

## Berkas

| Berkas | Fungsi |
|--------|--------|
| `ecosystem.config.js` | Konfigurasi PM2 (4 proses). Saat instalasi, salinannya dibuat di akar aplikasi dan tidak dilacak git |
| `nginx-salfanet.conf`, `nginx/salfanet.conf` | Konfigurasi reverse proxy Nginx |
| `salfanet-subdomains.conf` | Contoh server block per subdomain portal |
| `deploy.sh` | Deploy manual dari sumber di server (lihat di bawah) |
| `fix-pm2-limits.sh` | Menaikkan `max_memory_restart` backend di server yang sudah terpasang. Dijalankan oleh `deploy.sh` dan Update Sekarang |
| `fix-nginx-uploads.sh` | Menambahkan blok `/uploads/` ke site Nginx yang sudah ada. Dijalankan oleh Update Sekarang |
| `frontend.env.example` | Contoh variabel lingkungan frontend |
| `freeradius/` | Konfigurasi FreeRADIUS: modul `sqlippool`, `cui`, query, dan skrip perbaikan |
| `REGRESSION_TEST_CHECKLIST.md` | Daftar uji sebelum menyatakan sebuah rilis siap |
| `test-cwd.js`, `test-wrapper.js` | Skrip bantu untuk memeriksa direktori kerja proses PM2 |

## Pemasangan manual

Cara yang disarankan adalah installer. Bila harus manual:

```bash
# 1. Variabel lingkungan
cp backend/.env.example backend/.env       # DATABASE_URL, NEXTAUTH_SECRET, CRON_SECRET, dan lain-lain
cp frontend/.env.example frontend/.env     # NEXTAUTH_SECRET, alamat API

# 2. Dependensi dan Prisma
pnpm install
( cd backend && pnpm exec prisma generate && pnpm exec prisma db push )

# 3. Build (heap dibatasi agar muat di VPS kecil)
( cd backend  && NODE_OPTIONS="--max-old-space-size=1536" pnpm exec next build )
( cd frontend && NODE_OPTIONS="--max-old-space-size=1536" pnpm exec next build )

# 4. PM2
pm2 start deploy/ecosystem.config.js
pm2 save

# 5. Nginx
sudo cp deploy/nginx-salfanet.conf /etc/nginx/sites-available/salfanet
sudo ln -s /etc/nginx/sites-available/salfanet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`CRON_SECRET` wajib di produksi: tanpa itu API cron menolak semua panggilan.

## Memperbarui

| Cara | Kapan |
|------|-------|
| **Sistem, Update Sekarang** di panel admin | Cara biasa. Menarik kode, menjalankan `prisma generate` dan `db push`, build backend dan frontend (mengulang sekali dengan `.next/cache` kosong bila gagal), lalu restart PM2 |
| `bash frontend/vps-install/updater.sh` | Dari server, ke rilis terbaru atau versi tertentu |
| `./deploy/deploy.sh` | Deploy dari sumber di server (`/root/salfanet-radius`) ke `/var/www/salfanet-radius`: `pnpm install`, `prisma generate`, `prisma db push --accept-data-loss`, build, restart `salfanet-backend` dan `salfanet-frontend` |

> **Perhatian:** `deploy.sh` memakai `prisma db push --accept-data-loss`, yang bisa menghapus kolom atau tabel bila skema berubah. Update Sekarang tidak memakai opsi itu dan berhenti bila perubahan skema akan menghilangkan data. Baca perubahan skema di CHANGELOG sebelum menjalankan `deploy.sh`.

## Log

```bash
pm2 logs salfanet-backend    # API dan layanan
pm2 logs salfanet-frontend   # Next.js UI
pm2 logs salfanet-cron       # penjadwal cron
pm2 logs salfanet-wa         # WhatsApp
```

## Endpoint yang dilayani Nginx

| Alamat | Dilayani oleh |
|--------|---------------|
| `/api/auth/*` | Frontend (NextAuth) |
| `/api/*` | Backend |
| `/uploads/*` | Folder unggahan (gambar saja). Ditulis oleh installer dan `fix-nginx-uploads.sh`; **belum ada** di `nginx-salfanet.conf`, jadi pemasangan manual dengan berkas itu harus menambahkannya |
| `/*` | Frontend |
