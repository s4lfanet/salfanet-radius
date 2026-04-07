import type { Metadata } from 'next';
import CustomerClientLayout from './CustomerClientLayout';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const company = await prisma.company.findFirst({ select: { name: true } });
  return {
    title: `Customer Portal - ${company?.name || 'SALFANET RADIUS'}`,
    manifest: '/manifest-customer.json',
  };
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerClientLayout>{children}</CustomerClientLayout>;
}

