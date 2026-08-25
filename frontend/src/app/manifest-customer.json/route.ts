import { generateManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await generateManifest({
    id: '/customer',
    name: 'Customer',
    short_name: 'Customer',
    description: 'Portal Pelanggan {name} - cek tagihan, paket, dan tiket',
    start_url: '/customer',
    scope: '/customer',
    theme_color: '#06b6d4',
    background_color: '#03131d',
    shortcuts: [
      { name: 'Beranda', url: '/customer' },
      { name: 'Tagihan', url: '/customer/invoices' },
    ],
  });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
