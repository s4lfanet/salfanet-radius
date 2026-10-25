# Salfanet Radius — Documentation Index

> Terakhir diperiksa: 2026-10-25 terhadap kode v5.24.0. Perubahan terbaru ada di [CHANGELOG.md](../CHANGELOG.md), arsitektur saat ini di [ARCHITECTURE.md](ARCHITECTURE.md), cara menjalankan untuk pengembangan di [DEVELOPMENT.md](DEVELOPMENT.md).
>
> Dokumen bertanda **(arsip)** adalah catatan sejarah: rencana, audit, atau panduan yang ditulis untuk keadaan lama dan tidak diperbarui lagi. Untuk keadaan sekarang, andalkan kode, README utama, ARCHITECTURE, dan CHANGELOG.

---

## Struktur Dokumentasi

Dokumentasi diorganisir berdasarkan kategori fitur dan menu:

```
docs/
├── README.md                        # Pintu masuk dokumentasi
├── DOCS_INDEX.md                    # File ini (index)
├── ARCHITECTURE.md                  # Arsitektur: aplikasi, API, cron, proses PM2
├── DEVELOPMENT.md                   # Panduan pengembangan
├── COMPREHENSIVE_FEATURE_GUIDE.md   # Panduan fitur (disusun awal 2026, sebagian lama)
├── FRONTEND_API_CONTRACT.md         # Audit kontrak API frontend (arsip, Agustus 2026)
├── ISOLATION_SYSTEM.md              # Dokumentasi sistem isolir
├── ROADMAP.md, MAINTENANCE_ROADMAP.md, MIGRATION_ROADMAP.md,
│   ROADMAP_RESTRUCTURING.md, RESTRUCTURING_GUIDE.md,
│   SECURITY_FIXES_APPLIED.md, TYPE_SAFETY_EXCEPTIONS.md   # (arsip) rencana dan audit
│
├── getting-started/                 # Setup awal & troubleshooting
├── setup/                           # Instalasi server & VPS
├── mikrotik/                        # Konfigurasi MikroTik & CoA
├── billing/                         # Billing, invoice, payment
├── isolation/                       # Sistem isolasi pelanggan
├── notifications/                   # WhatsApp, email, push notification
├── customer-portal/                 # Portal pelanggan & self-service
├── mobile-app/                      # (arsip) rencana Expo/React Native yang tidak dilanjutkan
├── features/                        # Fitur-fitur spesifik
└── config-examples/                 # Contoh konfigurasi
```

---

## Getting Started — Setup Awal & Troubleshooting

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [TROUBLESHOOTING.md](getting-started/TROUBLESHOOTING.md) | Panduan troubleshooting umum | - |
| [COA_TROUBLESHOOTING_WORKFLOW.md](getting-started/COA_TROUBLESHOOTING_WORKFLOW.md) | Troubleshooting CoA disconnect | Network → Sessions |
| [DATABASE_MIGRATION_GUIDE.md](getting-started/DATABASE_MIGRATION_GUIDE.md) | Migrasi & update database Prisma | Settings |
| [MIGRATION_AND_CLEANUP_GUIDE.md](getting-started/MIGRATION_AND_CLEANUP_GUIDE.md) | Panduan migrasi sistem & cleanup | Settings |
| [API_TESTING_GUIDE.md](getting-started/API_TESTING_GUIDE.md) | Testing semua API endpoint | - |
| [CHANGELOG.md](getting-started/CHANGELOG.md) | (arsip) Log perubahan v2.x. Yang terbaru: [CHANGELOG.md](../CHANGELOG.md) di akar repo | - |

---

## Setup — Instalasi Server & VPS

| Dokumen | Deskripsi | Implementasi |
|---------|-----------|--------------|
| [VPS Installer](../frontend/vps-install/README.md) | Instalasi lengkap: langkah, environment, update, uninstall | `bash frontend/vps-install/vps-installer.sh` |
| [Deploy](../deploy/README.md) | PM2 ecosystem, nginx, skrip perbaikan, checklist regresi | `deploy/` |
| [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md) | Konfigurasi FreeRADIUS + MySQL | Jalankan `frontend/vps-install/install-freeradius.sh` |
| [CLOUDFLARE_TUNNEL_SETUP.md](setup/CLOUDFLARE_TUNNEL_SETUP.md) | Setup Cloudflare Tunnel untuk akses tanpa public IP | `cloudflared tunnel create` |
| [PROXMOX_LXC_SETUP.md](setup/PROXMOX_LXC_SETUP.md) | Deploy di Proxmox LXC container | LXC + TUN/TAP device |
| [PROXMOX_VPS_SETUP_GUIDE.md](setup/PROXMOX_VPS_SETUP_GUIDE.md) | Setup PPPoE/routing di Proxmox | Routing & /dev/ppp |
| [PROXMOX_L2TP_SETUP.md](setup/PROXMOX_L2TP_SETUP.md) | L2TP VPN client di Proxmox | strongSwan + xl2tpd |
| [VPN_CLIENT_SETUP_GUIDE.md](setup/VPN_CLIENT_SETUP_GUIDE.md) | Setup VPN client (L2TP/SSTP/PPTP) | Network → VPN Server |
| [VPS_OPTIMIZATION_GUIDE.md](setup/VPS_OPTIMIZATION_GUIDE.md) | Optimasi VPS 2GB RAM | `pnpm --filter frontend build:vps` |

