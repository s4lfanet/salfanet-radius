'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface User {
  id: string;
  name: string;
  username: string;
  phone: string;
  address: string;
  status: string;
  profile?: { name: string };
  router?: { name: string };
  odpAssignment?: {
    odp: {
      id: string;
      name: string;
    };
  } | null;
}

export default function SendMessagePage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [activeTab, setActiveTab] = useState<'single' | 'broadcast'>('single');
  
  // Single message states
  const [phoneNumber, setPhoneNumber] = useState('');
  const [singleMessage, setSingleMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; provider?: string; error?: string } | null>(null);

  // Broadcast states
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ total: number; successCount: number; failCount: number } | null>(null);

  // Filter states
  const [filters, setFilters] = useState<{
    profiles: { id: string; name: string }[];
    routers: { id: string; name: string }[];
    statuses: string[];
    odps: { id: string; name: string }[];
  }>({ profiles: [], routers: [], statuses: [], odps: [] });
  const [statusFilter, setStatusFilter] = useState('');
  const [profileFilter, setProfileFilter] = useState('');
  const [routerFilter, setRouterFilter] = useState('');
  const [addressFilter, setAddressFilter] = useState('');
  const [odpFilters, setOdpFilters] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Template states
  const [templates, setTemplates] = useState<{ id: string; name: string; message: string }[]>([]);

  useEffect(() => {
    loadUsers();
    loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, profileFilter, routerFilter, addressFilter, odpFilters]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (profileFilter) params.append('profileId', profileFilter);
      if (routerFilter) params.append('routerId', routerFilter);
      if (addressFilter) params.append('address', addressFilter);
      if (odpFilters.length > 0) params.append('odpIds', odpFilters.join(','));

      const res = await fetch(`/api/users/list?${params}`);
      const data = await res.json();

      if (data.success) {
        setUsers(data.users);
        setFilters(data.filters);
      }
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/whatsapp/templates');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Load templates error:', error);
    }
  };

  const loadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setBroadcastMessage(template.message);
      addToast({ type: 'success', title: t('whatsapp.templateLoaded'), description: `${template.name} loaded.`, duration: 2000 });
    }
  };

  const handleSingleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber || !singleMessage) {
      addToast({ type: 'error', title: t('common.error'), description: t('whatsapp.phoneAndMessageRequired') });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, message: singleMessage }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('whatsapp.messageSentVia').replace('{provider}', data.provider) });
        setResult({ success: true, provider: data.provider });
        setSingleMessage('');
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || t('whatsapp.failedSendMessage') });
        setResult({ success: false, error: data.error });
      }
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: t('whatsapp.failedSendMessage') });
      setResult({ success: false, error: 'Network error' });
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (selectedUsers.size === 0) {
      addToast({ type: 'error', title: t('common.error'), description: t('whatsapp.selectAtLeastOneUser') });
      return;
    }

    if (!broadcastMessage) {
      addToast({ type: 'error', title: t('common.error'), description: t('whatsapp.messageRequired') });
      return;
    }

    console.log('[Frontend] Broadcast message template:', broadcastMessage.substring(0, 200));
    console.log('[Frontend] Selected users:', Array.from(selectedUsers));

    if (!await confirm({
      title: t('whatsapp.confirmBroadcast'),
      message: `${t('whatsapp.sendMessageTo')} ${selectedUsers.size} ${t('whatsapp.users')}?`,
      confirmText: t('whatsapp.yesSend'),
      cancelText: t('common.cancel'),
      variant: 'info',
    })) return;

    setBroadcasting(true);
    setBroadcastResult(null);

    try {
      const payload = {
        userIds: Array.from(selectedUsers),
        message: broadcastMessage,
        delay: 2000,
      };
      
      console.log('[Frontend] Sending payload:', payload);

      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log('[Frontend] Broadcast response:', data);

      if (data.success) {
        addToast({ type: 'success', title: t('whatsapp.broadcastComplete'), description: `✅ ${t('whatsapp.success')}: ${data.successCount} | ❌ ${t('whatsapp.failed')}: ${data.failCount}` });
        setBroadcastResult(data);
        setSelectedUsers(new Set());
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || t('whatsapp.broadcastFailed') });
      }
    } catch (error) {
      console.error('[Frontend] Broadcast error:', error);
      addToast({ type: 'error', title: t('common.error'), description: t('whatsapp.failedSendBroadcast') });
    } finally {
      setBroadcasting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map((u) => u.id)));
    }
  };

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleOdpFilter = (odpId: string) => {
    setOdpFilters((prev) => prev.includes(odpId) ? prev.filter((id) => id !== odpId) : [...prev, odpId]);
  };

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="max-w-7xl mx-auto space-y-3">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('whatsapp.sendTitle')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('whatsapp.sendSubtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="bg-card rounded-lg border border-border p-1 inline-flex gap-1">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'single' ? 'bg-teal-600 text-white' : 'text-muted-foreground dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {t('whatsapp.singleMessage')}
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'broadcast' ? 'bg-teal-600 text-white' : 'text-muted-foreground dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('whatsapp.broadcast')}
          </button>
        </div>

        {/* Single Message Tab */}
        {activeTab === 'single' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-card rounded-lg border border-border">
              <div className="px-3 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.sendMessage')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.messageViaSent')}</p>
              </div>
              <form onSubmit={handleSingleSend} className="p-3 space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">{t('whatsapp.phoneNumber')}</label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="628123456789"
                    className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">{t('whatsapp.message')}</label>
                  <textarea
                    value={singleMessage}
                    onChange={(e) => setSingleMessage(e.target.value)}
                    placeholder={t('whatsapp.typeMessage')}
                    rows={6}
                    className="w-full px-2.5 py-2 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground resize-none"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">{singleMessage.length} {t('whatsapp.characters')}</p>
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('whatsapp.sending')}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      {t('whatsapp.sendMessage')}
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="bg-card rounded-lg border border-border">
              <div className="px-3 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.result')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.sendStatus')}</p>
              </div>
              <div className="p-3 flex items-center justify-center min-h-[200px]">
                {!result ? (
                  <div className="text-center text-muted-foreground">
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <p className="text-xs">{t('whatsapp.sendToSeeResult')}</p>
                  </div>
                ) : result.success ? (
                  <div className="flex items-center gap-3 text-success">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold">{t('whatsapp.messageSent')}</p>
                      <p className="text-xs">{t('whatsapp.via')} {result.provider}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-destructive">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold">{t('whatsapp.failed')}</p>
                      <p className="text-xs">{result.error}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Broadcast Tab */}
        {activeTab === 'broadcast' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="bg-card rounded-lg border border-border">
              <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.filterUsers')}</h3>
                  <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{t('whatsapp.selectForBroadcast')}</p>
                </div>
                <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-medium rounded">
                  {selectedUsers.size} / {users.length} {t('whatsapp.selected')}
                </span>
              </div>
              <div className="p-3 space-y-3">
                {/* Network Location Filter */}
                <div className="p-2.5 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="w-3.5 h-3.5 text-primary dark:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[10px] font-semibold text-blue-900 dark:text-blue-100">{t('whatsapp.filterByNetwork')}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[10px] font-medium text-muted-foreground dark:text-muted-foreground">{t('whatsapp.odpLocation')}</label>
                      {odpFilters.length > 0 && (
                        <button onClick={() => setOdpFilters([])} className="text-[9px] text-primary hover:underline">
                          {t('common.clear')} ({odpFilters.length})
                        </button>
                      )}
                    </div>
                    <div className="bg-card border border-border rounded p-1.5 max-h-24 overflow-y-auto">
                      {filters.odps.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground text-center py-1">
                          {t('whatsapp.noOdps')}
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          {filters.odps.map((odp) => (
                            <label key={odp.id} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-0.5">
                              <input
                                type="checkbox"
                                checked={odpFilters.includes(odp.id)}
                                onChange={() => toggleOdpFilter(odp.id)}
                                className="w-3 h-3 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-[10px] text-foreground">{odp.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Other Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground mb-0.5">{t('common.status')}</label>
                    <select
                      value={statusFilter || 'all'}
                      onChange={(e) => setStatusFilter(e.target.value === 'all' ? '' : e.target.value)}
                      className="w-full h-7 px-2 text-[10px] bg-card border border-border rounded focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                    >
                      <option value="all">{t('whatsapp.allStatus')}</option>
                      {filters.statuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground mb-0.5">{t('whatsapp.profileFilter')}</label>
                    <select
                      value={profileFilter || 'all'}
                      onChange={(e) => setProfileFilter(e.target.value === 'all' ? '' : e.target.value)}
                      className="w-full h-7 px-2 text-[10px] bg-card border border-border rounded focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                    >
                      <option value="all">{t('whatsapp.allProfiles')}</option>
                      {filters.profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground mb-0.5">{t('whatsapp.routerFilter')}</label>
                    <select
                      value={routerFilter || 'all'}
                      onChange={(e) => setRouterFilter(e.target.value === 'all' ? '' : e.target.value)}
                      className="w-full h-7 px-2 text-[10px] bg-card border border-border rounded focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                    >
                      <option value="all">{t('whatsapp.allRouters')}</option>
                      {filters.routers.map((router) => (
                        <option key={router.id} value={router.id}>{router.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground mb-0.5">{t('whatsapp.addressFilter')}</label>
                    <input
                      type="text"
                      placeholder={t('whatsapp.searchAddress')}
                      value={addressFilter}
                      onChange={(e) => setAddressFilter(e.target.value)}
                      className="w-full h-7 px-2 text-[10px] bg-card border border-border rounded focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                    />
                  </div>
                </div>

                {/* Users Table */}
                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-2 p-3 max-h-64 overflow-y-auto">
                      {users.length === 0 ? (
                        <div className="text-center py-6 text-[10px] text-muted-foreground">{t('whatsapp.noUsersFound')}</div>
                      ) : (
                        users.map((user) => (
                          <div key={user.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => toggleUser(user.id)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-xs font-medium text-foreground flex-1">{user.name}</span>
                              <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-medium rounded ${
                                user.status === 'active' ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success' : 'bg-gray-100 text-muted-foreground dark:bg-gray-800 dark:text-muted-foreground'
                              }`}>
                                {user.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <div>
                                <span className="text-muted-foreground">{t('common.phone')}</span>
                                <p className="font-mono text-muted-foreground">{user.phone || '-'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t('common.profile')}</span>
                                <p className="text-muted-foreground">{user.profile?.name || '-'}</p>
                              </div>
                              {user.odpAssignment && (
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">ODP</span>
                                  <p className="text-muted-foreground">{user.odpAssignment.odp.name}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop Table */}
                    <div className="overflow-x-auto max-h-64 hidden md:block">
                      <table className="w-full">
                        <thead className="sticky top-0">
                          <tr className="bg-muted border-b border-border">
                            <th className="px-2 py-1.5 text-left">
                              <input
                                type="checkbox"
                                checked={selectedUsers.size === users.length && users.length > 0}
                                onChange={toggleSelectAll}
                                className="w-3 h-3 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                            </th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase">{t('common.name')}</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase hidden sm:table-cell">{t('common.username')}</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase">{t('common.phone')}</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase hidden md:table-cell">{t('common.profile')}</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase hidden lg:table-cell">ODP</th>
                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase">{t('common.status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {users.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-2 py-6 text-center text-[10px] text-muted-foreground">{t('whatsapp.noUsersFound')}</td>
                            </tr>
                          ) : (
                            users.map((user) => (
                              <tr key={user.id} className="hover:bg-muted/50/50">
                                <td className="px-2 py-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedUsers.has(user.id)}
                                    onChange={() => toggleUser(user.id)}
                                    className="w-3 h-3 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                </td>
                                <td className="px-2 py-1 text-[10px] font-medium text-foreground">{user.name}</td>
                                <td className="px-2 py-1 text-[10px] text-muted-foreground dark:text-muted-foreground hidden sm:table-cell">{user.username}</td>
                                <td className="px-2 py-1 text-[10px] text-muted-foreground dark:text-muted-foreground font-mono">{user.phone || '-'}</td>
                                <td className="px-2 py-1 text-[10px] text-muted-foreground dark:text-muted-foreground hidden md:table-cell">{user.profile?.name || '-'}</td>
                                <td className="px-2 py-1 hidden lg:table-cell">
                                  {user.odpAssignment ? (
                                    <span className="text-[9px] text-muted-foreground dark:text-muted-foreground">
                                      {user.odpAssignment.odp.name}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="px-2 py-1">
                                  <span className={`inline-flex px-1 py-0.5 text-[9px] font-medium rounded ${
                                    user.status === 'active' ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success' : 'bg-gray-100 text-muted-foreground dark:bg-inputdark:text-muted-foreground'
                                  }`}>
                                    {user.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Broadcast Message */}
            <div className="bg-card rounded-lg border border-border">
              <div className="px-3 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">{t('whatsapp.broadcastMessage')}</h3>
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground mt-0.5">
                  Variabel yang tersedia untuk broadcast:
                </p>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground dark:text-muted-foreground">
                  <div><code className="bg-muted px-1 rounded">{'{{customerName}}'}</code> atau <code className="bg-muted px-1 rounded">{'{{name}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{username}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{profileName}}'}</code> atau <code className="bg-muted px-1 rounded">{'{{paket}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{price}}'}</code> atau <code className="bg-muted px-1 rounded">{'{{harga}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{phone}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{email}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{address}}'}</code> atau <code className="bg-muted px-1 rounded">{'{{alamat}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{companyName}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{companyPhone}}'}</code></div>
                  <div><code className="bg-muted px-1 rounded">{'{{companyAddress}}'}</code></div>
                </div>
                <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-[9px] text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">⚠️ Catatan Penting:</p>
                  <p>Variabel invoice seperti <code className="bg-warning/20 dark:bg-yellow-800 px-1 rounded">{'{{invoiceNumber}}'}</code>, <code className="bg-warning/20 dark:bg-yellow-800 px-1 rounded">{'{{amount}}'}</code>, <code className="bg-warning/20 dark:bg-yellow-800 px-1 rounded">{'{{dueDate}}'}</code>, <code className="bg-warning/20 dark:bg-yellow-800 px-1 rounded">{'{{paymentLink}}'}</code> TIDAK tersedia di broadcast manual.</p>
                  <p className="mt-1">Untuk mengirim pesan invoice, gunakan fitur <strong>WhatsApp Notifications</strong> yang otomatis mengirim saat invoice dibuat.</p>
                </div>
              </div>
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground dark:text-muted-foreground uppercase tracking-wider mb-1">{t('whatsapp.loadFromTemplate')}</label>
                  <select
                    onChange={(e) => e.target.value && loadTemplate(e.target.value)}
                    className="w-full h-7 px-2 text-[10px] bg-card border border-border rounded focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground"
                  >
                    <option value="">{t('whatsapp.selectTemplate')}</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder={t('whatsapp.typeBroadcast')}
                  rows={6}
                  className="w-full px-2.5 py-2 text-xs bg-card border border-border rounded-md focus:ring-1 focus:ring-primary focus:border-teal-500 text-foreground resize-none"
                />
                <p className="text-[10px] text-muted-foreground dark:text-muted-foreground">{broadcastMessage.length} {t('whatsapp.characters')}</p>

                <button
                  onClick={handleBroadcast}
                  disabled={broadcasting || selectedUsers.size === 0}
                  className="w-full h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {broadcasting ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('whatsapp.sendingTo', { count: selectedUsers.size })}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      {t('whatsapp.sendBroadcastTo', { count: selectedUsers.size })}
                    </>
                  )}
                </button>

                {broadcastResult && (
                  <div className="p-2.5 bg-primary/10 rounded-lg border border-primary/30">
                    <p className="text-[10px] font-medium text-blue-900 dark:text-blue-100 mb-1.5">{t('whatsapp.broadcastSummary')}:</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">{broadcastResult.total}</p>
                        <p className="text-[9px] text-muted-foreground">{t('common.total')}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-success">{broadcastResult.successCount}</p>
                        <p className="text-[9px] text-muted-foreground">{t('whatsapp.success')}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-destructive">{broadcastResult.failCount}</p>
                        <p className="text-[9px] text-muted-foreground">{t('whatsapp.failed')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      </div>
  );
}
