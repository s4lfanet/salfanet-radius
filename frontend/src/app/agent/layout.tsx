import type { Metadata, Viewport } from 'next';
import AgentLayoutClient from './AgentLayoutClient';
import { getCompanyInfo } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyInfo();
  return {
    title: `Agent Portal - ${company?.name || 'SALFANET RADIUS'}`,
    description: 'Portal Agent untuk Generate Voucher',
    manifest: '/manifest-agent.json',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#465fff',
};

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentLayoutClient>{children}</AgentLayoutClient>;
}
