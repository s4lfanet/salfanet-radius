'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { Plus, Edit2, Trash2, Eye, X, RefreshCw, FileCode } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { renderVoucherTemplate } from '@/lib/utils/templateRenderer';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

const DEFAULT_TEMPLATE = `{include file="rad-template-header.tpl"}
<style>
@media (max-width: 640px) {
  .voucher-preview-container { display: flex !important; flex-direction: column !important; padding: 0 8px !important; gap: 10px !important; }
  .voucher-card { display: block !important; width: calc(100% - 16px) !important; max-width: none !important; margin: 0 auto 10px auto !important; }
  .voucher-single { order: 1; }
  .voucher-dual { order: 2; }
  .voucher-header { font-size: 12px !important; padding: 6px 10px !important; }
  .voucher-label { font-size: 9px !important; }
  .voucher-code-single { font-size: 13px !important; }
  .voucher-code-dual { font-size: 10px !important; }
  .voucher-footer { font-size: 10px !important; padding: 6px 10px !important; }
}
@media (min-width: 641px) and (max-width: 1024px) {
  .voucher-card { width: calc(33.33% - 8px) !important; }
}
@media (min-width: 1025px) {
  .voucher-card { width: 155px !important; }
}
</style>
{foreach $v as $vs}
{if $vs['code'] eq $vs['secret']}
<div class="voucher-card voucher-single" style="display: inline-block; width: 155px; height: auto; min-height: 115px; border: 1px solid #ccc; border-radius: 4px; font-family: Arial, sans-serif; margin: 4px; padding: 0; vertical-align: top; background: #fff; page-break-inside: avoid; box-sizing: border-box;">
<div class="voucher-header" style="background: #ff8c00; color: #fff; padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 3px 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
{$vs['router_name']}
</div>
<div style="padding: 8px 10px; min-height: 50px;">
<div class="voucher-label" style="color: #ff8c00; font-size: 10px; font-weight: 600; margin-bottom: 3px;">Kode Voucher</div>
<div class="voucher-code-single" style="font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold; color: #000; line-height: 1.4; word-break: break-all;">{$vs['code']}</div>
</div>
<div class="voucher-footer" style="border-top: 1px dashed #ffa500; padding: 7px 10px; font-size: 11px; font-weight: bold; color: #333; background: #fffaf0;">
{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}
</div>
<div style="padding: 5px 10px; font-size: 9px; color: #666; background: #f9f9f9; border-top: 1px solid #eee;">
<div>📊 Kuota: {$vs['quota']}</div>
<div>⏱️ Durasi: {$vs['duration']}</div>
</div>
</div>
{else}
<div class="voucher-card voucher-dual" style="display: inline-block; width: 155px; height: auto; min-height: 115px; border: 1px solid #ccc; border-radius: 4px; font-family: Arial, sans-serif; margin: 4px; padding: 0; vertical-align: top; background: #fff; page-break-inside: avoid; box-sizing: border-box;">
<div class="voucher-header" style="background: #ff8c00; color: #fff; padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 3px 3px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
{$vs['router_name']}
</div>
<div style="padding: 8px 10px; min-height: 50px; display: flex; gap: 6px;">
<div style="flex: 1; min-width: 0;">
<div class="voucher-label" style="color: #ff8c00; font-size: 10px; font-weight: 600; margin-bottom: 2px;">Username</div>
<div class="voucher-code-dual" style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; color: #000; line-height: 1.3; word-break: break-all;">{$vs['code']}</div>
</div>
<div style="flex: 1; min-width: 0;">
<div class="voucher-label" style="color: #ff8c00; font-size: 10px; font-weight: 600; margin-bottom: 2px;">Password</div>
<div class="voucher-code-dual" style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; color: #000; line-height: 1.3; word-break: break-all;">{$vs['secret']}</div>
</div>
</div>
<div class="voucher-footer" style="border-top: 1px dashed #ffa500; padding: 7px 10px; font-size: 11px; font-weight: bold; color: #333; background: #fffaf0;">
{$vs['validity']} - {$_c['currency_code']}. {number_format($vs['total'], 0, ',', '.')}
</div>
<div style="padding: 5px 10px; font-size: 9px; color: #666; background: #f9f9f9; border-top: 1px solid #eee;">
<div>📊 Kuota: {$vs['quota']}</div>
<div>⏱️ Durasi: {$vs['duration']}</div>
</div>
</div>
{/if}
{/foreach}
{include file="rad-template-footer.tpl"}`;

