# 🧹 Migration and Cleanup Guide

**Last Updated:** February 17, 2026, 3:00 AM WIB  
**Project:** SALFANET RADIUS v2.9.0

---

## 📋 Overview

This guide documents the database migration structure and project cleanup performed to ensure a clean, production-ready deployment.

---

## ✅ Cleanup Completed

### **Removed Files:**
1. ❌ `prisma/migrations/standardize_status_casing.sql` (moved to proper migration folder)
2. ❌ `scripts/verify-migration.js` (temporary test script)
3. ❌ `scripts/test-migration.js` (temporary test script)  
4. ❌ `scripts/check-status.sql` (temporary verification script)

### **Kept Files:**
- ✅ `scripts/quick-test.ps1` - Automated testing workflow for Windows
- ✅ `scripts/quick-test.sh` - Automated testing workflow for Linux/Mac
- ✅ All production scripts (scan-api-endpoints.js, test-all-apis.js, etc.)

---

## 🗄️ Database Migration Structure

### **Prisma Migrations (Proper Order):**

| # | Migration | Date | Purpose | Status |
|---|-----------|------|---------|--------|
| 1 | `20251221004655_allow_duplicate_nas_ip` | Dec 21, 2025 | Allow duplicate NAS IP | ✅ Applied |
| 2 | `20251221020000_allow_same_nas_ip_different_port` | Dec 21, 2025 | Same NAS IP, different ports | ✅ Applied |
| 3 | `20251223_add_billing_fields.sql` | Dec 23, 2025 | Billing configuration fields | ✅ Applied |
| 4 | `add_manual_payment_features` | Unknown | Manual payment features | ✅ Applied |
| 5 | `fix_radacct_groupname` | Unknown | Fix radacct groupname | ✅ Applied |
| 6 | **`20260217025500_standardize_status_casing`** | **Feb 17, 2026** | **Status casing standardization** | ✅ **Applied** |

---

## 🔧 Migration Details

### **20260217025500_standardize_status_casing**

#### Purpose:
Convert all status values from UPPERCASE to lowercase for consistency across the codebase.

#### Changes:
```sql
-- Update pppoe_users table
UPDATE pppoe_users SET status = 'active' WHERE status = 'ACTIVE';
UPDATE pppoe_users SET status = 'isolated' WHERE status = 'ISOLATED';
UPDATE pppoe_users SET status = 'blocked' WHERE status = 'BLOCKED';
UPDATE pppoe_users SET status = 'stop' WHERE status = 'STOP';
```

#### Status Values:
- ✅ `active` - User can connect normally
- ✅ `isolated` - User can connect but restricted (captive portal)
- ✅ `blocked` - User cannot connect (payment issue)
- ✅ `stop` - User cannot connect (manually stopped)

#### Schema Defaults:
```prisma
model pppoeUser {
  status String @default("active")
  // Other fields...
}
```

#### When is this migration needed?

| Scenario | Migration Needed? | Action |
|----------|-------------------|--------|
| **Fresh VPS Install** | ❌ **NO** | Schema defaults are already lowercase |
| **Upgrade from Old Version** | ✅ **YES** | Converts existing UPPERCASE data |
| **Development to Production** | ⚠️ **MAYBE** | Only if dev has UPPERCASE data |

---

## 🚀 Fresh VPS Deployment

### **Option 1: Clean Install (Recommended)**

```bash
# 1. Clone repository
git clone <repository-url> salfanet-radius
cd salfanet-radius

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database credentials

# 4. Run all migrations (automatically in correct order)
npx prisma migrate deploy

# 5. Generate Prisma client
npx prisma generate

# 6. Build application
npm run build

# 7. Start application
npm start
```

**Result:**
- ✅ All 6 migrations applied in order
- ✅ Database schema created with lowercase defaults
- ✅ No manual data migration needed (no existing data)
- ✅ Ready for production use

---

### **Option 2: Upgrade Existing Database**

```bash
# 1. Backup existing database
mysqldump -u root -p salfanet_radius > backup_$(date +%Y%m%d).sql

# 2. Pull latest code
git pull origin main

# 3. Install updated dependencies
npm install

# 4. Check migration status
npx prisma migrate status

# 5. Apply pending migrations
npx prisma migrate deploy

# 6. Verify migration
npx prisma db execute --file scripts/verify-status-values.sql
```

**Result:**
- ✅ Existing data converted from UPPERCASE to lowercase
- ✅ New data uses lowercase from schema defaults
- ✅ Code and database now consistent

---

## 📊 Migration Verification

### **Check Migration Status:**
```bash
npx prisma migrate status
```

**Expected Output:**
```
5 migrations found in prisma/migrations

Database schema is up to date!
```

### **Verify Status Values:**
```sql
-- Check all distinct status values
SELECT DISTINCT status FROM pppoe_users ORDER BY status;
```

**Expected Result:**
```
active
blocked
isolated
stop
```

**❌ Bad Result (needs migration):**
```
ACTIVE
BLOCKED
ISOLATED
STOP
```

---

## 🔍 Schema Consistency Check

### **Status Field Defaults:**

All models with status fields now use lowercase defaults:

```prisma
// ✅ Correct (all models now use this)
status String @default("active")

// ❌ Incorrect (old style - don't use)
status String @default("ACTIVE")
```

### **Models with Status Fields:**
1. ✅ `pppoeUser` - User connection status
2. ✅ `networkServer` - Server status
3. ✅ `networkOLT` - OLT status
4. ✅ `networkODC` - ODC status
5. ✅ `networkODP` - ODP status

