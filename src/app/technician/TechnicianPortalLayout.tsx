'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Ticket,
  Wifi,
  WifiOff,
  Shield,
  Users,
  UserPlus,
  LogOut,
  Menu,
  X,
  Wrench,
  Phone,
  Sun,
  Moon,
  Loader2,
  ChevronRight,
  User,
  Bell,
  BellOff,
  Cpu,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { useTheme } from '@/hooks/useTheme';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';

interface TechnicianData {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
}

interface MenuItem {
  titleKey: string;
  icon: React.ReactNode;
  href: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    titleKey: 'techPortal.dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    href: '/technician/dashboard',
  },
  {
    titleKey: 'techPortal.tickets',
    icon: <Ticket className="w-4 h-4" />,
    href: '/technician/tickets',
  },
  {
    titleKey: 'techPortal.onlineUsers',
    icon: <Wifi className="w-4 h-4" />,
    href: '/technician/online',
  },
  {
    titleKey: 'techPortal.offlineUsers',
    icon: <WifiOff className="w-4 h-4" />,
    href: '/technician/offline',
  },
  {
    titleKey: 'techPortal.isolatedUsers',
    icon: <Shield className="w-4 h-4" />,
    href: '/technician/isolated',
  },
  {
    titleKey: 'techPortal.customers',
    icon: <Users className="w-4 h-4" />,
    href: '/technician/customers',
  },
  {
    titleKey: 'techPortal.register',
    icon: <UserPlus className="w-4 h-4" />,
    href: '/technician/register',
  },
  {
    titleKey: 'techPortal.genieacs',
    icon: <Cpu className="w-4 h-4" />,
    href: '/technician/genieacs',
  },
];

