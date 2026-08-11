import { PrismaClient, AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, ROLE_TEMPLATES } from './permissions';
import { seedParameterDisplayConfig } from './parameter-display-config';
import { createInvoiceTemplates } from './create-invoice-templates';
import { seedInvoiceOverdueTemplates } from './create-invoice-overdue-templates';
import { seedIsolationTemplates } from './isolation-templates';
import { seedEmailTemplates } from './email-templates';
import { seedWhatsAppTemplates } from './whatsapp-templates';
import { seedManualExtensionTemplates } from './manual-extension-templates';
import { seedTicketCategories } from './ticket-categories';

const prisma = new PrismaClient();

/**
 * Complete seed file based on actual production database
 * Run with: npx prisma db seed
 */

// =============================================
// TRANSACTION CATEGORIES (Keuangan)
// =============================================
const transactionCategories = [
  // INCOME
  { id: 'cat-income-pppoe', name: 'Pembayaran PPPoE', type: 'INCOME', description: 'Pendapatan dari pembayaran pelanggan PPPoE bulanan' },
  { id: 'cat-income-hotspot', name: 'Pembayaran Hotspot', type: 'INCOME', description: 'Pendapatan dari penjualan voucher hotspot' },
  { id: 'cat-income-instalasi', name: 'Biaya Instalasi', type: 'INCOME', description: 'Pendapatan dari biaya instalasi pelanggan baru' },
  { id: 'cat-income-lainnya', name: 'Pendapatan Lain-lain', type: 'INCOME', description: 'Pendapatan dari sumber lain' },
  // EXPENSE
  { id: 'cat-expense-bandwidth', name: 'Bandwidth & Upstream', type: 'EXPENSE', description: 'Biaya bandwidth dan koneksi upstream' },
  { id: 'cat-expense-gaji', name: 'Gaji Karyawan', type: 'EXPENSE', description: 'Biaya gaji dan upah karyawan' },
  { id: 'cat-expense-listrik', name: 'Listrik', type: 'EXPENSE', description: 'Biaya listrik untuk operasional' },
  { id: 'cat-expense-maintenance', name: 'Maintenance & Repair', type: 'EXPENSE', description: 'Biaya perawatan dan perbaikan perangkat' },
  { id: 'cat-expense-hardware', name: 'Peralatan & Hardware', type: 'EXPENSE', description: 'Pembelian peralatan dan hardware jaringan' },
  { id: 'cat-expense-sewa', name: 'Sewa Tempat', type: 'EXPENSE', description: 'Biaya sewa kantor atau tempat operasional' },
  { id: 'cat-expense-komisi', name: 'Komisi Agent', type: 'EXPENSE', description: 'Biaya komisi untuk agent voucher' },
  { id: 'cat-expense-marketing', name: 'Marketing & Promosi', type: 'EXPENSE', description: 'Biaya marketing, iklan, dan promosi' },
  { id: 'cat-expense-lainnya', name: 'Operasional Lainnya', type: 'EXPENSE', description: 'Biaya operasional lainnya' },
];

// =============================================
// HOTSPOT PROFILES (Sample)
// =============================================
// Hotspot profiles are not seeded by default.
// Admins can create their own profiles via the admin panel.

// =============================================
// ADMIN USER (Default Super Admin)
// =============================================
const adminUser = {
  id: 'admin-superadmin',
  username: 'superadmin',
  email: 'admin@example.com',
  password: 'admin123', // Will be hashed
  name: 'Super Administrator',
  role: 'SUPER_ADMIN',
  isActive: true,
};

// =============================================
// PERMISSIONS - Using imported from permissions.ts
// =============================================
// Permissions are imported from './permissions' for consistency

