# Multiple NAS with Same IP Address Support

**Date**: December 21, 2025  
**Version**: v2.7.4  
**Module**: Network / Router NAS Management  

---

## 🎯 Feature Overview

Sistem sekarang mendukung **multiple router/NAS dengan IP VPN yang sama**, selama kombinasi **port RADIUS** dan **secret** berbeda.

### Use Case

Scenario: Anda punya **beberapa MikroTik** di lokasi berbeda yang terhubung ke VPS melalui **VPN dengan IP yang sama** (misalnya `10.10.10.1`).

**Before (v2.7.3)**:
- ❌ Tidak bisa menambahkan router kedua dengan IP VPN sama
- ❌ Error: `nasname must be unique`
- ❌ Workaround: Harus gunakan IP berbeda

**After (v2.7.4)**:
- ✅ Bisa tambah multiple router dengan IP VPN sama
- ✅ Bedakan dengan **port RADIUS** atau **secret** yang berbeda
- ✅ Setiap router tetap punya konfigurasi API sendiri (username, password, API port)

---

## 📊 Technical Changes

### 1. Database Schema Update

**File**: `prisma/schema.prisma`

**Before**:
```prisma
model router {
  nasname        String             @unique  // ❌ Tidak allow duplicate IP
  ...
}
```

**After**:
```prisma
model router {
  nasname        String             // ✅ Allow duplicate IP
  ...
  
  @@unique([nasname, ports, secret], name: "unique_nas_config")
  // ✅ Unique combination: IP + port + secret
}
```

### 2. Migration SQL

**File**: `prisma/migrations/20251221004655_allow_duplicate_nas_ip/migration.sql`

```sql
-- Drop unique constraint on nasname
DROP INDEX `nas_nasname_key` ON `nas`;

-- Add composite unique constraint
ALTER TABLE `nas` 
ADD UNIQUE KEY `unique_nas_config` (`nasname`, `ports`, `secret`);
```

### 3. API Validation

**File**: `src/app/api/network/routers/route.ts`

**Added validation before save**:
```typescript
// Check for duplicate NAS configuration
const existingNas = await prisma.router.findFirst({
  where: {
    nasname,
    ports: radiusPort,
    secret: radiusSecret,
  },
});

if (existingNas) {
  return NextResponse.json({
    error: 'Duplicate NAS configuration',
    details: `Router dengan IP ${nasname}, port ${radiusPort}, dan secret yang sama sudah ada`,
  }, { status: 409 });
}
```

**Enhanced error handling**:
```typescript
// Prisma unique constraint error (P2002)
if (error.code === 'P2002') {
  return 'IP VPN bisa sama, tapi kombinasi port RADIUS dan secret harus unik'
}
```

---

## 🔧 Configuration Examples

### Example 1: Same VPN IP, Different Ports

**Router 1**:
```
Name: MikroTik Cabang A
IP Address: 192.168.1.1
NAS IP (VPN): 10.10.10.1
Port API: 8728
Port RADIUS: 1812  ⬅️ Port berbeda
Secret: secret123
```

**Router 2**:
```
Name: MikroTik Cabang B
IP Address: 192.168.2.1
NAS IP (VPN): 10.10.10.1  ⬅️ IP VPN sama!
Port API: 8728
Port RADIUS: 1813  ⬅️ Port berbeda
Secret: secret123
```

✅ **Allowed** - Port RADIUS berbeda (`1812` vs `1813`)

---

### Example 2: Same VPN IP, Different Secrets

**Router 1**:
```
NAS IP (VPN): 10.10.10.1
Port RADIUS: 1812
Secret: secret123  ⬅️ Secret berbeda
```

**Router 2**:
```
NAS IP (VPN): 10.10.10.1  ⬅️ IP VPN sama!
Port RADIUS: 1812
Secret: secret456  ⬅️ Secret berbeda
```

✅ **Allowed** - Secret berbeda (`secret123` vs `secret456`)

---

### Example 3: Exact Duplicate (Not Allowed)

**Router 1**:
```
NAS IP (VPN): 10.10.10.1
Port RADIUS: 1812
Secret: secret123
```

**Router 2**:
```
NAS IP (VPN): 10.10.10.1  ⬅️ Semua sama!
Port RADIUS: 1812         ⬅️ Semua sama!
Secret: secret123         ⬅️ Semua sama!
```

❌ **NOT ALLOWED** - Kombinasi IP + port + secret sudah ada

**Error**:
```
Duplicate NAS configuration
Router dengan IP 10.10.10.1, port 1812, dan secret yang sama sudah ada (MikroTik Cabang A).
Gunakan port atau secret yang berbeda.
```

---

## 🎯 How It Works

### 1. FreeRADIUS NAS Table

FreeRADIUS mengidentifikasi client (router) berdasarkan:
- **IP address** (nasname) - IP source request RADIUS
- **Port** (ports) - Port RADIUS yang digunakan
- **Secret** - Shared secret untuk enkripsi

**NAS Table (`nas`)**:
```sql
+----+----------+-----------+-------+--------+
| id | nasname  | ports     | secret| name   |
+----+----------+-----------+-------+--------+
| 1  |10.10.10.1| 1812      | sec123| CabangA|
| 2  |10.10.10.1| 1813      | sec123| CabangB| ✅ Allowed
| 3  |10.10.10.1| 1812      | sec456| CabangC| ✅ Allowed
+----+----------+-----------+-------+--------+
```

### 2. Request Flow