---

## MikroTik — Konfigurasi Router & CoA

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [MIKROTIK_COA_SETUP.md](mikrotik/MIKROTIK_COA_SETUP.md) | Setup CoA untuk auto-disconnect | Network → Sessions |
| [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md) | Setup lengkap RADIUS + CoA di MikroTik | FreeRADIUS → Settings |
| [MULTIPLE_NAS_SAME_IP.md](mikrotik/MULTIPLE_NAS_SAME_IP.md) | Multiple NAS dengan IP yang sama | Network → NAS |
| [FIREWALL_PAYMENT_INTEGRATION.md](mikrotik/FIREWALL_PAYMENT_INTEGRATION.md) | Integrasi firewall & payment gateway | Network → Firewall |

---

## Billing — Invoice, Payment & Top-up

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [PREPAID_POSTPAID_WORKFLOW_V3.md](billing/PREPAID_POSTPAID_WORKFLOW_V3.md) | Workflow billing prepaid & postpaid | Billing utama |
| [BALANCE_AUTO_RENEWAL.md](billing/BALANCE_AUTO_RENEWAL.md) | Sistem saldo & auto-renewal | Keuangan → Saldo |
| [INVOICE_NUMBER_FORMAT.md](billing/INVOICE_NUMBER_FORMAT.md) | Format nomor invoice | Invoices |
| [CUSTOMER_PAYMENT_SELF_SERVICE.md](billing/CUSTOMER_PAYMENT_SELF_SERVICE.md) | Self-service pembayaran pelanggan | Customer Portal |
| [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](billing/MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md) | Pembayaran manual + notifikasi | Manual Payments |
| [AGENT_DEPOSIT_SYSTEM.md](billing/AGENT_DEPOSIT_SYSTEM.md) | Sistem deposit & top-up agent (gateway + manual transfer + bukti TF) | Top-up Requests |

---

## Isolation — Sistem Isolasi Pelanggan

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [QUICK_START_ISOLATION.md](isolation/QUICK_START_ISOLATION.md) | Quick start isolation 5 menit | Isolated Users |
| [ISOLATION_SYSTEM_WORKFLOW.md](isolation/ISOLATION_SYSTEM_WORKFLOW.md) | Arsitektur & workflow lengkap | Isolated Users |
| [ISOLATION_TESTING_GUIDE.md](isolation/ISOLATION_TESTING_GUIDE.md) | Testing & validasi isolation | Isolated Users |

> **Config example:** [nginx-isolation.conf](config-examples/nginx-isolation.conf)

---

## Notifications — WhatsApp, Email & Push

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [NOTIFICATION_SETUP_GUIDE.md](notifications/NOTIFICATION_SETUP_GUIDE.md) | Master setup: WhatsApp, Email, provider | Notifications → Settings |
| [BROADCAST_NOTIFICATION_SYSTEM.md](notifications/BROADCAST_NOTIFICATION_SYSTEM.md) | Broadcast notifikasi massal | Notifications → Broadcast |
| [OUTAGE_NOTIFICATION_SYSTEM.md](notifications/OUTAGE_NOTIFICATION_SYSTEM.md) | Notifikasi gangguan jaringan | Notifications → Outage |
| [AUTO_RENEWAL_NOTIFICATION_SYSTEM.md](notifications/AUTO_RENEWAL_NOTIFICATION_SYSTEM.md) | Notifikasi auto-renewal via cron | Cron Service |
| [AGENT_NOTIFICATION_MOBILE_SYSTEM.md](notifications/AGENT_NOTIFICATION_MOBILE_SYSTEM.md) | Push notification agent di mobile app | Push Notifications |

---

