import type { Metadata } from 'next';
import CustomerClientLayout from './CustomerClientLayout';
import { getCompanyInfo } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyInfo();
  return {
    title: `Customer Portal - ${company?.name || 'SALFANET RADIUS'}`,
    manifest: '/manifest-customer.json',
  };
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerClientLayout>{children}</CustomerClientLayout>;
}

