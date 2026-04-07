import type { Metadata, Viewport } from 'next';
import AgentLayoutClient from './AgentLayoutClient';
import { prisma } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const company = await prisma.company.findFirst({ select: { name: true } });
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
  themeColor: '#0a0520',
};

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentLayoutClient>{children}</AgentLayoutClient>;
}