## Customer Portal — Login & Self-Service

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [CUSTOMER_LOGIN_BYPASS.md](customer-portal/CUSTOMER_LOGIN_BYPASS.md) | Login bypass / OTP pelanggan | Customer Portal → Login |
| [CUSTOMER_WIFI_SELFSERVICE.md](customer-portal/CUSTOMER_WIFI_SELFSERVICE.md) | Self-service WiFi (ganti password dll) | Customer Portal |
| [VOUCHER_EXPIRATION_TIMEZONE_FIX.md](customer-portal/VOUCHER_EXPIRATION_TIMEZONE_FIX.md) | Fix timezone voucher expiration | Hotspot → Vouchers |

---

## Aplikasi Mobile — Flutter, Android native

Dua aplikasi: pelanggan (`mobile/customer_app/`) dan admin (`mobile/admin_app/`). Keduanya memakai API backend yang sama dengan panel web dan memperbarui dirinya dari APK yang diunggah di Build APK.

| Dokumen | Deskripsi |
|---------|-----------|
| [customer_app/README.md](../mobile/customer_app/README.md) | Aplikasi pelanggan: build dan menjalankan |
| [customer_app/FIREBASE_SETUP.md](../mobile/customer_app/FIREBASE_SETUP.md) | Push FCM: proyek Firebase, `google-services.json`, service account di server |
| [customer_app/DESIGN.md](../mobile/customer_app/DESIGN.md) | Arah desain aplikasi pelanggan |
| [admin_app/README.md](../mobile/admin_app/README.md) | Aplikasi admin: build, login, fitur |
| [admin_app/DESIGN.md](../mobile/admin_app/DESIGN.md) | Arah desain aplikasi admin |

Folder `docs/mobile-app/` (`MOBILE_APP_NATIVE_DEVELOPMENT_GUIDE.md`, `MOBILE_BACKEND_API.md`, `MOBILE_TESTING_NGROK.md`) adalah **arsip** rencana Expo/React Native yang tidak dilanjutkan. Jangan dipakai sebagai acuan API.

---

## Features — Fitur Spesifik

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [CRON-SYSTEM.md](features/CRON-SYSTEM.md) | Sistem cron: runner, 27 job, riwayat, jalankan manual | Settings → Cron |
| [GPS_LOCATION_FEATURE.md](features/GPS_LOCATION_FEATURE.md) | Fitur GPS lokasi pelanggan & teknisi | Management → Map |
| [IMPORT_PPPOE_USERS.md](features/IMPORT_PPPOE_USERS.md) | Import bulk PPPoE users dari MikroTik | PPPoE → Import |
| [DYNAMIC_VIRTUAL_PARAMETERS.md](features/DYNAMIC_VIRTUAL_PARAMETERS.md) | Virtual parameters GenieACS | GenieACS → Devices |
| [GENIEACS-GUIDE.md](features/GENIEACS-GUIDE.md) | Panduan lengkap GenieACS TR-069 | GenieACS |
| [TOAST_NOTIFICATIONS_GUIDE.md](features/TOAST_NOTIFICATIONS_GUIDE.md) | UI toast notification system | Semua halaman admin |
| [FIBER_NETWORK_TOPOLOGY.md](features/FIBER_NETWORK_TOPOLOGY.md) | Infrastruktur fiber: OTB/ODC/ODP/JC/splice/peta/trace | Network → Infrastruktur |
| [LAPORAN_EXPORT.md](features/LAPORAN_EXPORT.md) | Laporan & ekspor: invoice, pembayaran, pelanggan | Laporan → Data & Export |

---

## Pemetaan Menu Admin → Dokumentasi

