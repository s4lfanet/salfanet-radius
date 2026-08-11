'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already running as installed PWA (standalone/fullscreen/minimal-ui)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      // iOS Safari
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      setInstalled(true);
      return;
    }

    // Dismissed in this session
    if (sessionStorage.getItem('pwa-install-dismissed')) {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  if (installed || dismissed || !deferredPrompt) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[99998] w-[calc(100vw-32px)] max-w-sm
        flex items-center gap-3 px-4 py-3
        bg-gray-950/95 border border-cyan-500/40 rounded-2xl
        shadow-[0_0_40px_rgba(6,182,212,0.25)] backdrop-blur-sm
        animate-in slide-in-from-bottom-4 duration-300"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
        <Download className="w-4 h-4 text-cyan-400" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium leading-tight">Install Aplikasi</p>
        <p className="text-gray-400 text-xs leading-tight mt-0.5 truncate">Tambah ke layar utama HP Anda</p>
      </div>

      {/* Install button */}
      <button
        onClick={handleInstall}
        className="flex-shrink-0 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700
          text-white rounded-lg font-medium text-xs transition-colors"
      >
        Install
      </button>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Tutup"
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
