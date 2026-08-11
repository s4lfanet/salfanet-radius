'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Ticket,
  LogOut,
  Menu,
  X,
  User,
  Wifi,
  Sun,
  Moon,
  LifeBuoy,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AgentNotificationDropdown from '@/components/agent/NotificationDropdown';
import { useTranslation } from '@/hooks/useTranslation';
import { useTheme } from '@/hooks/useTheme';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';
import { formatInTimeZone } from 'date-fns-tz';
import { id as localeId } from 'date-fns/locale';

interface MenuItem {
  titleKey: string;
  icon: React.ReactNode;
  href: string;
}

const menuItems: MenuItem[] = [
  {
    titleKey: 'agent.portal.dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    href: '/agent/dashboard',
  },
  {
    titleKey: 'agent.portal.vouchers',
    icon: <Ticket className="w-4 h-4" />,
    href: '/agent/vouchers',
  },
  {
    titleKey: 'agent.portal.sessions',
    icon: <Wifi className="w-4 h-4" />,
    href: '/agent/sessions',
  },
  {
    titleKey: 'agent.portal.support',
    icon: <LifeBuoy className="w-4 h-4" />,
    href: '/agent/tickets',
  },
];

interface AgentData {
  id: string;
  name: string;
  phone: string;
  balance: number;
}

function AgentSidebar({ 
  agent,
  company,
  sidebarOpen, 
  setSidebarOpen,
  onLogout 
}: { 
  agent: AgentData | null;
  company: { name: string; logo: string | null };
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-full z-50 transition-all duration-300 ease-in-out',
        'w-64 bg-sidebar border-r border-sidebar-border',
        'shadow-[5px_0_20px_rgba(0,0,0,0.25)]',
        'flex flex-col',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0' // Always visible on desktop
      )}>
        {/* Logo */}
        <div className="flex-shrink-0 p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {company.logo ? (
                <div className="w-9 h-9 rounded-lg bg-sidebar p-1 border border-brand-400/30 flex items-center justify-center overflow-hidden">
                  <Image unoptimized src={company.logo} alt={company.name || 'Logo'} width={36} height={36} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="p-2 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xs font-black tracking-wider text-gray-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-400 dark:via-brand-300 dark:to-blue-400 truncate max-w-[130px]">
                  {company.name || t('agent.portal.title')}
                </h1>
                <p className="text-[10px] text-brand-600 dark:text-brand-400/60 tracking-[0.15em] uppercase font-medium">{t('agent.portal.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-sidebar-accent rounded-lg lg:hidden"
            >
              <X className="w-4 h-4 text-sidebar-foreground/60" />
            </button>
          </div>
        </div>

        {/* Balance Card */}
        {agent && (
          <div className="flex-shrink-0 p-4">
            <div className="bg-sidebar-primary/15 rounded-xl p-3 border border-sidebar-primary/30">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('agent.portal.yourBalance')}</p>
              <p className="text-lg font-bold text-sidebar-primary">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(agent.balance || 0)}
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="p-3 space-y-1 flex-1 min-h-0 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 group',
                pathname === item.href
                  ? 'text-brand-500 bg-brand-50 dark:text-brand-400 dark:bg-brand-500/[0.12] border border-brand-200 dark:border-brand-500/30 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-gray-300 border border-transparent hover:border-gray-200 dark:hover:border-white/10',
              )}
            >
              <span className={cn(
                'p-1.5 rounded-lg transition-all duration-300 flex items-center justify-center',
                pathname === item.href 
                  ? 'text-brand-500 dark:text-brand-400 bg-brand-100 dark:bg-brand-500/20' 
                  : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300'
              )}>
                {item.icon}
              </span>
              <span className="tracking-wide">{t(item.titleKey)}</span>
            </Link>
          ))}
        </nav>

        {/* User Info & Logout */}
        <div className="flex-shrink-0 p-4 border-t border-sidebar-border">
          {agent && (
            <div className="mb-3">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent border border-sidebar-border">
                <div className="p-2 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-sidebar-foreground truncate">{agent.name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{agent.phone}</p>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-all duration-300"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('agent.portal.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function AgentLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [company, setCompany] = useState<{ name: string; logo: string | null }>({ name: '', logo: null });
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();

  // Live clock
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Check if on login page
  const isLoginPage = pathname === '/agent';

  useEffect(() => {
    setMounted(true);
    
    // Set sidebar open by default on desktop
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
    if (!isLoginPage) {
      const agentDataStr = localStorage.getItem('agentData');
      if (agentDataStr) {
        const localAgent = JSON.parse(agentDataStr);
        const token = localStorage.getItem('agentToken');
        setAgent(localAgent);
        // Fetch fresh balance from API
        if (token) {
          fetch('/api/agent/dashboard?limit=1', {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.agent) {
                const updated = { ...localAgent, balance: data.agent.balance };
                setAgent(updated);
                localStorage.setItem('agentData', JSON.stringify(updated));
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [isLoginPage, pathname]);

  // Load company info for sidebar logo
  useEffect(() => {
    fetch('/api/public/company')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.company?.name) setCompany({ name: data.company.name, logo: data.company.logo || null });
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('agentData');
    localStorage.removeItem('agentToken');
    router.push('/agent');
  };

  // Login page - no layout
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Desktop layout with sidebar
  return (
    <div data-role="agent" className="min-h-screen bg-background">
      {/* Background Effects - dark only */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none hidden dark:block">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(70,95,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(70,95,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden lg:block">
        <AgentSidebar 
          agent={agent}
          company={company}
          sidebarOpen={true}
          setSidebarOpen={() => {}}
          onLogout={handleLogout}
        />
      </div>

      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <AgentSidebar 
          agent={agent}
          company={company}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Content Area */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Desktop Header */}
        <header className="hidden lg:block sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border shadow-theme-sm">
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">{t('agent.portal.welcome')}</h2>
              <p className="text-xs text-muted-foreground">{agent?.name || 'Agent'}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Live datetime */}
              {now && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/50 border border-border text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs tabular-nums">
                    {formatInTimeZone(now, 'Asia/Jakarta', 'EEEE, d MMMM yyyy  HH:mm:ss', { locale: localeId })}
                  </span>
                </div>
              )}
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-card/50 hover:bg-card border border-border transition-all"
                title={isDark ? 'Mode Terang' : 'Mode Gelap'}
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
              </button>
              {agent && <AgentNotificationDropdown agentId={agent.id} />}
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border shadow-theme-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-card rounded-xl transition"
              >
                <Menu className="w-5 h-5 text-foreground" />
              </button>
              <div>
                <h1 className="text-base font-bold text-foreground">{t('agent.portal.title')}</h1>
                <p className="text-[10px] text-muted-foreground">{agent?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 bg-card/50 hover:bg-card rounded-xl transition border border-border flex items-center justify-center"
                title={isDark ? 'Mode Terang' : 'Mode Gelap'}
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
              </button>
              {agent && <AgentNotificationDropdown agentId={agent.id} enableToasts={false} />}
              <button
                onClick={handleLogout}
                className="p-2 bg-card/50 hover:bg-card rounded-xl transition border border-border flex items-center justify-center"
              >
                <LogOut className="w-4 h-4 text-foreground" />
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

function AgentToastBridge() {
  const { addToast, confirm } = useToast();
  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);
  return null;
}

export default function AgentLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CyberToastProvider>
      <AgentToastBridge />
      <AgentLayoutInner>{children}</AgentLayoutInner>
    </CyberToastProvider>
  );
}
