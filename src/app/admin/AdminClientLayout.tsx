'use client';

import { useState, useEffect, useCallback, Suspense, useRef, TouchEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut, SessionProvider } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  Wifi,
  Receipt,
  CreditCard,
  Wallet,
  Clock,
  MessageSquare,
  Network,
  Settings,
  Menu,
  X,
  ChevronDown,
  Shield,
  Search,
  LogOut,

  Router,
  AlertTriangle,
  Timer,
  Server,
  Bell,
  Package,
  UserCheck,
  Sun,
  Moon,
  Gift,
  Globe,
  BarChart3,
  FileText,
  Activity,
  Cable,
  GitBranch,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import NotificationDropdown from '@/components/NotificationDropdown';
import { useTranslation } from '@/hooks/useTranslation';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useTheme } from '@/hooks/useTheme';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';

interface MenuItem {
  titleKey: string;
  icon: React.ReactNode;
  href?: string;
  children?: { titleKey: string; href: string; badge?: string; requiredPermission?: string }[];
  badge?: string;
  requiredPermission?: string;
}

interface MenuGroup {
  titleKey: string;
  items: MenuItem[];
}

const dashboardMenuItem: MenuItem = {
  titleKey: 'nav.dashboard',
  icon: <LayoutDashboard className="w-4 h-4" />,
  href: '/admin',
  requiredPermission: 'dashboard.view',
};

