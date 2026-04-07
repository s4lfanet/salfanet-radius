import type { Metadata, Viewport } from 'next';
import TechnicianPortalLayout from '../TechnicianPortalLayout';
import { prisma } from '@/server/db/client';

export async function generateMetadata(): Promise<Metadata> {
  const company = await prisma.company.findFirst({ select: { name: true } });
  return {
    title: `Portal Teknisi - ${company?.name || 'SALFANET RADIUS'}`,
    description: 'Portal Teknisi untuk manajemen tiket dan pelanggan',
    manifest: '/manifest-technician.json',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0520',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <TechnicianPortalLayout>{children}</TechnicianPortalLayout>;
}
