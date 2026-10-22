'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { 
  Settings as SettingsIcon,
  MessageSquare,
  FileText,
  History,
  Send,
  Smartphone,
  Loader2
} from 'lucide-react';

type WaTab = 'providers' | 'templates' | 'notifications' | 'send' | 'history';

// Dynamic imports for better performance
const ProvidersPageContent = dynamic(() => import('@/app/admin/whatsapp/providers/page'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
});
const TemplatesPageContent = dynamic(() => import('@/app/admin/whatsapp/templates/page'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
});
const NotificationsPageContent = dynamic(() => import('@/app/admin/whatsapp/notifications/page'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
});
const SendPageContent = dynamic(() => import('@/app/admin/whatsapp/send/page'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
});
const HistoryPageContent = dynamic(() => import('@/app/admin/whatsapp/history/page'), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
});

export default function WhatsAppSettingsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hasPermission, loading: permsLoading } = usePermissions();
  // Same permissions as the tabs' APIs (and the sidebar), so a role only
  // sees the tabs it can use: customer service and marketing send and read
  // history, but providers and templates are for those who manage them.
  const tabs: { id: WaTab; label: string; icon: React.ReactNode; permission: string }[] = [
    { id: 'providers', label: t('whatsapp.providers'), icon: <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />, permission: 'whatsapp.providers' },
    { id: 'templates', label: t('whatsapp.templates'), icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />, permission: 'whatsapp.templates' },
    { id: 'notifications', label: t('whatsapp.reminderSettings'), icon: <SettingsIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />, permission: 'whatsapp.view' },
    { id: 'send', label: t('whatsapp.sendMessage'), icon: <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />, permission: 'whatsapp.send' },
    { id: 'history', label: t('common.history'), icon: <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />, permission: 'whatsapp.view' },
  ];
  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));
  const tabParam = searchParams.get('tab') as WaTab | null;
  const [requestedTab, setActiveTab] = useState<WaTab>(tabParam || 'providers');
  const activeTab: WaTab | undefined = visibleTabs.some((tab) => tab.id === requestedTab) ? requestedTab : visibleTabs[0]?.id;

  useEffect(() => {
    if (tabParam && tabs.some((tab) => tab.id === tabParam)) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  const handleTabChange = (tab: WaTab) => {
    setActiveTab(tab);
    router.push(`/admin/settings/whatsapp?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-96 sm:h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-brand-500 dark:via-white dark:to-pink-500 dark:drop- flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-brand-500" />
            {t('whatsapp.settings')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('whatsapp.settingsDesc')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex flex-wrap gap-1 sm:gap-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {!permsLoading && !activeTab && (
          <p className="text-sm text-muted-foreground">Akun Anda tidak punya akses ke menu WhatsApp.</p>
        )}
        {activeTab === 'providers' && <ProvidersPageContent />}
        {activeTab === 'templates' && <TemplatesPageContent />}
        {activeTab === 'notifications' && <NotificationsPageContent />}
        {activeTab === 'send' && <SendPageContent />}
        {activeTab === 'history' && <HistoryPageContent />}
      </div>
    </div>
    </div>
    </div>
  );
}
