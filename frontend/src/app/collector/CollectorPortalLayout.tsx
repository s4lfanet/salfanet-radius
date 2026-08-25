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
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
          {companyLogo ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-white dark:bg-slate-700 flex items-center justify-center">
              <Image unoptimized src={companyLogo} alt={companyName} width={32} height={32} className="max-h-full max-w-full w-auto h-auto object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
              <WalletIcon className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm text-foreground truncate">{companyName || 'Portal Kolektor'}</div>
            <div className="text-xs text-muted-foreground truncate">{collector.areaName || 'Umum'}</div>
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