| Menu Admin | Dokumentasi Terkait |
|------------|-------------------|
| **Dashboard** | [COMPREHENSIVE_FEATURE_GUIDE.md](COMPREHENSIVE_FEATURE_GUIDE.md) |
| **PPPoE** | [IMPORT_PPPOE_USERS.md](features/IMPORT_PPPOE_USERS.md), [PREPAID_POSTPAID_WORKFLOW_V3.md](billing/PREPAID_POSTPAID_WORKFLOW_V3.md) |
| **Hotspot** | [VOUCHER_EXPIRATION_TIMEZONE_FIX.md](customer-portal/VOUCHER_EXPIRATION_TIMEZONE_FIX.md) |
| **Network → NAS** | [MULTIPLE_NAS_SAME_IP.md](mikrotik/MULTIPLE_NAS_SAME_IP.md) |
| **Network → Sessions** | [COA_TROUBLESHOOTING_WORKFLOW.md](getting-started/COA_TROUBLESHOOTING_WORKFLOW.md), [MIKROTIK_COA_SETUP.md](mikrotik/MIKROTIK_COA_SETUP.md) |
| **Network → VPN Server** | [VPN_CLIENT_SETUP_GUIDE.md](setup/VPN_CLIENT_SETUP_GUIDE.md), [PROXMOX_L2TP_SETUP.md](setup/PROXMOX_L2TP_SETUP.md) |
| **Isolated Users** | [QUICK_START_ISOLATION.md](isolation/QUICK_START_ISOLATION.md), [ISOLATION_SYSTEM_WORKFLOW.md](isolation/ISOLATION_SYSTEM_WORKFLOW.md) |
| **Invoices** | [INVOICE_NUMBER_FORMAT.md](billing/INVOICE_NUMBER_FORMAT.md), [PREPAID_POSTPAID_WORKFLOW_V3.md](billing/PREPAID_POSTPAID_WORKFLOW_V3.md) |
| **Manual Payments** | [MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md](billing/MANUAL_PAYMENT_AND_NOTIFICATION_SYSTEM.md) |
| **Keuangan** | [BALANCE_AUTO_RENEWAL.md](billing/BALANCE_AUTO_RENEWAL.md), [AGENT_DEPOSIT_SYSTEM.md](billing/AGENT_DEPOSIT_SYSTEM.md) |
| **Top-up Requests** | [AGENT_DEPOSIT_SYSTEM.md](billing/AGENT_DEPOSIT_SYSTEM.md) |
| **Payment Gateway** | [FIREWALL_PAYMENT_INTEGRATION.md](mikrotik/FIREWALL_PAYMENT_INTEGRATION.md), [CUSTOMER_PAYMENT_SELF_SERVICE.md](billing/CUSTOMER_PAYMENT_SELF_SERVICE.md) |
| **Notifications** | [NOTIFICATION_SETUP_GUIDE.md](notifications/NOTIFICATION_SETUP_GUIDE.md), [BROADCAST_NOTIFICATION_SYSTEM.md](notifications/BROADCAST_NOTIFICATION_SYSTEM.md) |
| **Push Notifications** | [AGENT_NOTIFICATION_MOBILE_SYSTEM.md](notifications/AGENT_NOTIFICATION_MOBILE_SYSTEM.md) |
| **WhatsApp** | [NOTIFICATION_SETUP_GUIDE.md](notifications/NOTIFICATION_SETUP_GUIDE.md) |
| **GenieACS** | [GENIEACS-GUIDE.md](features/GENIEACS-GUIDE.md), [DYNAMIC_VIRTUAL_PARAMETERS.md](features/DYNAMIC_VIRTUAL_PARAMETERS.md) |
| **Technicians** | [GPS_LOCATION_FEATURE.md](features/GPS_LOCATION_FEATURE.md) |
| **Kelola Kolektor, Setoran Kolektor** | Bagian *Collector Portal* di [README.md](../README.md) |
| **Settings → Cron** | [CRON-SYSTEM.md](features/CRON-SYSTEM.md) |
| **FreeRADIUS** | [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md), [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md) |
| **Laporan → Data & Export** | [LAPORAN_EXPORT.md](features/LAPORAN_EXPORT.md) |
| **Network → Infrastruktur** | [FIBER_NETWORK_TOPOLOGY.md](features/FIBER_NETWORK_TOPOLOGY.md) |
| **Settings** | [DATABASE_MIGRATION_GUIDE.md](getting-started/DATABASE_MIGRATION_GUIDE.md) |

---

## Quick Reference — Implementasi

### Instalasi VPS Baru
1. (Proxmox) Buat container lewat [PROXMOX_LXC_SETUP.md](setup/PROXMOX_LXC_SETUP.md)
2. Jalankan installer: `bash frontend/vps-install/vps-installer.sh`. Ia menjalankan semua langkah (sistem, Node.js 22, MySQL, aplikasi, Redis, FreeRADIUS, nginx, PM2, keamanan); rinciannya di [VPS Installer](../frontend/vps-install/README.md)
3. Konfigurasi RADIUS lanjutan: [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md)
4. Setup MikroTik: [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md)

### Build Optimasi VPS 2GB RAM
```bash
# Build frontend dengan memory limit 1.5GB
pnpm --filter frontend build:vps

# Atau ultra-low memory (1GB)
pnpm --filter frontend build:low-mem

# Pastikan swap aktif (minimal 2GB)
sudo swapon --show
```

### Proses PM2
Instalasi menjalankan empat proses: `salfanet-frontend`, `salfanet-backend`, `salfanet-cron`, dan `salfanet-wa`.
```bash
pm2 status
pm2 logs salfanet-cron      # penjadwal cron, lihat docs/features/CRON-SYSTEM.md
pm2 logs salfanet-backend   # API
```

### Update
- Dari panel: **Sistem → Update Sekarang** (menarik kode, menjalankan `prisma generate` dan `db push`, build, restart)
- Dari server: `bash frontend/vps-install/updater.sh`
