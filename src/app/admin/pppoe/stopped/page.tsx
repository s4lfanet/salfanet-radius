'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { useState, useEffect } from 'react';
import {
  Users, Trash2, Download, Search, RefreshCcw, Plus, Shield, FileText,
} from 'lucide-react';
import { formatWIB } from '@/lib/timezone';

interface StoppedUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  expiredAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  note: string | null;
  profile: { id: string; name: string; groupName: string };
  router?: { id: string; name: string; nasname: string; ipAddress: string } | null;
  area?: { id: string; name: string } | null;
}

export default function StoppedSubscriptionsPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<StoppedUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/pppoe/users?status=stop');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set('status', 'stop');
      params.set('format', 'excel');
      
      const res = await fetch(`/api/pppoe/users/export?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `berhenti-langganan-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        await showSuccess(t('common.success'));
      } else {
        await showError(t('common.failed'));
      }
    } catch (error) {
      console.error('Export error:', error);
      await showError(t('common.failed'));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) {
      await showError(t('common.selectCustomersToDelete'));
      return;
    }
    const confirmed = await showConfirm(t('common.deleteCustomersConfirm').replace('{count}', selectedUsers.size.toString()));
    if (!confirmed) return;

    try {
      const res = await fetch('/api/pppoe/users/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
      });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(`${result.deleted || selectedUsers.size} ${t('pppoe.customer')} ${t('common.delete').toLowerCase()}`);
        setSelectedUsers(new Set());
        loadData();
      } else {
        await showError(result.error || t('common.failedDelete'));
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      await showError(t('common.failedDelete'));
    }
  };

  const handleReactivate = async (userId: string) => {
    const confirmed = await showConfirm(t('common.reactivateConfirm'));
    if (!confirmed) return;

    try {
      const res = await fetch('/api/pppoe/users/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'active' }),
      });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(t('common.customerReactivated'));
        loadData();
      } else {
        await showError(result.error || t('common.failedActivate'));
      }
    } catch (error) {
      console.error('Reactivate error:', error);
      await showError(t('common.failedActivate'));
    }
  };

  const handleDelete = async (userId: string) => {
    const confirmed = await showConfirm(t('common.deleteConfirmPermanent'));
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/pppoe/users?id=${userId}`, { method: 'DELETE' });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(t('common.customerDeleted'));
        loadData();
      } else {
        await showError(result.error || t('common.failedDelete'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      await showError(t('common.failedDelete'));
    }
  };

  const toggleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchSearch = !searchQuery ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.phone.includes(searchQuery) ||
      user.profile.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  // Stats
  const totalStopped = users.length;

  if (permLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (!hasPermission('customers.view')) return <div className="flex items-center justify-center h-screen text-destructive">{t('pppoe.accessDenied')}</div>;

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-[#00f7ff]" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('pppoe.stoppedSubscriptions')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pppoe.stoppedSubscriptionsDesc')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadData} disabled={loading} className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded flex items-center gap-1.5">
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Stats Card */}
      <div className="flex justify-end">
        <div className="bg-muted rounded-lg px-6 py-4 text-right">
          <div className="text-3xl font-bold text-destructive">{totalStopped}</div>
          <div className="text-[10px] text-muted-foreground mt-1">— {t('pppoe.totalData')}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button 
          onClick={handleExport} 
          className="px-3 py-1.5 text-xs bg-accent hover:bg-accent/90 text-black font-bold rounded-lg flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,247,255,0.3)] hover:shadow-[0_0_20px_rgba(0,247,255,0.5)] transition-all border border-accent/50"
        >
          <FileText className="h-3 w-3" />
          {t('pppoe.export')}
        </button>
        <button 
          onClick={handleBulkDelete} 
          disabled={selectedUsers.size === 0} 
          className="px-3 py-1.5 text-xs bg-destructive hover:bg-destructive/90 text-white font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,51,102,0.3)] hover:shadow-[0_0_20px_rgba(255,51,102,0.5)] transition-all border border-destructive/50 disabled:shadow-none"
        >
          <Trash2 className="h-3 w-3" />
          {t('pppoe.delete')}
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-muted border border-border rounded-lg p-3">
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>{t('pppoe.stoppedInfo1')}</li>
          <li>{t('pppoe.stoppedInfo2')}</li>
        </ul>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {/* Table Header Controls */}
        <div className="px-3 py-2 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs">{t('pppoe.show')}</span>
            <select 
              value={pageSize} 
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1 text-xs border border-border rounded bg-card"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-xs">{t('pppoe.entries')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">{t('common.search')}</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="px-2 py-1 text-xs border border-border rounded bg-card w-48"
              placeholder={t('common.search')}
            />
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3 p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-xs">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              {t('pppoe.loadingData')}
            </div>
          ) : paginatedUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              {users.length === 0 ? t('pppoe.noStoppedCustomers') : t('pppoe.noMatchingData')}
            </div>
          ) : (
            paginatedUsers.map((user) => (
              <div key={user.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      className="rounded border-border w-3.5 h-3.5 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{user.username}</p>
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full ml-2 shrink-0 bg-destructive/20 text-destructive">
                    Stopped
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                  <div><span className="text-muted-foreground">{t('pppoe.profile')}:</span> <span className="text-foreground">{user.profile.name}</span></div>
                  <div><span className="text-muted-foreground">{t('nav.areas')}:</span> <span className="text-foreground">{user.area?.name || '-'}</span></div>
                  <div><span className="text-muted-foreground">{t('pppoe.phoneNumber')}:</span> <span className="text-foreground">{user.phone}</span></div>
                  {user.email && <div className="truncate"><span className="text-muted-foreground">Email:</span> <span className="text-foreground">{user.email}</span></div>}
                  <div><span className="text-muted-foreground">{t('pppoe.registrationDate')}:</span> <span className="text-foreground text-[10px]">{user.createdAt ? formatWIB(user.createdAt, 'dd/MM/yyyy') : '-'}</span></div>
                  <div><span className="text-muted-foreground">{t('pppoe.stopDate')}:</span> <span className="text-foreground text-[10px]">{user.stoppedAt ? formatWIB(user.stoppedAt, 'dd/MM/yyyy') : user.expiredAt ? formatWIB(user.expiredAt, 'dd/MM/yyyy') : '-'}</span></div>
                  {user.note && <div className="col-span-2 truncate"><span className="text-muted-foreground">{t('pppoe.note')}:</span> <span className="text-foreground">{user.note}</span></div>}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => handleReactivate(user.id)}
                    className="p-2 text-success hover:bg-success/20 rounded border border-transparent hover:border-success/40 transition-all"
                    title={t('pppoe.reactivate')}
                  >
                    <Shield className="h-4 w-4 drop-shadow-[0_0_3px_rgba(0,255,136,0.5)]" />
                  </button>
                  <button
                    onClick={() => handleDelete(user.id)}
                    className="p-2 text-destructive hover:bg-destructive/20 rounded border border-transparent hover:border-destructive/40 transition-all"
                    title={t('pppoe.permanentDelete')}
                  >
                    <Trash2 className="h-4 w-4 drop-shadow-[0_0_3px_rgba(255,51,102,0.5)]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-2 py-2 text-center w-8">
                  <input 
                    type="checkbox" 
                    checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} 
                    onChange={toggleSelectAll} 
                    className="rounded border-border w-3 h-3" 
                  />
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.serviceNo')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.customer')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.profile')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('nav.areas')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('pppoe.phoneNumber')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('pppoe.registrationDate')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('pppoe.stopDate')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden xl:table-cell">{t('pppoe.note')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      {t('pppoe.loadingData')}
                    </div>
                  </td>
                </tr>
              ) : paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    {users.length === 0 ? t('pppoe.noStoppedCustomers') : t('pppoe.noMatchingData')}
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user, index) => (
                  <tr key={user.id} className="hover:bg-muted">
                    <td className="px-2 py-2 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedUsers.has(user.id)} 
                        onChange={() => toggleSelectUser(user.id)} 
                        className="rounded border-border w-3 h-3" 
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-xs">{user.username}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs font-medium">{user.name}</p>
                      {user.email && <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{user.email}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium">{user.profile.name}</span>
                      <br/>
                      <span className="text-[10px] text-muted-foreground font-mono">{user.profile.groupName}</span>
                    </td>
                    <td className="px-3 py-2 text-xs hidden md:table-cell">{user.area?.name || '-'}</td>
                    <td className="px-3 py-2 text-xs hidden md:table-cell">{user.phone}</td>
                    <td className="px-3 py-2 text-xs hidden lg:table-cell">
                      {user.createdAt ? formatWIB(user.createdAt, 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs hidden lg:table-cell">
                      {user.stoppedAt ? formatWIB(user.stoppedAt, 'dd/MM/yyyy') : 
                       user.expiredAt ? formatWIB(user.expiredAt, 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs hidden xl:table-cell">
                      <span className="text-muted-foreground truncate max-w-[100px] block">
                        {user.note || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleReactivate(user.id)} 
                          className="p-1 text-success hover:bg-success/20 rounded border border-transparent hover:border-success/40 transition-all"
                          title={t('pppoe.reactivate')}
                        >
                          <Shield className="h-3 w-3 drop-shadow-[0_0_3px_rgba(0,255,136,0.5)]" />
                        </button>
                        <button 
                          onClick={() => handleDelete(user.id)} 
                          className="p-1 text-destructive hover:bg-destructive/20 rounded border border-transparent hover:border-destructive/40 transition-all"
                          title={t('pppoe.permanentDelete')}
                        >
                          <Trash2 className="h-3 w-3 drop-shadow-[0_0_3px_rgba(255,51,102,0.5)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-3 py-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {t('pppoe.showing')} {filteredUsers.length === 0 ? 0 : startIndex + 1} {t('common.to')} {Math.min(startIndex + pageSize, filteredUsers.length)} {t('pppoe.of')} {filteredUsers.length} {t('pppoe.entries')}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-xs border border-border rounded disabled:opacity-50 hover:bg-muted"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-xs border border-border rounded disabled:opacity-50 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}








