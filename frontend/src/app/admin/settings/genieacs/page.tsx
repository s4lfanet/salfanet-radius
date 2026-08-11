'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Server, Loader2, Zap, Save, CheckCircle, Info, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface GenieACSSettings {
  id?: string;
  host: string;
  username: string;
  password: string;
  isActive: boolean;
  hasPassword?: boolean;
}

export default function GenieACSSettingsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [settings, setSettings] = useState<GenieACSSettings>({
    host: '',
    username: '',
    password: '',
    isActive: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, devicesRes] = await Promise.all([
        fetch('/api/settings/genieacs'),
        fetch('/api/settings/genieacs/devices')
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data?.settings) {
          setSettings({
            id: data.settings.id ?? '',
            host: data.settings.host ?? '',
            username: data.settings.username ?? '',
            password: '',
            isActive: data.settings.isActive ?? false,
            hasPassword: data.settings.hasPassword ?? false
          });
        }
      }

      if (devicesRes.ok) {
        const data = await devicesRes.json();
        setDeviceCount(data.devices?.length || 0);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.host || !settings.username || (!settings.password && !settings.hasPassword)) {
      addToast({ type: 'warning', title: t('genieacs.attention'), description: t('genieacs.requiredFields') });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        host: settings.host,
        username: settings.username,
      };
      if (settings.password) payload.password = settings.password;
      const response = await fetch('/api/settings/genieacs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        setSettings(prev => ({ ...prev, hasPassword: true, password: '', isActive: true }));
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.settingsSaved'), duration: 2000 });
      } else {
        throw new Error(data.error || t('common.failed'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.saveFailed');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.host) {
      addToast({ type: 'warning', title: t('genieacs.attention'), description: t('genieacs.enterUrlFirst') });
      return;
    }
    setTesting(true);
    try {
      const response = await fetch('/api/settings/genieacs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: settings.host, username: settings.username, password: settings.password })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({ type: 'success', title: t('genieacs.connectionSuccess'), description: t('genieacs.serverReachable').replace('{count}', String(data.deviceCount || 0)), duration: 3000 });
      } else {
        throw new Error(data.error || t('genieacs.connectionFailed'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedToConnect');
      addToast({ type: 'error', title: t('genieacs.connectionFailed'), description: msg });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-3">
            <Server className="w-6 h-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.8)]" />
            {t('genieacs.title')}
          </h1>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('genieacs.subtitle')}
            </p>
            <span className={`px-2 py-1 text-xs font-medium rounded ${settings.isActive ? 'bg-success/100' : 'bg-destructive/100'}`}>
              {settings.isActive ? t('genieacs.active') : t('genieacs.inactive')}
            </span>
          </div>
        </div>

      {/* Quick Stats */}
      {settings.isActive && (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
                <Server className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{deviceCount} {t('genieacs.device')}</p>
                <p className="text-xs text-muted-foreground">{t('genieacs.connectedToGenieacs')}</p>
              </div>
            </div>
            <a
              href="/admin/genieacs/devices"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t('genieacs.viewDevices')}
            </a>
          </div>
        </div>
      )}

      {/* Settings Form */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-3 border-b border-border bg-muted">
          <h2 className="text-sm font-semibold text-foreground">{t('genieacs.serverConfiguration')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('genieacs.enterCredentials')}</p>
        </div>

        <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
          {/* Status Info */}
          {settings.hasPassword && (
            <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-lg">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              <p className="text-xs text-success">{t('genieacs.credentialsSaved')}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/30 rounded-lg">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs text-primary">
              <p className="font-medium mb-1">{t('genieacs.nbiApiInfo')}</p>
              <p>{t('genieacs.nbiApiHelp')}</p>
            </div>
          </div>

          {/* Server URL */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('genieacs.serverUrl')} <span className="text-destructive">*</span>
            </label>
            <input
              type="url"
              value={settings.host || ''}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="http://genieacs.local:7557"
              required
            />
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                {t('genieacs.username')} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={settings.username || ''}
                onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                {t('genieacs.password')} {!settings.hasPassword && <span className="text-destructive">*</span>}
              </label>
              <input
                type="password"
                value={settings.password || ''}
                onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder={settings.hasPassword ? t('genieacs.passwordUnchanged') : '********'}
                required={!settings.hasPassword}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !settings.host}
              className="flex items-center gap-1.5 px-4 py-2 text-primary border border-primary hover:bg-primary/10 dark:hover:bg-primary/20 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {t('genieacs.testConnection')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('genieacs.saveSettings')}
            </button>
          </div>
        </form>
      </div>

      {/* Help Section */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">{t('genieacs.help')}</h3>
        <ul className="text-xs text-muted-foreground dark:text-muted-foreground space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            {t('genieacs.ensureAccessible')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            {t('genieacs.defaultPort')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            {t('genieacs.useTestConnection')}
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            {t('genieacs.afterConfig')}
          </li>
        </ul>
      </div>
      </div>
    </div>
  );
}


