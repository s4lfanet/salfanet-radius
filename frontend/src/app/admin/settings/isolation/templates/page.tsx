'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { 
  FileText, 
  Mail, 
  MessageCircle, 
  Globe,
  Edit,
  Eye,
  Save,
  X,
  Plus,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  Code,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface IsolationTemplate {
  id: string;
  type: 'whatsapp' | 'email' | 'html_page';
  name: string;
  subject?: string;
  message: string;
  variables: any;
  isActive: boolean;
}

type ViewMode = 'desktop' | 'tablet' | 'mobile';

export default function TemplatesPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<IsolationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<IsolationTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [saving, setSaving] = useState(false);
  const [companyBaseUrl, setCompanyBaseUrl] = useState('https://yourdomain.com');
  const [companyName, setCompanyName] = useState('ISP Billing');

  useEffect(() => {
    fetchTemplates();
    fetch('/api/settings/isolation')
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.baseUrl) setCompanyBaseUrl(d.data.baseUrl.replace(/\/$/, '')); })
      .catch(() => {});
    fetch('/api/public/company')
      .then(r => r.json())
      .then(d => { if (d.success && d.company?.name) setCompanyName(d.company.name); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/settings/isolation/templates');
      const data = await response.json();
      
      console.log('Templates API response:', data);
      
      if (data.success) {
        console.log('Templates data:', data.data);
        setTemplates(data.data);
      } else {
        console.error('API returned error:', data.message);
        addToast({ type: 'error', title: t('common.failed'), description: data.message || t('isolation.failedLoadTemplates') });
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      addToast({ type: 'error', title: t('common.failed'), description: t('isolation.failedLoadTemplates') });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: IsolationTemplate) => {
    setEditingTemplate({ ...template });
    setShowEditor(true);
    setPreviewMode(false);
  };

  const handleSave = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/settings/isolation/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          message: editingTemplate.message,
          isActive: editingTemplate.isActive,
        }),
      });

      const data = await response.json();

      if (data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('isolation.templateUpdated'), duration: 2000 });
        
        fetchTemplates();
        setShowEditor(false);
        setEditingTemplate(null);
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      addToast({ type: 'error', title: t('common.failed'), description: error.message || t('isolation.failedSaveTemplate') });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    setPreviewMode(false);
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return <MessageCircle className="w-5 h-5 text-success" />;
      case 'email':
        return <Mail className="w-5 h-5 text-primary" />;
      case 'html_page':
        return <Globe className="w-5 h-5 text-accent" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getTemplateColor = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return 'border-success/30 bg-success/10';
      case 'email':
        return 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20';
      case 'html_page':
        return 'border-purple-200 dark:border-purple-800 bg-accent/10';
      default:
        return 'border-border bg-background/20';
    }
  };

  const renderPreview = () => {
    if (!editingTemplate) return null;

    const sampleData = {
      companyName: companyName,
      customerName: 'John Doe',
      username: 'user001',
      phoneNumber: '081234567890',
      expiredDate: '15 Desember 2024',
      gracePeriodEnd: '20 Desember 2024',
      totalUnpaid: 'Rp 500.000',
      paymentLink: `${companyBaseUrl}/pay/xxx`,
      companyPhone: '0812-3456-7890',
      companyWhatsapp: '081234567890',
      companyEmail: `cs@${companyBaseUrl.replace(/https?:\/\//, '').split('/')[0]}`,
      companyWebsite: companyBaseUrl,
      qrCodeImage: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(companyBaseUrl + '/pay/xxx')}`,
    };

    let preview = editingTemplate.message;
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      preview = preview.replace(regex, value);
    });

    if (editingTemplate.type === 'whatsapp') {
      return (
        <div className="bg-card p-4 rounded-lg border border-border">
          <div className="bg-success/10 p-4 rounded-lg max-w-md">
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
              {preview}
            </pre>
          </div>
        </div>
      );
    }

    if (editingTemplate.type === 'email' || editingTemplate.type === 'html_page') {
      const containerWidth = viewMode === 'mobile' ? '375px' : viewMode === 'tablet' ? '768px' : '100%';
      
      return (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-border bg-muted">
            <button
              onClick={() => setViewMode('desktop')}
              className={`p-2 rounded ${viewMode === 'desktop' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground dark:text-muted-foreground'}`}
              title="Desktop view"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('tablet')}
              className={`p-2 rounded ${viewMode === 'tablet' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground dark:text-muted-foreground'}`}
              title="Tablet view"
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('mobile')}
              className={`p-2 rounded ${viewMode === 'mobile' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground dark:text-muted-foreground'}`}
              title="Mobile view"
            >
              <Smartphone className="w-4 h-4" />
            </button>
            <div className="ml-auto text-xs text-muted-foreground">
              {viewMode === 'mobile' ? '375px' : viewMode === 'tablet' ? '768px' : 'Full Width'}
            </div>
          </div>
          <div className="p-4 bg-muted overflow-auto" style={{ maxHeight: '600px' }}>
            <div style={{ width: containerWidth, margin: '0 auto' }}>
              <iframe
                srcDoc={preview}
                className="w-full bg-card border-0 rounded"
                style={{ minHeight: '400px' }}
                title="Preview"
              />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const availableVariables = [
    { key: 'companyName', desc: 'Nama perusahaan' },
    { key: 'customerName', desc: 'Nama customer' },
    { key: 'username', desc: 'Username PPPoE' },
    { key: 'phoneNumber', desc: 'Nomor HP customer' },
    { key: 'expiredDate', desc: 'Tanggal expired' },
    { key: 'gracePeriodEnd', desc: 'Akhir grace period' },
    { key: 'totalUnpaid', desc: 'Total tagihan belum dibayar' },
    { key: 'paymentLink', desc: 'Link pembayaran' },
    { key: 'companyPhone', desc: 'Telepon perusahaan' },
    { key: 'companyWhatsapp', desc: 'WhatsApp perusahaan' },
    { key: 'companyEmail', desc: 'Email perusahaan' },
    { key: 'companyWebsite', desc: 'Website perusahaan' },
    { key: 'qrCodeImage', desc: 'URL QR Code image' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  if (showEditor && editingTemplate) {
    return (
      <div className="bg-background relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
                {editingTemplate.type === 'whatsapp' && <MessageCircle className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />}
                {editingTemplate.type === 'email' && <Mail className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />}
                {editingTemplate.type === 'html_page' && <Globe className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />}
                {t('isolation.editTemplate')} {editingTemplate.name}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {editingTemplate.type === 'whatsapp' && t('isolation.whatsappTemplateDesc')}
                {editingTemplate.type === 'email' && t('isolation.emailTemplateDesc')}
                {editingTemplate.type === 'html_page' && t('isolation.htmlPageTemplateDesc')}
              </p>
            </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                previewMode
                  ? 'bg-accent hover:bg-accent/90 text-accent-foreground'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              {previewMode ? <Code className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {previewMode ? t('isolation.editor') : t('isolation.preview')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {t('isolation.saving')}
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {t('common.save')}
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 text-sm rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              {t('common.cancel')}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Editor/Preview */}
          <div className="lg:col-span-2">
            {previewMode ? (
              <div>
                <h3 className="font-semibold text-foreground mb-3">{t('isolation.preview')}</h3>
                {renderPreview()}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('common.name')}
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                  />
                </div>

                {editingTemplate.type === 'email' && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {t('isolation.subject')} Email
                    </label>
                    <input
                      type="text"
                      value={editingTemplate.subject || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                      placeholder="Subject email..."
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {editingTemplate.type === 'whatsapp' ? t('isolation.whatsappTemplateDesc') : 'HTML Template'}
                  </label>
                  <textarea
                    value={editingTemplate.message}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, message: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground font-mono text-sm"
                    rows={editingTemplate.type === 'whatsapp' ? 15 : 20}
                    placeholder={
                      editingTemplate.type === 'whatsapp'
                        ? 'Ketik pesan template...'
                        : '<!DOCTYPE html>\n<html>...'
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editingTemplate.isActive}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, isActive: e.target.checked })}
                    className="w-4 h-4 text-primary rounded"
                  />
                  <label htmlFor="isActive" className="text-sm text-foreground">
                    {t('isolation.active')}
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Variables Reference */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">{t('isolation.availableVariables')}</h3>
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-3">
                {t('isolation.insertVariable')}:
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableVariables.map((variable) => (
                  <div
                    key={variable.key}
                    className="p-2 bg-muted rounded border border-border cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${variable.key}}}`);
                      addToast({ type: 'success', title: t('common.copied'), description: `{{${variable.key}}} ${t('common.copied')}`, duration: 1500 });
                    }}
                    title={t('common.copy')}
                  >
                    <code className="text-xs font-mono text-primary dark:text-primary">
                      {`{{${variable.key}}}`}
                    </code>
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">{variable.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h4 className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Tips
              </h4>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                {editingTemplate.type === 'whatsapp' && (
                  <>
                    <li>{t('isolation.tipsWhatsapp')}</li>
                    <li>*bold* / _italic_</li>
                  </>
                )}
                {(editingTemplate.type === 'email' || editingTemplate.type === 'html_page') && (
                  <>
                    <li>{t('isolation.tipsEmail')}</li>
                    <li>{t('isolation.tipsTest')}</li>
                    <li>{t('isolation.tipsQr')}</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] mb-2">
            <FileText className="w-8 h-8 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] inline mr-2" />
            {t('isolation.templatesTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t('isolation.templatesSubtitle')}
          </p>
        </div>

      {/* Info Banner */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary">
            <p className="font-semibold mb-1">{t('isolation.dynamicVariables')}</p>
            <p>
              {t('isolation.dynamicVariablesDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {getTemplateIcon(template.type)}
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                  <p className="text-[10px] text-muted-foreground capitalize">{template.type.replace('_', ' ')}</p>
                </div>
              </div>
              {template.isActive ? (
                <span className="flex items-center gap-1 text-[10px] bg-success/20 dark:bg-green-900/30 text-success px-1.5 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  {t('isolation.active')}
                </span>
              ) : (
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {t('isolation.inactive')}
                </span>
              )}
            </div>
            {template.subject && (
              <div className="mb-2">
                <p className="text-[10px] text-muted-foreground">{t('isolation.subject')}:</p>
                <p className="text-xs text-foreground font-medium truncate">{template.subject}</p>
              </div>
            )}
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1">{t('isolation.previewLabel')}</p>
              <div className="bg-card rounded p-2 text-[10px] text-muted-foreground font-mono h-16 overflow-hidden">
                {template.message.substring(0, 100)}...
              </div>
            </div>
            <button
              onClick={() => handleEdit(template)}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white font-medium p-2 rounded-lg transition-colors text-sm"
            >
              <Edit className="w-4 h-4" />
              {t('common.edit')}
            </button>
          </div>
        ))}
      </div>

      {/* Desktop Templates Grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`rounded-lg border-2 p-6 ${getTemplateColor(template.type)}`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {getTemplateIcon(template.type)}
                <div>
                  <h3 className="font-semibold text-foreground">{template.name}</h3>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground capitalize mt-1">
                    {template.type.replace('_', ' ')}
                  </p>
                </div>
              </div>
              {template.isActive ? (
                <span className="flex items-center gap-1 text-xs bg-success/20 dark:bg-green-900/30 text-success px-2 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  {t('isolation.active')}
                </span>
              ) : (
                <span className="text-xs bg-muted text-muted-foreground dark:text-muted-foreground px-2 py-1 rounded-full">
                  {t('isolation.inactive')}
                </span>
              )}
            </div>

            {template.subject && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground dark:text-muted-foreground">{t('isolation.subject')}:</p>
                <p className="text-sm text-foreground font-medium truncate">
                  {template.subject}
                </p>
              </div>
            )}

            <div className="mb-4">
              <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-1">{t('isolation.previewLabel')}</p>
              <div className="bg-card rounded p-3 text-xs text-muted-foreground dark:text-muted-foreground font-mono h-24 overflow-hidden">
                {template.message.substring(0, 150)}...
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(template)}
                className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
                {t('common.edit')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
