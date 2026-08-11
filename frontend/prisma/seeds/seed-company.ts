import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding company data from production...');

  // Check if company exists
  const existingCompany = await prisma.company.findFirst();
  
  if (existingCompany) {
    console.log('✅ Company already exists:', existingCompany.name);
    console.log('Updating isolation settings...');
    
    const updated = await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        isolationEnabled: true,
        isolationIpPool: '192.168.200.0/24',
        isolationRateLimit: '64k/64k',
        isolationRedirectUrl: null,
        isolationMessage: null,
        isolationAllowDns: true,
        isolationAllowPayment: true,
        isolationNotifyWhatsapp: true,
        isolationNotifyEmail: false,
        gracePeriodDays: 0,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || ''
      }
    });
    
    console.log('✅ Company isolation settings updated');
    console.log(JSON.stringify(updated, null, 2));
  } else {
    console.log('Creating new company...');
    
    const company = await prisma.company.create({
      data: {
        id: randomUUID(),
        name: 'SALFANET RADIUS - Local Dev',
        address: 'Local Development',
        phone: '+62 82214535152',
        email: 'admin@localhost',
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
        bankAccounts: []
      }
    });
    
    console.log('✅ Company created successfully');
    console.log(JSON.stringify(company, null, 2));
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
