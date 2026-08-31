'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';
import { useToast } from '@/components/cyberpunk/CyberToast';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export default function AdminPushToggle() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const checkSupport = () =>
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const refresh = useCallback(async () => {
    const supported = checkSupport();
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      if (sub) {
        fetch('/api/push/admin-subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        }).catch(() => { /* silent sync */ });
      }
    } catch (e) {
      console.warn('[AdminPush] Service worker registration failed:', e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const handleToggle = async () => {
    if (!isSupported) return;
    setLoading(true);
    try {
      if (subscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        await fetch('/api/push/admin-unsubscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
        setSubscribed(false);
        setPermission(Notification.permission);
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
        const subRes = await fetch('/api/push/admin-subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        const subData = await subRes.json().catch(() => ({ success: false }));
        if (!subData.success) {
          await sub.unsubscribe();
          throw new Error(subData.error || 'Gagal mendaftarkan notifikasi push ke server');
        }
        setSubscribed(true);
        setPermission('granted');
        addToast({ type: 'success', title: 'Push notification aktif', description: 'Terdaftar di server' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal mengaktifkan notifikasi';
      console.error('[AdminPush]', e);
      addToast({ type: 'error', title: 'Gagal aktifkan notifikasi', description: msg });
    } finally {
      setLoading(false);
    }
  };

  const isOn = subscribed && permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <button
      onClick={handleToggle}
      disabled={loading || isDenied || !isSupported}
      title={
        !isSupported ? 'Browser tidak mendukung push notification'
        : isDenied ? 'Notifikasi diblokir — ubah di pengaturan browser'
        : isOn ? 'Klik untuk nonaktifkan notifikasi push'
        : 'Klik untuk aktifkan notifikasi push'
      }
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 border',
        isOn
          ? 'text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/[0.12] border-brand-200 dark:border-brand-500/30 shadow-sm'
          : isDenied || !isSupported
          ? 'text-gray-400 dark:text-gray-500 border-transparent opacity-60 cursor-not-allowed'
          : 'text-gray-700 dark:text-gray-300 border-transparent hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/5 hover:border-gray-200 dark:hover:border-white/10',
      )}
    >
      <span
        className={cn(
          'p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center transition-all duration-300',
          isOn ? 'text-brand-500 dark:text-brand-400 bg-brand-100 dark:bg-brand-500/20' : 'text-gray-400 dark:text-gray-500',
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isOn ? (
          <Bell className="w-4 h-4" />
        ) : (
          <BellOff className="w-4 h-4" />
        )}
      </span>
      <span className="flex-1 text-left tracking-wide">
        {isOn ? 'Notif Push: ON' : isDenied ? 'Notif Push: Diblokir' : 'Notif Push: OFF'}
      </span>
      {isSupported && (
        <span
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-all duration-300',
            isOn
              ? 'border-sidebar-primary bg-sidebar-primary'
              : 'border-sidebar-foreground/20 bg-sidebar-foreground/10',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-300',
              isOn ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      )}
    </button>
  );
}
