'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, BellRing, Loader2, X, Ticket, Wrench, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';

interface NotifEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
}

interface NotifResponse {
  success: boolean;
  events: NotifEvent[];
  count: number;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export default function CollectorNotificationBell() {
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotifEvent[]>([]);
  const [loading, _setLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiAdmin<NotifResponse>('/api/collector/notifications?since=' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (data?.success) {
        setNotifications(data.events);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Push subscription check
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
      } catch { /* silent */ }
    })();
  }, []);

  const handlePushToggle = async () => {
    if (!pushSupported) return;
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/push/technician-unsubscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
        }
        setPushSubscribed(false);
      } else {
        let perm = Notification.permission;
        if (perm === 'default') {
          perm = await Notification.requestPermission();
          setPermission(perm);
        }
        if (perm !== 'granted') return;
        const vapidRes = await fetch('/api/push/vapid-public-key');
        const vapidData = await vapidRes.json().catch(() => ({ success: false }));
        if (!vapidData.success || !vapidData.publicKey) {
          throw new Error('Server push notification belum dikonfigurasi (VAPID keys missing)');
        }
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
          });
        }
        const subRes = await fetch('/api/push/technician-subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        const subData = await subRes.json().catch(() => ({ success: false }));
        if (!subData.success) {
          await sub.unsubscribe();
          throw new Error(subData.error || 'Gagal mendaftarkan push');
        }
        setPushSubscribed(true);
        setPermission('granted');
      }
    } catch (e) {
      console.error('[CollectorPush]', e);
    } finally {
      setPushLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'payment_collected':
        return <Receipt className="w-4 h-4" />;
      case 'ont_task':
        return <Wrench className="w-4 h-4" />;
      case 'ticket_assigned':
        return <Ticket className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins} menit lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return formatWIB(d, 'dd MMM yyyy');
  };

  const pushOn = pushSubscribed && permission === 'granted';

  useEffect(() => {
    if (!bellOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBellOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bellOpen]);

  const iconBtn = 'relative h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';

  return (
    <div className="flex items-center gap-1">
      {/* Push toggle */}
      {pushSupported && (
        <button
          type="button"
          onClick={handlePushToggle}
          disabled={pushLoading || permission === 'denied'}
          aria-pressed={pushOn}
          aria-label={pushOn ? 'Notifikasi push aktif, ketuk untuk mematikan' : permission === 'denied' ? 'Notifikasi push diblokir browser' : 'Aktifkan notifikasi push'}
          className={cn(
            iconBtn,
            pushOn ? 'text-blue-700 dark:text-blue-400 bg-blue-600/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            permission === 'denied' && 'opacity-50 cursor-not-allowed',
          )}
        >
          {pushLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : pushOn ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </button>
      )}

      {/* Notification bell */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setBellOpen(!bellOpen)}
          aria-expanded={bellOpen}
          aria-label={notifications.length ? `Notifikasi, ${notifications.length} baru` : 'Notifikasi'}
          className={cn(iconBtn, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <Bell className="w-5 h-5" />
          {notifications.length > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center" aria-hidden>
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>

        {bellOpen && (
          <>
            <button type="button" aria-label="Tutup notifikasi" className="fixed inset-0 z-40 cursor-default" onClick={() => setBellOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-96 overflow-y-auto bg-card border border-border rounded-2xl z-50" role="dialog" aria-label="Notifikasi">
              <div className="sticky top-0 bg-card border-b border-border pl-4 pr-1 h-12 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-foreground">Notifikasi</span>
                <button type="button" onClick={() => setBellOpen(false)} aria-label="Tutup" className="h-[40px] pointer-coarse:h-[44px] w-[40px] pointer-coarse:w-[44px] flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loading ? (
                <div className="p-4 text-center text-[13px] text-muted-foreground">Memuat...</div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-[13px] font-medium text-foreground">Belum ada notifikasi</p>
                  <p className="text-[12px] text-muted-foreground mt-1">Pembayaran yang Anda catat dan tiket untuk Anda muncul di sini.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li key={n.id} className="flex gap-3 p-3">
                      <span className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-blue-700 dark:text-blue-400 bg-blue-600/10">
                        {getIcon(n.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{n.title}</p>
                        <p className="text-[12px] text-muted-foreground line-clamp-2">{n.message}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{formatTime(n.timestamp)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
