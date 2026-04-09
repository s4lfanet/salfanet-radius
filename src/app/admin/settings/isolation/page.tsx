'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Shield,
  Server,
  Wifi,
  Link as LinkIcon,
  MessageSquare,
  Globe,
  CreditCard,
  Bell,
  Mail,
  Clock,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';

interface IsolationSettings {
  isolationEnabled: boolean;
  isolationIpPool: string;
  isolationServerIp: string;
  isolationRateLimit: string;
  isolationRedirectUrl: string;
  isolationMessage: string;
  isolationAllowDns: boolean;
  isolationAllowPayment: boolean;
  isolationNotifyWhatsapp: boolean;
  isolationNotifyEmail: boolean;
  gracePeriodDays: number;
  baseUrl: string;
}

export default function IsolationSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<IsolationSettings>({
    isolationEnabled: true,
    isolationIpPool: '192.168.200.0/24',
    isolationServerIp: '',
    isolationRateLimit: '64k/64k',
    isolationRedirectUrl: '',
    isolationMessage: 'Akun Anda telah diisolir karena masa berlangganan habis. Silakan lakukan pembayaran untuk mengaktifkan kembali layanan.',
    isolationAllowDns: true,
    isolationAllowPayment: true,
    isolationNotifyWhatsapp: true,
    isolationNotifyEmail: false,
    gracePeriodDays: 0,
    baseUrl: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/isolation');
      const data = await response.json();
      
      if (data.success) {
        setSettings({
          isolationEnabled: data.data.isolationEnabled ?? true,
          isolationIpPool: data.data.isolationIpPool || '192.168.200.0/24',
          isolationServerIp: data.data.isolationServerIp || '',
          isolationRateLimit: data.data.isolationRateLimit || '64k/64k',
          isolationRedirectUrl: data.data.isolationRedirectUrl || '',
          isolationMessage: data.data.isolationMessage || 'Akun Anda telah diisolir karena masa berlangganan habis. Silakan lakukan pembayaran untuk mengaktifkan kembali layanan.',
          isolationAllowDns: data.data.isolationAllowDns ?? true,
          isolationAllowPayment: data.data.isolationAllowPayment ?? true,
          isolationNotifyWhatsapp: data.data.isolationNotifyWhatsapp ?? true,
          isolationNotifyEmail: data.data.isolationNotifyEmail ?? false,
          gracePeriodDays: data.data.gracePeriodDays || 0,
          baseUrl: data.data.baseUrl || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/isolation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('isolation.settingsSaved'), duration: 2000 });
        fetchSettings();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      addToast({ type: 'error', title: t('common.failed'), description: error.message || t('isolation.failedSave') });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!await confirm({
      title: t('isolation.resetToDefault') + '?',
      message: t('common.confirmReset') || 'Settings will be restored to default values',
      confirmText: t('common.yes') + ', Reset',
      cancelText: t('common.cancel'),
      variant: 'warning',
    })) return;
    setSettings({
      isolationEnabled: true,
      isolationIpPool: '192.168.200.0/24',
      isolationServerIp: settings.isolationServerIp,
      isolationRateLimit: '64k/64k',
      isolationRedirectUrl: settings.baseUrl ? `${settings.baseUrl}/isolated` : '',
      isolationMessage: 'Akun Anda telah diisolir karena masa berlangganan habis. Silakan lakukan pembayaran untuk mengaktifkan kembali layanan.',
      isolationAllowDns: true,
      isolationAllowPayment: true,
      isolationNotifyWhatsapp: true,
      isolationNotifyEmail: false,
      gracePeriodDays: 0,
      baseUrl: settings.baseUrl,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] mb-1">
            <Shield className="w-6 h-6 text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />
            {t('isolation.title')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('isolation.subtitle')}
          </p>
        </div>

      {/* Info Banner */}
      <div className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-primary dark:text-violet-200 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-foreground dark:text-violet-100">
            <p className="font-semibold mb-0.5">{t('isolation.aboutSystem')}</p>
            <p>
              {t('isolation.aboutSystemDesc')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* General Settings */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Server className="w-4 h-4" />
            {t('isolation.generalSettings')}
          </h2>
          
          <div className="space-y-3">
            {/* Enable Isolation */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  {t('isolation.enableAutoIsolation')}
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('isolation.autoIsolateDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isolationEnabled}
                  onChange={(e) => setSettings({ ...settings, isolationEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Grace Period */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {t('isolation.gracePeriod')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={settings.gracePeriodDays}
                  onChange={(e) => setSettings({ ...settings, gracePeriodDays: parseInt(e.target.value) })}
                  className="w-20 px-2.5 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
                />
                <span className="text-xs text-muted-foreground dark:text-muted-foreground">{t('isolation.days')}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.gracePeriodHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Network Settings */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Wifi className="w-4 h-4" />
            {t('isolation.networkSettings')}
          </h2>
          
          <div className="space-y-3">
            {/* IP Pool */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                {t('isolation.ipPoolLabel')}
              </label>
              <input
                type="text"
                value={settings.isolationIpPool}
                onChange={(e) => setSettings({ ...settings, isolationIpPool: e.target.value })}
                placeholder="192.168.200.0/24"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.ipPoolHint')}
              </p>
            </div>

            {/* Server IP for MikroTik NAT */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {t('isolation.serverIpLabel')}
              </label>
              <input
                type="text"
                value={settings.isolationServerIp}
                onChange={(e) => setSettings({ ...settings, isolationServerIp: e.target.value })}
                placeholder="103.151.140.110"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.serverIpHint')}
              </p>
            </div>

            {/* Rate Limit */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                {t('isolation.rateLimit')}
              </label>
              <input
                type="text"
                value={settings.isolationRateLimit}
                onChange={(e) => setSettings({ ...settings, isolationRateLimit: e.target.value })}
                placeholder="64k/64k"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.rateLimitHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Access Control */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Globe className="w-4 h-4" />
            {t('isolation.accessControl')}
          </h2>
          
          <div className="space-y-2">
            {/* Allow DNS */}
            <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
              <div>
                <label className="text-xs font-medium text-foreground">
                  {t('isolation.allowDns')}
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('isolation.allowDnsDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isolationAllowDns}
                  onChange={(e) => setSettings({ ...settings, isolationAllowDns: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Allow Payment Page */}
            <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
              <div>
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  {t('isolation.allowPayment')}
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('isolation.allowPaymentDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isolationAllowPayment}
                  onChange={(e) => setSettings({ ...settings, isolationAllowPayment: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Landing Page Settings */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <LinkIcon className="w-4 h-4" />
            {t('isolation.landingPage')}
          </h2>
          
          <div className="space-y-3">
            {/* Redirect URL */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                {t('isolation.redirectUrl')}
              </label>
              <input
                type="url"
                value={settings.isolationRedirectUrl}
                onChange={(e) => setSettings({ ...settings, isolationRedirectUrl: e.target.value })}
                placeholder={`${settings.baseUrl}/isolated`}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.redirectUrlHint')}
              </p>
            </div>

            {/* Custom Message */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                {t('isolation.customMessage')}
              </label>
              <textarea
                value={settings.isolationMessage}
                onChange={(e) => setSettings({ ...settings, isolationMessage: e.target.value })}
                rows={3}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
                placeholder={t('isolation.customMessagePlaceholder')}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t('isolation.customMessageHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Bell className="w-4 h-4" />
            {t('isolation.notifications')}
          </h2>
          
          <div className="space-y-2">
            {/* WhatsApp Notification */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <label className="font-medium text-foreground text-xs flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {t('isolation.whatsappNotification')}
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('isolation.whatsappNotificationDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isolationNotifyWhatsapp}
                  onChange={(e) => setSettings({ ...settings, isolationNotifyWhatsapp: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Email Notification */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <label className="font-medium text-foreground text-xs flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {t('isolation.emailNotification')}
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('isolation.emailNotificationDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.isolationNotifyEmail}
                  onChange={(e) => setSettings({ ...settings, isolationNotifyEmail: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {t('isolation.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('isolation.saveSettings')}
              </>
            )}
          </button>
          
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('isolation.resetToDefault')}
          </button>
        </div>

        {/* Configuration Guide */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {t('isolation.mikrotikConfigRequired')}
          </h3>
          <div className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
            <p>{t('isolation.mikrotikConfigDesc')}</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>{t('isolation.mikrotikStep1')} <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">isolir</code></li>
              <li>{t('isolation.mikrotikStep2')} <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">{settings.isolationIpPool}</code></li>
              <li>{t('isolation.mikrotikStep3')} <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">{settings.isolationRateLimit}</code></li>
              <li>{t('isolation.mikrotikStep4')}</li>
            </ol>
            <p className="mt-2">
              <a 
                href="/docs/isolation" 
                target="_blank"
                className="text-amber-800 dark:text-amber-300 underline hover:text-amber-900"
              >
                {t('isolation.viewFullDocs')}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
