'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface Provider {
  id: string;
  name: string;
  type: string;
  apiUrl: string;
  apiKey: string | null;
  senderNumber?: string | null;
  priority: number;
  isActive: boolean;
  description: string | null;
}

interface ProviderStatus {
  status: string;
  connected: boolean;
  phone?: string | null;
  name?: string | null;
}

export default function WhatsAppProvidersPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrProvider, setQrProvider] = useState<Provider | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({});
  const [restartingProvider, setRestartingProvider] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const copyWebhookUrl = async () => {
    const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      addToast({ type: 'error', title: 'Error!', description: 'Gagal menyalin URL' });
    }
  };

  const [formData, setFormData] = useState({
    name: '',
    type: 'mpwa',
    apiUrl: '',
    apiKey: '',
    senderNumber: '',
    priority: 0,
    description: ''
  });

  // Default base URLs for cloud/well-known providers.
  // Self-hosted types (mpwa, waha, gowa, wablast) intentionally have no default.
  const DEFAULT_URLS: Record<string, string> = {
    fonnte: 'https://api.fonnte.com/send',
    wablas: 'https://wa.wablas.com',
    kirimi: 'https://api.kirimi.id',
  };

  // Known Wablas server hostnames — user picks one which sets apiUrl
  const WABLAS_SERVERS = [
    'wa', 'jakarta', 'pati', 'deu', 'kudus', 'solo', 'bogor', 'jogja', 'bandung',
  ];

  const handleTypeChange = (newType: string) => {
    const newDefault = DEFAULT_URLS[newType] || '';
    // Auto-fill URL when: field is empty, OR the current value is already a known default URL
    const isCurrentlyDefault =
      formData.apiUrl === '' ||
      Object.values(DEFAULT_URLS).includes(formData.apiUrl);
    setFormData({
      ...formData,
      type: newType,
      apiUrl: isCurrentlyDefault ? newDefault : formData.apiUrl,
    });
  };

  useEffect(() => {
    fetchProviders();
    const interval = setInterval(() => {
      fetchAllStatuses();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      fetchAllStatuses();
    }
  }, [providers]);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/whatsapp/providers');
      const data = await res.json();
      setProviders(data.sort((a: Provider, b: Provider) => a.priority - b.priority));
    } catch (error) {
      console.error('Error fetching providers:', error);
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedFetchProviders') });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllStatuses = async () => {
    if (providers.length === 0) return;

    const newStatuses: Record<string, ProviderStatus> = {};

    await Promise.all(
      providers.map(async (provider) => {
        if (provider.type === 'mpwa' || provider.type === 'waha' || provider.type === 'gowa') {
          try {
            const res = await fetch(`/api/whatsapp/providers/${provider.id}/status`);
            if (res.ok) {
              newStatuses[provider.id] = await res.json();
            }
          } catch (error) {
            console.error(`Error fetching status for ${provider.name}:`, error);
          }
        }
      })
    );

    setProviderStatuses(prev => ({ ...prev, ...newStatuses }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.type || !formData.apiUrl) {
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.nameTypeUrlRequired') });
      return;
    }

    if ((formData.type === 'mpwa' || formData.type === 'gowa' || formData.type === 'kirimi') && !formData.apiKey) {
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.apiKeyRequiredFor').replace('{type}', formData.type.toUpperCase()) });
      return;
    }

    if (formData.type === 'kirimi' && !formData.senderNumber) {
      addToast({ type: 'error', title: 'Error!', description: 'Device ID wajib diisi untuk Kirimi.id' });
      return;
    }

    if (formData.type === 'mpwa' && !formData.senderNumber) {
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.senderNumberRequiredMpwa') });
      return;
    }

    try {
      const url = editingProvider
        ? `/api/whatsapp/providers/${editingProvider.id}`
        : '/api/whatsapp/providers';

      const res = await fetch(url, {
        method: editingProvider ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        addToast({ type: 'success', title: t('common.success'), description: t('whatsapp.providerSaved') });
        fetchProviders();
        resetForm();
      } else {
        const data = await res.json();
        addToast({ type: 'error', title: 'Error!', description: data.error || t('whatsapp.failedSaveProvider') });
      }
    } catch (error) {
      console.error('Error saving provider:', error);
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedSaveProvider') });
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/whatsapp/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (res.ok) {
        addToast({ type: 'success', title: t('common.success'), description: !currentStatus ? t('whatsapp.providerActivated') : t('whatsapp.providerDeactivated') });
        fetchProviders();
      } else {
        addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedToggleProvider') });
      }
    } catch (error) {
      console.error('Error toggling provider:', error);
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedToggleProvider') });
    }
  };

  const deleteProvider = async (id: string) => {
    if (!await confirm({
      title: t('whatsapp.deleteProvider'),
      message: t('whatsapp.deleteProviderConfirm'),
      confirmText: t('common.yesDelete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;

    try {
      const res = await fetch(`/api/whatsapp/providers/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        addToast({ type: 'success', title: t('common.deleted'), description: t('whatsapp.providerDeleted') });
        fetchProviders();
      } else {
        addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedDeleteProvider') });
      }
    } catch (error) {
      console.error('Error deleting provider:', error);
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.failedDeleteProvider') });
    }
  };

  const editProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey || '',
      senderNumber: provider.senderNumber || '',
      priority: provider.priority,
      description: provider.description || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'mpwa',
      apiUrl: '',
      apiKey: '',
      senderNumber: '',
      priority: 0,
      description: ''
    });
    setEditingProvider(null);
    setShowForm(false);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'mpwa': return 'bg-primary/20 text-primary dark:text-primary';
      case 'waha': return 'bg-accent/20 text-accent dark:bg-purple-900/30 dark:text-purple-400';
      case 'fonnte': return 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success';
      case 'wablas': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'gowa': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400';
      case 'wablast': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'kirimi': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-gray-100 text-foreground dark:bg-inputdark:text-muted-foreground';
    }
  };

  const restartSession = async (provider: Provider) => {
    if (!await confirm({
      title: t('whatsapp.restartSessionTitle', { name: provider.name }),
      message: `${t('whatsapp.restartInstructions')} ${t('whatsapp.restartDesc')}`,
      confirmText: t('whatsapp.yesRestart'),
      cancelText: t('common.cancel'),
      variant: 'warning',
    })) return;

    setRestartingProvider(provider.id);

    try {
      const res = await fetch(`/api/whatsapp/providers/${provider.id}/restart`, {
        method: 'POST'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to restart session');
      }

      addToast({ type: 'success', title: t('common.success'), description: t('whatsapp.sessionRestarted') });
      fetchAllStatuses();

      setTimeout(() => {
        showQrCode(provider);
      }, 1000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('whatsapp.failedRestartSession');
      addToast({ type: 'error', title: 'Error!', description: errorMessage });
    } finally {
      setRestartingProvider(null);
    }
  };

  const showQrCode = async (provider: Provider) => {
    setQrProvider(provider);
    setShowQrModal(true);
    setQrLoading(true);
    setQrImage(null);

    try {
      const url = `/api/whatsapp/providers/${provider.id}/qr`;
      const response = await fetch(url);

      if (response.ok) {
        if (provider.type === 'mpwa') {
          const data = await response.json();
          if (data.status === 'qrcode' && data.qrcode) {
            setQrImage(data.qrcode);
          } else {
            addToast({ type: 'info', title: 'Info', description: `${t('whatsapp.deviceStatusPrefix')}: ${data.message || data.status}` });
          }
        } else {
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);
          setQrImage(imageUrl);
        }
      } else if (response.status === 422) {
        const errorData = await response.json();
        addToast({ type: 'info', title: 'Info', description: errorData.error || t('whatsapp.deviceAlreadyConnected') });
        setShowQrModal(false);
        fetchAllStatuses();
      } else {
        const errorData = await response.json();
        addToast({ type: 'error', title: 'Error!', description: errorData.error || t('whatsapp.failedFetchQr') });
        setShowQrModal(false);
      }
    } catch (error) {
      console.error('Error fetching QR:', error);
      addToast({ type: 'error', title: 'Error!', description: t('whatsapp.errorFetchingQr') });
      setShowQrModal(false);
    } finally {
      setQrLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="w-12 h-12 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
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
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('whatsapp.providersTitle')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('whatsapp.providersSubtitle')}</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 self-start sm:self-auto"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('whatsapp.addProvider')}
            </button>
          </div>

          {/* Webhook URL Info */}
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground mb-1">Webhook URL (Incoming Messages)</p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Gunakan URL ini di dashboard provider WhatsApp Anda (Kirimi.id, Wablas, Fonnte, WAHA) untuk menerima pesan masuk.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-[10px] bg-muted text-foreground px-2 py-1.5 rounded break-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '/api/whatsapp/webhook'}
                  </code>
                  <button
                    onClick={copyWebhookUrl}
                    className="flex-shrink-0 h-7 px-2.5 bg-primary hover:bg-primary/90 text-white text-[10px] font-medium rounded flex items-center gap-1 transition-colors"
                  >
                    {copiedWebhook ? (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied!</>
                    ) : (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Provider Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={`bg-card rounded-lg border border-border p-3 space-y-2.5 ${!provider.isActive ? 'opacity-60' : ''}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{provider.name}</h3>
                    <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeColor(provider.type)}`}>
                        {provider.type.toUpperCase()}
                      </span>
                      {providerStatuses[provider.id] && (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${providerStatuses[provider.id].connected
                            ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success'
                            : 'bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive'
                          }`}>
                          {providerStatuses[provider.id].connected ? `● ${t('whatsapp.connected')}` : `○ ${t('whatsapp.disconnected')}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(provider.id, provider.isActive)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    title={provider.isActive ? t('whatsapp.deactivate') : t('whatsapp.activate')}
                  >
                    {provider.isActive ? (
                      <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Info */}
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-muted-foreground dark:text-muted-foreground">{t('whatsapp.baseUrl')}:</span>
                    <p className="font-mono text-[10px] text-foreground break-all">{provider.apiUrl}</p>
                  </div>
                  {provider.senderNumber && (
                    <div>
                      <span className="text-muted-foreground dark:text-muted-foreground">{t('whatsapp.senderNumber')}:</span>
                      <span className="font-mono text-[10px] text-foreground ml-1">{provider.senderNumber}</span>
                    </div>
                  )}
                  {providerStatuses[provider.id]?.phone && (
                    <div>
                      <span className="text-muted-foreground dark:text-muted-foreground">{t('whatsapp.connected')}:</span>
                      <span className="font-mono text-[10px] text-success dark:text-success ml-1">{providerStatuses[provider.id].phone}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground dark:text-muted-foreground">{t('whatsapp.priority')}:</span>
                    <span className="font-semibold text-foreground ml-1">{provider.priority}</span>
                  </div>
                  {provider.description && (
                    <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{provider.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex gap-1.5">
                    {(provider.type === 'waha' || provider.type === 'mpwa' || provider.type === 'gowa') && (
                      <button
                        onClick={() => showQrCode(provider)}
                        className="flex-1 h-7 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        {t('whatsapp.qrCode')}
                      </button>
                    )}
                    <button
                      onClick={() => editProvider(provider)}
                      className="flex-1 h-7 bg-muted hover:bg-muted/80 text-foreground dark:text-gray-200 text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      className="h-7 px-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-white text-[10px] font-medium rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {(provider.type === 'waha' || provider.type === 'gowa') && (
                    <button
                      onClick={() => restartSession(provider)}
                      disabled={restartingProvider === provider.id}
                      className="w-full h-7 bg-warning/100 hover:bg-warning text-white text-[10px] font-medium rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {restartingProvider === provider.id ? (
                        <>
                          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {t('whatsapp.restarting')}
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {t('whatsapp.restartSession')}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
          {providers.length === 0 && !showForm && (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-xs text-muted-foreground dark:text-muted-foreground mb-3">{t('whatsapp.noProviders')}</p>
              <button
                onClick={() => setShowForm(true)}
                className="h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('whatsapp.addFirstProvider')}
              </button>
            </div>
          )}
        </div>

        {/* Form Modal */}
        <SimpleModal isOpen={showForm} onClose={resetForm} size="lg">
          <ModalHeader>
            <ModalTitle>{editingProvider ? t('whatsapp.editProvider') : t('whatsapp.addProvider')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel required>{t('whatsapp.providerName')}</ModalLabel>
                  <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="MPWA Device 1" required />
                </div>
                <div>
                  <ModalLabel>{t('whatsapp.providerType')}</ModalLabel>
                  <ModalSelect value={formData.type} onChange={(e) => handleTypeChange(e.target.value)}>
                    <option value="mpwa" className="bg-[#0a0520]">MPWA</option>
                    <option value="waha" className="bg-[#0a0520]">WAHA</option>
                    <option value="gowa" className="bg-[#0a0520]">GOWA</option>
                    <option value="fonnte" className="bg-[#0a0520]">Fonnte</option>
                    <option value="wablas" className="bg-[#0a0520]">Wablas</option>
                    <option value="kirimi" className="bg-[#0a0520]">Kirimi.id</option>
                  </ModalSelect>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <ModalLabel required>{t('whatsapp.baseUrl')}</ModalLabel>
                    {DEFAULT_URLS[formData.type] && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, apiUrl: DEFAULT_URLS[formData.type] })}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                      >
                        ↺ reset default
                      </button>
                    )}
                  </div>
                  <ModalInput
                    type="text"
                    value={formData.apiUrl}
                    onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                    placeholder={DEFAULT_URLS[formData.type] || 'http://10.100.0.245:2451'}
                    required
                  />
                  {formData.type === 'wablas' && (
                    <div className="mt-1">
                      <p className="text-[9px] text-muted-foreground mb-1">Pilih server Wablas Anda:</p>
                      <div className="flex flex-wrap gap-1">
                        {WABLAS_SERVERS.map(srv => {
                          const url = `https://${srv}.wablas.com`;
                          const active = formData.apiUrl === url;
                          return (
                            <button
                              key={srv}
                              type="button"
                              onClick={() => setFormData({ ...formData, apiUrl: url })}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                active
                                  ? 'bg-primary text-background border-primary'
                                  : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                              }`}
                            >
                              {srv}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-muted-foreground/60 mt-0.5">Server sesuai akun Wablas Anda — lihat di dashboard Wablas</p>
                    </div>
                  )}
                  {formData.type !== 'wablas' && DEFAULT_URLS[formData.type] && formData.apiUrl === DEFAULT_URLS[formData.type] && (
                    <p className="text-[9px] text-primary/70 mt-0.5">✓ URL default {formData.type} — bisa diubah manual</p>
                  )}
                  {formData.type !== 'wablas' && DEFAULT_URLS[formData.type] && formData.apiUrl !== DEFAULT_URLS[formData.type] && formData.apiUrl && (
                    <p className="text-[9px] text-amber-500 mt-0.5">⚠ URL custom — berbeda dari default</p>
                  )}
                  {!DEFAULT_URLS[formData.type] && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">Self-hosted — isi URL server {formData.type.toUpperCase()} Anda</p>
                  )}
                </div>
                <div>
                  <ModalLabel required={(formData.type === 'mpwa' || formData.type === 'gowa' || formData.type === 'kirimi')}>{t('whatsapp.apiKey')}</ModalLabel>
                  <ModalInput type="text" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} placeholder={formData.type === 'gowa' ? 'username:password' : formData.type === 'kirimi' ? 'user_code:secret' : 'API Key or Token'} required={(formData.type === 'mpwa' || formData.type === 'gowa' || formData.type === 'kirimi')} />
                  {formData.type === 'gowa' && <p className="text-[9px] text-muted-foreground mt-0.5">Format: username:password</p>}
                  {formData.type === 'kirimi' && <p className="text-[9px] text-muted-foreground mt-0.5">Format: user_code:secret (dari dashboard kirimi.id)</p>}
                  {formData.type === 'wablas' && <p className="text-[9px] text-muted-foreground mt-0.5">Token dari menu Device → Settings. Opsional: token.secret_key</p>}
                </div>
              </div>
              {formData.type === 'mpwa' && (
                <div>
                  <ModalLabel required>{t('whatsapp.senderNumber')}</ModalLabel>
                  <ModalInput type="text" value={formData.senderNumber} onChange={(e) => setFormData({ ...formData, senderNumber: e.target.value })} placeholder="0816104997" required />
                </div>
              )}
              {formData.type === 'kirimi' && (
                <div>
                  <ModalLabel required>Device ID</ModalLabel>
                  <ModalInput type="text" value={formData.senderNumber} onChange={(e) => setFormData({ ...formData, senderNumber: e.target.value })} placeholder="device_id dari dashboard kirimi.id" required />
                </div>
              )}
              <div>
                <ModalLabel>{t('whatsapp.priority')} (0=Primary)</ModalLabel>
                <ModalInput type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })} min={0} required />
              </div>
              <div>
                <ModalLabel>{t('whatsapp.description')}</ModalLabel>
                <ModalTextarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} placeholder={t('whatsapp.additionalNotes')} />
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={resetForm}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingProvider ? t('common.update') : t('common.save')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* QR Modal */}
        <SimpleModal isOpen={showQrModal} onClose={() => setShowQrModal(false)} size="sm">
          <ModalHeader>
            <ModalTitle>{t('whatsapp.qrCode')} - {qrProvider?.name}</ModalTitle>
          </ModalHeader>
          <ModalBody className="flex flex-col items-center justify-center space-y-4">
            {qrLoading ? (
              <div className="flex flex-col items-center space-y-2 py-8">
                <div className="w-10 h-10 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]" />
                <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
              </div>
            ) : qrImage ? (
              <>
                <div className="p-3 bg-white rounded-lg shadow-[0_0_20px_rgba(0,247,255,0.3)]">
                  <img src={qrImage} alt="QR Code" className="w-48 h-48" />
                </div>
                <p className="text-[10px] text-muted-foreground text-center">{t('whatsapp.scanWhatsapp')}</p>
                <ModalButton variant="primary" onClick={() => showQrCode(qrProvider!)}>{t('whatsapp.refreshQr')}</ModalButton>
              </>
            ) : (
              <p className="text-xs text-[#ff6b8a] py-4">{t('whatsapp.failedLoadQr')}</p>
            )}
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setShowQrModal(false)}>{t('common.close')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  );
}
