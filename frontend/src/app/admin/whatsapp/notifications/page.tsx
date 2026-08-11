'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError } from '@/lib/sweetalert';

interface ReminderSettings {
  id: string;
  enabled: boolean;
  reminderDays: number[];
  reminderTime: string;
  otpEnabled: boolean;
  otpExpiry: number;
  batchSize: number;
  batchDelay: number;
  randomize: boolean;
  updatedAt: string;
}

export default function NotificationSettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState<number[]>([-7, -5, -3, 0]);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [otpExpiry, setOtpExpiry] = useState(5);
  const [batchSize, setBatchSize] = useState(10);
  const [batchDelay, setBatchDelay] = useState(60);
  const [randomize, setRandomize] = useState(true);
  const [newDay, setNewDay] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/whatsapp/reminder-settings');
      const data = await res.json();
      
      if (data.success && data.settings) {
        setSettings(data.settings);
        setEnabled(data.settings.enabled);
        setReminderDays(data.settings.reminderDays);
        setReminderTime(data.settings.reminderTime);
        setOtpEnabled(data.settings.otpEnabled ?? true);
        setOtpExpiry(data.settings.otpExpiry ?? 5);
        setBatchSize(data.settings.batchSize ?? 10);
        setBatchDelay(data.settings.batchDelay ?? 60);
        setRandomize(data.settings.randomize ?? true);
      }
    } catch (error) {
      console.error('Load settings error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addReminderDay = () => {
    const day = parseInt(newDay);
    if (isNaN(day)) {
      showError(t('whatsapp.enterValidNumber'));
      return;
    }
    if (day > 0) {
      showError(t('whatsapp.valueMustBeZeroOrNegative'));
      return;
    }
    if (reminderDays.includes(day)) {
      showError(t('whatsapp.dayAlreadyInList'));
      return;
    }
    
    const newDays = [...reminderDays, day].sort((a, b) => a - b);
    setReminderDays(newDays);
    setNewDay('');
  };

  const removeReminderDay = (day: number) => {
    setReminderDays(reminderDays.filter(d => d !== day));
  };

  const handleSave = async () => {
    if (reminderDays.length === 0) {
      await showError(t('whatsapp.minOneReminderDay'));
      return;
    }

    if (otpExpiry < 1 || otpExpiry > 60) {
      await showError(t('whatsapp.otpExpiryRange'));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/reminder-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          reminderDays,
          reminderTime,
          otpEnabled,
          otpExpiry,
          batchSize,
          batchDelay,
          randomize
        })
      });

      const data = await res.json();

      if (data.success) {
        await showSuccess(t('whatsapp.settingsSavedSuccess'));
        loadSettings();
      } else {
        await showError(t('whatsapp.failedSaveSettings') + ': ' + data.error);
      }
    } catch (error) {
      console.error('Save error:', error);
      await showError(t('whatsapp.failedSaveSettings'));
    } finally {
      setSaving(false);
    }
  };

  const formatDayLabel = (day: number) => {
    if (day === 0) return t('whatsapp.hDayLabel');
    return `H${day} (${t('whatsapp.hMinusDaysLabel').replace('{days}', String(Math.abs(day)))})`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="w-12 h-12 border-4 border-brand-500 dark:border-[#00f7ff] border-t-transparent rounded-full animate-spin dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
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
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('whatsapp.notificationsTitle')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('whatsapp.notificationsSubtitle')}</p>
        </div>

        {/* Invoice Reminder Card */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.invoiceReminder')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.invoiceReminderDesc')}</p>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-3">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-foreground">{t('whatsapp.enableAutoReminder')}</p>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.enableAutoReminderDesc')}</p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-teal-600' : 'bg-muted/80'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-card rounded-full shadow transition-transform ${enabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Reminder Time */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('whatsapp.sendTime')}
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-40 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
              />
              <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">{t('whatsapp.sendTimeNote')}</p>
            </div>

            {/* Reminder Days */}
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('whatsapp.reminderSchedule')}
              </label>
              <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mb-2">
                {t('whatsapp.reminderScheduleDesc')}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {reminderDays.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground italic">{t('whatsapp.noSchedule')}</span>
                ) : (
                  reminderDays.map((day) => (
                    <span
                      key={day}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-muted text-foreground border border-border rounded"
                    >
                      {formatDayLabel(day)}
                      <button
                        onClick={() => removeReminderDay(day)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="-7"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addReminderDay()}
                  className="w-24 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                />
                <button
                  onClick={addReminderDay}
                  className="h-8 px-3 text-xs font-medium text-foreground bg-card border border-border rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('whatsapp.addSchedule')}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground dark:text-muted-foreground mt-1">
                {t('whatsapp.exampleSchedule')}
              </p>
            </div>
          </div>
        </div>

        {/* OTP Settings Card */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.otpLogin')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.otpLoginDesc')}</p>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-3">
            {/* OTP Enable Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-foreground">{t('whatsapp.enableOtp')}</p>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.enableOtpDesc')}</p>
              </div>
              <button
                onClick={() => setOtpEnabled(!otpEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${otpEnabled ? 'bg-teal-600' : 'bg-muted/80'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-card rounded-full shadow transition-transform ${otpEnabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* OTP Expiry */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('whatsapp.otpExpiry')}
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={otpExpiry}
                onChange={(e) => setOtpExpiry(parseInt(e.target.value))}
                className="w-24 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
              />
              <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">
                {t('whatsapp.otpExpiryNote')} {otpExpiry} {t('whatsapp.minutes')}
              </p>
            </div>

            {/* OTP Warning */}
            {!otpEnabled && (
              <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      OTP Login Dinonaktifkan
                    </p>
                    <p className="text-[10px] text-yellow-700 dark:text-yellow-300 leading-relaxed">
                      Customer dapat login langsung tanpa kode OTP. Sistem akan membuat session otomatis setelah validasi nomor telepon. 
                      Fitur ini berguna jika layanan WhatsApp sedang bermasalah atau untuk mempercepat akses customer.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Batch Sending Settings Card */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.batchSendingSettings')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.batchSendingDesc')}</p>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-3">
            {/* Batch Size */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Jumlah Pesan Per Batch
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
                className="w-24 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
              />
              <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">
                Kirim {batchSize} pesan sekaligus, lalu jeda sebelum batch berikutnya
              </p>
            </div>

            {/* Batch Delay */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Jeda Antar Batch (Detik)
              </label>
              <input
                type="number"
                min="10"
                max="300"
                value={batchDelay}
                onChange={(e) => setBatchDelay(parseInt(e.target.value) || 60)}
                className="w-24 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
              />
              <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">
                Tunggu {batchDelay} detik sebelum mengirim batch berikutnya
              </p>
            </div>

            {/* Randomize Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-foreground">{t('whatsapp.randomOrder')}</p>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.randomOrderDesc')}</p>
              </div>
              <button
                onClick={() => setRandomize(!randomize)}
                className={`relative w-10 h-5 rounded-full transition-colors ${randomize ? 'bg-teal-600' : 'bg-muted/80'}`}
              >
                <span className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-card rounded-full shadow transition-transform ${randomize ? 'translate-x-[20px]' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Info Box */}
            <div className="p-2.5 bg-primary/10 border border-primary/30 rounded-lg">
              <p className="text-[10px] text-blue-800 dark:text-blue-200 leading-relaxed">
                💡 <strong>Tips:</strong> Untuk menghindari banned WhatsApp, gunakan batch size 10-20 pesan dengan jeda 60-120 detik. 
                Aktifkan pengacakan urutan untuk menghindari deteksi pattern otomatis.
              </p>
            </div>

            {/* Example Calculation */}
            {batchSize > 0 && batchDelay > 0 && (
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-foreground">
                  📊 <strong>Estimasi:</strong> Untuk 100 reminder, akan dikirim dalam {Math.ceil(100 / batchSize)} batch, 
                  total waktu ~{Math.ceil((100 / batchSize) * batchDelay / 60)} menit
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('whatsapp.saving')}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {t('whatsapp.saveSettings')}
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
