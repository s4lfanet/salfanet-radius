'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { Loader2 } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  type: string;
  message: string;
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
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{amount}}', '{{profileName}}', '{{area}}', '{{expiredDate}}', '{{companyName}}', '{{companyPhone}}'],
  },
  'manual-payment-rejection': {
    title: '❌ Pembayaran Manual Ditolak',
    description: 'Dikirim otomatis saat admin menolak konfirmasi pembayaran manual',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{invoiceNumber}}', '{{profileName}}', '{{area}}', '{{rejectionReason}}', '{{paymentLink}}', '{{companyName}}', '{{companyPhone}}'],
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
    title: '📄 Notifikasi Invoice Baru',
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
    title: '🎉 E-Voucher Purchase Success',
    description: 'Dikirim saat customer berhasil membeli e-voucher',
    variables: ['{{customerName}}', '{{voucherCodes}}', '{{profileName}}', '{{price}}', '{{quantity}}', '{{totalAmount}}', '{{purchaseDate}}', '{{expiryDate}}', '{{duration}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}'],
  },
  'welcome-message': {
    title: '👋 Selamat Datang Pelanggan Baru',
    description: 'Pesan selamat datang untuk pelanggan baru yang baru bergabung',
    variables: ['{{customerName}}', '{{customerUsername}}', '{{profileName}}', '{{expiredAt}}', '{{supportContact}}', '{{companyName}}', '{{companyPhone}}', '{{companyEmail}}', '{{companyAddress}}'],
  },
};

const templateTypes = Object.keys(templateConfig) as (keyof typeof templateConfig)[];

