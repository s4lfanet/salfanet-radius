# Salfanet Radius — Documentation Index

> Last updated: 2026-03-19 | Version 2.11.4

---

## Struktur Dokumentasi

Dokumentasi diorganisir berdasarkan kategori fitur dan menu:

```
docs/
├── README.md                        # Dokumentasi utama
├── DOCS_INDEX.md                    # File ini (index)
├── AI_PROJECT_MEMORY.md             # AI context & project memory
├── COMPREHENSIVE_FEATURE_GUIDE.md   # Panduan lengkap semua fitur
├── ROADMAP.md                       # Rencana pengembangan
│
├── getting-started/                 # Setup awal & troubleshooting
├── setup/                           # Instalasi server & VPS
├── mikrotik/                        # Konfigurasi MikroTik & CoA
├── billing/                         # Billing, invoice, payment
├── isolation/                       # Sistem isolasi pelanggan
├── notifications/                   # WhatsApp, email, push notification
├── customer-portal/                 # Portal pelanggan & self-service
├── mobile-app/                      # Aplikasi mobile (Expo/React Native)
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
| [CHANGELOG.md](getting-started/CHANGELOG.md) | Log perubahan versi | - |

---

## Setup — Instalasi Server & VPS

| Dokumen | Deskripsi | Implementasi |
|---------|-----------|--------------|
| [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md) | Konfigurasi FreeRADIUS + MySQL | Jalankan `vps-install/install-freeradius.sh` |
| [CLOUDFLARE_TUNNEL_SETUP.md](setup/CLOUDFLARE_TUNNEL_SETUP.md) | Setup Cloudflare Tunnel untuk akses tanpa public IP | `cloudflared tunnel create` |
| [PROXMOX_LXC_SETUP.md](setup/PROXMOX_LXC_SETUP.md) | Deploy di Proxmox LXC container | LXC + TUN/TAP device |
| [PROXMOX_VPS_SETUP_GUIDE.md](setup/PROXMOX_VPS_SETUP_GUIDE.md) | Setup PPPoE/routing di Proxmox | Routing & /dev/ppp |
| [PROXMOX_L2TP_SETUP.md](setup/PROXMOX_L2TP_SETUP.md) | L2TP VPN client di Proxmox | strongSwan + xl2tpd |
| [VPN_CLIENT_SETUP_GUIDE.md](setup/VPN_CLIENT_SETUP_GUIDE.md) | Setup VPN client (L2TP/SSTP/PPTP) | Network → VPN Server |
| [VPS_OPTIMIZATION_GUIDE.md](setup/VPS_OPTIMIZATION_GUIDE.md) | Optimasi VPS 2GB RAM | `npm run build:vps` |

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

## Mobile App — Expo / React Native

| Dokumen | Deskripsi | Implementasi |
|---------|-----------|--------------|
| [MOBILE_APP_NATIVE_DEVELOPMENT_GUIDE.md](mobile-app/MOBILE_APP_NATIVE_DEVELOPMENT_GUIDE.md) | Panduan development mobile app | `cd mobile-app && npx expo start` |
| [MOBILE_BACKEND_API.md](mobile-app/MOBILE_BACKEND_API.md) | Dokumentasi API backend untuk mobile | `src/app/api/mobile/` |
| [MOBILE_TESTING_NGROK.md](mobile-app/MOBILE_TESTING_NGROK.md) | Testing mobile via ngrok tunnel | `npm run tunnel` |

---

## Features — Fitur Spesifik

| Dokumen | Deskripsi | Menu Terkait |
|---------|-----------|--------------|
| [CRON-SYSTEM.md](features/CRON-SYSTEM.md) | Sistem cron job (auto-renewal, expiry) | Cron Service (PM2) |
| [GPS_LOCATION_FEATURE.md](features/GPS_LOCATION_FEATURE.md) | Fitur GPS lokasi pelanggan & teknisi | Management → Map |
| [IMPORT_PPPOE_USERS.md](features/IMPORT_PPPOE_USERS.md) | Import bulk PPPoE users dari MikroTik | PPPoE → Import |
| [DYNAMIC_VIRTUAL_PARAMETERS.md](features/DYNAMIC_VIRTUAL_PARAMETERS.md) | Virtual parameters GenieACS | GenieACS → Devices |
| [GENIEACS-GUIDE.md](features/GENIEACS-GUIDE.md) | Panduan lengkap GenieACS TR-069 | GenieACS |
| [TOAST_NOTIFICATIONS_GUIDE.md](features/TOAST_NOTIFICATIONS_GUIDE.md) | UI toast notification system | Semua halaman admin |
| [FIBER_NETWORK_TOPOLOGY.md](features/FIBER_NETWORK_TOPOLOGY.md) | Infrastruktur fiber: OTB/ODC/ODP/JC/splice/peta/trace (**roadmap**) | Network → Infrastruktur |
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
| **FreeRADIUS** | [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md), [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md) |
| **Laporan → Data & Export** | [LAPORAN_EXPORT.md](features/LAPORAN_EXPORT.md) |
| **Network → Infrastruktur** | [FIBER_NETWORK_TOPOLOGY.md](features/FIBER_NETWORK_TOPOLOGY.md) |
| **Settings** | [DATABASE_MIGRATION_GUIDE.md](getting-started/DATABASE_MIGRATION_GUIDE.md) |

---

## Quick Reference — Implementasi

### Instalasi VPS Baru
1. Ikuti [PROXMOX_LXC_SETUP.md](setup/PROXMOX_LXC_SETUP.md) untuk membuat container
2. Jalankan `vps-install/install-system.sh` → `install-freeradius.sh` → `install-pm2.sh`
3. Ikuti [FREERADIUS-SETUP.md](setup/FREERADIUS-SETUP.md) untuk konfigurasi RADIUS
4. Setup MikroTik: [MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md](mikrotik/MIKROTIK_RADIUS_COA_COMPLETE_SETUP.md)

### Build Optimasi VPS 2GB RAM
```bash
# Build dengan memory limit 1.5GB
npm run build:vps

# Atau ultra-low memory (1GB)
npm run build:low-mem

# Pastikan swap aktif (minimal 2GB)
sudo swapon --show
```

### Cron Service
```bash
# Start cron service terpisah dari Next.js
pm2 start cron-service.js --name salfanet-cron
```

### Deploy Update
```bash
# Quick deploy (build + restart PM2)
npm run deploy:quick

# Full deploy (install + build + restart)
npm run deploy:full
```
