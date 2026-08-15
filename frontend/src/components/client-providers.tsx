'use client';

import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';
import { useAppStore } from '@/lib/store';

export function ClientProviders() {
  const [mounted, setMounted] = useState(false);
  const initializeTimezone = useAppStore((s) => s.initializeTimezone);

  useEffect(() => {
    setMounted(true);
    // Initialize timezone from server on app load.
    // This ensures the frontend uses the company's configured timezone
    // (e.g., Asia/Makassar) instead of defaulting to Asia/Jakarta.
    initializeTimezone().catch((e) => {
      console.warn('Failed to initialize timezone:', e);
    });
  }, [initializeTimezone]);

  if (!mounted) return null;
  return (
    <>
      <Toaster />
      <PwaInstallPrompt />
    </>
  );
}