export default function WhatsAppTemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof typeof templateConfig>('registration-approval');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/templates');
      const data = await res.json();

      if (data.success) {
        const templatesMap: Record<string, Template> = {};
        data.data.forEach((t: Template) => {
          templatesMap[t.type] = t;
        });
        setTemplates(templatesMap);
      }
    } catch (error) {
      console.error('Fetch templates error:', error);
      showError(t('whatsapp.failedLoadTemplate'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (type: string, message: string) => {
    const template = templates[type];
    if (!template) return;

    setSaving(type);
    try {
      const res = await fetch(`/api/whatsapp/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess(t('whatsapp.templateUpdated'));
        fetchTemplates();
      } else {
        showError(data.error || t('whatsapp.failedUpdateTemplate'));
      }
    } catch (error) {
      console.error('Update template error:', error);
      showError(t('whatsapp.failedUpdateTemplate'));
    } finally {
      setSaving(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccess(t('whatsapp.templateCopied'));
  };

  const TemplateEditor = ({ type }: { type: string }) => {
    const template = templates[type];
    const config = templateConfig[type as keyof typeof templateConfig];
    const [message, setMessage] = useState(template?.message || '');

    useEffect(() => {
      setMessage(template?.message || '');
    }, [template]);

    if (!config) return null;

    const isChanged = template && message !== template.message;

    const insertVariable = (variable: string) => {
      const textarea = document.getElementById(`textarea-${type}`) as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = message.slice(0, start) + variable + message.slice(end);
        setMessage(newText);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + variable.length;
          textarea.focus();
        }, 0);
      }
    };

    return (
      <div className="bg-card rounded-lg border border-border">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">{config.title}</h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground dark:text-muted-foreground mt-0.5 line-clamp-2">{config.description}</p>
            </div>
            {template && (
              <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold rounded shrink-0 border ${template.isActive ? 'bg-success/20 text-success border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]' : 'bg-muted/20 text-muted-foreground border-muted/40'}`}>
                {template.isActive ? 'Aktif' : 'Nonaktif'}
              </span>
            )}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:divide-x divide-border">
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {!template ? (
            <div className="text-center py-8 sm:py-12 text-muted-foreground">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-xs sm:text-sm">{t('whatsapp.templateNotCreated')}</p>
              <p className="text-[10px] sm:text-xs mt-0.5 sm:mt-1">{t('whatsapp.createDefaultOrManual')}</p>
            </div>
          ) : (
            <>
              {/* Message Textarea */}
              <div>
                <label className="block text-[10px] sm:text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1 sm:mb-2">
                  {t('whatsapp.templateMessage')}
                </label>
                <textarea
                  id={`textarea-${type}`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-mono bg-card border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-teal-500 text-foreground resize-none"
                  rows={12}
                  placeholder="Tulis template WhatsApp Anda di sini..."
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground dark:text-muted-foreground mt-1 sm:mt-2">{message.length} {t('whatsapp.characters')}</p>
              </div>

              {/* Variables */}
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <label className="text-[10px] sm:text-xs font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                    {t('whatsapp.availableVariables')}
                  </label>
                </div>
                <div className="bg-primary/10 p-2 sm:p-3 rounded-md border border-primary/30">
                  <div className="flex flex-wrap gap-1 sm:gap-1.5">
                    {config.variables.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertVariable(variable)}
                        className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] bg-card hover:bg-primary/20 dark:hover:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded font-mono transition-colors text-foreground"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] sm:text-[10px] text-primary dark:text-primary mt-1.5 sm:mt-2">
                    💡 {t('whatsapp.clickToInsert')}
                  </p>
                </div>
              </div>

              {/* Format Info */}
              <div className="bg-muted/50 p-2 sm:p-3 rounded-md border border-border">
                <p className="text-[10px] sm:text-xs font-medium text-foreground mb-1 sm:mb-2">{t('whatsapp.waFormat')}:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-muted-foreground dark:text-muted-foreground">
                  <div>• *bold* → <strong>bold</strong></div>
                  <div>• _italic_ → <em>italic</em></div>
                  <div>• ~strikethrough~ → <del>strikethrough</del></div>
                  <div>• ```code``` → <code className="text-[9px] sm:text-[10px]">code</code></div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => handleUpdate(type, message)}
                  className={`flex-1 h-9 sm:h-10 text-xs sm:text-sm font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                    !isChanged || saving === type
                      ? 'bg-gray-100 text-muted-foreground dark:bg-inputdark:text-muted-foreground cursor-not-allowed'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground text-white'
                  }`}
                  disabled={!isChanged || saving === type}
                >
                  {saving === type ? (
                    <>
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('whatsapp.saving')}
                    </>
                  ) : isChanged ? (
                    <>
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      {t('whatsapp.saveChanges')}
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('whatsapp.saved')}
                    </>
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(message)}
                  className="h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-medium text-foreground bg-card border border-border rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden sm:inline">{t('whatsapp.copy')}</span>
                  <span className="sm:hidden">{t('whatsapp.copyBtn')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* WhatsApp Live Preview Pane */}
        <div className="p-3 sm:p-4 border-t lg:border-t-0 border-border bg-[#0B141A]/20">
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 sm:mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Preview Pesan
          </p>
          {!template ? (
            <div className="flex items-center justify-center h-40 rounded-lg bg-[#0B141A]/60">
              <p className="text-xs text-white/30">Belum ada template</p>
            </div>
          ) : (
            <div className="bg-[#0B141A] rounded-xl min-h-[220px] p-3 relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)' , backgroundSize: '20px 20px'}}></div>
              <div className="relative max-w-[90%] ml-auto">
                <div className="bg-[#005C4B] text-white rounded-lg rounded-tr-sm p-2.5 sm:p-3 shadow-lg relative">
                  <div
                    className="text-[11px] sm:text-xs leading-relaxed whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: (() => {
                      const sampleVars: Record<string, string> = {
                        '{{customerName}}': 'Budi Santoso', '{{namaPelanggan}}': 'Budi Santoso', '{{nama}}': 'Budi Santoso', '{{name}}': 'Budi Santoso',
                        '{{customerUsername}}': 'budi123', '{{username}}': 'budi123',
                        '{{amount}}': 'Rp 150.000', '{{jumlah}}': 'Rp 150.000', '{{totalAmount}}': 'Rp 150.000', '{{harga}}': 'Rp 150.000',
                        '{{invoiceNumber}}': 'INV-202501-001', '{{nomorInvoice}}': 'INV-202501-001',
                        '{{dueDate}}': '31 Januari 2025', '{{tanggalJatuhTempo}}': '31 Januari 2025',
                        '{{packageName}}': 'Paket 20 Mbps', '{{paket}}': 'Paket 20 Mbps', '{{package}}': 'Paket 20 Mbps',
                        '{{phone}}': '08123456789', '{{telepon}}': '08123456789',
                        '{{address}}': 'Jl. Merdeka No. 10, RT 05/RW 03', '{{alamat}}': 'Jl. Merdeka No. 10',
                        '{{date}}': '15 Januari 2025', '{{tanggal}}': '15 Januari 2025', '{{tanggalBayar}}': '15 Januari 2025',
                        '{{companyName}}': 'Salfanet ISP', '{{perusahaan}}': 'Salfanet ISP',
                        '{{technicianName}}': 'Ahmad (Teknisi)', '{{teknisi}}': 'Ahmad (Teknisi)',
                        '{{issueDescription}}': 'Gangguan pada kabel backbone', '{{masalah}}': 'Gangguan kabel backbone',
                        '{{estimatedTime}}': '2-3 jam', '{{estimasi}}': '2-3 jam',
                        '{{status}}': 'AKTIF', '{{period}}': 'Januari 2025', '{{periode}}': 'Januari 2025',
                        '{{remainingDays}}': '5', '{{sisaHari}}': '5',
                        '{{speedUp}}': '20 Mbps', '{{speedDown}}': '20 Mbps', '{{kecepatan}}': '20 Mbps',
                        '{{paymentMethod}}': 'Transfer Bank BCA', '{{metodeBayar}}': 'Transfer Bank',
                        '{{activationDate}}': '15 Januari 2025', '{{tanggalAktif}}': '15 Januari 2025',
                        '{{installationDate}}': '10 Januari 2025', '{{tanggalPasang}}': '10 Januari 2025',
                        '{{notes}}': 'Terima kasih atas pembayarannya', '{{catatan}}': '-',
                        '{{otp}}': '123456', '{{kode}}': '123456', '{{token}}': 'TKN-ABC123',
                        '{{link}}': 'https://salfanet.net/bayar', '{{url}}': 'https://salfanet.net',
                        '{{year}}': new Date().getFullYear().toString(),
                        '{{month}}': formatWIB(new Date(), 'MMMM'),
                      };
                      let rendered = message;
                      Object.entries(sampleVars).forEach(([k, v]) => {
                        rendered = rendered.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v);
                      });
                      rendered = rendered.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                      rendered = rendered
                        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
                        .replace(/_([^_\n]+)_/g, '<em>$1</em>')
                        .replace(/~([^~\n]+)~/g, '<del class="opacity-70">$1</del>')
                        .replace(/```([^`]+)```/g, '<code class="bg-black/30 px-0.5 rounded font-mono">$1</code>');
                      return rendered;
                    })() }}
                  />
                  <div className="absolute -right-[5px] top-0 w-0 h-0 border-l-[6px] border-l-[#005C4B] border-b-[6px] border-b-transparent"></div>
                  <p className="text-[9px] text-white/40 text-right mt-1.5 select-none">12:00 ✓✓</p>
                </div>
              </div>
              <p className="text-[9px] text-white/25 text-center mt-3">{message.length} karakter · data contoh</p>
            </div>
          )}
        </div>
        </div> {/* close lg:grid */}
      </div>
    );
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
        <div className="max-w-6xl mx-auto space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="px-1 sm:px-0">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">{t('whatsapp.templatesTitle')}</span>
            <span className="sm:hidden">{t('whatsapp.templateWhatsapp')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('whatsapp.templatesSubtitle')}</p>
        </div>

        {/* Tabs - Wrapping on mobile */}
        <div className="bg-card rounded-lg border border-border p-1 overflow-hidden">
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {templateTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium rounded transition-colors ${
                  activeTab === type
                    ? 'bg-teal-600 text-white'
                    : 'text-muted-foreground dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {templateConfig[type].title}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <TemplateEditor type={activeTab} />

        {/* Info Card */}
        <div className="bg-primary/10 rounded-lg border border-primary/30 p-3 sm:p-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary dark:text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-blue-900 dark:text-blue-100">📋 {t('whatsapp.howToUse')}</p>
              <ul className="text-[10px] sm:text-xs text-blue-800 dark:text-blue-200 space-y-0.5 sm:space-y-1">
                <li>• <strong>Persetujuan Pendaftaran</strong>: Dikirim saat admin approve registrasi baru</li>
                <li>• <strong>Admin Create User</strong>: Dikirim saat admin create user manual</li>
                <li>• <strong>Invoice Instalasi</strong>: Dikirim saat mark installed dan invoice dibuat</li>
                <li>• <strong>Invoice Jatuh Tempo</strong>: Dikirim via cron untuk reminder invoice (H-5, H-3, H-1, H-0)</li>
                <li>• <strong>Pembayaran Berhasil</strong>: Dikirim otomatis saat invoice dibayar</li>
                <li>• <strong>Informasi Gangguan</strong>: Template untuk broadcast maintenance</li>
                <li>• <strong>Perbaikan Selesai</strong>: Template untuk broadcast perbaikan selesai</li>
                <li className="break-words">• Variabel <code className="bg-primary/20 dark:bg-blue-800 px-1 rounded text-[9px] sm:text-[10px]">{'{{nama}}'}</code> akan diganti otomatis dengan data real</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
