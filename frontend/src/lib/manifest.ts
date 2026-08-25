import 'server-only';
import { getCompanyInfo } from '@/lib/api/server';

const FALLBACK_NAME = 'Salfanet';

interface ManifestConfig {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  shortcuts?: Array<{ name: string; url: string; }>;
}

/**
 * Generate a PWA manifest dynamically with company name from DB.
 * Falls back to "Salfanet" if company name is not set.
 */
export async function generateManifest(config: ManifestConfig) {
  const company = await getCompanyInfo();
  const companyName = company?.name || FALLBACK_NAME;

  return {
    id: config.id,
    name: `${companyName} ${config.name}`,
    short_name: config.short_name,
    description: config.description.replace('{name}', companyName),
    start_url: config.start_url,
    scope: config.scope,
    display: 'standalone',
    display_override: config.id === '/' ? ['standalone', 'minimal-ui'] : undefined,
    orientation: 'any',
    background_color: config.background_color,
    theme_color: config.theme_color,
    lang: 'id-ID',
    prefer_related_applications: false,
    categories: ['business', 'utilities'],
    icons: [
      { src: '/api/pwa/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/api/pwa/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: config.shortcuts?.map(s => ({
      name: s.name,
      url: s.url,
      icons: [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }],
    })),
  };
}
