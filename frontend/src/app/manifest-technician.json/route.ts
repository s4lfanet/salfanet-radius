import { generateManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await generateManifest({
    id: '/technician',
    name: 'Teknisi',
    short_name: 'Teknisi',
    description: 'Portal Teknisi {name} - manajemen tiket lapangan dan pelanggan',
    start_url: '/technician/login',
    scope: '/technician',
    theme_color: '#f59e0b',
    background_color: '#0a0520',
    shortcuts: [
      { name: 'Dashboard', url: '/technician/dashboard' },
      { name: 'Tiket', url: '/technician/tickets' },
    ],
  });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
