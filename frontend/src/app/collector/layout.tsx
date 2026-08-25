import type { Metadata, Viewport } from 'next';
import { getCompanyInfo } from '@/lib/api/server';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyInfo();
  return {
    title: `Portal Kolektor - ${company?.name || 'SALFANET RADIUS'}`,
    description: 'Portal Kolektor untuk manajemen tagihan dan setoran',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#10b981',
};

export default function CollectorRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
