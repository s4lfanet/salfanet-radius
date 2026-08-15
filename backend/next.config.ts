import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Skip TS type-checking during build (same as frontend)
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // Node.js-only packages used in API routes
  serverExternalPackages: ['node-routeros', 'iconv-lite', 'source-map-support', 'ssh2', 'cpu-features', 'sshcrypto'],
  // Fix workspace root detection issue in pnpm monorepo
  turbopack: {
    root: path.resolve(__dirname, '..'),
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  // CORS — allow frontend to call this API
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,PATCH,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-cron-secret, x-requested-with' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
