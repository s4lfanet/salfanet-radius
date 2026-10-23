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

// globals.css shrinks the root font to 14px (13px on phones) for the admin
// panel. The collector portal is sized on a 16px rem (DESIGN.md): at 14px its
// 44px tap targets came out at 36-38px and text-sm at 11-12px. This style
// lives only while a collector page is mounted.
const ROOT_SIZE = 'html{font-size:16px}';

export default function CollectorRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jakarta.className}>
      <style>{ROOT_SIZE}</style>
      {children}
    </div>
  );
}
