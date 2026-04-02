'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, MessageSquare, User, Receipt, Shield, Menu, X, Package, Clock, LogOut, Bell, CheckCircle2, XCircle, RefreshCw, Trash2, Wifi, FileText, PauseCircle, Gift, Sun, Moon, RefreshCcw } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';
import { useTheme } from '@/hooks/useTheme';
import { PushNotificationToggle } from '@/components/push-notification-toggle';

interface MenuItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const menuItems: MenuItem[] = [
  { name: 'Beranda',      href: '/customer',           icon: Home },
  { name: 'Riwayat',     href: '/customer/history',   icon: Receipt },
  { name: 'Tagihan',     href: '/customer/invoices',  icon: FileText },
  { name: 'Perpanjang',  href: '/customer/renewal',   icon: RefreshCcw },
  { name: 'Ganti Paket', href: '/customer/upgrade',   icon: Package },
  { name: 'WiFi',        href: '/customer/wifi',      icon: Wifi },
  { name: 'Tiket',       href: '/customer/tickets',   icon: MessageSquare },
  { name: 'Referral',    href: '/customer/referral',  icon: Gift },
  { name: 'Suspend',     href: '/customer/suspend',   icon: PauseCircle },
  { name: 'Akun',        href: '/customer/profile',   icon: User },
];

interface NotifEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
}

