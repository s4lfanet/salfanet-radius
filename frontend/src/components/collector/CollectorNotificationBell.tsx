'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Loader2, X, Ticket, Wrench, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';

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
  const [loading, setLoading] = useState(false);
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
        const { publicKey } = await vapidRes.json();
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
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
    return d.toLocaleDateString('id-ID');
  };

  const pushOn = pushSubscribed && permission === 'granted';

  return (
    <div className="flex items-center gap-2">
      {/* Push toggle */}
      {pushSupported && (
        <button
          onClick={handlePushToggle}
          disabled={pushLoading || permission === 'denied'}
          title={pushOn ? 'Notif Push: ON' : permission === 'denied' ? 'Notif diblokir' : 'Notif Push: OFF'}
          className={cn(
            'p-2 rounded-lg transition-colors',
            pushOn ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground hover:bg-accent',
            permission === 'denied' && 'opacity-50 cursor-not-allowed',
          )}
        >
          {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : pushOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
      )}

      {/* Notification bell */}
      <div className="relative">
        <button
          onClick={() => setBellOpen(!bellOpen)}
          className="relative p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {notifications.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>

        {bellOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-50">
              <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold">Notifikasi</span>
                <button onClick={() => setBellOpen(false)} className="p-1 hover:bg-accent rounded-lg">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {loading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Memuat...</div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Tidak ada notifikasi</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((n) => (
                    <div key={n.id} className="flex gap-3 p-3 hover:bg-accent transition-colors">
                      <span className="p-1.5 rounded-lg flex-shrink-0 text-emerald-500 bg-emerald-500/10">
                        {getIcon(n.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatTime(n.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