// =============================================
// MAIN SEED FUNCTION
// =============================================
export async function seedAll(forceTemplates = false) {
  console.log('🌱 Starting complete database seed...\n');
  if (forceTemplates) {
    console.log('⚠️  Force mode: templates will be reset to defaults\n');
  }

  // 1. Seed Transaction Categories
  console.log('📊 Seeding Transaction Categories...');
  let catCount = 0;
  for (const cat of transactionCategories) {
    try {
      const existing = await prisma.transactionCategory.findUnique({
        where: { id: cat.id },
      });
      
      if (existing) {
        await prisma.transactionCategory.update({
          where: { id: cat.id },
          data: { description: cat.description },
        });
        catCount++;
      } else {
        await prisma.transactionCategory.create({
          data: { ...cat, type: cat.type as any, isActive: true },
        });
        catCount++;
      }
    } catch (error: any) {
      // Skip if already exists (duplicate name or id)
      if (error.code === 'P2002') {
        console.log(`   ⊙ Category exists: ${cat.name}`);
      } else {
        throw error;
      }
    }
  }
  console.log(`   ✅ ${catCount} categories seeded\n`);

  // 2. Seed Permissions
  console.log('🔐 Seeding Permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { name: perm.name, category: perm.category, description: perm.description },
      create: {
        id: crypto.randomUUID(),
        key: perm.key,
        name: perm.name,
        category: perm.category,
        description: perm.description,
        isActive: true,
      },
    });
  }
  console.log(`   ✅ ${PERMISSIONS.length} permissions seeded\n`);

  // 2.5 Seed Role Permission Templates
  console.log('👥 Seeding Role Permission Templates...');
  for (const [role, permissionKeys] of Object.entries(ROLE_TEMPLATES)) {
    // Delete existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { role: role as AdminRole },
    });

    // Create new role permissions
    let count = 0;
    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUnique({
        where: { key },
      });

      if (permission) {
        await prisma.rolePermission.create({
          data: {
            id: crypto.randomUUID(),
            role: role as AdminRole,
            permissionId: permission.id,
          },
        });
        count++;
      }
    }
    console.log(`   ✅ Role ${role}: ${count} permissions`);
  }
  console.log('');

  // 3. Seed Admin User
  console.log('👤 Seeding Admin User...');
  const hashedPassword = await bcrypt.hash(adminUser.password, 10);
  const existingAdmin = await prisma.adminUser.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });
  
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        password: hashedPassword,
        name: adminUser.name,
        role: adminUser.role as any,
        isActive: adminUser.isActive,
      },
    });
    console.log(`   ✅ Admin user created: ${adminUser.username} / ${adminUser.password}\n`);
  } else {
    console.log(`   ⊙ Admin user already exists: ${existingAdmin.username}\n`);
  }

  // 4. Hotspot Profiles — not seeded; created by admin via UI
  console.log('📶 Hotspot Profiles: skipped (create via admin panel)\n');

  // 4.5 Seed Company (default row required by /api/company/info and isolir setup)
  console.log('🏢 Seeding Company...');
  const existingCompany = await prisma.company.findFirst();
  if (existingCompany) {
    console.log(`   ⊙ Company already exists: ${existingCompany.name}\n`);
  } else {
    await prisma.company.create({
      data: {
        id: crypto.randomUUID(),
        name: 'SALFANET RADIUS',
        address: '',
        phone: '',
        email: '',
        timezone: 'Asia/Jakarta',
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || '',
        poweredBy: 'SALFANET RADIUS',
        invoiceGenerateDays: 7,
        gracePeriodDays: 0,
        isolationEnabled: true,
        isolationIpPool: '192.168.200.0/24',
        isolationRateLimit: '64k/64k',
        isolationRedirectUrl: null,
        isolationMessage: null,
        isolationAllowDns: true,
        isolationAllowPayment: true,
        isolationNotifyWhatsapp: true,
        isolationNotifyEmail: false,
        bankAccounts: [],
      },
    });
    console.log('   ✅ Default company created\n');
  }

  // 5. Seed WhatsApp Templates (Using imported function)
  console.log('💬 Seeding WhatsApp Templates...');
  try {
    await seedWhatsAppTemplates(forceTemplates);
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed WhatsApp templates:', error);
  }
  console.log('');

  // 6. Setup RADIUS isolir group with dynamic settings
  console.log('🔧 Setting up RADIUS isolir group...');
  
  // Get isolation settings from company
  const company = await prisma.company.findFirst({
    select: {
      isolationRateLimit: true,
    }
  });
  
  const rateLimit = company?.isolationRateLimit || '128k/128k 256k/256k 64k/64k 8 8';
  
  await prisma.$executeRaw`DELETE FROM radgroupreply WHERE groupname = 'isolir'`;
  await prisma.$executeRaw`
    INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
    ('isolir', 'Mikrotik-Group', ':=', 'isolir'),
    ('isolir', 'Mikrotik-Rate-Limit', ':=', ${rateLimit}),
    ('isolir', 'Session-Timeout', ':=', '86400'),
    ('isolir', 'Framed-Pool', ':=', 'pool-isolir')
  `;
  console.log(`   ✅ Isolir group configured with rate limit: ${rateLimit}\n`);

  // 7. Seed GenieACS Parameter Display Config
  console.log('⚙️ Seeding GenieACS Parameter Display Config...');
  try {
    await seedParameterDisplayConfig();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed parameter display config:', error);
  }
  console.log('');

  // 8. Seed Invoice Templates
  console.log('📧 Seeding Invoice Templates...');
  try {
    await createInvoiceTemplates();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed invoice templates:', error);
  }
  console.log('');

  // 9. Seed Invoice Overdue Templates
  console.log('⏰ Seeding Invoice Overdue Templates...');
  try {
    await seedInvoiceOverdueTemplates();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed invoice overdue templates:', error);
  }
  console.log('');

  // 10. Seed Isolation Templates (WhatsApp, Email, HTML)
  console.log('🔒 Seeding Isolation Templates...');
  try {
    await seedIsolationTemplates();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed isolation templates:', error);
  }
  console.log('');

  // 11. Seed Email Templates (All notification templates)
  console.log('📧 Seeding Email Templates...');
  try {
    await seedEmailTemplates(forceTemplates);
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed email templates:', error);
  }
  console.log('');

  // 12. Seed Manual Extension Templates (WhatsApp & Email)
  console.log('🔄 Seeding Manual Extension Templates...');
  try {
    await seedManualExtensionTemplates();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed manual extension templates:', error);
  }
  console.log('');

  // 13. Seed Ticket Categories
  console.log('🎫 Seeding Ticket Categories...');
  try {
    await seedTicketCategories();
  } catch (error) {
    console.error('   ⚠️ Warning: Failed to seed ticket categories:', error);
  }
  console.log('');

  console.log('🎉 Database seeding completed!\n');
  console.log('================================');
  console.log('Default Admin Login:');
  console.log(`  Username: ${adminUser.username}`);
  console.log(`  Password: ${adminUser.password}`);
  console.log('================================\n');
}

// Run if called directly
if (require.main === module) {
  const forceTemplates = process.argv.includes('--force-templates');
  seedAll(forceTemplates)
    .catch((e) => {
      console.error('❌ Seeding error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
