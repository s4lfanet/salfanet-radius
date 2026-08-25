import { generateManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export async function GET() {
  const manifest = await generateManifest({
    id: '/agent',
    name: 'Agent',
    short_name: 'Agent',
    description: 'Portal Agent {name} - generate dan kelola voucher',
    start_url: '/agent',
    scope: '/agent',
    theme_color: '#8b5cf6',
    background_color: '#0a0520',
    shortcuts: [
      { name: 'Dashboard', url: '/agent' },
      { name: 'Voucher', url: '/agent/voucher' },
    ],
  });

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
