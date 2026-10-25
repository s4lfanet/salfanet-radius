'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, BellRing, CheckCheck, Inbox, Loader2, RotateCcw, Ticket, Wallet, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';

interface NotifEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  timestamp: string;
  read: boolean;
}

interface NotifResponse {
  success: boolean;
  events: NotifEvent[];
  unread: number;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  settlement_confirmed: CheckCheck,
  settlement_unconfirmed: RotateCcw,
  proof_approved: Inbox,
  proof_rejected: XCircle,
  payment_assigned: Wallet,
  ticket_assigned: Ticket,
};

const formatTime = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return formatWIB(iso, 'dd MMM yyyy');
};

export default function CollectorNotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<NotifEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiAdmin<NotifResponse>('/api/collector/notifications');
      if (data?.success) {
        setEvents(data.events);
        setUnread(data.unread);
      }
    } catch { /* keep what is shown; the next poll retries */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // A push that arrives while the portal is open refreshes the bell at once.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PUSH_RECEIVED') void load();
      if (e.data?.type === 'NOTIFICATION_CLICK' && typeof e.data.url === 'string') {
        try { router.push(new URL(e.data.url).pathname); } catch { /* ignore a malformed link */ }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [load, router]);

  // Browser push: is this device already subscribed? If so, make sure the
  // server knows too (an earlier failed sign-up would otherwise stay silent).
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushSubscribed(!!sub);
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

  useEffect(() => {
    if (!open) return;
    void load();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, load]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setEvents((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - ids.length));
    try {
      await apiAdmin('/api/collector/notifications', { method: 'POST', body: JSON.stringify({ ids }) });
    } catch { void load(); }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiAdmin('/api/collector/notifications', { method: 'POST', body: JSON.stringify({ all: true }) });
      setEvents((list) => list.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { void load(); }
    finally { setMarkingAll(false); }
  };

  const openEvent = (n: NotifEvent) => {
    if (!n.read) void markRead([n.id]);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const handlePushToggle = async () => {
    if (!pushSupported) return;
    setPushLoading(true);
    setPushError(null);
    try {
      if (pushSubscribed) {
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
        setPushSubscribed(false);
        return;
      }

      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') {
        setPushError('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.');
        return;
      }
      const vapidRes = await fetch('/api/push/vapid-public-key');
      const vapid = await vapidRes.json().catch(() => ({ success: false }));
      if (!vapid.success || !vapid.publicKey) {
        setPushError('Notifikasi push belum diaktifkan di server. Hubungi admin.');
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
        setPushError(saved.error || 'Gagal mendaftarkan notifikasi di server.');
        return;
      }
      setPushSubscribed(true);
      setPermission('granted');
    } catch (e) {
      console.error('[CollectorPush]', e);
      setPushError('Notifikasi push tidak bisa diaktifkan di browser ini.');
    } finally {
      setPushLoading(false);
    }
  };

  const iconBtn = 'relative h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';
  const pushOn = pushSubscribed && permission === 'granted';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        className={cn(iconBtn, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
      >
        {pushOn ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Tutup notifikasi" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[min(34rem,calc(100dvh-5rem))] flex flex-col bg-card border border-border rounded-2xl z-50 overflow-hidden"
            role="dialog"
            aria-label="Notifikasi"
          >
            <div className="bg-card border-b border-border pl-4 pr-1 h-12 shrink-0 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">Notifikasi{unread > 0 && <span className="ml-2 text-xs font-medium text-muted-foreground">{unread} belum dibaca</span>}</span>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} disabled={markingAll} className="h-8 px-2.5 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-600/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                    {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Tandai semua dibaca'}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
              {!loaded ? (
                <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="w-4 h-4 animate-spin" /> Memuat...</div>
              ) : events.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm font-medium text-foreground">Belum ada notifikasi</p>
                  <p className="text-xs text-muted-foreground mt-1">Konfirmasi setoran, hasil pemeriksaan bukti transfer, dan tiket untuk Anda muncul di sini.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {events.map((n) => {
                    const Icon = ICONS[n.type] || Bell;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openEvent(n)}
                          className={cn('w-full flex gap-3 p-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted', !n.read && 'bg-blue-600/5')}
                        >
                          <span className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0', n.read ? 'text-muted-foreground bg-muted' : 'text-blue-700 dark:text-blue-400 bg-blue-600/10')}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={cn('block text-sm truncate', n.read ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{n.title}</span>
                            <span className="block text-xs text-muted-foreground line-clamp-3">{n.message}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">{formatTime(n.timestamp)}</span>
                          </span>
                          {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-600 shrink-0" aria-label="Belum dibaca" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {pushSupported && (
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Notifikasi di perangkat ini</p>
                    <p className="text-xs text-muted-foreground">
                      {permission === 'denied' ? 'Diblokir di pengaturan browser' : pushOn ? 'Aktif, muncul walau portal tertutup' : 'Nonaktif'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePushToggle}
                    disabled={pushLoading || permission === 'denied'}
                    aria-pressed={pushOn}
                    className="h-8 shrink-0 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pushOn ? <BellOff className="w-3.5 h-3.5" /> : <BellRing className="w-3.5 h-3.5" />}
                    {pushOn ? 'Matikan' : 'Aktifkan'}
                  </button>
                </div>
                {pushError && <p className="mt-2 text-xs text-red-700 dark:text-red-400" role="alert">{pushError}</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
