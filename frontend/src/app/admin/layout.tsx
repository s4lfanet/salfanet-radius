import type { Metadata } from 'next';
import AdminClientLayout from './AdminClientLayout';
import { getCompanyInfo } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyInfo();
  return {
    title: `Admin Panel - ${company?.name || 'SALFANET RADIUS'}`,
    manifest: '/manifest-admin.json',
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
