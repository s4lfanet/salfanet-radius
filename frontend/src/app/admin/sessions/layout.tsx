'use client';

import { CyberToastProvider } from '@/components/cyberpunk/CyberToast';

/**
 * Sessions sub-layout — provides CyberToastProvider for all sessions pages.
 *
 * Reason: the admin root layout also wraps with CyberToastProvider, but Next.js
 * code-splitting can place the layout bundle and each page bundle into separate
 * JS chunks. When CyberToast.tsx ends up in two chunks, createContext() is called
 * twice, producing two different context objects. The outer provider sets one
 * context while the page's useToast() reads the other → "must be used within a
 * CyberToastProvider" error.
 *
 * By adding a provider co-located with the consuming pages (same bundle group),
 * all sessions pages reliably read from the nearest matching context instance.
 */
export default function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CyberToastProvider>{children}</CyberToastProvider>;
}
