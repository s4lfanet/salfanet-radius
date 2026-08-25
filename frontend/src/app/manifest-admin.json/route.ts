import { generateManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await generateManifest({
    id: '/admin',
    name: 'Admin',
    short_name: 'Admin',
    description: 'Panel Admin {name} - manajemen ISP/RTRW.NET',
    start_url: '/admin',
    scope: '/admin',
    theme_color: '#06b6d4',
    background_color: '#03131d',
    shortcuts: [
      { name: 'Dashboard', url: '/admin' },
      { name: 'Pelanggan', url: '/admin/customers' },
    ],
  });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
