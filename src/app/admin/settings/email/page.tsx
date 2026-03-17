'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import {
  Mail,
  Save,
  Loader2,
  TestTube,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Info,
  Book,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Settings as SettingsIcon,
  Clock,
  Calendar,
  X
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { showSuccess, showError } from '@/lib/sweetalert';

interface EmailSettings {
  id?: string;
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  notifyNewUser: boolean;
  notifyExpired: boolean;
  notifyInvoice: boolean;
  notifyPayment: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
  htmlBody: string;
  isActive: boolean;
}

const templateConfig = {
  'registration-confirmation': {
    title: '✅ Konfirmasi Pendaftaran',
    description: 'Dikirim otomatis saat customer submit form pendaftaran',
    variables: ['{{customerName}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'registration-approval': {
    title: '🎉 Persetujuan Pendaftaran',
    description: 'Dikirim saat admin menyetujui pendaftaran customer baru',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{password}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{ipAddress}}', '{{expiredAt}}', '{{installationFee}}', '{{subscriptionType}}', '{{invoiceNumber}}', '{{paymentLink}}', '{{paymentToken}}', '{{baseUrl}}', '{{bankAccounts}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'admin-create-user': {
    title: '👤 Admin Create User',
    description: 'Dikirim saat admin membuat user manual (tanpa flow registrasi)',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{password}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{area}}', '{{ipAddress}}', '{{expiredAt}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'installation-invoice': {
    title: '🔧 Invoice Instalasi',
    description: 'Dikirim saat instalasi selesai dan invoice dibuat',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{installationFee}}', '{{paymentLink}}', '{{paymentToken}}', '{{baseUrl}}', '{{bankAccounts}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'invoice-reminder': {
    title: '📅 Invoice Bulanan / Jatuh Tempo',
    description: 'Dikirim via cron untuk invoice bulanan yang mendekati jatuh tempo',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{customerUsername}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{area}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{daysRemaining}}', '{{paymentLink}}', '{{paymentToken}}', '{{baseUrl}}', '{{bankAccounts}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'payment-success': {
    title: '✅ Pembayaran Berhasil',
    description: 'Dikirim otomatis saat pembayaran invoice berhasil',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{password}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{ipAddress}}', '{{expiredAt}}', '{{invoiceNumber}}', '{{amount}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'maintenance-outage': {
    title: '⚠️ Informasi Gangguan',
    description: 'Template untuk broadcast informasi maintenance atau gangguan jaringan',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{issueType}}', '{{description}}', '{{estimatedTime}}', '{{affectedArea}}', '{{status}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{baseUrl}}'],
  },
  'maintenance-resolved': {
    title: '✅ Perbaikan Selesai',
    description: 'Template untuk broadcast informasi perbaikan selesai dan layanan kembali normal',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{description}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{baseUrl}}'],
  },
  'voucher-purchase': {
    title: '🎫 Pembelian Voucher',
    description: 'Dikirim otomatis saat customer berhasil membeli voucher internet',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{voucherCodes}}', '{{profileName}}', '{{price}}', '{{quantity}}', '{{totalAmount}}', '{{purchaseDate}}', '{{expiryDate}}', '{{duration}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'voucher-payment-link': {
    title: '💳 Link Pembayaran Voucher',
    description: 'Dikirim saat customer melakukan order voucher dan perlu melakukan pembayaran',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{orderToken}}', '{{profileName}}', '{{price}}', '{{quantity}}', '{{totalAmount}}', '{{paymentLink}}', '{{expiryTime}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'manual-extension': {
    title: '🎉 Perpanjangan Manual',
    description: 'Dikirim saat admin melakukan perpanjangan langganan customer secara manual',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{profileName}}', '{{area}}', '{{amount}}', '{{newExpiredAt}}', '{{invoiceNumber}}', '{{profileChanged}}', '{{companyName}}', '{{companyPhone}}'],
  },
  'manual-payment-approval': {
    title: '✅ Pembayaran Manual Disetujui',
    description: 'Dikirim otomatis saat admin menyetujui konfirmasi pembayaran manual',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{profileName}}', '{{area}}', '{{expiredDate}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'manual-payment-rejection': {
    title: '❌ Pembayaran Manual Ditolak',
    description: 'Dikirim otomatis saat admin menolak konfirmasi pembayaran manual',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{profileName}}', '{{area}}', '{{rejectionReason}}', '{{paymentLink}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'account-info': {
    title: '📋 Informasi Akun Pelanggan',
    description: 'Mengirimkan informasi akun pelanggan seperti username, password, dan detail lainnya',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{password}}', '{{phone}}', '{{email}}', '{{address}}', '{{profileName}}', '{{area}}', '{{ipAddress}}', '{{expiredAt}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'auto-renewal-success': {
    title: '🔄 Auto-Renewal Berhasil',
    description: 'Dikirim otomatis saat sistem berhasil melakukan auto-renewal langganan',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{profileName}}', '{{area}}', '{{amount}}', '{{newExpiredAt}}', '{{invoiceNumber}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'general-broadcast': {
    title: '📢 Broadcast Umum ke Pelanggan',
    description: 'Template untuk broadcast pengumuman atau informasi umum ke pelanggan',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{message}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'invoice-created': {
    title: '🔄 Notifikasi Invoice Baru',
    description: 'Dikirim saat invoice baru dibuat oleh sistem',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{address}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{paymentLink}}', '{{paymentToken}}', '{{baseUrl}}', '{{bankAccounts}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
  'invoice-overdue': {
    title: '⚠️ Invoice Overdue Reminder',
    description: 'Dikirim saat invoice sudah melewati tanggal jatuh tempo',
    variables: ['{{customerId}}', '{{customerName}}', '{{username}}', '{{phone}}', '{{email}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{overdueDays}}', '{{paymentLink}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'maintenance-info': {
    title: '🔧 Pemberitahuan Maintenance',
    description: 'Template untuk broadcast informasi maintenance terjadwal',
    variables: ['{{customerName}}', '{{maintenanceDate}}', '{{maintenanceTime}}', '{{duration}}', '{{affectedArea}}', '{{description}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'manual_payment_admin': {
    title: '🔔 Notifikasi Admin Manual Payment',
    description: 'Dikirim ke admin saat ada konfirmasi pembayaran manual dari customer',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{paymentDate}}', '{{paymentMethod}}', '{{bankName}}', '{{accountNumber}}', '{{proofImage}}'],
  },
  'outage_notification': {
    title: '⚡ Notifikasi Gangguan',
    description: 'Dikirim otomatis saat terdeteksi gangguan jaringan atau layanan',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{outageType}}', '{{affectedArea}}', '{{description}}', '{{estimatedTime}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'payment_receipt': {
    title: '🧾 Bukti Pembayaran',
    description: 'Dikirim sebagai bukti pembayaran yang telah diterima',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{paymentDate}}', '{{paymentMethod}}', '{{receiptNumber}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'payment-confirmed': {
    title: '✅ Konfirmasi Pembayaran Diterima',
    description: 'Dikirim saat pembayaran telah dikonfirmasi dan diterima',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{paymentDate}}', '{{newExpiredAt}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'payment-reminder-general': {
    title: '💰 Pengingat Pembayaran Umum',
    description: 'Template umum untuk mengingatkan pembayaran yang akan jatuh tempo',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{daysRemaining}}', '{{paymentLink}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'payment-warning': {
    title: '⚠️ Peringatan Pembayaran Tertunda',
    description: 'Dikirim sebagai peringatan untuk pembayaran yang tertunda',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}', '{{paymentLink}}', '{{suspensionDate}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'promo-offer': {
    title: '🎁 Promo & Penawaran Khusus',
    description: 'Template untuk broadcast promo atau penawaran khusus kepada pelanggan',
    variables: ['{{customerName}}', '{{promoTitle}}', '{{promoDescription}}', '{{discount}}', '{{validUntil}}', '{{termsConditions}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'thank-you': {
    title: '🙏 Ucapan Terima Kasih',
    description: 'Template ucapan terima kasih kepada pelanggan',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{message}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'upgrade-notification': {
    title: '⬆️ Pemberitahuan Upgrade Paket',
    description: 'Dikirim saat customer melakukan upgrade paket langganan',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{oldProfile}}', '{{newProfile}}', '{{newSpeed}}', '{{newPrice}}', '{{effectiveDate}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'voucher-purchase-success': {
    title: '🎉 Pembelian Voucher Berhasil',
    description: 'Dikirim saat customer berhasil membeli voucher internet',
    variables: ['{{customerName}}', '{{voucherCodes}}', '{{profileName}}', '{{price}}', '{{quantity}}', '{{totalAmount}}', '{{purchaseDate}}', '{{expiryDate}}', '{{duration}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'welcome-message': {
    title: '👋 Selamat Datang Pelanggan Baru',
    description: 'Pesan selamat datang untuk pelanggan baru yang baru bergabung',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{profileName}}', '{{expiredAt}}', '{{supportContact}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
};

const templateTypes = Object.keys(templateConfig) as (keyof typeof templateConfig)[];

export default function EmailSettingsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'settings' | 'templates' | 'reminders' | 'history'>('settings');

  const [settings, setSettings] = useState<EmailSettings>({
    enabled: false,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: 'RADIUS Notification',
    notifyNewUser: true,
    notifyExpired: true,
    notifyInvoice: true,
    notifyPayment: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [testEmail, setTestEmail] = useState('');

  // Templates state
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [activeTemplateTab, setActiveTemplateTab] = useState<keyof typeof templateConfig>('registration-approval');
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');

  useEffect(() => {
    const initializeData = async () => {
      await fetchSettings();
    };
    initializeData();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/email', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        // Only fetch templates after settings loaded successfully
        await fetchTemplates();
      } else if (response.status === 401) {
        // Don't redirect if already on login page
        if (!window.location.pathname.includes('/login')) {
          console.error('Unauthorized - session expired');
          window.location.href = '/admin/login';
        }
        return;
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/settings/email/templates', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 401) {
        if (!window.location.pathname.includes('/login')) {
          console.error('Unauthorized - session expired');
          window.location.href = '/admin/login';
        }
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const templatesMap: Record<string, EmailTemplate> = {};
          data.data.forEach((t: EmailTemplate) => {
            templatesMap[t.type] = t;
          });
          setTemplates(templatesMap);
        }
      }
    } catch (error) {
      console.error('Fetch templates error:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (response.ok) {
        addToast({ type: 'success', title: t('emailSettings.messages.saved'), description: t('emailSettings.messages.savedDesc') });
        fetchSettings();
      } else {
        // Handle unauthorized error - redirect to login
        if (response.status === 401) {
          addToast({ type: 'warning', title: t('emailSettings.messages.sessionExpired'), description: t('emailSettings.messages.sessionExpiredDesc') });
          window.location.href = '/admin/login';
          return;
        }

        addToast({ type: 'error', title: t('emailSettings.test.failed'), description: data.error || t('emailSettings.messages.saveFailed') });
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Error!', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      addToast({ type: 'warning', title: t('emailSettings.test.title'), description: t('emailSettings.test.emailRequired') });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch('/api/settings/email/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await response.json();

      if (data.success) {
        addToast({ type: 'success', title: t('emailSettings.test.success'), description: t('emailSettings.test.successDesc').replace('{email}', testEmail) });
      } else {
        addToast({ type: 'error', title: t('emailSettings.test.failed'), description: data.error });
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Error!', description: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleUpdateTemplate = async (type: string, subject: string, htmlBody: string) => {
    const template = templates[type];
    if (!template) return;

    setSavingTemplate(type);
    try {
      const res = await fetch(`/api/settings/email/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlBody }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess('Template updated successfully!');
        fetchTemplates();
      } else {
        showError(data.error || t('settings.failedUpdateTemplate'));
      }
    } catch (error) {
      console.error('Update template error:', error);
      showError(t('settings.failedUpdateTemplate'));
    } finally {
      setSavingTemplate(null);
    }
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
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
            <Mail className="w-6 h-6 text-[#00f7ff] inline mr-2" />
            {t('emailSettings.title')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('emailSettings.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex flex-wrap gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'settings'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              <SettingsIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
              {t('emailSettings.tabs.settings')}
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'templates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
              {t('emailSettings.tabs.templates')}
            </button>
            <button
              onClick={() => setActiveTab('reminders')}
              className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'reminders'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
              {t('emailSettings.tabs.reminders')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-2 px-2 sm:px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1" />
              {t('emailSettings.tabs.history')}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'settings' ? (
          <>
            {/* Tutorial Section */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-primary/30">
              <button
                onClick={() => setShowTutorial(!showTutorial)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <Book className="w-4 h-4 text-primary dark:text-primary" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {t('emailSettings.tutorial.title')}
                  </span>
                </div>
                {showTutorial ? (
                  <ChevronUp className="w-4 h-4 text-primary dark:text-primary" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-primary dark:text-primary" />
                )}
              </button>

              {showTutorial && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="bg-card rounded-lg p-4 space-y-3">
                    <h3 className="font-medium text-sm text-foreground">
                      {t('emailSettings.tutorial.subtitle')}
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 dark:bg-blue-900 text-primary dark:text-primary flex items-center justify-center font-bold">
                          1
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">
                            {t('emailSettings.tutorial.step1Title')}
                          </p>
                          <p className="text-muted-foreground">
                            Buka <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                              Google Account Security <ExternalLink className="w-3 h-3" />
                            </a> → Pilih "2-Step Verification" → Aktifkan
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 dark:bg-blue-900 text-primary dark:text-primary flex items-center justify-center font-bold">
                          2
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">
                            {t('emailSettings.tutorial.step2Title')}
                          </p>
                          <p className="text-muted-foreground mb-2">
                            Di halaman Security, pilih <strong>"App passwords"</strong>
                          </p>
                          <div className="bg-background p-2 rounded border border-border">
                            <p className="text-foreground mb-1">• App name: <code className="bg-gray-200 dark:bg-inputpx-1 rounded">RADIUS System</code></p>
                            <p className="text-foreground">• Device: <code className="bg-gray-200 dark:bg-inputpx-1 rounded">Web Server</code></p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 dark:bg-blue-900 text-primary dark:text-primary flex items-center justify-center font-bold">
                          3
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">
                            {t('emailSettings.tutorial.step3Title')}
                          </p>
                          <p className="text-muted-foreground">
                            Copy password yang dihasilkan (16 karakter) dan paste di field <strong>SMTP Password</strong> di bawah
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 dark:bg-blue-900 text-primary dark:text-primary flex items-center justify-center font-bold">
                          4
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-foreground mb-1">
                            {t('emailSettings.tutorial.step4Title')}
                          </p>
                          <p className="text-muted-foreground">
                            Lengkapi form di bawah, aktifkan "Enable Email Notifications", lalu klik "Test Email" untuk verifikasi
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-warning/10 border border-warning/30 rounded p-3 mt-3">
                      <div className="flex gap-2">
                        <Info className="w-4 h-4 text-warning dark:text-warning flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-yellow-800 dark:text-yellow-200">
                          <p className="font-medium mb-1">⚠️ Catatan Penting:</p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>Gunakan App Password, bukan password Gmail biasa</li>
                            <li>Port 587 untuk TLS, Port 465 untuk SSL</li>
                            <li>Pastikan "Less secure app access" TIDAK perlu diaktifkan (menggunakan App Password)</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Main Form */}
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="space-y-4">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between pb-4 border-b dark:border-gray-800">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      {t('emailSettings.smtp.enableEmail')}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('emailSettings.smtp.enableEmailDesc')}
                    </p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.enabled ? 'bg-green-600' : 'bg-muted/80'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>

                {/* SMTP Configuration */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {t('emailSettings.smtp.title')}
                  </h3>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.host')} *</label>
                      <input
                        type="text"
                        value={settings.smtpHost}
                        onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                        placeholder="smtp.gmail.com"
                        className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.port')} *</label>
                      <input
                        type="number"
                        value={settings.smtpPort}
                        onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })}
                        placeholder="587"
                        className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="smtpSecure"
                      checked={settings.smtpSecure}
                      onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="smtpSecure" className="text-xs text-muted-foreground dark:text-muted-foreground">
                      {t('emailSettings.smtp.useSsl')}
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.username')} *</label>
                    <input
                      type="email"
                      value={settings.smtpUser}
                      onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                      placeholder="your-email@gmail.com"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.password')} *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={settings.smtpPassword}
                        onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                        placeholder="16-digit app password"
                        className="w-full px-3 py-2 pr-10 text-sm border dark:border-gray-700 rounded dark:bg-input font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('emailSettings.smtp.passwordHint')}
                    </p>
                  </div>
                </div>

                {/* Sender Information */}
                <div className="space-y-3 pt-4 border-t dark:border-gray-800">
                  <h3 className="text-sm font-medium text-foreground">
                    {t('emailSettings.sender.title')}
                  </h3>

                  <div>
                    <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.fromEmail')} *</label>
                    <input
                      type="email"
                      value={settings.fromEmail}
                      onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                      placeholder="noreply@yourdomain.com"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('emailSettings.smtp.fromEmailHint')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">{t('emailSettings.smtp.fromName')}</label>
                    <input
                      type="text"
                      value={settings.fromName}
                      onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                      placeholder="RADIUS Notification"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                    />
                  </div>
                </div>

                {/* Notification Types */}
                <div className="space-y-3 pt-4 border-t dark:border-gray-800">
                  <h3 className="text-sm font-medium text-foreground">
                    {t('emailSettings.notifications.title')}
                  </h3>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.notifyNewUser}
                        onChange={(e) => setSettings({ ...settings, notifyNewUser: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-foreground">
                        <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />
                        {t('emailSettings.notifications.newUser')}
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.notifyExpired}
                        onChange={(e) => setSettings({ ...settings, notifyExpired: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-foreground">
                        <XCircle className="w-3 h-3 inline mr-1 text-orange-600" />
                        {t('emailSettings.notifications.expired')}
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.notifyInvoice}
                        onChange={(e) => setSettings({ ...settings, notifyInvoice: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-foreground">
                        <Mail className="w-3 h-3 inline mr-1 text-primary" />
                        {t('emailSettings.notifications.invoice')}
                      </span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.notifyPayment}
                        onChange={(e) => setSettings({ ...settings, notifyPayment: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs text-foreground">
                        <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />
                        {t('emailSettings.notifications.payment')}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Test Email Section */}
                <div className="pt-4 border-t dark:border-gray-800">
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    {t('emailSettings.test.title')}
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder={t('emailSettings.test.placeholder')}
                      className="flex-1 px-3 py-2 text-sm border dark:border-gray-700 rounded dark:bg-input"
                    />
                    <button
                      onClick={handleTest}
                      disabled={testing || !settings.enabled}
                      className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground text-white rounded disabled:opacity-50 flex items-center gap-2"
                    >
                      {testing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('emailSettings.test.sending')}
                        </>
                      ) : (
                        <>
                          <TestTube className="w-4 h-4" />
                          {t('emailSettings.test.button')}
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('emailSettings.test.hint')}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-white rounded disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('emailSettings.buttons.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {t('emailSettings.buttons.save')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'templates' ? (
          <TemplatesTab
            templates={templates}
            loadingTemplates={loadingTemplates}
            savingTemplate={savingTemplate}
            activeTemplateTab={activeTemplateTab}
            setActiveTemplateTab={setActiveTemplateTab}
            handleUpdateTemplate={handleUpdateTemplate}
          />
        ) : activeTab === 'reminders' ? (
          <RemindersTab
            settings={settings}
            setSettings={setSettings}
            saving={saving}
            handleSave={handleSave}
          />
        ) : (
          <HistoryTab />
        )}
      </div>
    </div>
  );
}

// Templates Tab Component
function TemplatesTab({
  templates,
  loadingTemplates,
  savingTemplate,
  activeTemplateTab,
  setActiveTemplateTab,
  handleUpdateTemplate,
}: any) {
  const { t } = useTranslation();
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Map template type to translation key
  const getTemplateTitle = (type: string): string => {
    const titleMap: Record<string, string> = {
      'registration-confirmation': t('emailSettings.templates.registrationConfirmation'),
      'registration-approval': t('emailSettings.templates.registrationApproval'),
      'admin-create-user': t('emailSettings.templates.adminCreateUser'),
      'installation-invoice': t('emailSettings.templates.installationInvoice'),
      'invoice-reminder': t('emailSettings.templates.invoiceReminder'),
      'payment-success': t('emailSettings.templates.paymentSuccess'),
      'maintenance-outage': t('emailSettings.templates.maintenanceOutage'),
      'maintenance-resolved': t('emailSettings.templates.maintenanceResolved'),
      'voucher-purchase': t('emailSettings.templates.voucherPurchase'),
      'voucher-payment-link': t('emailSettings.templates.voucherPaymentLink'),
      'manual-extension': t('emailSettings.templates.manualExtension'),
      'manual-payment-approval': t('emailSettings.templates.manualPaymentApproval'),
      'manual-payment-rejection': t('emailSettings.templates.manualPaymentRejection'),
    };
    return titleMap[type] || templateConfig[type as keyof typeof templateConfig]?.title || type;
  };

  const getTemplateDesc = (type: string): string => {
    const descMap: Record<string, string> = {
      'registration-confirmation': t('emailSettings.templates.registrationConfirmationDesc'),
      'registration-approval': t('emailSettings.templates.registrationApprovalDesc'),
      'admin-create-user': t('emailSettings.templates.adminCreateUserDesc'),
      'installation-invoice': t('emailSettings.templates.installationInvoiceDesc'),
      'invoice-reminder': t('emailSettings.templates.invoiceReminderDesc'),
      'payment-success': t('emailSettings.templates.paymentSuccessDesc'),
      'maintenance-outage': t('emailSettings.templates.maintenanceOutageDesc'),
      'maintenance-resolved': t('emailSettings.templates.maintenanceResolvedDesc'),
      'voucher-purchase': t('emailSettings.templates.voucherPurchaseDesc'),
      'voucher-payment-link': t('emailSettings.templates.voucherPaymentLinkDesc'),
      'manual-extension': t('emailSettings.templates.manualExtensionDesc'),
      'manual-payment-approval': t('emailSettings.templates.manualPaymentApprovalDesc'),
      'manual-payment-rejection': t('emailSettings.templates.manualPaymentRejectionDesc'),
    };
    return descMap[type] || templateConfig[type as keyof typeof templateConfig]?.description || '';
  };

  const handlePreview = (htmlBody: string) => {
    // Replace sample variables with sample data
    const sampleData: Record<string, string> = {
      '{{customerId}}': 'C-001',
      '{{customerName}}': 'John Doe',
      '{{username}}': 'john.pppoe',
      '{{password}}': 'demo123456',
      '{{phone}}': '+62812345678',
      '{{email}}': 'john@example.com',
      '{{address}}': 'Jl. Contoh No. 123, Jakarta',
      '{{profileName}}': 'PAKET GOLD 20MB',
      '{{ipAddress}}': '10.10.10.100',
      '{{expiredAt}}': '31 Januari 2026',
      '{{installationFee}}': 'Rp 250.000',
      '{{subscriptionType}}': 'POSTPAID',
      '{{invoiceNumber}}': 'INV-202501-0001',
      '{{amount}}': 'Rp 350.000',
      '{{dueDate}}': '15 Januari 2026',
      '{{daysRemaining}}': '7',
      '{{paymentLink}}': 'https://example.com/pay/PAY-123ABC',
      '{{paymentToken}}': 'PAY-123ABC',
      '{{baseUrl}}': 'https://example.com',
      '{{bankAccounts}}': `
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #333; font-size: 16px; margin: 0 0 15px 0;">🏦 Rekening Bank untuk Transfer Manual:</h3>
          <div style="background-color: white; border-left: 4px solid #4facfe; padding: 12px; margin: 10px 0; border-radius: 4px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Rekening 1</div>
            <div style="color: #333; font-size: 15px; font-weight: bold; margin-bottom: 3px;">Bank BCA</div>
            <div style="color: #333; font-size: 16px; font-family: monospace; margin-bottom: 3px;">1234567890</div>
            <div style="color: #666; font-size: 13px;">a/n PT. CONTOH INTERNET</div>
          </div>
          <div style="background-color: white; border-left: 4px solid #4facfe; padding: 12px; margin: 10px 0; border-radius: 4px;">
            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Rekening 2</div>
            <div style="color: #333; font-size: 15px; font-weight: bold; margin-bottom: 3px;">Bank Mandiri</div>
            <div style="color: #333; font-size: 16px; font-family: monospace; margin-bottom: 3px;">9876543210</div>
            <div style="color: #666; font-size: 13px;">a/n PT. CONTOH INTERNET</div>
          </div>
        </div>
      `,
      '{{companyName}}': 'PT. Contoh Internet',
      '{{companyPhone}}': '+621234567890',
      '{{companyEmail}}': 'info@contoh.com',
      '{{companyAddress}}': 'Jl. Perusahaan No. 1, Jakarta',
      '{{voucherCodes}}': 'VCHR-ABC123, VCHR-DEF456',
      '{{price}}': 'Rp 50.000',
      '{{quantity}}': '2',
      '{{totalAmount}}': 'Rp 100.000',
      '{{purchaseDate}}': '17 Desember 2025',
      '{{expiryDate}}': '17 Januari 2026',
      '{{duration}}': '30 hari',
      '{{orderToken}}': 'ORD-XYZ789',
      '{{expiryTime}}': '24 jam',
      '{{issueType}}': 'Maintenance',
      '{{description}}': 'Perbaikan sistem jaringan',
      '{{estimatedTime}}': '2 jam',
      '{{affectedArea}}': 'Area Jakarta Selatan',
    };

    let preview = htmlBody;
    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(key, 'g'), value);
    });

    setPreviewHtml(preview);
    setShowPreview(true);
  };

  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Template Type Tabs - Responsive with flex-wrap on mobile */}
      <div className="bg-card rounded-lg border border-border">
        <div className="border-b border-border px-2 sm:px-4 py-2">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {templateTypes.map((type) => {
              return (
                <button
                  key={type}
                  onClick={() => setActiveTemplateTab(type)}
                  className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium rounded transition-colors ${activeTemplateTab === type
                    ? 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-violet-200'
                    : 'bg-muted text-muted-foreground dark:text-muted-foreground hover:bg-muted'
                    }`}
                >
                  {getTemplateTitle(type)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Template Editor */}
        <TemplateEditor
          type={activeTemplateTab}
          template={templates[activeTemplateTab]}
          config={templateConfig[activeTemplateTab as keyof typeof templateConfig]}
          savingTemplate={savingTemplate}
          handleUpdateTemplate={handleUpdateTemplate}
          onPreview={handlePreview}
        />
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-card rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Email Preview - {getTemplateTitle(activeTemplateTab)}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="bg-muted rounded-lg p-4">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[600px] bg-card rounded border-0"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
            <div className="flex justify-end p-4 border-t dark:border-gray-700">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-gray-500 hover:bg-muted text-foreground rounded-lg transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Template Editor Component
function TemplateEditor({ type, template, config, savingTemplate, handleUpdateTemplate, onPreview }: any) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');

  useEffect(() => {
    if (template) {
      setSubject(template.subject);
      setHtmlBody(template.htmlBody);
    }
  }, [template]);

  if (!config) return null;

  const isChanged = template && (subject !== template.subject || htmlBody !== template.htmlBody);

  const insertVariable = (variable: string, target: 'subject' | 'body') => {
    if (target === 'subject') {
      const input = document.getElementById(`subject-${type}`) as HTMLInputElement;
      if (input) {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const newText = subject.slice(0, start) + variable + subject.slice(end);
        setSubject(newText);
        setTimeout(() => {
          input.selectionStart = input.selectionEnd = start + variable.length;
          input.focus();
        }, 0);
      }
    } else {
      const textarea = document.getElementById(`body-${type}`) as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = htmlBody.slice(0, start) + variable + htmlBody.slice(end);
        setHtmlBody(newText);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + variable.length;
          textarea.focus();
        }, 0);
      }
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
      {!template ? (
        <div className="text-center py-12 sm:py-16 text-muted-foreground">
          <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 opacity-30" />
          <p className="text-sm sm:text-base">{t('settings.templateNotCreated')}</p>
          <p className="text-xs sm:text-sm mt-1">{t('settings.refreshForDefault')}</p>
        </div>
      ) : (
        <>
          {/* Description */}
          <div className="flex items-start gap-2 sm:gap-3 bg-primary/10 p-3 sm:p-4 rounded-lg border border-primary/30">
            <Info className="w-4 h-4 sm:w-5 sm:h-5 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 flex-1 min-w-0">
              <p className="font-medium mb-1 break-words">{config.description}</p>
              <p>Status: {template.isActive ? '✅ Aktif' : '❌ Nonaktif'}</p>
            </div>
          </div>

          {/* Variables */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-foreground mb-2">
              📝 Available Variables (Klik untuk insert)
            </label>
            <div className="bg-muted p-2 sm:p-3 rounded-lg border border-border">
              <div className="flex flex-wrap gap-1 sm:gap-1.5">
                {config.variables.map((variable: string) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable, 'body')}
                    className="px-2 py-1 text-[10px] bg-card dark:bg-input hover:bg-primary/10 dark:hover:bg-primary/20 border border-border rounded font-mono transition-colors"
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Email Subject *
            </label>
            <input
              id={`subject-${type}`}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Email subject dengan {{variables}}"
            />
          </div>

          {/* HTML Body */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              HTML Body *
            </label>
            <textarea
              id={`body-${type}`}
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-card border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary resize-none"
              rows={16}
              placeholder="HTML email body dengan {{variables}}"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {htmlBody.length} characters | Gunakan HTML untuk styling
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => onPreview(htmlBody)}
              disabled={!htmlBody}
              className="px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white disabled:opacity-50 disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              <Eye className="w-4 h-4" />
              Preview HTML
            </button>

            <button
              onClick={() => handleUpdateTemplate(type, subject, htmlBody)}
              disabled={!isChanged || savingTemplate === type}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2 ${!isChanged || savingTemplate === type
                ? 'bg-gray-100 text-muted-foreground dark:bg-inputdark:text-muted-foreground cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground text-white'
                }`}
            >
              {savingTemplate === type ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Template
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Reminders Tab Component
function RemindersTab({
  settings,
  setSettings,
  saving,
  handleSave,
}: any) {
  const { t } = useTranslation();
  const [reminderDaysArray, setReminderDaysArray] = useState<string[]>(
    settings.reminderDays ? settings.reminderDays.split(',') : ['7', '3', '1']
  );

  const handleDaysChange = (index: number, value: string) => {
    const newDays = [...reminderDaysArray];
    newDays[index] = value;
    setReminderDaysArray(newDays);
    setSettings({
      ...settings,
      reminderDays: newDays.filter(d => d.trim()).join(','),
    });
  };

  const addDay = () => {
    const newDays = [...reminderDaysArray, ''];
    setReminderDaysArray(newDays);
  };

  const removeDay = (index: number) => {
    const newDays = reminderDaysArray.filter((_, i) => i !== index);
    setReminderDaysArray(newDays);
    setSettings({
      ...settings,
      reminderDays: newDays.filter(d => d.trim()).join(','),
    });
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium mb-1">{t('settings.invoiceReminderSettings')}</p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Sistem akan mengirim email reminder otomatis ke customer berdasarkan jadwal yang ditentukan sebelum invoice jatuh tempo.
            </p>
          </div>
        </div>
      </div>

      {/* Reminder Settings Form */}
      <div className="bg-card rounded-lg border border-border p-6 space-y-6">
        {/* Enable Reminder */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1">
              Aktifkan Invoice Reminder
            </label>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              Kirim email pengingat otomatis sebelum invoice jatuh tempo
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={settings.reminderEnabled}
              onChange={(e) => setSettings({ ...settings, reminderEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-inputpeer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Reminder Time */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <Clock className="w-4 h-4 inline mr-1.5" />
            Jam Pengiriman
          </label>
          <input
            type="time"
            value={settings.reminderTime}
            onChange={(e) => setSettings({ ...settings, reminderTime: e.target.value })}
            disabled={!settings.reminderEnabled}
            className="w-full sm:w-48 px-3 py-2 text-sm bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-muted-foreground disabled:cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
            Waktu pengiriman email reminder setiap hari (format 24 jam)
          </p>
        </div>

        {/* Reminder Days */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <Calendar className="w-4 h-4 inline mr-1.5" />
            Jadwal Reminder (Hari Sebelum Jatuh Tempo)
          </label>

          <div className="space-y-2">
            {reminderDaysArray.map((day, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={day}
                  onChange={(e) => handleDaysChange(index, e.target.value)}
                  disabled={!settings.reminderEnabled}
                  className="w-24 px-3 py-2 text-sm bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-muted-foreground disabled:cursor-not-allowed"
                  placeholder="Hari"
                />
                <span className="text-sm text-muted-foreground dark:text-muted-foreground">{t('settings.daysBeforeDue')}</span>
                {reminderDaysArray.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDay(index)}
                    disabled={!settings.reminderEnabled}
                    className="p-1.5 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addDay}
            disabled={!settings.reminderEnabled}
            className="mt-3 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            Tambah Jadwal
          </button>

          <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-2">
            Contoh: 7, 3, 1 berarti reminder akan dikirim 7 hari, 3 hari, dan 1 hari sebelum jatuh tempo
          </p>
        </div>

        {/* Example Schedule */}
        {settings.reminderEnabled && reminderDaysArray.filter(d => d.trim()).length > 0 && (
          <div className="bg-background rounded-lg p-4">
            <p className="text-xs font-medium text-foreground mb-2">
              📅 Contoh Jadwal:
            </p>
            <div className="space-y-1">
              {reminderDaysArray
                .filter(d => d.trim() && !isNaN(Number(d)))
                .sort((a, b) => Number(b) - Number(a))
                .map((day, index) => (
                  <p key={index} className="text-xs text-muted-foreground dark:text-muted-foreground">
                    • Reminder {index + 1}: {day} hari sebelum jatuh tempo pada pukul {settings.reminderTime}
                  </p>
                ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${saving
              ? 'bg-gray-100 text-muted-foreground dark:bg-inputdark:text-muted-foreground cursor-not-allowed'
              : 'bg-primary hover:bg-primary-dark text-white shadow-sm hover:shadow'
              }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Simpan Pengaturan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// History Tab Component
function HistoryTab() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewingEmail, setViewingEmail] = useState<any | null>(null);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchHistory();
  }, [currentPage, statusFilter]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });

      console.log('[EmailHistory] Fetching with params:', params.toString());
      const response = await fetch(`/api/email/history?${params}`, {
        credentials: 'include',
      });
      const data = await response.json();
      console.log('[EmailHistory] Response:', data);

      if (data.success) {
        console.log('[EmailHistory] Setting history:', data.history.length, 'items');
        setHistory(data.history);
        setTotalPages(data.pagination.totalPages);
      } else {
        console.error('[EmailHistory] API returned success: false', data);
      }
    } catch (error) {
      console.error('Failed to fetch email history:', error);
      addToast({ type: 'error', title: 'Error', description: 'Failed to fetch email history' });
    } finally {
      setLoading(false);
    }
  };

  const viewEmailBody = (email: any) => {
    setViewingEmail(email);
  };

  const filteredHistory = history.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.toEmail.toLowerCase().includes(searchLower) ||
      (item.toName && item.toName.toLowerCase().includes(searchLower)) ||
      item.subject.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                placeholder="Search by email, name, or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 text-sm border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="all">{t('settings.allStatusFilter')}</option>
            <option value="sent">{t('settings.sentFilter')}</option>
            <option value="failed">{t('settings.failedFilter')}</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Email History Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('settings.noEmailHistory')}</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3 p-4">
              {filteredHistory.map((email) => (
                <div key={email.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    {email.status === 'sent' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 dark:bg-green-900/30 text-green-800 dark:text-success">
                        <CheckCircle2 className="w-3 h-3" />
                        Sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/20 dark:bg-red-900/30 text-red-800 dark:text-destructive">
                        <XCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatWIB(email.sentAt)}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Recipient</span>
                      <p className="text-foreground font-medium truncate">{email.toEmail}</p>
                      {email.toName && (
                        <p className="text-muted-foreground text-xs">{email.toName}</p>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Subject</span>
                      <p className="text-foreground truncate">{email.subject}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <button
                      onClick={() => viewEmailBody(email)}
                      className="text-primary hover:text-primary-dark font-medium text-xs"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Recipient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHistory.map((email) => (
                    <tr key={email.id} className="hover:bg-muted/50/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {formatWIB(email.sentAt)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-medium text-foreground">{email.toEmail}</div>
                        {email.toName && (
                          <div className="text-muted-foreground">{email.toName}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        <div className="max-w-xs truncate">{email.subject}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {email.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/20 dark:bg-green-900/30 text-green-800 dark:text-success">
                            <CheckCircle2 className="w-3 h-3" />
                            Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/20 dark:bg-red-900/30 text-red-800 dark:text-destructive">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => viewEmailBody(email)}
                          className="text-primary hover:text-primary-dark font-medium text-sm"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-muted px-6 py-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>

                  <span className="text-sm text-foreground">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* Email Detail Modal */}
    {viewingEmail && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingEmail(null)}>
        <div className="bg-[#1e1b2e] border border-[#bc13fe]/30 rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-[#bc13fe]/20">
            <h2 className="text-lg font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent truncate pr-4">{viewingEmail.subject}</h2>
            <button onClick={() => setViewingEmail(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 overflow-y-auto flex-1 space-y-3 text-sm">
            <div className="flex gap-2"><span className="font-semibold text-gray-400 min-w-[60px]">To:</span><span className="text-gray-200">{viewingEmail.toEmail}{viewingEmail.toName && <span className="text-purple-400"> ({viewingEmail.toName})</span>}</span></div>
            <div className="flex gap-2"><span className="font-semibold text-gray-400 min-w-[60px]">Status:</span><span className={viewingEmail.status === 'sent' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>{viewingEmail.status.toUpperCase()}</span></div>
            {viewingEmail.error && <div className="flex gap-2"><span className="font-semibold text-gray-400 min-w-[60px]">Error:</span><span className="text-red-400">{viewingEmail.error}</span></div>}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="font-semibold text-gray-400 mb-2">Email Content:</div>
              <div className="max-h-96 overflow-y-auto bg-gray-800 border border-gray-700 p-4 rounded text-gray-200" dangerouslySetInnerHTML={{ __html: viewingEmail.body }} />
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