// â”€â”€â”€ Inner layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CustomerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  // null = not yet checked (SSR), true/false after client mounts
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [notifHistory, setNotifHistory] = useState<NotifEvent[]>([]);
  // Default: look back 24h so events that happened before page load are caught
  const lastCheckedRef = useRef<string>(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { addToast } = useToast();

  // â”€â”€ Persist notifications to localStorage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('customer_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.history)) setNotifHistory(parsed.history);
        if (typeof parsed.unread === 'number') setUnreadCount(parsed.unread);
        if (parsed.lastChecked) lastCheckedRef.current = parsed.lastChecked;
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save whenever history / unread changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('customer_notifications', JSON.stringify({
        history: notifHistory,
        unread: unreadCount,
        lastChecked: lastCheckedRef.current,
      }));
    } catch { /* ignore */ }
  }, [notifHistory, unreadCount]);

  const handleClearAllNotifications = () => {
    setNotifHistory([]);
    setUnreadCount(0);
  };

  const handleDeleteNotification = (id: string) => {
    setNotifHistory(prev => prev.filter(n => n.id !== id));
  };

  const poll = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('customer_token') : null;
    if (!token) return;
    try {
      const res = await fetch(
        `/api/customer/notifications?since=${encodeURIComponent(lastCheckedRef.current)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.events) || data.events.length === 0) return;

      lastCheckedRef.current = new Date().toISOString();
      localStorage.setItem('customer_notif_last_checked', lastCheckedRef.current);
      const events: NotifEvent[] = data.events;

      setUnreadCount(prev => prev + events.length);
      setNotifHistory(prev => [...events, ...prev].slice(0, 20));

      // Trigger auto-refresh on all customer pages that are listening
      window.dispatchEvent(new CustomEvent('customer-data-refresh'));

      for (const event of events) {
        if (event.type === 'payment_success') {
          addToast({ type: 'success', title: event.title, description: event.message, duration: 8000 });
        } else if (event.type === 'payment_rejected') {
          addToast({ type: 'error', title: event.title, description: event.message, duration: 12000 });
        } else if (event.type === 'package_changed') {
          addToast({ type: 'success', title: event.title, description: event.message, duration: 10000 });
        } else if (event.type === 'ticket_reply') {
          addToast({ type: 'info', title: event.title, description: event.message, duration: 10000 });
        } else if (event.type === 'ticket_resolved') {
          addToast({ type: 'success', title: event.title, description: event.message, duration: 10000 });
        } else {
          addToast({ type: 'info', title: event.title, description: event.message, duration: 7000 });
        }
      }
    } catch {
      // silently ignore
    }
  }, [addToast]);

  useEffect(() => {
    // Load from cache immediately to prevent logo flash / layout shift
    try {
      const cachedLogo = localStorage.getItem('_co_logo');
      const cachedName = localStorage.getItem('_co_name');
      if (cachedLogo) setCompanyLogo(cachedLogo);
      if (cachedName) setCompanyName(cachedName);
    } catch { /* ignore */ }
    loadCompanyInfo();
    const token = localStorage.getItem('customer_token');
    const handleResize = () => { if (localStorage.getItem('customer_token')) setSidebarOpen(window.innerWidth >= 1024); };
    if (token) handleResize();
    window.addEventListener('resize', handleResize);
    // Poll immediately on mount so notifications show without waiting 30s
    poll();
    intervalRef.current = setInterval(poll, 30_000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const loadCompanyInfo = async () => {
    try {
      const res = await fetch('/api/public/company');
      const data = await res.json();
      if (data.company?.name) {
        setCompanyName(data.company.name);
        try { localStorage.setItem('_co_name', data.company.name); } catch { /* ignore */ }
      }
      if (data.company?.logo) {
        setCompanyLogo(data.company.logo);
        try { localStorage.setItem('_co_logo', data.company.logo); } catch { /* ignore */ }
      } else {
        try { localStorage.removeItem('_co_logo'); } catch { /* ignore */ }
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    router.push('/customer/login');
  };

  // Re-check auth token whenever pathname changes (e.g. after login/logout)
  useEffect(() => {
    setAuthenticated(!!localStorage.getItem('customer_token'));
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/customer') return pathname === '/customer';
    return pathname.startsWith(href);
  };

  // Skip portal UI on login page — render children directly
  if (pathname === '/customer/login') {
    return <>{children}</>;
  }

  // Not yet authenticated (or not checked yet) — render children only so the
  // page component can run its own useEffect redirect to /customer/login
  if (!authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ willChange: 'transform' }}>
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-cyan-500/10 rounded-full blur-[80px]" style={{ transform: 'translateZ(0)' }} />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-blue-500/10 rounded-full blur-[80px]" style={{ transform: 'translateZ(0)' }} />
        <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[50%] h-[50%] bg-sky-400/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* â”€â”€ DESKTOP SIDEBAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 transition-all duration-300 ease-in-out',
          'w-64 bg-background/95 backdrop-blur-xl border-r border-cyan-500/20',
          'shadow-[5px_0_30px_rgba(6,182,212,0.15)] flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0'
        )}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {companyLogo ? (
                <div className="w-9 h-9 rounded-lg bg-white p-1 border border-cyan-400/30 flex items-center justify-center overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <img src={companyLogo} alt={companyName} className="w-full h-full object-contain" decoding="async" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white p-1 border border-cyan-400/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <Shield className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                </div>
              )}
              <div>
                <h1 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400">
                  {companyName}
                </h1>
                <p className="text-[10px] text-cyan-400/70 tracking-widest font-bold uppercase">Customer Portal</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-cyan-500/20 rounded-lg lg:hidden"
            >
              <X className="w-4 h-4 text-cyan-300" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1 flex-1 min-h-0 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => {
                  router.push(item.href);
                  if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 group',
                  active
                    ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-muted-foreground hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20'
                )}
              >
                <span
                  className={cn(
                    'p-1.5 rounded-lg transition-all duration-300',
                    active
                      ? 'text-cyan-400 bg-cyan-500/20 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                      : 'text-muted-foreground/60 group-hover:text-cyan-400'
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="tracking-wide">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-cyan-500/20">
          <PushNotificationToggle compact />
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-all duration-300"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* â”€â”€ MAIN CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-cyan-500/20 items-center justify-between px-6 py-3">
          <div>
            <h2 className="text-sm font-bold text-white">Customer Portal</h2>
            <p className="text-xs text-cyan-400/70">{companyName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-cyan-400/50" />
            <span className="text-xs text-muted-foreground">
              {formatInTimeZone(new Date(), 'Asia/Jakarta', 'EEEE, d MMMM yyyy', { locale: localeId })}
            </span>
            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => { setBellOpen(v => !v); setUnreadCount(0); }}
                className="relative p-2 flex items-center justify-center rounded-xl hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-all"
              >
                <Bell className="w-4 h-4 text-cyan-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-card/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-[0_8px_30px_rgba(6,182,212,0.2)] z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-cyan-500/20 flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Notifikasi</span>
                      <div className="flex items-center gap-1">
                        {notifHistory.length > 0 && (
                          <button onClick={handleClearAllNotifications} title="Hapus semua" className="p-1 hover:bg-red-500/20 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                        <button onClick={() => setBellOpen(false)} className="p-1 hover:bg-cyan-500/20 rounded-lg"><X className="w-3.5 h-3.5 text-cyan-300" /></button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-cyan-500/10">
                      {notifHistory.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">Belum ada notifikasi</p>
                      ) : notifHistory.map(n => (
                        <div key={n.id} className="px-4 py-3 hover:bg-cyan-500/5 transition-colors group">
                            <div className="flex items-start gap-2">
                              <div className={`mt-0.5 p-1 rounded-lg flex-shrink-0 ${
                                n.type === 'payment_success' ? 'bg-green-500/20' :
                                n.type === 'payment_rejected' ? 'bg-red-500/20' :
                                n.type === 'package_changed' ? 'bg-blue-500/20' : 'bg-cyan-500/20'
                              }`}>
                                {n.type === 'payment_success' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                {n.type === 'payment_rejected' && <XCircle className="w-3 h-3 text-red-400" />}
                                {n.type === 'package_changed' && <Package className="w-3 h-3 text-blue-400" />}
                                {n.type !== 'payment_success' && n.type !== 'payment_rejected' && n.type !== 'package_changed' && <Bell className="w-3 h-3 text-cyan-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold mb-0.5 ${
                                  n.type === 'payment_success' ? 'text-green-400' :
                                  n.type === 'payment_rejected' ? 'text-red-400' :
                                  n.type === 'package_changed' ? 'text-blue-400' : 'text-cyan-400'
                                }`}>{n.title}</p>
                                <p className="text-[11px] text-muted-foreground leading-tight">{n.message}</p>
                                <p className="text-[10px] text-muted-foreground/50 mt-1">{formatWIB(n.timestamp, 'dd MMM yyyy HH:mm')}</p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteNotification(n.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg transition-all flex-shrink-0"
                              >
                                <X className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Theme Toggle â€” Desktop */}
            <button
              onClick={toggleTheme}
              className="p-2 flex items-center justify-center rounded-xl hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition-all"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark
                ? <Sun className="w-4 h-4 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
                : <Moon className="w-4 h-4 text-slate-400" />
              }
            </button>

          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Menu button (left side) */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 flex items-center justify-center hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/30"
              >
                <Menu className="w-5 h-5 text-cyan-400" />
              </button>
              {companyLogo ? (
                <div className="w-8 h-8 rounded-lg bg-white p-1 border border-cyan-400/30 flex items-center justify-center overflow-hidden">
                  <img src={companyLogo} alt={companyName} className="w-full h-full object-contain" decoding="async" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-white p-1 border border-cyan-400/30 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                </div>
              )}
              <div>
                <h1 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400">
                  {companyName}
                </h1>
                <p className="text-[10px] text-cyan-400/70 tracking-widest font-bold uppercase">Customer Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Bell (mobile) */}
              <div className="relative">
                <button
                  onClick={() => { setBellOpen(v => !v); setUnreadCount(0); }}
                  className="relative p-2 flex items-center justify-center hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/30"
                >
                  <Bell className="w-4 h-4 text-cyan-400" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-72 bg-card/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-[0_8px_30px_rgba(6,182,212,0.2)] z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-cyan-500/20 flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Notifikasi</span>
                        <div className="flex items-center gap-1">
                          {notifHistory.length > 0 && (
                            <button onClick={handleClearAllNotifications} title="Hapus semua" className="p-1 hover:bg-red-500/20 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          )}
                          <button onClick={() => setBellOpen(false)} className="p-1 hover:bg-cyan-500/20 rounded-lg"><X className="w-3.5 h-3.5 text-cyan-300" /></button>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-cyan-500/10">
                        {notifHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">Belum ada notifikasi</p>
                        ) : notifHistory.map(n => (
                          <div key={n.id} className="px-4 py-3 hover:bg-cyan-500/5 transition-colors group">
                            <div className="flex items-start gap-2">
                              <div className={`mt-0.5 p-1 rounded-lg flex-shrink-0 ${
                                n.type === 'payment_success' ? 'bg-green-500/20' :
                                n.type === 'payment_rejected' ? 'bg-red-500/20' :
                                n.type === 'package_changed' ? 'bg-blue-500/20' : 'bg-cyan-500/20'
                              }`}>
                                {n.type === 'payment_success' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                {n.type === 'payment_rejected' && <XCircle className="w-3 h-3 text-red-400" />}
                                {n.type === 'package_changed' && <Package className="w-3 h-3 text-blue-400" />}
                                {n.type !== 'payment_success' && n.type !== 'payment_rejected' && n.type !== 'package_changed' && <Bell className="w-3 h-3 text-cyan-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold mb-0.5 ${
                                  n.type === 'payment_success' ? 'text-green-400' :
                                  n.type === 'payment_rejected' ? 'text-red-400' :
                                  n.type === 'package_changed' ? 'text-blue-400' : 'text-cyan-400'
                                }`}>{n.title}</p>
                                <p className="text-[11px] text-muted-foreground leading-tight">{n.message}</p>
                                <p className="text-[10px] text-muted-foreground/50 mt-1">{formatWIB(n.timestamp, 'dd MMM yyyy HH:mm')}</p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteNotification(n.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-lg transition-all flex-shrink-0"
                              >
                                <X className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Theme Toggle â€” Mobile */}
              <button
                onClick={toggleTheme}
                className="p-2 flex items-center justify-center hover:bg-cyan-500/20 rounded-xl transition-all border border-cyan-500/30"
                title={isDark ? 'Light Mode' : 'Dark Mode'}
              >
                {isDark
                  ? <Sun className="w-4 h-4 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
                  : <Moon className="w-4 h-4 text-slate-400" />
                }
              </button>

            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 relative z-10 pb-6">
          {children}
        </main>
      </div>


    </div>
  );
}

// â”€â”€â”€ Bridge for global showSuccess/showError helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CustomerToastBridge() {
  const { addToast, confirm } = useToast();
  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);
  return null;
}

// â”€â”€â”€ Root export: wrap with CyberToastProvider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CyberToastProvider>
      <CustomerToastBridge />
      <CustomerLayoutInner>{children}</CustomerLayoutInner>
    </CyberToastProvider>
  );
}