interface VoucherTemplate {
  id: string;
  name: string;
  htmlTemplate: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function VoucherTemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<VoucherTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    htmlTemplate: DEFAULT_TEMPLATE,
    isDefault: false,
    isActive: true
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/voucher-templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingTemplate ? `/api/voucher-templates/${editingTemplate.id}` : '/api/voucher-templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        await showSuccess(editingTemplate ? t('common.updated') : t('common.created'));
        await fetchTemplates();
        handleCloseDialog();
      } else {
        const error = await res.json();
        await showError(error.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('hotspot.failedSaveTemplate'));
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm(t('common.deleteConfirm'));
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/voucher-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await showSuccess(t('hotspot.templateDeleted'));
        await fetchTemplates();
      } else {
        const error = await res.json();
        await showError(error.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('hotspot.failedDeleteTemplate'));
    }
  };

  const handleEdit = (template: VoucherTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      htmlTemplate: template.htmlTemplate,
      isDefault: template.isDefault,
      isActive: template.isActive
    });
    setShowDialog(true);
  };

  const handleAdd = () => {
    setEditingTemplate(null);
    setFormData({ name: '', htmlTemplate: DEFAULT_TEMPLATE, isDefault: false, isActive: true });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingTemplate(null);
  };

  const sampleVouchers = [
    {
      code: 'DEMO1234',
      secret: 'DEMO1234',
      total: 10000,
      profile: {
        name: '3 Jam',
        validityValue: 3,
        validityUnit: 'HOURS',
        usageQuota: 5 * 1024 * 1024 * 1024, // 5GB
        usageDuration: 180 // 3 hours
      },
      router: { name: 'test-mikrotik', shortname: 'TM' }
    },
    {
      code: 'USER5678',
      secret: 'PASS9999',
      total: 25000,
      profile: {
        name: '1 Hari',
        validityValue: 1,
        validityUnit: 'DAYS',
        usageQuota: 10 * 1024 * 1024 * 1024, // 10GB
        usageDuration: 1440 // 24 hours
      },
      router: { name: 'test-mikrotik', shortname: 'TM' }
    }
  ];

  const previewHtml = renderVoucherTemplate(
    formData.htmlTemplate,
    sampleVouchers,
    { currencyCode: 'Rp', companyName: 'test-mikrotik' }
  );

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <FileCode className="w-5 h-5 text-[#00f7ff]" />
              {t('hotspot.templateTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('hotspot.templateSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchTemplates}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border rounded-md hover:bg-muted"
              title="Perbarui Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('hotspot.addTemplate')}
            </button>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">{t('common.loading')}</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">{t('hotspot.noTemplates')}</div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-sm text-foreground">{template.name}</div>
                  <div className="flex items-center gap-1">
                    {template.isDefault && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary">
                        {t('common.default')}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${template.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {template.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button onClick={() => handleEdit(template)} className="p-2 text-primary hover:bg-primary/10 rounded" title="Edit Template">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(template.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Hapus Template">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table - Desktop */}
        {loading ? (
          <div className="hidden md:block text-center py-8 text-xs text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.name')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.default')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-muted">
                    <td className="px-3 py-2">
                      <span className="font-medium text-xs text-foreground">{template.name}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${template.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                        {template.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {template.isDefault && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary dark:text-primary">
                          {t('common.default')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-1 text-primary hover:bg-primary/10 rounded"
                          title="Edit Template"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="p-1 text-destructive hover:bg-destructive/10 rounded"
                          title="Hapus Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {t('hotspot.noTemplates')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Add/Edit Dialog */}
        <SimpleModal isOpen={showDialog} onClose={handleCloseDialog} size="xl">
          <ModalHeader>
            <ModalTitle>{editingTemplate ? t('hotspot.editTemplate') : t('hotspot.addTemplate')}</ModalTitle>
            <ModalDescription>{t('hotspot.configureTemplate')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('hotspot.templateName')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g., Default Card" />
              </div>
              <div>
                <ModalLabel>{t('hotspot.htmlTemplate')}</ModalLabel>
                <ModalTextarea value={formData.htmlTemplate} onChange={(e) => setFormData({ ...formData, htmlTemplate: e.target.value })} required rows={12} className="font-mono text-[10px]" placeholder="Enter HTML template..." />
                <p className="text-[9px] text-muted-foreground mt-1">
                  Use Smarty: {`{$vs['code']}, {$vs['secret']}, {$vs['total']}, {$_c['currency_code']}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isDefault} onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff] w-3.5 h-3.5" />
                  <span className="text-xs text-foreground">{t('hotspot.setDefault')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff] w-3.5 h-3.5" />
                  <span className="text-xs text-foreground">{t('common.active')}</span>
                </label>
              </div>
            </ModalBody>
            <ModalFooter className="justify-between">
              <button type="button" onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#00f7ff] border border-[#00f7ff]/50 rounded-lg hover:bg-[#00f7ff]/10 transition-all">
                <Eye className="w-3.5 h-3.5" /> {t('hotspot.previewTemplate')}
              </button>
              <div className="flex gap-2">
                <ModalButton type="button" variant="secondary" onClick={handleCloseDialog}>{t('common.cancel')}</ModalButton>
                <ModalButton type="submit" variant="primary">{editingTemplate ? t('common.update') : t('common.create')}</ModalButton>
              </div>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Preview Dialog */}
        <SimpleModal isOpen={showPreview} onClose={() => setShowPreview(false)} size="md">
          <ModalHeader>
            <ModalTitle>{t('hotspot.previewTemplate')}</ModalTitle>
          </ModalHeader>
          <ModalBody className="p-4 overflow-y-auto">
            <div style={{ display: 'flex', justifyContent: 'center', maxHeight: '65vh', overflowY: 'auto' }}>
              <div
                style={{
                  background: '#fff',
                  borderRadius: '8px',
                  padding: '12px',
                  width: '100%',
                  maxWidth: '380px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  overflowX: 'hidden',
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setShowPreview(false)}>{t('common.close')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  );
}