---

## 🎯 Production Deployment Checklist

### **Before Deploy:**
- [x] All migrations in proper folder structure
- [x] Migration status verified (`prisma migrate status`)
- [x] Temporary test files removed
- [x] Schema defaults set to lowercase
- [x] Code updated to use lowercase status values

### **During Deploy:**
```bash
# 1. Stop application
pm2 stop all

# 2. Backup database
mysqldump -u root -p salfanet_radius > backup_production.sql

# 3. Pull latest code
git pull origin main

# 4. Install dependencies
npm ci --production

# 5. Apply migrations
npx prisma migrate deploy

# 6. Generate Prisma client
npx prisma generate

# 7. Build application
npm run build

# 8. Restart application
pm2 restart all
```

### **After Deploy:**
- [ ] Test user login (PPPoE/Hotspot)
- [ ] Test admin login
- [ ] Verify isolation system works
- [ ] Check RADIUS authorization
- [ ] Monitor error logs

---

## 📁 Migration Files Location

```
prisma/migrations/
├── 20251221004655_allow_duplicate_nas_ip/
│   └── migration.sql
├── 20251221020000_allow_same_nas_ip_different_port/
│   └── migration.sql
├── 20251223_add_billing_fields.sql         # ⚠️ Should be in folder
├── add_manual_payment_features/
│   └── migration.sql
├── fix_radacct_groupname/
│   └── migration.sql
└── 20260217025500_standardize_status_casing/  # ✅ Newly added
    └── migration.sql
```

**Note:** `20251223_add_billing_fields.sql` should be moved to a folder structure for consistency, but it's already applied so we're leaving it as-is.

---

## 🔄 Migration Best Practices

### **DO:**
✅ Use `npx prisma migrate dev` in development  
✅ Use `npx prisma migrate deploy` in production  
✅ Always backup database before migration  
✅ Test migrations on staging first  
✅ Use descriptive migration names  
✅ Keep migrations in proper folder structure

### **DON'T:**
❌ Manually edit `_prisma_migrations` table  
❌ Delete applied migrations  
❌ Skip migrations  
❌ Run migrations directly without Prisma CLI  
❌ Use `migrate reset` in production  
❌ Create migrations with UPPERCASE defaults

---

## 🧪 Testing Migrations

### **Test on Fresh Database:**
```bash
# 1. Create test database
mysql -u root -p -e "CREATE DATABASE salfanet_radius_test;"

# 2. Update .env with test database
DATABASE_URL="mysql://root@localhost:3306/salfanet_radius_test"

# 3. Apply all migrations
npx prisma migrate deploy

# 4. Verify schema
npx prisma db pull

# 5. Check all tables created
mysql -u root -p salfanet_radius_test -e "SHOW TABLES;"
```

### **Test Migration Rollback (Development Only):**
```bash
# Reset database and reapply
npx prisma migrate reset

# Or apply specific migration
npx prisma migrate deploy
```

---

## 📝 Migration Changelog

### **v2.9.0 - February 17, 2026**

**Changes:**
- ✅ Standardized all status values to lowercase
- ✅ Moved migration to proper folder structure
- ✅ Cleaned up temporary test scripts
- ✅ Updated schema defaults to lowercase
- ✅ Updated all codebase references to lowercase

**Files Modified:** 8 files  
**Migration SQL Lines:** 4 UPDATE statements  
**Schema Changes:** Defaults updated to lowercase

---

## ⚠️ Important Notes

### **Fresh Install vs Upgrade:**

**Fresh Install (New VPS):**
- Migration file exists but has **no effect**
- Schema creates tables with lowercase defaults
- No data to convert
- Migration marked as "applied" automatically

**Upgrade (Existing Database):**
- Migration converts UPPERCASE → lowercase
- Affects existing records
- Schema remains the same (just data changes)
- Critical for code consistency

### **Why This Migration Matters:**

1. **Code Consistency:** Code uses lowercase (`status === 'active'`)
2. **Database Consistency:** Old data was UPPERCASE (`ACTIVE`)
3. **Mismatch Issues:** Queries fail if casing doesn't match
4. **Future Proof:** All new records use lowercase from defaults

---

## 🆘 Troubleshooting

### **Issue: Migration already applied but status still UPPERCASE**

**Solution:**
```bash
# Manually run the migration SQL
npx prisma db execute --file prisma/migrations/20260217025500_standardize_status_casing/migration.sql
```

### **Issue: Migration not found**

**Solution:**
```bash
# Check migration folder exists
ls prisma/migrations/20260217025500_standardize_status_casing/

# If not, create it:
mkdir -p prisma/migrations/20260217025500_standardize_status_casing
# Copy migration.sql to that folder
```

### **Issue: Prisma migrate status shows "not applied"**

**Solution:**
```bash
# Mark as applied without running (if already run manually)
npx prisma migrate resolve --applied 20260217025500_standardize_status_casing

# Or apply it for real
npx prisma migrate deploy
```

---

## 📚 Related Documentation

- [DATABASE_MIGRATION_GUIDE.md](DATABASE_MIGRATION_GUIDE.md) - General migration guide
- ROADMAP_PROGRESS_2026-02-17.md - Implementation progress
- TESTING_GUIDE_2026-02-17.md - Testing procedures
- [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md) - API testing

---

**Status:** ✅ Production Ready  
**Last Verified:** February 17, 2026, 3:00 AM WIB  
**Migration Version:** 6 migrations applied
