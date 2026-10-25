'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Browser push for the collector portal, shared by the bell, the sidebar and
 * the prompt on the page, so they always agree on whether it is on.
 */

interface PushState {
  /** Can this browser do push at all. When false, `reason` says why. */
  supported: boolean;
  reason: string | null;
  subscribed: boolean;
  permission: NotificationPermission;
  loading: boolean;
  error: string | null;
  /** Subscribed and allowed: notifications will arrive. */
  on: boolean;
  toggle: () => Promise<void>;
}

const Ctx = createContext<PushState | null>(null);

export function useCollectorPush(): PushState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCollectorPush must be used inside CollectorPushProvider');
  return v;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Why push cannot work here, in words the collector can act on. Null when it can. */
function unsupportedReason(): string | null {
  if (typeof window === 'undefined') return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (!window.isSecureContext) return 'Notifikasi push hanya jalan lewat alamat HTTPS. Buka portal dari alamat https.';
  if (ios && !installed) return 'Di iPhone atau iPad, pasang portal ke Layar Utama dulu (Bagikan, lalu Tambah ke Layar Utama), lalu buka dari ikonnya.';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'Browser ini tidak mendukung notifikasi push. Coba Chrome atau Edge terbaru.';
  return null;
}

export function CollectorPushProvider({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Is this device already subscribed? If so, make sure the server knows too:
  // an earlier failed sign-up would otherwise stay silent.
  useEffect(() => {
    const why = unsupportedReason();
    setReason(why);
    setSupported(!why);
    if (why) return;
    setPermission(Notification.permission);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        if (sub && Notification.permission === 'granted') {
          await fetch('/api/push/collector-subscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          }).catch(() => {});
        }
      } catch { /* the toggle reports problems when it is used */ }
    })();
  }, []);

  const toggle = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);
    try {
      if (subscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/push/collector-unsubscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
        }
        setSubscribed(false);
        return;
      }

      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') {
        setError('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.');
        return;
      }
      const vapidRes = await fetch('/api/push/vapid-public-key');
      const vapid = await vapidRes.json().catch(() => ({ success: false }));
      if (!vapid.success || !vapid.publicKey) {
        setError('Notifikasi push belum diaktifkan di server. Hubungi admin.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) });
      }
      const res = await fetch('/api/push/collector-subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const saved = await res.json().catch(() => ({ success: false }));
      if (!saved.success) {
        await sub.unsubscribe();
        setError(saved.error || 'Gagal mendaftarkan notifikasi di server.');
        return;
      }
      setSubscribed(true);
      setPermission('granted');
    } catch (e) {
      console.error('[CollectorPush]', e);
      setError('Notifikasi push tidak bisa diaktifkan di browser ini.');
    } finally {
      setLoading(false);
    }
  }, [supported, subscribed]);

  const value = useMemo<PushState>(
    () => ({ supported, reason, subscribed, permission, loading, error, on: subscribed && permission === 'granted', toggle }),
    [supported, reason, subscribed, permission, loading, error, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const DISMISS_KEY = 'collector-push-prompt-dismissed';

/**
 * The invitation on the page: shown until push is on or the collector says
 * "Nanti" (remembered on this device only). Where push cannot work it stays
 * quiet; the sidebar row says why.
 */
export function CollectorPushPrompt() {
  const push = useCollectorPush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  if (!push.supported || push.on || push.permission === 'denied' || dismissed) return null;

  const later = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* shown again next visit */ }
  };

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3" aria-label="Aktifkan notifikasi">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
          <BellRing className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Aktifkan notifikasi di perangkat ini</p>
          <p className="text-xs text-muted-foreground">Setoran dikonfirmasi, bukti transfer ditolak, dan tiket baru langsung muncul walau portal tertutup.</p>
          {push.error && <p className="mt-1 text-xs text-red-700 dark:text-red-400" role="alert">{push.error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={later} className="h-[40px] pointer-coarse:h-[44px] px-3 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
          Nanti
        </button>
        <button
          type="button"
          onClick={push.toggle}
          disabled={push.loading}
          className="inline-flex items-center justify-center gap-2 h-[40px] pointer-coarse:h-[44px] px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {push.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Aktifkan
        </button>
      </div>
    </section>
  );
}

/** The always-present control for the sidebar and drawer: state, the switch, or the reason it cannot work. */
export function CollectorPushRow() {
  const push = useCollectorPush();

  if (!push.supported) {
    return (
      <div className="px-2 mb-2">
        <p className="flex items-center gap-2 text-xs font-medium text-foreground"><BellOff className="w-4 h-4 shrink-0 text-muted-foreground" /> Notifikasi push tidak tersedia</p>
        {push.reason && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{push.reason}</p>}
      </div>
    );
  }
  const blocked = push.permission === 'denied';
  return (
    <div className="px-2 mb-2">
      <button
        type="button"
        onClick={push.toggle}
        disabled={push.loading || blocked}
        aria-pressed={push.on}
        className={cn(
          'w-full flex items-center gap-3 h-[40px] pointer-coarse:h-[44px] px-3 rounded-xl text-xs font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          push.on ? 'bg-blue-600/10 text-blue-700 dark:text-blue-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {push.loading ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : push.on ? <BellRing className="w-[18px] h-[18px]" /> : <BellOff className="w-[18px] h-[18px]" />}
        <span className="flex-1 text-left">{push.on ? 'Notifikasi push aktif' : 'Aktifkan notifikasi push'}</span>
        {push.on && <span className="text-xs font-normal opacity-70">Matikan</span>}
      </button>
      {blocked && <p className="mt-1 px-1 text-xs text-muted-foreground">Diblokir di pengaturan browser. Izinkan notifikasi untuk situs ini.</p>}
      {push.error && <p className="mt-1 px-1 text-xs text-red-700 dark:text-red-400" role="alert">{push.error}</p>}
    </div>
  );
}