const menuGroups: MenuGroup[] = [
  {
    titleKey: 'nav.catNotifikasi',
    items: [
      {
        titleKey: 'nav.notifications',
        icon: <Bell className="w-4 h-4" />,
        href: '/admin/notifications',
        badge: 'notifications',
        requiredPermission: 'dashboard.view',
      },
      {
        titleKey: 'nav.pushNotifications',
        icon: <Bell className="w-4 h-4" />,
        href: '/admin/notifications/push',
        requiredPermission: 'dashboard.view',
      },
      {
        titleKey: 'nav.whatsapp',
        icon: <MessageCircle className="w-4 h-4" />,
        href: '/admin/settings/whatsapp',
        requiredPermission: 'whatsapp.view',
      },
      {
        titleKey: 'nav.email',
        icon: <Mail className="w-4 h-4" />,
        href: '/admin/settings/email',
        requiredPermission: 'settings.view',
      },
      {
        titleKey: 'nav.isolationTemplates',
        icon: <FileText className="w-4 h-4" />,
        href: '/admin/settings/isolation/templates',
        requiredPermission: 'settings.view',
      },
    ],
  },
  {
    titleKey: 'nav.catCustomerAgent',
    items: [
      {
        titleKey: 'nav.pppoe',
        icon: <Users className="w-4 h-4" />,
        requiredPermission: 'customers.view',
        children: [
          { titleKey: 'nav.pppoeCustomers', href: '/admin/pppoe/customers', requiredPermission: 'customers.view' },
          { titleKey: 'nav.users', href: '/admin/pppoe/users', requiredPermission: 'customers.view' },
          { titleKey: 'nav.profiles', href: '/admin/pppoe/profiles', requiredPermission: 'customers.view' },
          { titleKey: 'nav.areas', href: '/admin/pppoe/areas', requiredPermission: 'customers.view' },
          { titleKey: 'nav.stopSubscription', href: '/admin/pppoe/stopped', requiredPermission: 'customers.view' },
          { titleKey: 'nav.registrations', href: '/admin/pppoe/registrations', badge: 'pending', requiredPermission: 'registrations.view' },
        ],
      },
      {
        titleKey: 'nav.hotspot',
        icon: <Wifi className="w-4 h-4" />,
        requiredPermission: 'hotspot.view',
        children: [
          { titleKey: 'nav.voucher', href: '/admin/hotspot/voucher', requiredPermission: 'vouchers.view' },
          { titleKey: 'nav.rekapVoucher', href: '/admin/hotspot/rekap-voucher', requiredPermission: 'vouchers.view' },
          { titleKey: 'nav.profile', href: '/admin/hotspot/profile', requiredPermission: 'hotspot.view' },
          { titleKey: 'nav.template', href: '/admin/hotspot/template', requiredPermission: 'hotspot.view' },
          { titleKey: 'nav.evoucher', href: '/admin/hotspot/evoucher', requiredPermission: 'vouchers.view' },
        ],
      },
      {
        titleKey: 'nav.agent',
        icon: <UserCheck className="w-4 h-4" />,
        href: '/admin/hotspot/agent',
        requiredPermission: 'hotspot.view',
      },
      {
        titleKey: 'nav.isolation',
        icon: <Shield className="w-4 h-4" />,
        requiredPermission: 'customers.view',
        children: [
          { titleKey: 'nav.isolatedUsers', href: '/admin/isolated-users', requiredPermission: 'customers.view' },
          { titleKey: 'nav.isolationSettings', href: '/admin/settings/isolation', requiredPermission: 'settings.view' },
          { titleKey: 'nav.mikrotikSetup', href: '/admin/settings/isolation/mikrotik', requiredPermission: 'settings.view' },
        ],
      },
      {
        titleKey: 'nav.referral',
        icon: <Gift className="w-4 h-4" />,
        requiredPermission: 'customers.view',
        children: [
          { titleKey: 'nav.referralList', href: '/admin/referrals', requiredPermission: 'customers.view' },
          { titleKey: 'nav.referralSettings', href: '/admin/settings/referral', requiredPermission: 'settings.view' },
        ],
      },
    ],
  },
  {
    titleKey: 'nav.catBillingTransactions',
    items: [
      {
        titleKey: 'nav.agentDeposits',
        icon: <Wallet className="w-4 h-4" />,
        href: '/admin/hotspot/agent/deposits',
        requiredPermission: 'hotspot.view',
      },
      {
        titleKey: 'nav.invoices',
        icon: <Receipt className="w-4 h-4" />,
        href: '/admin/invoices',
        requiredPermission: 'invoices.view',
      },
      {
        titleKey: 'nav.payment',
        icon: <CreditCard className="w-4 h-4" />,
        requiredPermission: 'settings.payment',
        children: [
          { titleKey: 'nav.paymentGateway', href: '/admin/payment-gateway', requiredPermission: 'settings.payment' },
          { titleKey: 'nav.manualPayments', href: '/admin/manual-payments', badge: 'manualPayments', requiredPermission: 'invoices.view' },
          { titleKey: 'nav.bankAccounts', href: '/admin/payment/bank-accounts', requiredPermission: 'settings.payment' },
        ],
      },
      {
        titleKey: 'nav.transaksi',
        icon: <Wallet className="w-4 h-4" />,
        href: '/admin/keuangan',
        requiredPermission: 'keuangan.view',
      },
    ],
  },
  {
    titleKey: 'nav.catNetwork',
    items: [
      {
        titleKey: 'nav.sessions',
        icon: <Clock className="w-4 h-4" />,
        requiredPermission: 'sessions.view',
        children: [
          { titleKey: 'nav.pppoeSessions', href: '/admin/sessions/pppoe', requiredPermission: 'sessions.view' },
          { titleKey: 'nav.hotspotSessions', href: '/admin/sessions/hotspot', requiredPermission: 'sessions.view' },
        ],
      },
      {
        titleKey: 'nav.router',
        icon: <Router className="w-4 h-4" />,
        requiredPermission: 'routers.view',
        children: [
          { titleKey: 'nav.routerNas', href: '/admin/network/routers', requiredPermission: 'routers.view' },
          { titleKey: 'nav.vpnServer', href: '/admin/network/vpn-server', requiredPermission: 'routers.view' },
          { titleKey: 'nav.vpnClient', href: '/admin/network/vpn-client', requiredPermission: 'routers.view' },
        ],
      },
      {
        titleKey: 'nav.oltAndOnu',
        icon: <Server className="w-4 h-4" />,
        requiredPermission: 'network.view',
        children: [
          { titleKey: 'nav.oltManagement', href: '/admin/network/olts', requiredPermission: 'network.view' },
        ],
      },
      {
        titleKey: 'nav.topology',
        icon: <Globe className="w-4 h-4" />,
        requiredPermission: 'network.view',
        children: [
          { titleKey: 'nav.unifiedMap', href: '/admin/network/unified-map', requiredPermission: 'network.view' },
          { titleKey: 'nav.infrastructure', href: '/admin/network/infrastruktur', requiredPermission: 'network.view' },
          { titleKey: 'nav.splitterDiagrams', href: '/admin/network/diagrams', requiredPermission: 'network.view' },
          { titleKey: 'nav.networkTrace', href: '/admin/network/trace', requiredPermission: 'network.view' },
        ],
      },
      {
        titleKey: 'nav.fiberManagement',
        icon: <Cable className="w-4 h-4" />,
        requiredPermission: 'network.view',
        children: [
          { titleKey: 'nav.fiberCables', href: '/admin/network/fiber-cables', requiredPermission: 'network.view' },
          { titleKey: 'nav.fiberCores', href: '/admin/network/fiber-cores', requiredPermission: 'network.view' },
          { titleKey: 'nav.splicePoints', href: '/admin/network/splice-points', requiredPermission: 'network.view' },
          { titleKey: 'nav.jointClosures', href: '/admin/network/fiber-joint-closures', requiredPermission: 'network.view' },
        ],
      },
      {
        titleKey: 'nav.genieacs',
        icon: <Router className="w-4 h-4" />,
        requiredPermission: 'settings.genieacs',
        children: [
          { titleKey: 'nav.devices', href: '/admin/genieacs/devices', requiredPermission: 'settings.genieacs' },
          { titleKey: 'nav.tasks', href: '/admin/genieacs/tasks', requiredPermission: 'settings.genieacs' },
          { titleKey: 'nav.virtualParameters', href: '/admin/genieacs/virtual-parameters', requiredPermission: 'settings.genieacs' },
          { titleKey: 'nav.parameterConfig', href: '/admin/genieacs/parameter-config', requiredPermission: 'settings.genieacs' },
        ],
      },
      {
        titleKey: 'nav.freeradius',
        icon: <Server className="w-4 h-4" />,
        requiredPermission: 'settings.view',
        children: [
          { titleKey: 'nav.radiusStatus', href: '/admin/freeradius/status', requiredPermission: 'settings.view' },
          { titleKey: 'nav.radiusConfig', href: '/admin/freeradius/config', requiredPermission: 'settings.view' },
          { titleKey: 'nav.radTest', href: '/admin/freeradius/radtest', requiredPermission: 'settings.view' },
          { titleKey: 'nav.radCheck', href: '/admin/freeradius/radcheck', requiredPermission: 'settings.view' },
          { titleKey: 'nav.radiusLogs', href: '/admin/freeradius/logs', requiredPermission: 'settings.view' },
        ],
      },
    ],
  },
  {
    titleKey: 'nav.catReports',
    items: [
      {
        titleKey: 'nav.laporan',
        icon: <BarChart3 className="w-4 h-4" />,
        requiredPermission: 'reports.view',
        children: [
          { titleKey: 'nav.laporanData', href: '/admin/laporan', requiredPermission: 'reports.view' },
          { titleKey: 'nav.laporanAnalitik', href: '/admin/laporan/analitik', requiredPermission: 'reports.view' },
        ],
      },
    ],
  },
  {
    titleKey: 'nav.catManagement',
    items: [
      {
        titleKey: 'nav.inventory',
        icon: <Package className="w-4 h-4" />,
        requiredPermission: 'settings.view',
        children: [
          { titleKey: 'nav.inventoryItems', href: '/admin/inventory/items', requiredPermission: 'settings.view' },
          { titleKey: 'nav.inventoryMovements', href: '/admin/inventory/movements', requiredPermission: 'settings.view' },
          { titleKey: 'nav.inventoryCategories', href: '/admin/inventory/categories', requiredPermission: 'settings.view' },
          { titleKey: 'nav.inventorySuppliers', href: '/admin/inventory/suppliers', requiredPermission: 'settings.view' },
        ],
      },
      {
        titleKey: 'nav.tickets',
        icon: <MessageSquare className="w-4 h-4" />,
        requiredPermission: 'dashboard.view',
        children: [
          { titleKey: 'nav.allTickets', href: '/admin/tickets', requiredPermission: 'dashboard.view' },
          { titleKey: 'nav.ticketCategories', href: '/admin/tickets/categories', requiredPermission: 'settings.view' },
        ],
      },
      {
        titleKey: 'nav.management',
        icon: <Shield className="w-4 h-4" />,
        href: '/admin/management',
        requiredPermission: 'users.view',
      },
      {
        titleKey: 'nav.settingsMenu',
        icon: <Settings className="w-4 h-4" />,
        requiredPermission: 'settings.view',
        children: [
          { titleKey: 'nav.company', href: '/admin/settings/company', requiredPermission: 'settings.company' },
          { titleKey: 'nav.database', href: '/admin/settings/database', requiredPermission: 'settings.view' },
          { titleKey: 'nav.cronJobs', href: '/admin/settings/cron', requiredPermission: 'settings.cron' },
          { titleKey: 'nav.genieacs', href: '/admin/settings/genieacs', requiredPermission: 'settings.genieacs' },
          { titleKey: 'nav.systemUpdate', href: '/admin/system', requiredPermission: 'settings.view' },
        ],
      },
    ],
  },
];

