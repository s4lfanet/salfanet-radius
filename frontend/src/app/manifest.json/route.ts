import { generateManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await generateManifest({
    id: '/',
    name: '',
    short_name: 'Salfanet',
    description: 'Billing & RADIUS management system untuk ISP/RTRW.NET',
    start_url: '/customer',
    scope: '/',
    theme_color: '#06b6d4',
    background_color: '#03131d',
    shortcuts: [
      { name: 'Admin Panel', url: '/admin' },
      { name: 'Portal Pelanggan', url: '/customer' },
    ],
  });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
