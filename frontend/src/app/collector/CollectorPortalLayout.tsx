'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Wallet,
  UserX,
  Unplug,
  LogOut,
  Menu,
  X,
  Wallet as WalletIcon,
  Users,
  Sun,
  Moon,
  Loader2,
  Inbox,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';
import { useTheme } from '@/hooks/useTheme';
import Image from 'next/image';

interface CollectorData {
  id: string;
  name: string;
  username: string;
  phoneNumber: string;
  email?: string;
  areaName?: string | null;
}

const MENU_ITEMS = [
  { title: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, href: '/collector/dashboard' },
  { title: 'Tagihan', icon: <Users className="w-4 h-4" />, href: '/collector/billing' },
  { title: 'Setoran Saya', icon: <Wallet className="w-4 h-4" />, href: '/collector/settlements' },
  { title: 'Koleksi Saya', icon: <History className="w-4 h-4" />, href: '/collector/my-collections' },
  { title: 'Bukti Transfer', icon: <Inbox className="w-4 h-4" />, href: '/collector/proofs' },
  { title: 'Pelanggan Isolir', icon: <UserX className="w-4 h-4" />, href: '/collector/isolir' },
  { title: 'Cabut ONT', icon: <Unplug className="w-4 h-4" />, href: '/collector/ont' },
];

export default function CollectorPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collector, setCollector] = useState<CollectorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    apiAdmin<{ success: boolean; collector: CollectorData }>('/api/collector/auth/session')
      .then(data => {
        if (data.success && data.collector) setCollector(data.collector);
        else router.push('/collector/login');
      })
      .catch(() => router.push('/collector/login'))
      .finally(() => setLoading(false));

    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company.name) setCompanyName(data.company.name);
        if (data.success && data.company.logo) setCompanyLogo(data.company.logo);
      })
      .catch(() => {});
  }, [router]);

  const handleLogout = async () => {
    try {
      await apiAdmin('/api/collector/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/collector/login');
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!collector) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-sidebar-border bg-sidebar-accent/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {companyLogo ? (
                <div className="w-12 h-12 rounded-lg bg-sidebar p-1 border border-brand-400/30 flex items-center justify-center overflow-hidden">
                  <Image unoptimized src={companyLogo} alt={companyName} width={48} height={48} className="max-w-full max-h-full w-auto h-auto object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center border border-brand-400/40">
                  <WalletIcon className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-xs font-black tracking-wider text-gray-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-400 dark:via-brand-300 dark:to-blue-400 truncate max-w-[130px]">
                  {companyName || 'Portal Kolektor'}
                </h1>
                <p className="text-[10px] text-brand-600 dark:text-brand-400/60 tracking-[0.15em] uppercase font-medium">Panel Kolektor</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-sidebar-accent rounded-lg"
              aria-label="Close menu"
            >
              <X className="w-4 h-4 text-sidebar-foreground/60" />
            </button>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {MENU_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {item.icon}
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border">
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
              {collector.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{collector.name}</div>
              <div className="text-xs text-muted-foreground truncate">@{collector.username}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-accent"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-lg font-bold text-foreground">
              {MENU_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'))?.title || 'Portal Kolektor'}
            </h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
