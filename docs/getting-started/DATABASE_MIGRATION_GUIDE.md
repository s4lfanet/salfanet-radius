# Database Management Scripts

## Overview
Scripts untuk mengelola database SALFANET RADIUS saat ada perubahan `schema.prisma`.

---

## 📋 Available Scripts

### 1. `reset-database.bat` - Fresh Start (HAPUS SEMUA DATA)
**⚠️ WARNING: Menghapus semua data!**

Digunakan ketika:
- Setup awal project
- Ada breaking changes di schema yang tidak bisa di-migrate
- Ingin mulai dari database kosong
- Testing dengan data bersih

```batch
.\reset-database.bat
```

**Yang dilakukan:**
1. DROP database `salfanet_radius`
2. CREATE database baru
3. Push schema dari `prisma/schema.prisma`
4. Generate Prisma Client
5. Seed data awal (roles, permissions, admin user, dll)

**Hasil:**
- Database kosong dengan struktur terbaru
- User admin: `superadmin` / `admin123`
- Data template siap pakai

---

### 2. `migrate-database.bat` - Update Schema (KEEP DATA)
**✅ Aman - Data tidak dihapus**

Digunakan ketika:
- Ada perubahan schema yang **non-breaking** (tambah kolom, index, dll)
- Ingin update struktur tanpa kehilangan data
- Production environment

```batch
.\migrate-database.bat
```

**Yang dilakukan:**
1. Push perubahan schema ke database
2. Generate Prisma Client
3. Verify schema sync

**⚠️ Limitation:**
- Tidak bisa handle breaking changes (misal: hapus kolom, ubah tipe data)
- Kalau gagal, gunakan `reset-database.bat` atau migrate manual

---

## 🔄 Workflow Schema Changes

### Development Environment
```batch
# Ubah schema.prisma
code prisma/schema.prisma

# Jika data tidak penting:
.\reset-database.bat

# Jika ingin keep data:
.\migrate-database.bat
```

### Production Environment
```bash
# 1. BACKUP DATABASE DULU!
mysqldump -u root -p salfanet_radius > backup_$(date +%Y%m%d).sql

# 2. Test di staging dulu
npx prisma db push

# 3. Generate client
npx prisma generate

# 4. Restart aplikasi
pm2 restart salfanet-backend
```

---

## 🛠️ Manual Database Commands

### Backup Database
```bash
# Windows (Laragon)
"C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe" -u root salfanet_radius > backup.sql

# Linux
mysqldump -u root -p salfanet_radius > backup.sql
```

### Restore Database
```bash
# Windows (Laragon)
"C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe" -u root salfanet_radius < backup.sql

# Linux
mysql -u root -p salfanet_radius < backup.sql
```

### Check Schema Sync
```bash
npx prisma db pull --print
```

### Force Reset (Nuclear Option)
```bash
# Drop database
npx prisma migrate reset --force

# Atau manual:
DROP DATABASE salfanet_radius;
CREATE DATABASE salfanet_radius CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
npx prisma db push
npx prisma generate
npx tsx prisma/seeds/seed-all.ts
```

---

## 📝 Prisma Commands Cheatsheet

| Command | Purpose | Safe? |
|---------|---------|-------|
| `prisma db push` | Sync schema → DB | ⚠️ Can lose data |
| `prisma db pull` | Sync DB → schema | ✅ Read-only |
| `prisma generate` | Generate client | ✅ Safe |
| `prisma migrate dev` | Create migration | ⚠️ Use with migrations/ |
| `prisma migrate deploy` | Run migrations | ✅ Production |
| `prisma migrate reset` | Reset + migrations | ❌ DELETES ALL |
| `prisma studio` | GUI browser | ✅ Safe |

---

## 🚨 Common Issues

### "Migration failed: Table already exists"
```bash
# Solution: Use db push instead
npx prisma db push --accept-data-loss
```

### "Prisma Client is outdated"
```bash
# Solution: Regenerate client
npx prisma generate
```

### "Cannot connect to database"
```bash
# Solution: Check MySQL running
# Windows: Start Laragon
# Linux: sudo systemctl start mysql
```

### Breaking Changes in Schema
```bash
# Solution: Reset database
.\reset-database.bat
# Or manually backup → reset → restore data
```

---

## 📊 Example Workflow: Add New Column

### Scenario: Tambah kolom `email` ke table `pppoeUser`

**1. Edit schema:**
```prisma
model pppoeUser {
  id       String @id
  username String
  email    String? // ← New column
  // ...
}
```

**2. Migrate (keep data):**
```batch
.\migrate-database.bat
```

**3. Verify:**
```bash
npx prisma studio
# Check table pppoeUser has email column
```

**4. Restart app:**
```bash
# Development
npm run dev

# Production
pm2 restart salfanet-backend
```

---

## ✅ Best Practices

1. **Always backup production before migration**
2. **Test schema changes in development first**
3. **Use `db push` in development, `migrate` in production**
4. **Keep `schema.prisma` in version control**
5. **Document breaking changes in migrations**
6. **Run seed after reset to have working data**

---

## 🔗 Related Files

- `prisma/schema.prisma` - Database schema definition
- `prisma/seeds/seed-all.ts` - Initial data seeder
- `.env` - Database connection string
- `setup-database.bat` - Initial setup
- `fresh-db-test.bat` - Reset + test

---

**Need help?** Check [Prisma Documentation](https://www.prisma.io/docs)
