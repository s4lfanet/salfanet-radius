# Database Seed Scripts

Koleksi seed scripts untuk initialize database dengan data default.

## 📁 Available Seeds

### 1. Company Data (`seed-company.ts`)

**Purpose**: Initialize company settings record

**Features**:
- Creates default company with isolation settings
- Required for `/api/settings/isolation` endpoint
- Auto-generates UUID for company ID

**Usage**:
```bash
cd backend
npx tsx prisma/seeds/seed-company.ts
```

**Data Created**:
- Company name: "SALFANET RADIUS - Local Dev"
- Isolation enabled: `true`
- IP Pool: `192.168.200.0/24`
- Rate Limit: `64k/64k`
- Grace period: `0` days

### 2. Isolation Templates (`isolation-templates.ts`)

**Purpose**: Create default isolation notification templates

**Features**:
- 3 pre-configured templates:
  1. **WhatsApp** - Formatted message with emoji
  2. **Email** - HTML email template
  3. **HTML Landing Page** - Full isolation page
- Dynamic variables support
- All templates active by default

**Usage**:
```bash
cd backend
npx tsx prisma/seeds/isolation-templates.ts
```

**Templates Created**:

| Template | Type | Variables | Preview |
|----------|------|-----------|---------|
| Default WhatsApp Isolation Notice | `whatsapp` | 9 vars | Customer notification with payment link |
| Default Email Isolation Notice | `email` | 9 vars | HTML email with styling |
| Default HTML Landing Page | `html_page` | 10 vars | Responsive landing page |

**Dynamic Variables**:
- `{{customerName}}` - Nama pelanggan
- `{{username}}` - Username PPPoE
- `{{expiredDate}}` - Tanggal expired
- `{{rateLimit}}` - Bandwidth limit
- `{{paymentLink}}` - URL pembayaran
- `{{qrCode}}` / `{{qrCodeImage}}` - QR code URL
- `{{companyName}}` - Nama perusahaan
- `{{companyPhone}}` - No telepon
- `{{companyEmail}}` - Email perusahaan

### 3. All Seeds (`seed-all.ts`)

**Purpose**: Run all seed scripts at once: permissions and role templates, the default admin, company record, transaction categories, WhatsApp, email, invoice, isolation and manual-extension templates, ticket categories, and parameter display config. The VPS installer runs this.

**Usage**:
```bash
pnpm --filter backend db:seed
# atau dari folder backend
pnpm db:seed
```

## 🚀 Installation Guide

### Fresh Installation

1. **Setup Database Schema**:
```bash
npx prisma db push
```

2. **Run All Seeds** (company, templates, permissions, default admin):
```bash
pnpm db:seed
```

3. **Or one at a time**, for example only the company record:
```bash
npx tsx prisma/seeds/seed-company.ts
```

### Production Deployment

```bash
cd /var/www/salfanet-radius/backend

npx prisma db push
pnpm db:seed
```

> **Perhatian:** `pnpm db:seed` menimpa izin tiap role dengan template bawaan (`ROLE_TEMPLATES` di `permissions.ts`). Jalankan di server yang sudah berjalan hanya bila izin role memang ingin dikembalikan ke bawaan; update biasa lewat Update Sekarang tidak menjalankannya. Akun Super Admin dan data perusahaan yang sudah ada tidak ditimpa.

## 🔍 Troubleshooting

### Company Already Exists

Seeds check for existing data before creating:
```
✅ Company already exists: SALFANET RADIUS - Local Dev
Updating isolation settings...
```

### Template Already Exists

Templates are skipped if already present:
```
✅ Template "Default WhatsApp Isolation Notice" already exists, skipping...
```

### Permission Errors

Ensure database user has INSERT privileges:
```sql
GRANT INSERT, UPDATE ON salfanet_radius.* TO 'salfanet_user'@'localhost';
FLUSH PRIVILEGES;
```

## 📝 Notes

1. **Company seed is required** for isolation settings API to work
2. **Template seed is optional** but recommended for better UX
3. Seeds are **idempotent** - safe to run multiple times
4. Use **UTC timezone** for consistent date handling

## 🔗 Related Files

- `src/app/api/settings/isolation/route.ts` - Isolation API
- `src/app/admin/settings/isolation/page.tsx` - Settings UI
- `src/app/admin/settings/isolation/templates/page.tsx` - Templates UI

## 📚 Documentation

See also:
- [Install Wizard](../../../frontend/production/install-wizard.html) - Complete installation guide
- [CHANGELOG.md](../../../CHANGELOG.md) - Version history
- [README.md](../../../README.md) - Project overview
