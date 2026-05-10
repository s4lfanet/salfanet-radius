'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  Settings as SettingsIcon,
  MessageSquare,
  FileText,
  History,
  Send,
  Smartphone,
  Loader2
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'providers' | 'templates' | 'notifications' | 'send' | 'history'>('providers');

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#00f7ff]" />
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
          <button
            onClick={() => setActiveTab('providers')}
            className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'providers'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
            {t('whatsapp.providers')}
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
            {t('whatsapp.templates')}
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'notifications'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
            {t('whatsapp.reminderSettings')}
          </button>
          <button
            onClick={() => setActiveTab('send')}
            className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'send'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
            {t('whatsapp.sendMessage')}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
            {t('common.history')}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
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