/* â”€â”€â”€ Notification Bell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* --- Sidebar Push Notification Toggle --- */
function SidebarPushToggle({ techId }: { techId: string }) {
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

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  };

  const refresh = async () => {
    const supported = checkSupport();
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      // Sync: if browser has subscription but DB might not (e.g. after DB restore), re-register
      if (sub && techId) {
        fetch('/api/push/technician-subscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianId: techId, subscription: sub.toJSON() }),
        }).catch(() => { /* silent sync */ });
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!techId) return;
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId]);

  const handleToggle = async () => {
    if (!isSupported || !techId) return;
    setLoading(true);
    try {
      if (subscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        await fetch('/api/push/technician-unsubscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianId: techId, endpoint }),
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
        const subRes = await fetch('/api/push/technician-subscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianId: techId, subscription: sub.toJSON() }),
        });
        const subData = await subRes.json().catch(() => ({ success: false }));
        if (!subData.success) {
          // Unsubscribe browser-side to keep UI in sync with server state
          await sub.unsubscribe();
          throw new Error(subData.error || 'Gagal mendaftarkan notifikasi push ke server');
        }
        setSubscribed(true);
        setPermission('granted');
        addToast({ type: 'success', title: 'Push notification aktif', description: 'Terdaftar di server' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal mengaktifkan notifikasi';
      console.error('[SidebarPush]', e);
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
          ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-300 dark:border-cyan-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(6,182,212,0.15)]'
          : isDenied || !isSupported
          ? 'text-slate-400 dark:text-slate-500 border-transparent opacity-60 cursor-not-allowed'
          : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-cyan-500/10 hover:border-slate-200 dark:hover:border-cyan-500/20',
      )}
    >
      <span
        className={cn(
          'p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center transition-all duration-300',
          isOn ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10' : 'text-slate-400 dark:text-slate-400',
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
        {isOn ? 'Notif Push: ON' : isDenied ? 'Notif Push: Diblokir' : !isSupported ? 'Notif Push: OFF' : 'Notif Push: OFF'}
      </span>
      {isSupported && (
        <span
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-all duration-300',
            isOn
              ? 'border-cyan-500 bg-cyan-500'
              : isDenied
              ? 'border-slate-400 dark:border-slate-600 bg-slate-300 dark:bg-slate-700'
              : 'border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-600',
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

function NotificationBell() {
  const { addToast } = useToast();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; isRead: boolean; createdAt: string }[]>([]);

  const loadTickets = async () => {
    try {
      const res = await fetch('/api/technician/tickets?status=OPEN');
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.tickets || []).map((t: { id: string; ticketNumber: string; subject: string; customerName: string; description: string; createdAt: string; status: string }) => ({
        id: t.id,
        title: `#${t.ticketNumber} — ${t.subject}`,
        message: t.customerName || '',
        isRead: !['OPEN'].includes(t.status),
        createdAt: t.createdAt,
      }));
      setNotifications(prev => {
        // Merge: keep push-injected items (id starts with 'push-') + fresh ticket data
        const pushItems = prev.filter(n => n.id.startsWith('push-'));
        return [...items, ...pushItems].slice(0, 20);
      });
      const unread = items.filter((n: { isRead: boolean }) => !n.isRead).length;
      setCount(prev => Math.max(prev, unread));
    } catch { /* silent */ }
  };

  // Listen for push notifications from service worker
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'PUSH_RECEIVED') return;
      const { title, body, tag } = event.data;
      // Add to bell list
      setNotifications(prev => [{
        id: `push-${tag || Date.now()}`,
        title: title || 'Notifikasi Baru',
        message: body || '',
        isRead: false,
        createdAt: new Date().toISOString(),
      }, ...prev].slice(0, 20));
      setCount(prev => prev + 1);
      // Show toast
      addToast({
        type: 'info',
        title: title || 'Notifikasi Baru',
        description: body,
        duration: 7000,
      });
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handler);
      return () => navigator.serviceWorker.removeEventListener('message', handler);
    }
  }, [addToast]);

  // Poll for new tickets
  useEffect(() => {
    loadTickets();
    const iv = setInterval(loadTickets, 30000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open) setCount(0); // clear badge when opening
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl bg-slate-100 dark:bg-cyan-500/10 hover:bg-slate-200 dark:hover:bg-cyan-500/20 border border-slate-200 dark:border-cyan-500/30 transition-all"
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-200" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(255,0,0,0.5)] animate-bounce">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-cyan-500/30 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-cyan-500/20 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-900 dark:text-white">Notifikasi</p>
              {notifications.length > 0 && (
                <button onClick={() => { setNotifications([]); setCount(0); }} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
                  Bersihkan
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-cyan-500/10">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-400 text-center py-6">Tidak ada notifikasi</p>
              ) : (
                notifications.map((n) => (
                  <Link key={n.id} href="/technician/tickets" onClick={() => setOpen(false)} className="block px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-cyan-500/10 transition">
                    <div className="flex items-start gap-2">
                      {!n.isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-xs font-semibold truncate', n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white')}>{n.title}</p>
                        {n.message && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{n.message}</p>}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="px-3 py-2 border-t border-slate-100 dark:border-cyan-500/10">
              <Link href="/technician/tickets" onClick={() => setOpen(false)} className="text-[10px] text-cyan-500 hover:underline font-medium">
                Lihat semua tiket →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function TechSidebar({
  tech,
  sidebarOpen,
  setSidebarOpen,
  onLogout,
}: {
  tech: TechnicianData | null;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 transition-all duration-300 ease-in-out',
          'w-64 bg-white dark:bg-[#0b1120]/95 backdrop-blur-xl',
          'border-r border-slate-200 dark:border-cyan-500/20',
          'shadow-[5px_0_15px_rgba(0,0,0,0.08)] dark:shadow-[5px_0_30px_rgba(6,182,212,0.15)]',
          'overflow-y-auto flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-slate-200 dark:border-cyan-500/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.5)] flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-cyan-700 dark:text-transparent dark:bg-gradient-to-r dark:from-cyan-400 dark:to-blue-400 dark:bg-clip-text">
                  {t('techPortal.title')}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{t('techPortal.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-cyan-500/20 rounded-lg lg:hidden transition-colors"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {/* Technician info card */}
        {tech && (
          <div className="p-4 flex-shrink-0">
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20 rounded-xl p-3 border border-cyan-200 dark:border-cyan-500/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex-shrink-0 flex items-center justify-center">
                  <User className="w-3 h-3 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{tech.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                    {tech.phoneNumber}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 group',
                  isActive
                    ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-cyan-500/10 border border-transparent hover:border-slate-200 dark:hover:border-cyan-500/20',
                )}
              >
                <span
                  className={cn(
                    'p-1.5 rounded-lg transition-all duration-300 flex-shrink-0 flex items-center justify-center',
                    isActive
                      ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10'
                      : 'text-slate-400 dark:text-slate-400 group-hover:text-cyan-500',
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1 tracking-wide">{t(item.titleKey)}</span>
                {isActive && <ChevronRight className="w-3 h-3 text-cyan-500/60 flex-shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Profile Link + Logout */}
        <div className="p-3 border-t border-slate-200 dark:border-cyan-500/20 flex-shrink-0 space-y-2">
          <Link
            href="/technician/profile"
            className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-cyan-500/10 border border-transparent hover:border-slate-200 dark:hover:border-cyan-500/20"
          >
            <span className="p-1.5 rounded-lg text-slate-400 dark:text-slate-400">
              <User className="w-4 h-4" />
            </span>
            <span className="tracking-wide">{t('techPortal.profile')}</span>
          </Link>
          {tech && <SidebarPushToggle techId={tech.id} />}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-all duration-300"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('techPortal.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* â”€â”€â”€ Main Layout Inner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function TechnicianPortalInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  const { addToast, confirm } = useToast();

  const [tech, setTech] = useState<TechnicianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  // Live clock
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetch('/api/technician/auth/session')
      .then((res) => {
        if (!res.ok) {
          router.replace('/technician/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.technician) setTech(data.technician);
        setLoading(false);
      })
      .catch(() => {
        router.replace('/technician/login');
      });
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/technician/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.replace('/technician/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-slate-900 dark:via-[#0a0e1a] dark:to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.5)] flex items-center justify-center">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-cyan-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('techPortal.loading')}</p>
        </div>
      </div>
    );
  }

  const currentMenu = MENU_ITEMS.find((m) => m.href === pathname);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0e1a]">
      {/* Background blobs — dark only */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none hidden dark:block">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <TechSidebar tech={tech} sidebarOpen={true} setSidebarOpen={() => {}} onLogout={handleLogout} />
      </div>

      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <TechSidebar tech={tech} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
      </div>

      {/* Main Content Area */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Desktop Header */}
        <header className="hidden lg:block sticky top-0 z-20 bg-white/80 dark:bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-slate-200 dark:border-cyan-500/20 shadow-sm dark:shadow-none">
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {currentMenu ? t(currentMenu.titleKey) : t('techPortal.welcome')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{tech?.name || ''}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Live datetime */}
              {now && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-cyan-500/10 border border-slate-200 dark:border-cyan-500/20 text-slate-600 dark:text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-cyan-400/70 flex-shrink-0" />
                  <span className="text-xs tabular-nums">
                    {formatInTimeZone(now, 'Asia/Jakarta', 'EEEE, d MMMM yyyy  HH:mm:ss', { locale: localeId })}
                  </span>
                </div>
              )}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-cyan-500/10 hover:bg-slate-200 dark:hover:bg-cyan-500/20 border border-slate-200 dark:border-cyan-500/30 transition-all"
                title={isDark ? 'Mode Terang' : 'Mode Gelap'}
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 bg-white/95 dark:bg-gradient-to-r dark:from-[#0b1120] dark:via-[#0f172a] dark:to-cyan-600 shadow-sm dark:shadow-[0_6px_30px_rgba(6,182,212,0.45)] backdrop-blur-xl border-b border-slate-200 dark:border-cyan-500/20">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition"
              >
                <Menu className="w-5 h-5 text-slate-700 dark:text-white" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white">{t('techPortal.title')}</h1>
                <p className="text-[10px] text-slate-500 dark:text-white/70">{tech?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 rounded-xl transition border border-slate-200 dark:border-white/20 flex items-center justify-center"
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="p-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 rounded-xl transition border border-slate-200 dark:border-white/20 flex items-center justify-center"
              >
                <LogOut className="w-4 h-4 text-slate-700 dark:text-white" />
              </button>
            </div>
          </div>
        </header>
        {/* Page Content */}
        <main className="flex-1 relative z-10">
          {children}
        </main>
      </div>
    </div>
  );
}

/* â”€â”€â”€ Toast Bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function TechToastBridge() {
  const { addToast, confirm } = useToast();
  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);
  return null;
}

export default function TechnicianPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CyberToastProvider>
      <TechToastBridge />
      <TechnicianPortalInner>{children}</TechnicianPortalInner>
    </CyberToastProvider>
  );
}
