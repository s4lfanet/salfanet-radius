'use client';

import { useState, useEffect } from 'react';
import {
  Send,
  Shield,
  Loader2,
  Database,
} from 'lucide-react';
import { showSuccess, showError } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';

interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  backupTopicId: string;
  healthTopicId: string;
  schedule: string;
  scheduleTime: string;
  keepLastN: number;
}

export default function TelegramSettingsPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingBackup, setTestingBackup] = useState(false);

  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings>({
    enabled: false,
    botToken: '',
    chatId: '',
    backupTopicId: '',
    healthTopicId: '',
    schedule: 'daily',
    scheduleTime: '02:00',
    keepLastN: 7,
  });

  useEffect(() => {
    if (hasPermission('settings.view')) {
      loadSettings();
    }
  }, [hasPermission]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram/settings');
      const data = await res.json();
      if (data && !data.error) {
        setTelegramSettings(data);
      }
    } catch (error) {
      console.error('Load telegram settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTelegramSettings = async () => {
    try {
      const res = await fetch('/api/telegram/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramSettings),
      });

      const data = await res.json();

      if (data.success) {
        // Restart cron jobs to apply new settings
        await fetch('/api/cron/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restart', job: 'all' }),
        });

        await showSuccess(t('settings.telegramTestSuccess'));
        loadSettings();
      } else {
        await showError(data.error || t('common.saveFailed'));
      }
    } catch (error) {
      await showError(t('common.failedSave') + ': ' + error);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramSettings.botToken || !telegramSettings.chatId) {
      await showError(t('settings.enterTokenChatIdFirst'));
      return;
    }

    setTesting(true);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: telegramSettings.botToken,
          chatId: telegramSettings.chatId,
          backupTopicId: telegramSettings.backupTopicId || undefined,
          healthTopicId: telegramSettings.healthTopicId || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        await showSuccess(t('settings.telegramTestSuccess'));
      } else {
        await showError(data.error || t('settings.telegramTestFailed'));
      }
    } catch (error) {
      await showError(t('settings.failedTest') + ': ' + error);
    } finally {
      setTesting(false);
    }
  };

  const handleTestBackup = async () => {
    if (!telegramSettings.botToken || !telegramSettings.chatId) {
      await showError(t('settings.enterTokenChatIdFirst'));
      return;
    }

    // Must save settings first before test backup (API loads from DB)
    setTestingBackup(true);
    try {
      const res = await fetch('/api/telegram/test-backup', {
        method: 'POST',
      });

      const data = await res.json();

      if (data.success) {
        await showSuccess(`Backup berhasil dikirim ke Telegram!\nFile: ${data.filename}`);
      } else {
        await showError(data.error || 'Gagal mengirim backup ke Telegram');
      }
    } catch (error) {
      await showError('Gagal test backup: ' + error);
    } finally {
      setTestingBackup(false);
    }
  };

  const canView = hasPermission('settings.view');
  const canEdit = hasPermission('settings.edit');

  if (!permLoading && !canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
          <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>
        <div className="relative z-10 text-center">
          <Shield className="w-16 h-16 text-[#ff3366] drop-shadow-[0_0_20px_rgba(255,51,102,0.6)] mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] mb-2">
            Access Denied
          </h2>
          <p className="text-muted-foreground">
            You don&apos;t have permission to view Telegram settings.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
          <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
            <Send className="w-6 h-6 text-[#00f7ff] inline mr-2" />
            Telegram Auto-Backup
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Konfigurasi backup otomatis database melalui Telegram
          </p>
        </div>

        {/* Form */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Send className="w-5 h-5" />
            Telegram Auto-Backup Configuration
          </h3>

          <div className="space-y-4">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <label className="font-medium text-foreground">{t('settings.enableAutoBackup')}</label>
                <p className="text-sm text-muted-foreground">{t('settings.autoBackupDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegramSettings.enabled}
                  onChange={(e) =>
                    setTelegramSettings({ ...telegramSettings, enabled: e.target.checked })
                  }
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/30 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Bot Token */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Telegram Bot Token
              </label>
              <input
                type="text"
                value={telegramSettings.botToken || ''}
                onChange={(e) =>
                  setTelegramSettings({ ...telegramSettings, botToken: e.target.value })
                }
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get token from @BotFather on Telegram
              </p>
            </div>

            {/* Chat ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Chat ID (Group)
              </label>
              <input
                type="text"
                value={telegramSettings.chatId || ''}
                onChange={(e) =>
                  setTelegramSettings({ ...telegramSettings, chatId: e.target.value })
                }
                placeholder="-1001234567890"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get Chat ID from @userinfobot or your group
              </p>
            </div>

            {/* Backup Topic ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Backup Topic ID
              </label>
              <input
                type="text"
                value={telegramSettings.backupTopicId || ''}
                onChange={(e) =>
                  setTelegramSettings({ ...telegramSettings, backupTopicId: e.target.value })
                }
                placeholder="123"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Topic ID for backup messages (right-click topic → Copy Link → extract ID)
              </p>
            </div>

            {/* Health Topic ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Health Topic ID (Optional)
              </label>
              <input
                type="text"
                value={telegramSettings.healthTopicId || ''}
                onChange={(e) =>
                  setTelegramSettings({ ...telegramSettings, healthTopicId: e.target.value })
                }
                placeholder="456"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Topic ID for health check reports
              </p>
            </div>

            {/* Schedule */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Schedule
                </label>
                <select
                  value={telegramSettings.schedule || 'daily'}
                  onChange={(e) =>
                    setTelegramSettings({ ...telegramSettings, schedule: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  disabled={!canEdit}
                >
                  <option value="daily">{t('settings.dailyOption')}</option>
                  <option value="12h">{t('settings.every12Hours')}</option>
                  <option value="6h">{t('settings.every6Hours')}</option>
                  <option value="weekly">{t('settings.weeklySunday')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Time (WIB)
                </label>
                <input
                  type="time"
                  value={telegramSettings.scheduleTime || '00:00'}
                  onChange={(e) =>
                    setTelegramSettings({ ...telegramSettings, scheduleTime: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Keep Last N */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Keep Last Backups
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={telegramSettings.keepLastN || 7}
                onChange={(e) =>
                  setTelegramSettings({ ...telegramSettings, keepLastN: parseInt(e.target.value) || 7 })
                }
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Automatically delete old backups, keep only last N files
              </p>
            </div>

            {/* Action Buttons */}
            {canEdit && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <button
                  onClick={handleTestTelegram}
                  disabled={testing || testingBackup}
                  className="px-4 py-2 border border-primary text-primary dark:text-violet-200 hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </button>
                <button
                  onClick={handleTestBackup}
                  disabled={testing || testingBackup}
                  className="px-4 py-2 border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {testingBackup ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Test Auto Backup
                    </>
                  )}
                </button>
                <button
                  onClick={handleSaveTelegramSettings}
                  disabled={testing || testingBackup}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white rounded-lg transition"
                >
                  Save Settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-lg p-4">
          <h4 className="font-medium text-foreground dark:text-violet-200 mb-2">
            📘 How to Setup Telegram Backup
          </h4>
          <ol className="text-sm text-foreground dark:text-violet-100 space-y-1 list-decimal list-inside">
            <li>Create a bot via @BotFather on Telegram and get the Bot Token</li>
            <li>Create a group, add your bot as admin</li>
            <li>Enable Topics in group settings</li>
            <li>Create topics: &quot;Backup&quot; and &quot;Health&quot;</li>
            <li>Get Chat ID from @getidsbot in your group</li>
            <li>Right-click each topic → Copy Link → extract topic ID from URL</li>
            <li>Enter all credentials above and click &quot;Save Settings&quot;</li>
            <li>Click &quot;Test Connection&quot; to verify bot can send messages</li>
            <li>Click &quot;Test Auto Backup&quot; to send an actual backup file to Telegram</li>
            <li>Enable auto-backup and save settings</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
