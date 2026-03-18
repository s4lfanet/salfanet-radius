'use client';

import { useState, useEffect } from 'react';
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
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { useTheme } from '@/hooks/useTheme';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';

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
function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; isRead: boolean; createdAt: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/technician/tickets?limit=5&status=open');
        if (res.ok) {
          const data = await res.json();
          const tickets = (data.tickets || []).map((t: { id: string; title: string; description: string; createdAt: string; status: string }) => ({
            id: t.id,
            title: t.title || 'Tiket Baru',
            message: t.description?.substring(0, 60) || '',
            isRead: t.status !== 'open',
            createdAt: t.createdAt,
          }));
          setNotifications(tickets);
          setCount(tickets.filter((n: { isRead: boolean }) => !n.isRead).length);
        }
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl bg-slate-100 dark:bg-cyan-500/10 hover:bg-slate-200 dark:hover:bg-cyan-500/20 border border-slate-200 dark:border-cyan-500/30 transition-all"
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-200" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(255,0,0,0.5)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-72 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-cyan-500/30 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-cyan-500/20">
              <p className="text-xs font-bold text-slate-900 dark:text-white">Notifikasi</p>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-cyan-500/10">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-400 text-center py-6">Tidak ada notifikasi</p>
              ) : (
                notifications.map((n) => (
                  <Link key={n.id} href="/technician/tickets" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50 dark:hover:bg-cyan-500/10 transition">
                    <p className={cn('text-xs font-semibold truncate', n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white')}>{n.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{n.message}</p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* â”€â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.5)]">
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
                <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex-shrink-0">
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
                    'p-1.5 rounded-lg transition-all duration-300 flex-shrink-0',
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
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.5)]">
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
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-cyan-500/10 hover:bg-slate-200 dark:hover:bg-cyan-500/20 border border-slate-200 dark:border-cyan-500/30 transition-all"
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 bg-gradient-to-r from-[#0b1120] via-[#0f172a] to-cyan-600 shadow-[0_6px_30px_rgba(6,182,212,0.45)] backdrop-blur-xl border-b border-cyan-500/20">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-white/10 rounded-xl transition"
              >
                <Menu className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-base font-bold text-white">{t('techPortal.title')}</h1>
                <p className="text-[10px] text-white/70">{tech?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition border border-white/20"
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-white" />}
              </button>
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition border border-white/20"
              >
                <LogOut className="w-4 h-4 text-white" />
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
