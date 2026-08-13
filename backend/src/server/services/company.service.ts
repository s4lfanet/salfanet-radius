import 'server-only'
import { prisma } from '@/server/db/client';

export async function getCompanyName(): Promise<string> {
  try {
    const company = await prisma.company.findFirst({
      select: { name: true }
    });
    return company?.name || 'SALFANET RADIUS';
  } catch (error) {
    console.error('Error fetching company name:', error);
    return 'SALFANET RADIUS';
  }
}

export async function getCompanyInfo() {
  try {
    const company = await prisma.company.findFirst();
    return company || {
      name: 'SALFANET RADIUS',
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || '',
    };
  } catch (error) {
    console.error('Error fetching company info:', error);
    return {
      name: 'SALFANET RADIUS',
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || '',
    };
  }
}
