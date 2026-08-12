# Salfanet Radius — VPS Installer

Installer dan uninstaller untuk deploy Salfanet Radius di VPS/LXC/VM.

## Arsitektur

```
Browser → Nginx (port 80) → Frontend (Next.js, port 3000)
                          → Backend (NestJS, port 3001)  [/api/v1/*]
                          → Frontend (Next.js, port 3000) [/api/* legacy]

FreeRADIUS (port 1812/udp, 1813/udp) → MySQL (salfanet_radius)
PM2 manages: salfanet-frontend, salfanet-backend, salfanet-wa
```

## Quick Install (Fresh VPS)

```bash
# 1. Clone repo
git clone https://github.com/s4lfanet/salfanet-radius.git
cd salfanet-radius

# 2. Run installer
bash vps-install/vps-installer.sh
```

## Install Options

```bash
# Full install (default) — semua komponen
bash vps-install/vps-installer.sh

# Skip FreeRADIUS (jika sudah ada RADIUS server lain)
bash vps-install/vps-installer.sh --skip-freeradius

# Gunakan kode yang sudah ada di APP_DIR (tidak git clone)
bash vps-install/vps-installer.sh --skip-clone

# Force LXC mode (skip UFW firewall)
bash vps-install/vps-installer.sh --env lxc

# Custom app directory
bash vps-install/vps-installer.sh --app-dir /opt/salfanet

# Custom database password
bash vps-install/vps-installer.sh --db-password mysecret123
```

## Update (Tanpa Reinstall)

```bash
cd /var/www/salfanet-radius

# Full update: pull + deps + migrate + build + restart
bash vps-install/updater.sh

# Hanya rebuild frontend
bash vps-install/updater.sh --frontend

# Hanya rebuild backend
bash vps-install/updater.sh --backend

# Hanya jalankan Prisma migrations
bash vps-install/updater.sh --migrate
```

## Uninstall

```bash
# Interactive (dengan backup + konfirmasi)
bash vps-install/vps-uninstaller.sh

# Skip backup
bash vps-install/vps-uninstaller.sh --no-backup

# Force remove semua (termasuk system packages)
bash vps-install/vps-uninstaller.sh --force
```

## Files

| File | Fungsi |
|------|--------|
| `vps-installer.sh` | Installer utama (entry point) |
| `vps-uninstaller.sh` | Uninstaller (backup + remove semua) |
| `updater.sh` | Update incremental (pull + build + restart) |
| `common.sh` | Shared functions (colors, logging, config) |
| `install-system.sh` | System packages, timezone, swap |
| `install-mysql.sh` | MySQL server + database + user |
| `install-nodejs.sh` | Node.js 20 + pnpm 9 |
| `install-app.sh` | Clone repo, deps, .env, migrations, build |
| `install-freeradius.sh` | FreeRADIUS 3.x + sqlippool + cui |
| `install-nginx.sh` | Nginx reverse proxy |
| `install-pm2.sh` | PM2 + ecosystem.config.js |

## Default Ports

| Service | Port |
|---------|------|
| Nginx (HTTP) | 80 |
| Frontend (Next.js) | 3000 |
| Backend (NestJS) | 3001 |
| WhatsApp (Baileys) | 4000 |
| FreeRADIUS auth | 1812/udp |
| FreeRADIUS acct | 1813/udp |
| MySQL | 3306 |

## Default Credentials

| Item | Value |
|------|-------|
| Database | `salfanet_radius` |
| DB User | `salfanet_user` |
| DB Password | `salfanetradius123` (override with `--db-password`) |
| DB Root Password | `root123` (set during install) |

**Ganti semua password default setelah install!**

## Prerequisites

- Ubuntu 22.04 / 24.04 (atau Debian 12)
- Root access
- Minimal 1GB RAM (2GB recommended — installer auto-creates swap jika <2GB)
- Internet connection
