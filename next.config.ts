import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typescript: {
    // Skip TS type-checking during build to avoid OOM on low-RAM VPS (4GB)
    // Type errors are caught in development; CI/lint checks should run separately
    ignoreBuildErrors: true,
  },
  // Optimize for low-resource VPS (2GB RAM)
  output: 'standalone', // Minimal deployment bundle — only includes required files
  // Image optimization cache: default 60s → 1 hour (reduce CPU re-encoding)
  images: {
    minimumCacheTTL: 3600,
    formats: ['image/webp'],
  },
  experimental: {
    // Reduce memory usage during build
    workerThreads: false,
    cpus: 1, // Use single CPU for build to reduce memory
  },
  // Node.js-only packages used in API routes — skip Turbopack bundling entirely
  // This prevents static analysis of conditional require('source-map-support') in node-routeros
  serverExternalPackages: ['node-routeros', 'source-map-support'],
  // Fix workspace root detection issue
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Security & Performance
  productionBrowserSourceMaps: false, // Protect code & save memory
  poweredByHeader: false, // Remove X-Powered-By header
  compress: true, // Enable gzip compression
  
  // Headers for security
  async headers() {
    // CSP directives — practical policy untuk Next.js + TailwindCSS + SweetAlert2
    const cspDirectives = [
      "default-src 'self'",
      // Scripts: allow self + inline (Next.js hydration) + Cloudflare analytics
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      // Styles: allow self + inline (Tailwind utility classes)
      "style-src 'self' 'unsafe-inline'",
      // Images: allow self, data URIs (inline), blob (PDF export), CDN maps
      "img-src 'self' data: blob: https: http:",
      // Fonts: self + data URIs
      "font-src 'self' data:",
      // Connections: self + Cloudflare analytics beacon + payment gateways
      "connect-src 'self' https://cloudflareinsights.com https://api.midtrans.com https://api.xendit.co https://sandbox.duitku.com https://passport.duitku.com https://sandbox.tripay.co.id https://tripay.co.id",
      // Frames: hanya self (bukan 'none' agar SweetAlert2 modal bisa inline)
      "frame-src 'self' https://app.midtrans.com https://app.sandbox.midtrans.com",
      // Batas upload media — 10MB
      "media-src 'self' blob:",
      // Worker: untuk PDF generation
      "worker-src 'self' blob:",
      // Objek HTML (Flash, dll): tidak diizinkan
      "object-src 'none'",
      // Cegah clickjacking via CSP (lebih kuat dari X-Frame-Options)
      "frame-ancestors 'self'",
      // Base URI: hanya self
      "base-uri 'self'",
      // Form action: hanya self
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self), payment=(self), usb=()',
          },
        ],
      },
      // API routes: disable caching untuk semua endpoint sensitif
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