**Router 1 (Port 1812)**:
```
MikroTik 10.10.10.1:1812 
  → FreeRADIUS (match: IP=10.10.10.1, Port=1812, Secret=sec123)
  → CabangA
  → Authorize user
```

**Router 2 (Port 1813)**:
```
MikroTik 10.10.10.1:1813
  → FreeRADIUS (match: IP=10.10.10.1, Port=1813, Secret=sec123)
  → CabangB
  → Authorize user
```

FreeRADIUS menggunakan **kombinasi IP + port** untuk routing request ke router yang tepat.

---

## 📋 Deployment Checklist

### Step 1: Update Code
```bash
git pull origin main
```

### Step 2: Run Migration
```bash
cd /var/www/salfanet-radius
npx prisma migrate deploy
```

Expected output:
```
Applying migration `20251221004655_allow_duplicate_nas_ip`
✔ Generated Prisma Client
```

### Step 3: Verify Schema
```bash
npx prisma db pull
```

Check `schema.prisma`:
```prisma
@@unique([nasname, ports, secret], name: "unique_nas_config")
```

### Step 4: Restart Application
```bash
npm run build
pm2 restart salfanet-backend
```

### Step 5: Test
1. Tambah router pertama dengan IP VPN `10.10.10.1`, port `1812`
2. Tambah router kedua dengan IP VPN `10.10.10.1`, port `1813`
3. Coba tambah router ketiga dengan IP + port + secret sama → harus error

---

## 🧪 Testing Scenarios

### Test 1: Add Router with Same IP, Different Port

**Request**:
```json
POST /api/network/routers
{
  "name": "MikroTik Cabang B",
  "ipAddress": "192.168.2.1",
  "nasIpAddress": "10.10.10.1",
  "username": "admin",
  "password": "password",
  "port": 8728,
  "secret": "secret123"
  // Port RADIUS auto = 1813 (jika 1812 sudah ada)
}
```

**Expected**: ✅ Success

### Test 2: Add Router with Same IP, Same Port, Same Secret

**Request**:
```json
POST /api/network/routers
{
  "name": "Duplicate Router",
  "ipAddress": "192.168.3.1",
  "nasIpAddress": "10.10.10.1",
  "secret": "secret123"
  // Port RADIUS default = 1812
}
```

**Expected**: ❌ Error 409 Conflict
```json
{
  "error": "Duplicate NAS configuration",
  "details": "Router dengan IP 10.10.10.1, port 1812, dan secret yang sama sudah ada",
  "hint": "Gunakan port atau secret yang berbeda untuk IP VPN yang sama"
}
```

### Test 3: Add Router with Same IP, Different Secret

**Request**:
```json
POST /api/network/routers
{
  "name": "MikroTik Cabang C",
  "ipAddress": "192.168.4.1",
  "nasIpAddress": "10.10.10.1",
  "secret": "secret456"  // Secret berbeda
}
```

**Expected**: ✅ Success

---

## 🔍 Troubleshooting

### Error: "nasname must be unique"

**Problem**: Migration belum running

**Solution**:
```bash
npx prisma migrate deploy
npx prisma generate
pm2 restart salfanet-backend
```

### Error: "P2002: Unique constraint failed"

**Problem**: Router dengan kombinasi IP + port + secret yang sama sudah ada

**Solution**:
- Gunakan port RADIUS berbeda (1813, 1814, dst)
- Atau gunakan secret berbeda
- Atau update router yang sudah ada

### FreeRADIUS tidak authorize user

**Problem**: Port RADIUS di MikroTik tidak match dengan NAS table

**Solution**:
Check MikroTik RADIUS client config:
```routeros
/radius
print
# Pastikan port sama dengan yang di NAS table
```

---

## 📊 Database Impact

### Before Migration

```sql
SHOW CREATE TABLE nas;

UNIQUE KEY `nas_nasname_key` (`nasname`)  -- ❌ Block duplicate IP
```

### After Migration

```sql
SHOW CREATE TABLE nas;

UNIQUE KEY `unique_nas_config` (`nasname`,`ports`,`secret`)  -- ✅ Allow duplicate IP
```

### Query Performance

**No performance impact** - Index tetap optimal:
- Composite unique index pada `(nasname, ports, secret)`
- Index individual pada `nasname` tetap ada
- FreeRADIUS query tetap fast

---

## 📚 Related Documentation

- **FreeRADIUS NAS Table**: [docs/FREERADIUS-SETUP.md](../setup/FREERADIUS-SETUP.md)
- **Router Management**: [docs/DEPLOYMENT-GUIDE.md](../../deploy/README.md)
- **Database Schema**: [prisma/schema.prisma](../../backend/prisma/schema.prisma)

---

## ✅ Summary

**What Changed**:
- ✅ Database schema: `nasname` unique constraint → composite unique `(nasname, ports, secret)`
- ✅ API validation: Check duplicate sebelum save
- ✅ Error handling: Informative message untuk duplicate config
- ✅ Migration: Automatic database update

**Benefits**:
- ✅ Multiple router dengan IP VPN sama
- ✅ Flexible configuration (port atau secret berbeda)
- ✅ No breaking changes (existing routers tetap work)
- ✅ Better error messages

**Compatibility**:
- ✅ FreeRADIUS 3.x
- ✅ MySQL/MariaDB
- ✅ Existing routers tidak terpengaruh
- ✅ Backward compatible

---

**Updated**: December 21, 2025  
**Version**: v2.7.4  
**Status**: Production Ready ✅
