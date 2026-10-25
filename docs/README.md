# SALFANET RADIUS - Dokumentasi

Billing ISP/RTRW.NET dengan FreeRADIUS: dua aplikasi Next.js (frontend dan backend), penjadwal cron, gateway WhatsApp Baileys, dan dua aplikasi Android (Flutter). Versi saat ini: lihat [CHANGELOG.md](../CHANGELOG.md).

Daftar lengkap semua dokumen, per kategori dan per menu admin, ada di **[DOCS_INDEX.md](DOCS_INDEX.md)**.

## Mulai dari sini

| Kebutuhan | Dokumen |
|-----------|---------|
| Gambaran produk, fitur, dan portal | [README.md](../README.md) |
| Cara kerja sistem: aplikasi, API, cron, proses PM2 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Menjalankan dan mengembangkan secara lokal | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Memasang di VPS | [VPS Installer](../frontend/vps-install/README.md) |
| Apa yang berubah | [CHANGELOG.md](../CHANGELOG.md) |

## Tugas umum

**Memasang server baru.** Ikuti [VPS Installer](../frontend/vps-install/README.md), lalu [FREERADIUS-SETUP.md](./setup/FREERADIUS-SETUP.md) dan [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](./mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md) untuk routernya. PM2, nginx, dan skrip perbaikan ada di [deploy/README.md](../deploy/README.md).

**Memperbarui server.** Dari panel: Sistem, Update Sekarang. Dari server: `bash frontend/vps-install/updater.sh`.

**Mengatur billing prabayar dan pascabayar.** [PREPAID_POSTPAID_WORKFLOW_V3.md](./billing/PREPAID_POSTPAID_WORKFLOW_V3.md), lalu jadwal pembuatan invoice di [CRON-SYSTEM.md](./features/CRON-SYSTEM.md).

**Pembayaran manual (bukti transfer).** [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](./billing/MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md).

**Pengingat tagihan dan notifikasi massal.** [NOTIFICATION_SETUP_GUIDE.md](./notifications/NOTIFICATION_SETUP_GUIDE.md) dan [BROADCAST_NOTIFICATION_SYSTEM.md](./notifications/BROADCAST_NOTIFICATION_SYSTEM.md). Aturan pengingat invoice dijelaskan di [CRON-SYSTEM.md](./features/CRON-SYSTEM.md).

**Pelanggan terisolir.** [QUICK_START_ISOLATION.md](./isolation/QUICK_START_ISOLATION.md) dan [ISOLATION_SYSTEM_WORKFLOW.md](./isolation/ISOLATION_SYSTEM_WORKFLOW.md).

**Perangkat TR-069.** [GENIEACS-GUIDE.md](./features/GENIEACS-GUIDE.md).

**Portal kolektor dan setoran.** Bagian *Collector Portal* di [README.md](../README.md).

**Ada yang tidak jalan.** [TROUBLESHOOTING.md](./getting-started/TROUBLESHOOTING.md), riwayat job di Settings, Cron, dan log PM2 (`pm2 logs salfanet-backend`, `pm2 logs salfanet-cron`).

## Tentang dokumen lama

Sebagian dokumen di folder ini ditulis untuk versi 2.x sampai 4.x dan tidak seluruhnya diperbarui. Rencana, audit, dan catatan migrasi (`ROADMAP*.md`, `MIGRATION_ROADMAP.md`, `RESTRUCTURING_GUIDE.md`, `SECURITY_FIXES_APPLIED.md`, dan sejenisnya) adalah **arsip** dan ditandai begitu di [DOCS_INDEX.md](DOCS_INDEX.md). Bila isi dokumen berbeda dengan kode, kode yang benar; mohon laporkan atau perbaiki dokumennya.
