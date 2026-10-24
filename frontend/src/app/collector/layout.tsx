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
  themeColor: '#2563EB',
};

// The login page uses the panel's own fonts, like every other portal's login;
// the signed-in portal sets Plus Jakarta Sans in (portal)/layout.tsx.
export default function CollectorRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
