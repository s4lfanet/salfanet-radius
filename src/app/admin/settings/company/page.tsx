'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Building2, Mail, Phone, MapPin, Globe, Save, Loader2, RotateCcw, Zap, Upload, ImageIcon, X as XIcon } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useAppStore } from '@/lib/store';
import { setCurrentTimezone } from '@/lib/timezone';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface CompanySettings {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  baseUrl: string;
  timezone: string;
  bankAccounts: BankAccount[];
  poweredBy: string;
  footerAdmin: string;
  footerCustomer: string;
  footerTechnician: string;
  invoiceGenerateDays: number;
  logo?: string;
}

export default function CompanySettingsPage() {
  const { t } = useTranslation();
  const { setCompany } = useAppStore();
  const { addToast } = useToast();
  const [settings, setSettings] = useState<CompanySettings>({
    name: '',
    email: '',
    phone: '',
    address: '',
    baseUrl: '',
    timezone: 'Asia/Jakarta',
    bankAccounts: [],
    poweredBy: 'SALFANET RADIUS',
    footerAdmin: 'Powered by SALFANET RADIUS',
    footerCustomer: 'Powered by SALFANET RADIUS',
    footerTechnician: 'Powered by SALFANET RADIUS',
    invoiceGenerateDays: 7,
    logo: '',
  });
  const [initialTimezone, setInitialTimezone] = useState('Asia/Jakarta');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/company');
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setSettings({
            id: data.id || '',
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            baseUrl: data.baseUrl || '',
            timezone: data.timezone || 'Asia/Jakarta',
            bankAccounts: data.bankAccounts || [],
            poweredBy: data.poweredBy || 'SALFANET RADIUS',
            footerAdmin: data.footerAdmin || 'Powered by SALFANET RADIUS',
            footerCustomer: data.footerCustomer || 'Powered by SALFANET RADIUS',
            footerTechnician: data.footerTechnician || 'Powered by SALFANET RADIUS',
            invoiceGenerateDays: data.invoiceGenerateDays || 7,
            logo: data.logo || '',
          });
          setInitialTimezone(data.timezone || 'Asia/Jakarta');
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload/logo', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setSettings(prev => ({ ...prev, logo: data.url }));
        setCompany({ logo: data.url });
        addToast({ type: 'success', title: 'Logo uploaded', description: 'Logo akan tampil setelah simpan.', duration: 3000 });
      } else {
        addToast({ type: 'error', title: 'Upload gagal', description: data.error || 'Gagal upload logo.', duration: 4000 });
      }
    } catch {
      addToast({ type: 'error', title: 'Upload gagal', description: 'Terjadi kesalahan saat upload.', duration: 4000 });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  // Check if timezone has changed
  const timezoneChanged = settings.timezone !== initialTimezone;

  // Handle restart services
  const handleRestartServices = async () => {
    setRestarting(true);
    try {
      const restartResponse = await fetch('/api/settings/restart-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: 'all', delay: 2000 })
      });

      const restartResult = await restartResponse.json();

      if (restartResult.success) {
        if (restartResult.autoRestarted) {
          addToast({ type: 'success', title: t('settings.servicesRestarting') || 'Services Restarting', description: t('settings.pageWillReload') || 'Page will reload in 5 seconds...', duration: 5000 });
          setTimeout(() => { window.location.reload(); }, 5000);
        } else {
          addToast({ type: 'success', title: 'Timezone Updated! ✅', description: t('settings.timezoneApplied') || 'Timezone applied. Page will reload.', duration: 4000 });
          setTimeout(() => { window.location.reload(); }, 4000);
        }
      } else {
        addToast({
          type: 'warning',
          title: 'Auto Restart Not Available',
          description: `${restartResult.message || ''} ${t('settings.restartManually') || 'Please restart manually: pm2 restart all'}`,
          duration: 8000
        });
      }
    } catch (error) {
      console.error('Restart error:', error);
      addToast({
        type: 'error',
        title: 'Restart Failed',
        description: t('settings.autoRestartFailed') || 'Auto restart failed. Please restart manually.',
        duration: 8000
      });
    } finally {
      setRestarting(false);
    }
  };

  // Handle save and restart
  const handleSaveAndRestart = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setCompany({
          name: settings.name,
          email: settings.email,
          phone: settings.phone,
          address: settings.address,
          baseUrl: settings.baseUrl,
          timezone: settings.timezone,
          poweredBy: settings.poweredBy,
          logo: settings.logo,
        });
        setCurrentTimezone(settings.timezone);
        setInitialTimezone(settings.timezone);

        setSaving(false);
        await handleRestartServices();
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      setSaving(false);
      addToast({ type: 'error', title: t('common.error'), description: t('settings.saveSettingsFailed') });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        // Update global store with new settings (including timezone)
        setCompany({
          name: settings.name,
          email: settings.email,
          phone: settings.phone,
          address: settings.address,
          baseUrl: settings.baseUrl,
          timezone: settings.timezone,
          poweredBy: settings.poweredBy,
          logo: settings.logo,
        });

        // Update timezone library
        setCurrentTimezone(settings.timezone);
        setInitialTimezone(settings.timezone);

        addToast({ type: 'success', title: t('common.success'), description: t('settings.companySaved'), duration: 2000 });
      } else {
        throw new Error(t('common.saveFailed'));
      }
    } catch (error) {
      addToast({ type: 'error', title: t('common.error'), description: t('settings.saveSettingsFailed') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="space-y-3">
          {/* Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Building2 className="w-6 h-6 text-[#00f7ff]" />
              <span>{t('settings.companySettings')}</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('settings.manageCompanyInfo')}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-3">
            <div className="space-y-3">
              {/* Logo Perusahaan */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  <ImageIcon className="w-3 h-3" />
                  Logo Perusahaan
                </label>
                <div className="flex items-center gap-3">
                  {settings.logo ? (
                    <div className="relative group">
                      <img
                        src={settings.logo}
                        alt="Logo"
                        className="w-14 h-14 object-contain rounded-lg border border-border bg-card p-1"
                      />
                      <button
                        type="button"
                        onClick={() => { setSettings(prev => ({ ...prev, logo: '' })); setCompany({ logo: '' }); }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-lg border-2 border-dashed border-border bg-card flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                      />
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg bg-card hover:bg-accent transition-colors cursor-pointer">
                        {uploadingLogo ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload className="w-3 h-3" /> Upload Logo</>
                        )}
                      </div>
                    </label>
                    <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG, SVG, WebP · Maks 2MB</p>
                  </div>
                </div>
              </div>

              {/* Nama Perusahaan */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  <Building2 className="w-3 h-3" />
                  {t('settings.companyName')}
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  placeholder="Nama perusahaan Anda"
                  required
                />
              </div>

              {/* Email & Phone - 2 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                    <Mail className="w-3 h-3" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                    placeholder="email@perusahaan.com"
                    required
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                    <Phone className="w-3 h-3" />
                    {t('settings.phone')}
                  </label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                    placeholder="08xxxxxxxxxx"
                    required
                  />
                </div>
              </div>

              {/* Alamat */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  <MapPin className="w-3 h-3" />
                  {t('settings.address')}
                </label>
                <textarea
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  rows={2}
                  placeholder="Alamat lengkap perusahaan"
                  required
                />
              </div>

              {/* Base URL */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  <Globe className="w-3 h-3" />
                  Base URL
                </label>
                <input
                  type="url"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  placeholder="https://billing.domain.com"
                  required
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{t('settings.baseUrlHelp')}</p>
              </div>

              {/* Invoice Generate Days */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  📅 {t('settings.invoiceGenerateDays')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={settings.invoiceGenerateDays}
                  onChange={(e) => setSettings({ ...settings, invoiceGenerateDays: parseInt(e.target.value) || 7 })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  placeholder="7"
                  required
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{t('settings.invoiceGenerateDaysHelp')}</p>
              </div>

              {/* Powered By */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  <Zap className="w-3 h-3" />
                  {t('settings.poweredBy')}
                </label>
                <input
                  type="text"
                  value={settings.poweredBy}
                  onChange={(e) => setSettings({ ...settings, poweredBy: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  placeholder="SALFANET RADIUS"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{t('settings.poweredByHelp')}</p>
              </div>

              {/* Footer Settings Section */}
              <div className="col-span-2 border-t border-border pt-4 mt-2">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  Pengaturan Footer
                </h3>
                <p className="text-[10px] text-muted-foreground mb-4">
                  Atur teks footer yang ditampilkan di halaman login untuk setiap portal
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Admin Footer */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                      🔒 Footer Admin
                    </label>
                    <input
                      type="text"
                      value={settings.footerAdmin}
                      onChange={(e) => setSettings({ ...settings, footerAdmin: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                      placeholder="Powered by SALFANET RADIUS"
                    />
                  </div>

                  {/* Customer Footer */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                      👤 Footer Customer
                    </label>
                    <input
                      type="text"
                      value={settings.footerCustomer}
                      onChange={(e) => setSettings({ ...settings, footerCustomer: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                      placeholder="Powered by SALFANET RADIUS"
                    />
                  </div>

                  {/* Technician Footer */}
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                      🔧 Footer Teknisi
                    </label>
                    <input
                      type="text"
                      value={settings.footerTechnician}
                      onChange={(e) => setSettings({ ...settings, footerTechnician: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                      placeholder="Powered by SALFANET RADIUS"
                    />
                  </div>
                </div>
              </div>

              {/* Timezone */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground mb-1">
                  🌍 Timezone
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                  required
                >
                  <optgroup label="Indonesia">
                    <option value="Asia/Jakarta">WIB - Jakarta, Sumatera, Jawa, Kalimantan Barat/Tengah (UTC+7)</option>
                    <option value="Asia/Makassar">WITA - Bali, NTB, NTT, Sulawesi, Kalimantan Selatan/Timur (UTC+8)</option>
                    <option value="Asia/Jayapura">WIT - Maluku, Papua (UTC+9)</option>
                  </optgroup>
                  <optgroup label="Asia Tenggara">
                    <option value="Asia/Singapore">Singapore (SGT - UTC+8)</option>
                    <option value="Asia/Kuala_Lumpur">Malaysia (MYT - UTC+8)</option>
                    <option value="Asia/Bangkok">Thailand (ICT - UTC+7)</option>
                    <option value="Asia/Manila">Philippines (PHT - UTC+8)</option>
                    <option value="Asia/Ho_Chi_Minh">Vietnam (ICT - UTC+7)</option>
                  </optgroup>
                  <optgroup label="Asia Lainnya">
                    <option value="Asia/Dubai">UAE (GST - UTC+4)</option>
                    <option value="Asia/Riyadh">Saudi Arabia (AST - UTC+3)</option>
                    <option value="Asia/Tokyo">Japan (JST - UTC+9)</option>
                    <option value="Asia/Seoul">South Korea (KST - UTC+9)</option>
                    <option value="Asia/Hong_Kong">Hong Kong (HKT - UTC+8)</option>
                  </optgroup>
                  <optgroup label="Australia & Pacific">
                    <option value="Australia/Sydney">Australia Sydney (AEDT - UTC+11)</option>
                    <option value="Australia/Melbourne">Australia Melbourne (AEDT - UTC+11)</option>
                    <option value="Pacific/Auckland">New Zealand (NZDT - UTC+13)</option>
                  </optgroup>
                </select>
                <div className="mt-1.5 p-2 bg-warning/10 border border-warning/30 rounded-lg">
                  <p className="text-[10px] text-warning">
                    ⚠️ <strong>{t('settings.timezoneWarningTitle')}</strong> {t('settings.timezoneWarning1')}
                  </p>
                  <ul className="mt-1 ml-4 text-[10px] text-warning/80 list-disc space-y-0.5">
                    <li>{t('settings.timezoneWarning1')}</li>
                    <li>{t('settings.timezoneWarning2')}</li>
                    <li>{t('settings.timezoneWarning3')}</li>
                    <li>{t('settings.timezoneWarning4')}</li>
                    <li>{t('settings.timezoneWarning5')}</li>
                  </ul>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={saving || restarting}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('settings.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3" />
                      {t('settings.saveSettings')}
                    </>
                  )}
                </button>

                {/* Save & Restart Button - only show when timezone changed */}
                {timezoneChanged && (
                  <button
                    type="button"
                    onClick={handleSaveAndRestart}
                    disabled={saving || restarting}
                    className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {restarting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('settings.restarting')}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3" />
                        {t('settings.saveAndRestart')}
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Timezone change indicator */}
              {timezoneChanged && (
                <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded-lg">
                  <p className="text-[10px] text-warning">
                    🔄 {t('settings.timezoneChangedNote')}
                  </p>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
