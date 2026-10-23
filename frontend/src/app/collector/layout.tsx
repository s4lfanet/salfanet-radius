import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { getCompanyInfo } from '@/lib/api/server';

// Same typeface as the admin and customer apps (DESIGN.md): large x-height and
// clearly distinct figures for rupiah amounts and invoice numbers.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' });

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

// Type follows the panel's root size (14px, 13px on phones) so the portal
// reads at the same scale as the admin panel. Control heights are set in px
// instead (40px, 44px on touch screens), so tap targets do not shrink with it.
export default function CollectorRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={jakarta.className}>{children}</div>;
}
