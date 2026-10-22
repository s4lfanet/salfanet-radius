'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  Contact,
  UserX,
  Wallet,
  History,
  Inbox,
  Unplug,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';
import { useTheme } from '@/hooks/useTheme';
import CollectorNotificationBell from '@/components/collector/CollectorNotificationBell';

interface CollectorData {
  id: string;
  name: string;
  username: string;
  phoneNumber: string;
  email?: string;
  areaName?: string | null;
  scopeLabel?: string;
}

type Item = { title: string; short?: string; icon: React.ComponentType<{ className?: string }>; href: string };

// The four a collector uses on every visit sit in the phone's bottom bar;
// the rest stay one tap away under Menu.
const PRIMARY: Item[] = [
  { title: 'Ringkasan', icon: LayoutDashboard, href: '/collector/dashboard' },
  { title: 'Tagihan', icon: Receipt, href: '/collector/billing' },
  { title: 'Pelanggan', icon: Contact, href: '/collector/customers' },
  { title: 'Pelanggan Isolir', short: 'Isolir', icon: UserX, href: '/collector/isolir' },
];
const SECONDARY: Item[] = [
  { title: 'Setoran Saya', icon: Wallet, href: '/collector/settlements' },
  { title: 'Koleksi Saya', icon: History, href: '/collector/my-collections' },
  { title: 'Bukti Transfer', icon: Inbox, href: '/collector/proofs' },
  { title: 'Cabut ONT', icon: Unplug, href: '/collector/ont' },
];
const ALL = [...PRIMARY, ...SECONDARY];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

export default function CollectorPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collector, setCollector] = useState<CollectorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    apiAdmin<{ success: boolean; collector: CollectorData }>('/api/collector/auth/session')
      .then((data) => {
        if (data.success && data.collector) setCollector(data.collector);
        else router.push('/collector/login');
      })
      .catch(() => router.push('/collector/login'))
      .finally(() => setLoading(false));

    fetch('/api/public/company')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.company.name) setCompanyName(data.company.name);
        if (data.success && data.company.logo) setCompanyLogo(data.company.logo);
      })
      .catch(() => {});
  }, [router]);

  // Close the drawer on navigation and with Escape.
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await apiAdmin('/api/collector/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/collector/login');
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" role="status">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="sr-only">Memuat portal</span>
      </div>
    );
  }

  if (!collector) return null;

  const current = ALL.find((i) => isActive(pathname, i.href));

  const brand = (
    <div className="flex items-center gap-3 min-w-0">
      {companyLogo ? (
        <div className="w-10 h-10 shrink-0 rounded-xl bg-white border border-border p-1 flex items-center justify-center overflow-hidden">
          <Image unoptimized src={companyLogo} alt={companyName} width={40} height={40} className="max-w-full max-h-full w-auto h-auto object-contain" />
        </div>
      ) : (
        <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-400 flex items-center justify-center">
          <Wallet className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{companyName || 'Portal Kolektor'}</p>
        <p className="text-xs text-muted-foreground">Portal Kolektor</p>
      </div>
    </div>
  );

  const navLink = (item: Item) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          active ? 'bg-blue-600/10 text-blue-700 dark:text-blue-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        {item.title}
      </Link>
    );
  };

  const account = (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 px-2 mb-2">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-400 flex items-center justify-center text-sm font-bold" aria-hidden>
          {collector.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{collector.name}</p>
          <p className="text-xs text-muted-foreground truncate">{collector.username}</p>
        </div>
      </div>
      {collector.scopeLabel && (
        <p className="px-2 mb-2 text-xs text-muted-foreground leading-relaxed">
          Wilayah tugas: <span className="font-medium text-foreground">{collector.scopeLabel}</span>
        </p>
      )}
      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-600/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
      >
        <LogOut className="w-[18px] h-[18px]" /> Keluar
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background lg:flex" data-role="collector">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-dvh sticky top-0 border-r border-border bg-card">
        <div className="p-4 border-b border-border">{brand}</div>
        <nav aria-label="Menu portal kolektor" className="flex-1 overflow-y-auto p-3 space-y-1">
          {PRIMARY.map(navLink)}
          <div className="my-2 border-t border-border" />
          {SECONDARY.map(navLink)}
        </nav>
        {account}
      </aside>

      {/* Phone drawer (Menu) */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Tutup menu" className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-xs bg-card border-r border-border flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
              {brand}
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Menu portal kolektor" className="flex-1 overflow-y-auto p-3 space-y-1">
              {PRIMARY.map(navLink)}
              <div className="my-2 border-t border-border" />
              {SECONDARY.map(navLink)}
            </nav>
            {account}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 lg:h-16 sticky top-0 z-30 border-b border-border bg-card flex items-center justify-between gap-2 px-4 lg:px-6">
          <h1 className="text-base lg:text-lg font-bold text-foreground truncate">{current?.title || 'Portal Kolektor'}</h1>
          <div className="flex items-center gap-1">
            <CollectorNotificationBell />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Pakai tema terang' : 'Pakai tema gelap'}
              className="h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Bottom padding keeps the last row clear of the phone's bottom bar. */}
        <main className="flex-1 w-full max-w-[1440px] px-4 pt-4 lg:px-8 lg:pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10">
          {children}
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav
        aria-label="Menu utama"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium focus-visible:outline-none focus-visible:bg-muted',
                  active ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground',
                )}
              >
                <span className={cn('flex items-center justify-center h-7 w-12 rounded-full', active && 'bg-blue-600/10')}>
                  <Icon className="w-5 h-5" />
                </span>
                {item.short || item.title}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium focus-visible:outline-none focus-visible:bg-muted',
              SECONDARY.some((i) => isActive(pathname, i.href)) ? 'text-blue-700 dark:text-blue-400' : 'text-muted-foreground',
            )}
          >
            <span className={cn('flex items-center justify-center h-7 w-12 rounded-full', SECONDARY.some((i) => isActive(pathname, i.href)) && 'bg-blue-600/10')}>
              <Menu className="w-5 h-5" />
            </span>
            Menu
          </button>
        </div>
      </nav>
    </div>
  );
}
