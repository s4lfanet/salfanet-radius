'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { useState } from 'react';
import {
  Users, Trash2, Download, Search, RefreshCcw, Plus, Shield, FileText,
} from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { pppoeApi } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';

interface StoppedUser {
  id: string;
  username: string;
  customerId: string | null;
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
  const queryClient = useQueryClient();
  const usersQueryKey = buildQueryKey('/api/pppoe/users', { status: 'stop' });
  const { data: usersData, isLoading: loading, refetch } = useApiQuery<{ users: StoppedUser[] }>('/api/pppoe/users', {
    params: { status: 'stop' },
  });
  const users = usersData?.users || [];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    try {
      const blob = await pppoeApi.exportUsers({ status: 'stop', format: 'excel' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `berhenti-langganan-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      await showSuccess(t('common.success'));
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

    // TRUE optimistic update: remove from list BEFORE API call
    const deletedIds = new Set(Array.from(selectedUsers));
    const usersToRestore = users.filter(u => deletedIds.has(u.id));
    queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
      users: (old?.users || []).filter(u => !deletedIds.has(u.id)),
    }));
    setSelectedUsers(new Set());

    try {
      const result = await pppoeApi.bulkDelete(Array.from(deletedIds));
      await showSuccess(`${result.deleted || deletedIds.size} ${t('pppoe.customer')} ${t('common.delete').toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
    } catch (error: unknown) {
      // Rollback if API failed
      queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
        users: [...(old?.users || []), ...usersToRestore],
      }));
      console.error('Bulk delete error:', error);
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedDelete'));
    }
  };

  const handleReactivate = async (userId: string) => {
    const confirmed = await showConfirm(t('common.reactivateConfirm'));
    if (!confirmed) return;

    // TRUE optimistic update: remove from list BEFORE API call
    // Save reference for rollback if API fails
    const userToRestore = users.find(u => u.id === userId);
    queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
      users: (old?.users || []).filter(u => u.id !== userId),
    }));
    setSelectedUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });

    try {
      await pppoeApi.updateStatus(userId, 'active');
      await showSuccess(t('common.customerReactivated'));
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
    } catch (error: unknown) {
      // Rollback: add user back to list if API failed
      if (userToRestore) {
        queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
          users: [...(old?.users || []), userToRestore],
        }));
      }
      console.error('Reactivate error:', error);
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedActivate'));
    }
  };

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId);
    setDeletePassword('');
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    if (!deletePassword.trim()) { await showError('Masukkan password superadmin untuk konfirmasi hapus pelanggan.'); return; }
    const userId = deleteUserId;
    setDeleting(true);

    // TRUE optimistic update: remove from list BEFORE API call
    const userToRestore = users.find(u => u.id === userId);
    queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
      users: (old?.users || []).filter(u => u.id !== userId),
    }));
    setSelectedUsers(prev => { const n = new Set(prev); n.delete(userId); return n; });

    try {
      await pppoeApi.deleteUser(userId, deletePassword);
      await showSuccess(t('common.customerDeleted'));
      queryClient.invalidateQueries({ queryKey: usersQueryKey });
    } catch (error: unknown) {
      // Rollback if API failed
      if (userToRestore) {
        queryClient.setQueryData<{ users: StoppedUser[] }>(usersQueryKey, (old) => ({
          users: [...(old?.users || []), userToRestore],
        }));
      }
      console.error('Delete error:', error);
      await showError(error instanceof Error ? error.message : String(error) || t('common.failedDelete'));
    } finally {
      setDeleting(false);
      setDeleteUserId(null);
      setDeletePassword('');
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
      (user.customerId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
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
          <button onClick={() => refetch()} disabled={loading} className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded flex items-center gap-1.5">
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
                      <p className="text-xs text-muted-foreground font-mono">{user.customerId || '-'} · {user.username}</p>
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
                    onClick={() => handleDeleteClick(user.id)}
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
                      <p className="font-medium text-xs font-mono">{user.customerId || '-'}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs font-medium">{user.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{user.username}</p>
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
                          onClick={() => handleDeleteClick(user.id)} 
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

      {/* Delete Password Confirmation Modal */}
      {deleteUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setDeleteUserId(null); setDeletePassword(''); }}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-destructive/50">
                <Trash2 className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-base font-bold text-foreground mb-2">{t('pppoe.deleteUser')}</h2>
              <p className="text-xs text-muted-foreground">{t('pppoe.deleteConfirm')}</p>
            </div>
            <div className="text-left mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                🔒 Password Superadmin
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Masukkan password superadmin"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded focus:ring-2 focus:ring-destructive/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !deleting && deletePassword.trim()) handleDelete(); }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Demi keamanan, masukkan password superadmin untuk mengonfirmasi penghapusan pelanggan.
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => { setDeleteUserId(null); setDeletePassword(''); }}
                className="px-4 py-2 text-xs border border-border rounded hover:bg-muted"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deletePassword.trim()}
                className="px-4 py-2 text-xs bg-destructive text-white rounded hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? 'Menghapus...' : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}








