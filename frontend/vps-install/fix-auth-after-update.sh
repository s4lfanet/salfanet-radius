#!/bin/bash
# ==========================================================================
# SALFANET RADIUS - Auth Self-Heal for Legacy Updates
# ==========================================================================
# Tujuan:
# 1) Migrasi akun admin dari tabel legacy `admin_user` -> `admin_users` jika perlu
# 2) Pastikan minimal ada 1 akun SUPER_ADMIN aktif
# 3) Buat emergency superadmin jika database kosong total (hanya fallback)
#
# Aman dijalankan berulang (idempotent).
# ==========================================================================

set -e

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"

if [ ! -d "$APP_DIR" ]; then
  echo "[AUTH-SELF-HEAL] APP_DIR not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

node <<'NODE'
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function hasTable(tableName) {
  const rows = await prisma.$queryRawUnsafe(`SHOW TABLES LIKE '${tableName}'`);
  return Array.isArray(rows) && rows.length > 0;
}

async function countAdminUsers() {
  const rows = await prisma.$queryRawUnsafe('SELECT COUNT(1) AS c FROM admin_users');
  return Number(rows?.[0]?.c || 0);
}

async function countActiveSuperAdmin() {
  const rows = await prisma.$queryRawUnsafe("SELECT COUNT(1) AS c FROM admin_users WHERE role='SUPER_ADMIN' AND isActive=1");
  return Number(rows?.[0]?.c || 0);
}

async function migrateLegacyAdminUser() {
  const existsLegacy = await hasTable('admin_user');
  if (!existsLegacy) return false;

  const currentCount = await countAdminUsers();
  if (currentCount > 0) return false;

  const legacyRows = await prisma.$queryRawUnsafe('SELECT COUNT(1) AS c FROM admin_user');
  const legacyCount = Number(legacyRows?.[0]?.c || 0);
  if (legacyCount === 0) return false;

  await prisma.$executeRawUnsafe(`
    INSERT INTO admin_users (
      id, username, email, password, name, role, isActive, phone,
      createdAt, updatedAt, lastLogin, twoFactorEnabled, twoFactorSecret
    )
    SELECT
      id,
      username,
      email,
      password,
      COALESCE(name, username),
      COALESCE(role, 'SUPER_ADMIN'),
      COALESCE(isActive, 1),
      phone,
      COALESCE(createdAt, NOW(3)),
      COALESCE(updatedAt, NOW(3)),
      lastLogin,
      COALESCE(twoFactorEnabled, 0),
      twoFactorSecret
    FROM admin_user
  `);

  return true;
}

async function ensureSuperAdmin() {
  const superAdminCount = await countActiveSuperAdmin();
  if (superAdminCount > 0) return { changed: false };

  const anyAdmin = await prisma.adminUser.findFirst({ orderBy: { createdAt: 'asc' } });
  if (anyAdmin) {
    await prisma.adminUser.update({
      where: { id: anyAdmin.id },
      data: { role: 'SUPER_ADMIN', isActive: true },
    });
    return { changed: true, promoted: anyAdmin.username };
  }

  const fallbackPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
  const hashed = await bcrypt.hash(fallbackPassword, 12);

  await prisma.adminUser.upsert({
    where: { username: 'superadmin' },
    update: {
      password: hashed,
      role: 'SUPER_ADMIN',
      isActive: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      name: 'Super Administrator',
    },
    create: {
      id: 'admin-superadmin',
      username: 'superadmin',
      email: 'admin@salfanet.local',
      password: hashed,
      name: 'Super Administrator',
      role: 'SUPER_ADMIN',
      isActive: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

  return { changed: true, createdFallback: true, fallbackPassword };
}

(async () => {
  try {
    const hasAdminUsers = await hasTable('admin_users');
    if (!hasAdminUsers) {
      console.log('[AUTH-SELF-HEAL] admin_users table not found yet (skip)');
      return;
    }

    const migrated = await migrateLegacyAdminUser();
    if (migrated) {
      console.log('[AUTH-SELF-HEAL] Migrated legacy admin_user -> admin_users');
    }

    const ensure = await ensureSuperAdmin();
    if (ensure.changed && ensure.promoted) {
      console.log(`[AUTH-SELF-HEAL] Promoted user to SUPER_ADMIN: ${ensure.promoted}`);
    }

    if (ensure.changed && ensure.createdFallback) {
      console.log('[AUTH-SELF-HEAL] Created fallback superadmin account');
      console.log(`[AUTH-SELF-HEAL] TEMP PASSWORD: ${ensure.fallbackPassword}`);
      console.log('[AUTH-SELF-HEAL] Please login and change password immediately.');
    }

    const countRows = await prisma.$queryRawUnsafe('SELECT COUNT(1) AS c FROM admin_users');
    console.log(`[AUTH-SELF-HEAL] admin_users_count=${Number(countRows?.[0]?.c || 0)}`);
  } catch (err) {
    console.error('[AUTH-SELF-HEAL] Error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
NODE