function CategoryItem({ titleKey, items, pendingCount, manualPaymentsCount, unreadNotifications, userPermissions, t, onNavigate }: {
  titleKey: string;
  items: MenuItem[];
  pendingCount: number;
  manualPaymentsCount: number;
  unreadNotifications: number;
  userPermissions: string[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hasActiveItem = items.some(item =>
    item.href === pathname || item.children?.some(c => c.href === pathname)
  );
  const [isOpen, setIsOpen] = useState(hasActiveItem);

  const visibleItems = items
    .filter(item => !item.requiredPermission || userPermissions.includes(item.requiredPermission))
    .map(item => ({
      ...item,
      children: item.children?.filter(child => !child.requiredPermission || userPermissions.includes(child.requiredPermission)),
    }))
    .filter(item => !item.children || item.children.length > 0);

  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-2 py-1 group"
      >
        <span className="text-[9px] text-slate-600 tracking-[0.25em] uppercase font-bold group-hover:text-slate-800 dark:text-cyan-300/80 dark:group-hover:text-cyan-300 transition-colors flex-shrink-0">
          {t(titleKey)}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/35 via-cyan-400/20 to-transparent" />
        <ChevronDown
          className={cn(
            'w-3 h-3 text-cyan-400/60 group-hover:text-cyan-300 transition-all duration-200 flex-shrink-0',
            isOpen ? 'rotate-180' : ''
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out space-y-0',
          isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        )}
      >
        {visibleItems.map(item => (
          <NavItem
            key={item.titleKey}
            item={item}
            pendingCount={pendingCount}
            manualPaymentsCount={manualPaymentsCount}
            unreadNotifications={unreadNotifications}
            t={t}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function NavItem({ item, pendingCount, manualPaymentsCount, unreadNotifications, collapsed, t, onNavigate }: { item: MenuItem; pendingCount: number; manualPaymentsCount: number; unreadNotifications: number; collapsed?: boolean; t: (key: string, params?: Record<string, string | number>) => string; onNavigate?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isActive = item.href === pathname || item.children?.some(c => c.href === pathname);

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition-all duration-300 group',
            isActive
              ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-400/30 shadow-[0_0_15px_rgba(0,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20',
          )}
        >
          <span className={cn(
            'flex-shrink-0 p-0.5 rounded-md transition-all duration-300',
            isActive ? 'text-cyan-400 bg-cyan-500/10 drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]' : 'text-muted-foreground group-hover:text-cyan-400'
          )}>
            {item.icon}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate tracking-wide">{t(item.titleKey)}</span>
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-300', isOpen && 'rotate-180')} />
            </>
          )}
        </button>
        {!collapsed && (
          <div className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out',
            isOpen ? 'max-h-96 opacity-100 mt-0.5' : 'max-h-0 opacity-0'
          )}>
            <div className="ml-3.5 pl-2 border-l-2 border-cyan-500/20 space-y-0.5">
              {item.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center justify-between px-2.5 py-1 text-xs rounded-md transition-all duration-200 group/item',
                    pathname === child.href
                      ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-400/20 shadow-[0_0_10px_rgba(0,255,255,0.1)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-primary/10'
                  )}
                >
                  <span className="tracking-wide">{t(child.titleKey)}</span>
                  {child.badge === 'pending' && pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-md font-bold min-w-[18px] text-center shadow-[0_0_8px_rgba(255,0,0,0.5)] animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                  {child.badge === 'manualPayments' && manualPaymentsCount > 0 && (
                    <span className="bg-amber-500 text-black text-[9px] px-1.5 py-0.5 rounded-md font-bold min-w-[18px] text-center shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse">
                      {manualPaymentsCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Get badge count based on badge type
  const getBadgeCount = () => {
    if (item.badge === 'notifications') return unreadNotifications;
    return 0;
  };

  const badgeCount = getBadgeCount();

  return (
    <Link
      href={item.href!}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition-all duration-300 group',
        pathname === item.href
          ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-400/30 shadow-[0_0_15px_rgba(0,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'text-muted-foreground hover:text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20',
      )}
    >
      <span className={cn(
        'flex-shrink-0 p-0.5 rounded-md transition-all duration-300',
        pathname === item.href ? 'text-cyan-400 bg-cyan-500/10 drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]' : 'text-muted-foreground group-hover:text-cyan-400'
      )}>
        {item.icon}
      </span>
      {!collapsed && (
        <>
          <span className="truncate tracking-wide">{t(item.titleKey)}</span>
          {badgeCount > 0 && (
            <span className="ml-auto flex-shrink-0 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center shadow-[0_0_8px_rgba(255,0,0,0.5)] animate-pulse">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

function AdminLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default FALSE untuk mobile
  const [mounted, setMounted] = useState(false);
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [pendingManualPayments, setPendingManualPayments] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { addToast, confirm } = useToast();
  // Persist lastChecked to sessionStorage so navigating between admin pages
  // doesn't re-show already-toasted notifications
  const adminNotifLastCheckedRef = useRef<string>(
    (typeof window !== 'undefined' && sessionStorage.getItem('adminNotifLastChecked'))
      ? sessionStorage.getItem('adminNotifLastChecked')!
      : new Date().toISOString()
  );
  // Track which notification IDs have already been shown as toasts (per browser session)
  // This prevents the same notification from ever re-appearing as a toast
  const toastedNotifIdsRef = useRef<Set<string>>(
    new Set(
      typeof window !== 'undefined' && sessionStorage.getItem('adminToastedNotifIds')
        ? JSON.parse(sessionStorage.getItem('adminToastedNotifIds')!)
        : []
    )
  );
  // Stable ref so pollNotifications useEffect doesn't need addToast as dependency
  const addToastRef = useRef(addToast);
  useEffect(() => { addToastRef.current = addToast; }, [addToast]);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Bridge global showSuccess/showError/showConfirm helpers to CyberToast
  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);

  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  const { company, setCompany } = useAppStore();
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();

  const isLoginPage = pathname === '/admin/login';

  // Set sidebar state based on screen size
  useEffect(() => {
    const handleResize = () => {
      // Open sidebar by default on desktop (lg breakpoint = 1024px)
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    // Set initial state
    handleResize();

    // Listen for resize events
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Idle timeout - 30 minutes with 1 minute warning
  const handleIdleWarning = useCallback(() => {
    setShowIdleWarning(true);
    setIdleCountdown(60);
  }, []);

  const handleIdleTimeout = useCallback(() => {
    setShowIdleWarning(false);
  }, []);

  const { extendSession } = useIdleTimeout({
    timeout: 30 * 60 * 1000, // 30 minutes
    warningTime: 60 * 1000, // 1 minute warning
    enabled: !isLoginPage && status === 'authenticated',
    onWarning: handleIdleWarning,
    onTimeout: handleIdleTimeout,
  });

  // Countdown timer for idle warning
  useEffect(() => {
    if (!showIdleWarning) return;

    const interval = setInterval(() => {
      setIdleCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showIdleWarning]);

  // Handle stay logged in
  const handleStayLoggedIn = useCallback(() => {
    setShowIdleWarning(false);
    setIdleCountdown(60);
    extendSession();
  }, [extendSession]);

  // Handle logout - use redirect: false to avoid NEXTAUTH_URL issues
  const handleLogout = useCallback(async () => {
    // Log logout activity before signing out
    if (session?.user) {
      try {
        await fetch('/api/auth/logout-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: (session.user as any).id,
            username: (session.user as any).username,
            role: (session.user as any).role,
          }),
        });
      } catch (error) {
        console.error('Failed to log logout:', error);
      }
    }

    await signOut({ redirect: false });
    // Manual redirect to current origin
    window.location.href = `${window.location.origin}/admin/login`;
  }, [session]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load user permissions when session is available
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    const userId = (session.user as any).id;
    if (userId) {
      fetch(`/api/admin/users/${userId}/permissions`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setUserPermissions(data.permissions);
          }
        })
        .catch(console.error);
    }
  }, [session, status]);

  // Load company data
  useEffect(() => {
    fetch('/api/company')
      .then((res) => res.json())
      .then((data) => {
        if (data.name) {
          setCompany({
            name: data.name,
            email: data.email,
            phone: data.phone,
            address: data.address,
            baseUrl: data.baseUrl || window.location.origin,
            adminPhone: data.phone,
          });
        }
      })
      .catch(console.error);
  }, [setCompany]);

  // Load pending registrations
  useEffect(() => {
    if (status !== 'authenticated') return;

    const loadPending = () => {
      fetch('/api/admin/registrations?status=PENDING')
        .then((res) => res.json())
        .then((data) => {
          if (data.stats) setPendingRegistrations(data.stats.pending || 0);
        })
        .catch(console.error);
    };

    loadPending();
    const interval = setInterval(loadPending, 30000);
    return () => clearInterval(interval);
  }, [status]);

  // Load pending manual payments
  useEffect(() => {
    if (status !== 'authenticated') return;

    const loadPendingPayments = () => {
      fetch('/api/manual-payments?status=PENDING')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setPendingManualPayments(data.data?.length || 0);
        })
        .catch(console.error);
    };

    loadPendingPayments();
    const interval = setInterval(loadPendingPayments, 30000);
    return () => clearInterval(interval);
  }, [status]);

  // Load unread notifications + show toasts for new ones
  useEffect(() => {
    if (status !== 'authenticated') return;

    const pollNotifications = async () => {
      try {
        // Get unread count (badge)
        const countRes = await fetch('/api/notifications?limit=1');
        const countData = await countRes.json();
        if (countData.success) setUnreadNotifications(countData.unreadCount || 0);

        // Get new notifications since last check (for toasts)
        const since = encodeURIComponent(adminNotifLastCheckedRef.current);
        const newRes = await fetch(`/api/notifications?since=${since}&limit=20`);
        const newData = await newRes.json();
        if (newData.success && Array.isArray(newData.notifications) && newData.notifications.length > 0) {
          adminNotifLastCheckedRef.current = new Date().toISOString();
          sessionStorage.setItem('adminNotifLastChecked', adminNotifLastCheckedRef.current);
          for (const notif of newData.notifications) {
            // Skip if this notification was already toasted in this session
            if (toastedNotifIdsRef.current.has(notif.id)) continue;
            toastedNotifIdsRef.current.add(notif.id);
            // Persist toasted IDs (keep last 200 to avoid unbounded growth)
            const idsArray = Array.from(toastedNotifIdsRef.current).slice(-200);
            sessionStorage.setItem('adminToastedNotifIds', JSON.stringify(idsArray));

            const toastType =
              notif.type === 'new_ticket' ? 'info' :
              notif.type === 'manual_payment_submitted' ? 'info' :
              notif.type === 'agent_deposit_request' ? 'info' :
              notif.type === 'agent_deposit_approved' ? 'success' :
              notif.type === 'agent_deposit_rejected' ? 'warning' :
              notif.type === 'payment_received' ? 'success' :
              notif.type === 'new_registration' ? 'info' :
              notif.type === 'user_expired' ? 'warning' :
              notif.type === 'system_alert' ? 'error' : 'info';
            addToastRef.current({ type: toastType, title: notif.title, description: notif.message, duration: 8000 });
          }
        }
      } catch {
        // silently ignore
      }
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 30000);
    return () => clearInterval(interval);
  // addToast intentionally excluded — we use addToastRef to prevent re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);



  // Show login page without layout
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Show loading while checking session
  if (status === 'loading' || !mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[70px] animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[70px] animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
        </div>

        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin shadow-[0_0_20px_rgba(0,255,255,0.3)]" />
            <div className="absolute inset-0 w-12 h-12 border-3 border-blue-500/20 border-b-blue-400 rounded-full animate-spin animate-reverse" style={{ animationDuration: '1.5s' }} />
          </div>
          <p className="text-sm text-cyan-400/80 font-medium tracking-wider uppercase animate-pulse">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    if (typeof window !== 'undefined') {
      window.location.href = `${window.location.origin}/admin/login`;
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[70px] animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[70px] animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
        </div>

        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin shadow-[0_0_20px_rgba(0,255,255,0.3)]" />
            <div className="absolute inset-0 w-12 h-12 border-3 border-blue-500/20 border-b-blue-400 rounded-full animate-spin animate-reverse" style={{ animationDuration: '1.5s' }} />
          </div>
          <p className="text-sm text-cyan-400/80 font-medium tracking-wider uppercase animate-pulse">{t('common.redirectingToLogin')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Cyberpunk Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Primary glow orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/5 rounded-full blur-[70px] animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[70px] animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-blue-500/3 rounded-full blur-[80px]" />

        {/* Scan lines overlay */}
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(6,182,212,0.01)_2px,rgba(6,182,212,0.01)_4px)]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      {/* Mobile overlay - tap or swipe to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            (e.currentTarget as any).touchStartX = touch.clientX;
          }}
          onTouchEnd={(e) => {
            const touchStartX = (e.currentTarget as any).touchStartX;
            const touchEndX = e.changedTouches[0].clientX;
            if (touchStartX - touchEndX > 50) {
              setSidebarOpen(false);
            }
          }}
        />
      )}

      {/* Sidebar - optimized for mobile */}
      <aside 
        className={cn(
          'fixed top-0 left-0 z-50 h-dvh w-[280px] sm:w-64 transition-transform duration-300 ease-out',
          'bg-background/95 backdrop-blur-xl',
          'border-r border-cyan-500/20',
          'shadow-[5px_0_30px_rgba(6,182,212,0.1),inset_-1px_0_0_rgba(255,255,255,0.05)]',
          'safe-area-inset-left',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Top neon line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        <div className="flex flex-col h-full">
          {/* Logo - compact on mobile with safe area */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 via-transparent to-blue-500/5">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-400 flex items-center justify-center border border-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] animate-[neonPulse_3s_ease-in-out_infinite]">
                <span className="text-black font-black text-xs sm:text-sm">{company.name.charAt(0)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[11px] sm:text-xs font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)] truncate max-w-[130px] sm:max-w-[110px]">
                  {company.name}
                </h1>
                <p className="text-[9px] sm:text-[10px] text-cyan-400/60 tracking-[0.15em] sm:tracking-[0.2em] uppercase font-medium">{t('common.billingSystem')}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 sm:p-1.5 hover:bg-primary/20 rounded-lg sm:rounded-md text-muted-foreground hover:text-primary transition-colors border border-transparent hover:border-primary/30 active:scale-95"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Navigation - optimized scrolling for mobile */}
          <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-1.5 custom-scrollbar touch-pan-y">
            <div className="mb-1">
              <NavItem
                item={dashboardMenuItem}
                pendingCount={pendingRegistrations}
                manualPaymentsCount={pendingManualPayments}
                unreadNotifications={unreadNotifications}
                t={t}
                onNavigate={() => setSidebarOpen(false)}
              />
            </div>
            {menuGroups.map(group => (
              <CategoryItem
                key={group.titleKey}
                titleKey={group.titleKey}
                items={group.items}
                pendingCount={pendingRegistrations}
                manualPaymentsCount={pendingManualPayments}
                unreadNotifications={unreadNotifications}
                userPermissions={userPermissions}
                t={t}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          {/* Version badge */}
          <div className="flex-shrink-0 px-3 py-1.5">
            <AppVersionBadge />
          </div>

          {/* User - fixed at bottom */}
          <div className="flex-shrink-0 px-2.5 py-2 border-t border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 via-transparent to-blue-500/5">
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-primary/20 transition-all duration-300 border border-transparent hover:border-primary/30 group"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center text-white text-sm font-black shadow-[0_0_15px_rgba(6,182,212,0.3)] group-hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-shadow">
                  {session?.user?.name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-foreground truncate tracking-wide">
                    {session?.user?.name || 'Admin'}
                  </p>
                  <p className="text-[10px] text-cyan-400 truncate font-medium tracking-wider capitalize">
                    {(session?.user as any)?.role || 'admin'}
                  </p>
                </div>
                <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground group-hover:text-cyan-400 transition-all duration-300', showUserMenu && 'rotate-180')} />
              </button>

              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-background/95 backdrop-blur-xl rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5),0_0_10px_rgba(0,255,255,0.1)] border border-cyan-500/20 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                  <div className="absolute top-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                  <div className="p-3 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-transparent to-blue-500/10">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] font-medium">{t('auth.signedInAs')}</p>
                    <p className="text-xs font-bold text-cyan-400 truncate mt-1">
                      {(session?.user as any)?.username}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors tracking-wider"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t('auth.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64 min-h-screen flex flex-col relative z-10 transition-all duration-300">
        {/* Header - optimized for mobile */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-cyan-500/20 shadow-[0_4px_30px_rgba(0,0,0,0.3),0_0_15px_rgba(6,182,212,0.05)] safe-area-inset-top">
          {/* Top neon line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

          <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2.5 sm:p-2 hover:bg-primary/20 rounded-lg text-foreground hover:text-primary transition-colors border border-transparent hover:border-primary/30 active:scale-95"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile title - show on small screens */}
            <div className="flex-1 sm:hidden min-w-0">
              <h1 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 truncate">
                {company.name}
              </h1>
            </div>

            {/* Search - hidden on mobile */}
            <div className="hidden sm:flex flex-1 max-w-md">
              <div className="relative w-full group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  className="w-full pl-10 pr-4 py-2.5 bg-card/50 border-2 border-primary/20 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 focus:bg-card/80 focus:shadow-[0_0_20px_rgba(0,247,255,0.1)] transition-all duration-300"
                />
                {/* Bottom focus line */}
                <div className="absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-accent/0 to-transparent group-focus-within:via-accent transition-all duration-300" />
              </div>
            </div>

            <div className="hidden sm:block flex-1" />

            {/* Actions - compact on mobile */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors border border-transparent hover:border-primary/30"
                title={t('common.toggleTheme')}
              >
                {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
              </button>
              <NotificationDropdown />
            </div>
          </div>
        </header>

        {/* Content - with safe area padding */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 animate-in fade-in duration-500 safe-area-inset-bottom">{children}</main>
      </div>

      {/* Idle Timeout Warning Modal */}
      {showIdleWarning && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          {/* Scan lines */}
          <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(6,182,212,0.02)_2px,rgba(6,182,212,0.02)_4px)]" />

          <div className="relative bg-background/95 backdrop-blur-xl border-2 border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(0,255,255,0.2),0_0_100px_rgba(255,0,255,0.1)] max-w-sm w-full p-6 animate-in zoom-in-95 duration-300">
            {/* Top neon line */}
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br-lg" />

            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse">
                <Timer className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black text-foreground tracking-wider uppercase drop-shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                  {t('common.sessionTimeout')}
                </h3>
                <p className="text-[10px] text-cyan-400/60 tracking-[0.2em] uppercase font-medium">
                  {t('common.securityProtocolActive')}
                </p>
              </div>
            </div>

            <div className="mb-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {t('common.autoLogoutInactivity')}
              </p>
              <div className="inline-flex items-center justify-center gap-3 px-6 py-4 bg-amber-500/10 border border-amber-500/30 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
                <span className="text-4xl font-mono font-black text-amber-400 tabular-nums drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                  {idleCountdown}
                </span>
                <span className="text-xs text-amber-400 uppercase font-bold tracking-wider">{t('common.seconds')}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-3 text-sm font-bold text-muted-foreground hover:text-destructive bg-card/50 hover:bg-destructive/10 border-2 border-border hover:border-destructive/30 rounded-xl transition-all duration-300 uppercase tracking-wider"
              >
                {t('auth.logout')}
              </button>
              <button
                onClick={handleStayLoggedIn}
                className="flex-1 px-4 py-3 text-sm font-black text-black bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 border-2 border-cyan-400 shadow-[0_0_20px_rgba(0,255,255,0.4)] hover:shadow-[0_0_30px_rgba(0,255,255,0.6)] rounded-xl transition-all duration-300 uppercase tracking-wider"
              >
                {t('common.stayActive')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Version badge in sidebar footer ───────────────────────
function AppVersionBadge() {
  const [info, setInfo] = useState<{ version: string; commit: string; hasUpdate: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/admin/system/info')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setInfo(d); })
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <Link
      href="/admin/system"
      className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg bg-card/50 hover:bg-primary/10 border border-border/50 hover:border-cyan-500/30 group transition-all duration-200"
    >
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
        <span className="text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
          v{info.version} · {info.commit}
        </span>
      </div>
      {info.hasUpdate && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
          UPDATE
        </span>
      )}
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CyberToastProvider>
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[70px] animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[70px] animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
          </div>

          <div className="relative">
            <div className="w-12 h-12 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin shadow-[0_0_20px_rgba(0,255,255,0.3)]" />
          </div>
        </div>
      }>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </Suspense>
    </SessionProvider>
    </CyberToastProvider>
  );
}
