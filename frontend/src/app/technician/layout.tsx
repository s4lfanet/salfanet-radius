import type { Metadata, Viewport } from 'next';
import { getCompanyInfo } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyInfo();
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
  themeColor: '#f59e0b',
};

export default function TechnicianRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
