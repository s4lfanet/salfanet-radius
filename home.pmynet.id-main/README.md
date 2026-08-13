# FreeRADIUS Customer Management Project

This project is organized into three main components:

- **core/**: Contains the FreeRADIUS 3.2.8 source code and configuration (`raddb`).
- **backend/**: Node.js API server for the administration dashboard.
- **frontend/**: Vite + React (or other) frontend for the administration dashboard.

## Getting Started

### 1. Setup FreeRADIUS (Core)

Jalankan setup script untuk mengkonfigurasi FreeRADIUS:

```bash
./setup-radius.sh
```

Script ini akan:
- Membuat directory `mods-enabled` dan `sites-enabled`
- Mengaktifkan modul SQL dan sqlippool
- Mengkonfigurasi koneksi database
- Setup IP Pool untuk assignment IP ke client

### 2. Setup Database

Setelah FreeRADIUS dikonfigurasi, setup IP Pool di database:

```bash
mysql -h <DB_HOST> -u <DB_USER> -p<DB_PASSWORD> <DB_NAME> < core/raddb/setup-ippool.sql
```

### 3. Admin Dashboard (Backend & Frontend)

Each has its own `package.json`. Run `npm install` and `npm start` (or `npm run dev`) in the respective directories.

```bash
# Backend
cd backend
npm install
npm start

# Frontend
cd frontend
npm install
npm run dev
```

### 4. Deploy ke VPS

Push ke GitHub, GitHub Actions akan otomatis deploy ke VPS.

### 5. Konfigurasi Mikrotik

Pastikan Mikrotik dikonfigurasi dengan benar:

```
/ip pool
add name=radius-pool ranges=10.10.10.2-10.10.10.254

/ppp profile
set default local-address=10.10.10.1 remote-address=radius-pool

/radius
add address=<IP_VPS> secret=<RADIUS_SECRET> service=ppp

/ppp aaa
set use-radius=yes
```

## Troubleshooting

Jika ONT tidak dapat IP atau sering disconnect, lihat file [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) untuk panduan lengkap.

## Struktur Database

- `radcheck`: Username dan password user
- `radreply`: Attribute reply untuk user
- `radgroupcheck`: Attribute check untuk group
- `radgroupreply`: Attribute reply untuk group (termasuk Pool-Name)
- `radusergroup`: Mapping user ke group
- `radippool`: IP Pool untuk assignment
- `radacct`: Accounting log
- `nas`: RADIUS clients (Mikrotik, dll)
