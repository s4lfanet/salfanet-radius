'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePushNotification, type PushRole } from '@/hooks/usePushNotification';

/**
 * Shared sidebar push-notification toggle, identical across all portals.
 * PushToggleRow is the presentational row; SidebarPushToggle wires it to
 * usePushNotification for a given role. Portals that already own a push
 * state (e.g. collector's shared provider) render PushToggleRow directly.
 */

export interface PushToggleRowProps {
  on: boolean;
  denied: boolean;
  /** Why push cannot work on this device, in words the user can act on. */
  reason?: string | null;
  loading: boolean;
  error?: string | null;
  onToggle: () => void;
}

/** Why push cannot work here, or null when it can. */
export function pushUnsupportedReason(): string | null {
  if (typeof window === 'undefined') return 'Notifikasi push tidak tersedia.';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (!window.isSecureContext) {
    return 'Notifikasi push hanya jalan lewat alamat HTTPS. Buka portal dari alamat https.';
  }
  if (ios && !installed) {
    return 'Di iPhone atau iPad, pasang portal ke Layar Utama dulu (Bagikan, lalu Tambah ke Layar Utama), lalu buka dari ikonnya.';
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Browser ini tidak mendukung notifikasi push. Coba Chrome atau Edge terbaru.';
  }
  return null;
}

export function PushToggleRow({ on, denied, reason, loading, error, onToggle }: PushToggleRowProps) {
  const unsupported = reason !== null && reason !== undefined;

  if (unsupported) {
    return (
      <div className="px-2 mb-2">
        <p className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-gray-400 dark:text-gray-500">
          <span className="p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <BellOff className="w-4 h-4" />
          </span>
          <span className="flex-1 text-left tracking-wide">Notif Push</span>
        </p>
        <p className="mt-1 px-3 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">{reason}</p>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={loading || denied}
        aria-pressed={on}
        title={
          denied
            ? 'Notifikasi diblokir - ubah di pengaturan browser'
            : on
            ? 'Klik untuk nonaktifkan notifikasi push'
            : 'Klik untuk aktifkan notifikasi push'
        }
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 border',
          on
            ? 'text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/[0.12] border-brand-200 dark:border-brand-500/30 shadow-sm'
            : denied
            ? 'text-gray-400 dark:text-gray-500 border-transparent opacity-60 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 border-transparent hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5 hover:border-gray-200 dark:hover:border-white/10',
        )}
      >
        <span
          className={cn(
            'p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center transition-all duration-300',
            on ? 'text-brand-500 dark:text-brand-400 bg-brand-100 dark:bg-brand-500/20' : 'text-gray-400 dark:text-gray-500',
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : on ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4" />
          )}
        </span>
        <span className="flex-1 text-left tracking-wide">
          {on ? 'Notif Push: Aktif' : denied ? 'Notif Push: Diblokir' : 'Notif Push: Nonaktif'}
        </span>
        <span
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-all duration-300',
            on
              ? 'border-sidebar-primary bg-sidebar-primary'
              : 'border-sidebar-foreground/20 bg-sidebar-foreground/10',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-300',
              on ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      </button>
      {denied && (
        <p className="mt-1 px-3 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          Diblokir di pengaturan browser. Izinkan notifikasi untuk situs ini.
        </p>
      )}
      {error && (
        <p className="mt-1 px-3 text-[11px] text-red-600 dark:text-red-400 leading-relaxed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface SidebarPushToggleProps {
  role: PushRole;
  /** Extra body fields sent to the subscribe/unsubscribe endpoints (e.g. technicianId). */
  extraBody?: Record<string, string>;
}

export default function SidebarPushToggle({ role, extraBody }: SidebarPushToggleProps) {
  const { isSubscribed, permission, isLoading, error, subscribe, unsubscribe } =
    usePushNotification(role, extraBody);
  const [reason, setReason] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setReason(pushUnsupportedReason());
    setChecked(true);
  }, []);

  // Render nothing until the client-side capability check runs, so SSR and
  // hydration never flash a wrong state.
  if (!checked) return null;

  const on = isSubscribed && permission === 'granted';

  return (
    <PushToggleRow
      on={on}
      denied={permission === 'denied'}
      reason={reason}
      loading={isLoading}
      error={error}
      onToggle={() => {
        void (on ? unsubscribe() : subscribe());
      }}
    />
  );
}
