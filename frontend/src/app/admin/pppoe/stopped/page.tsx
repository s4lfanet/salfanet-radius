'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { useEffect, useMemo, useState } from 'react';
import {
  UserX, Trash2, RefreshCw, Search, Download, AlertTriangle, ChevronDown, ChevronUp, X, Power,
} from 'lucide-react';
import { Pagination } from '@/components/Pagination';
import { formatWIB } from '@/lib/timezone';
import { pppoeApi } from '@/lib/api';
import { apiAdmin } from '@/lib/api/client';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';

interface StoppedUser {
  id: string;
  username: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  expiredAt: string | null;
  updatedAt: string;
  createdAt: string;
  note: string | null;
  subscriptionType?: string;
  profile: { id: string; name: string; groupName: string };
  area?: { id: string; name: string } | null;
}

interface RepairCandidate {
  id: string;
  username: string;
  name: string;
  customerId: string | null;
  subscriptionType: string;
  expiredAt: string | null;
  stoppedAt: string;
  reasons: string[];
  manualStop: boolean;
}

const LIST_PARAMS = { status: 'stop', limit: 500, sortBy: 'updatedAt', sortOrder: 'desc' };

/** Days since the record last changed — the stop date, as there is no stoppedAt column. */
function daysSince(date: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

function stoppedFor(date: string): string {
  const d = daysSince(date);
  if (d === 0) return 'Hari ini';
  if (d < 30) return `${d} hari`;
  if (d < 365) return `${Math.floor(d / 30)} bulan`;
  return `${Math.floor(d / 365)} tahun`;
}

export default function StoppedSubscriptionsPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const usersQueryKey = buildQueryKey('/api/pppoe/users', LIST_PARAMS);
  const { data: usersData, isLoading: loading, isFetching } = useApiQuery<{ users: StoppedUser[]; total: number }>(
    '/api/pppoe/users',
    { params: LIST_PARAMS },
  );
  const users = useMemo(() => usersData?.users ?? [], [usersData]);
  const canEdit = hasPermission('customers.edit');

  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [repairList, setRepairList] = useState<RepairCandidate[]>([]);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairSelected, setRepairSelected] = useState<Set<string>>(new Set());
  const [repairBusy, setRepairBusy] = useState(false);

  // Customers the old Auto Stop job may have stopped by mistake. Checked on
  // load so the admin sees it without having to know a button exists.
  const loadRepairCandidates = async () => {
    try {
      const res = await apiAdmin<{ success: boolean; data: RepairCandidate[] }>('/api/admin/pppoe/repair-auto-stop');
      const list = res.data ?? [];
      setRepairList(list);
      setRepairSelected(new Set(list.filter((c) => !c.manualStop).map((c) => c.id)));
    } catch (error: unknown) {
      console.error('Repair candidates error:', error);
    }
  };

  useEffect(() => {
    if (!permLoading && canEdit) loadRepairCandidates();
  }, [permLoading, canEdit]);

  const removeFromList = (ids: Set<string>) => {
    queryClient.setQueryData<{ users: StoppedUser[]; total: number }>(usersQueryKey, (old) => ({
      users: (old?.users ?? []).filter((u) => !ids.has(u.id)),
      total: Math.max(0, (old?.total ?? 0) - ids.size),
    }));
    setSelected((prev) => new Set(Array.from(prev).filter((id) => !ids.has(id))));
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: usersQueryKey });
    if (canEdit) loadRepairCandidates();
  };

  const applyRepair = async () => {
    if (repairSelected.size === 0) return;
    const confirmed = await showConfirm(`Aktifkan kembali ${repairSelected.size} pelanggan?`);
    if (!confirmed) return;
    setRepairBusy(true);
    try {
      const res = await apiAdmin<{ success: boolean; restored: number }>('/api/admin/pppoe/repair-auto-stop', {
        method: 'POST',
        body: JSON.stringify({ userIds: Array.from(repairSelected) }),
      });
      await showSuccess(`${res.restored} pelanggan diaktifkan kembali`);
      setRepairOpen(false);
      refreshAll();
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedActivate'));
    } finally {
      setRepairBusy(false);
    }
  };

  const handleReactivate = async (user: StoppedUser) => {
    const confirmed = await showConfirm(`Aktifkan kembali ${user.name}?`);
    if (!confirmed) return;
    setBusyId(user.id);
    try {
      await pppoeApi.updateStatus(user.id, 'active');
      removeFromList(new Set([user.id]));
      await showSuccess(`${user.name} diaktifkan kembali`);
      refreshAll();
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedActivate'));
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkReactivate = async () => {
    if (selected.size === 0) return;
    const confirmed = await showConfirm(`Aktifkan kembali ${selected.size} pelanggan?`);
    if (!confirmed) return;
    const ids = new Set(selected);
    try {
      await pppoeApi.bulkUpdateStatus(Array.from(ids), 'active');
      removeFromList(ids);
      await showSuccess(`${ids.size} pelanggan diaktifkan kembali`);
      refreshAll();
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedActivate'));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const confirmed = await showConfirm(t('common.deleteCustomersConfirm').replace('{count}', selected.size.toString()));
    if (!confirmed) return;
    const ids = new Set(selected);
    try {
      const result = await pppoeApi.bulkDelete(Array.from(ids));
      removeFromList(ids);
      await showSuccess(`${result.deleted ?? ids.size} pelanggan dihapus`);
      refreshAll();
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedDelete'));
    }
  };

  const closeDeleteModal = () => {
    setDeleteUserId(null);
    setDeletePassword('');
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    if (!deletePassword.trim()) {
      await showError('Masukkan password superadmin untuk menghapus pelanggan.');
      return;
    }
    setDeleting(true);
    try {
      await pppoeApi.deleteUser(deleteUserId, deletePassword);
      removeFromList(new Set([deleteUserId]));
      await showSuccess(t('common.customerDeleted'));
      refreshAll();
      closeDeleteModal();
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failedDelete'));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await pppoeApi.exportUsers({ status: 'stop', format: 'excel' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pelanggan-berhenti-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      await showError((error instanceof Error ? error.message : String(error)) || t('common.failed'));
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.customerId ?? '').toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.phone ?? '').includes(q) ||
      u.profile.name.toLowerCase().includes(q) ||
      (u.area?.name ?? '').toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const pageUsers = filteredUsers.slice(startIndex, startIndex + pageSize);
  const total = usersData?.total ?? users.length;
  const allPageSelected = pageUsers.length > 0 && pageUsers.every((u) => selected.has(u.id));
  const reviewCount = repairList.length;

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const togglePage = () => setSelected((prev) => {
    const n = new Set(prev);
    pageUsers.forEach((u) => (allPageSelected ? n.delete(u.id) : n.add(u.id)));
    return n;
  });

  const toggleRepair = (id: string, checked: boolean) => setRepairSelected((prev) => {
    const n = new Set(prev);
    if (checked) n.add(id); else n.delete(id);
    return n;
  });

  const renderRowActions = (user: StoppedUser, compact: boolean) => {
    const busy = busyId === user.id;
    const icon = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';
    return (
      <div className={`flex items-center gap-1 ${compact ? 'justify-end' : 'gap-2'}`}>
        {canEdit && (
          <button
            onClick={() => handleReactivate(user)}
            disabled={busy}
            className={`flex items-center gap-1.5 font-medium bg-success/10 border border-success/30 text-success hover:bg-success/20 disabled:opacity-50 transition ${
              compact ? 'px-2.5 py-1 text-[11px] rounded-md' : 'px-3 py-1.5 text-xs rounded-lg'
            }`}
          >
            {busy ? <RefreshCw className={`${icon} animate-spin`} /> : <Power className={icon} />}
            Aktifkan
          </button>
        )}
        <button
          onClick={() => setDeleteUserId(user.id)}
          aria-label={`Hapus ${user.name} permanen`}
          title={t('pppoe.permanentDelete')}
          className={`p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition ${
            compact ? 'rounded-md' : 'ml-auto rounded-lg'
          }`}
        >
          <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
      </div>
    );
  };

  if (permLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasPermission('customers.view')) {
    return <div className="flex items-center justify-center min-h-[50vh] text-sm text-destructive">{t('pppoe.accessDenied')}</div>;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserX className="w-5 h-5 text-muted-foreground" />
            Pelanggan berhenti
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {loading ? 'Memuat data…' : `${total} pelanggan.`} Layanan nonaktif dan tidak bisa login, tetapi tagihan dan riwayatnya tetap tersimpan. Pelanggan bisa diaktifkan kembali kapan saja.
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 transition text-sm text-primary shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('common.refresh')}</span>
        </button>
      </div>

      {/* Auto Stop review */}
      {canEdit && reviewCount > 0 && (
        <section className="bg-card border border-warning/40 rounded-xl overflow-hidden">
          <div className="p-3 sm:p-4 flex items-start gap-3 bg-warning/5">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {reviewCount} pelanggan kemungkinan salah di-stop oleh Auto Stop
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mereka sedang cuti, sudah membayar, atau belum menunggak 30 hari saat di-stop. Periksa daftarnya, lalu aktifkan yang memang tidak seharusnya berhenti.
              </p>
            </div>
            <button
              onClick={() => setRepairOpen((v) => !v)}
              aria-expanded={repairOpen}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-warning/40 text-warning hover:bg-warning/10 transition shrink-0"
            >
              {repairOpen ? 'Tutup' : 'Periksa'}
              {repairOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {repairOpen && (
            <div className="border-t border-warning/20">
              <ul className="divide-y divide-border max-h-[28rem] overflow-auto">
                {repairList.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-3 px-3 sm:px-4 py-3 cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="mt-1 w-3.5 h-3.5 rounded border-border accent-primary"
                        checked={repairSelected.has(c.id)}
                        onChange={(e) => toggleRepair(c.id, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                          <span className="text-[11px] font-mono text-muted-foreground">{c.username}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {c.subscriptionType === 'PREPAID' ? 'Prabayar' : 'Pascabayar'}
                          </span>
                          {c.manualStop && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                              Pernah di-stop manual
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Di-stop {formatWIB(c.stoppedAt, 'dd MMM yyyy, HH:mm')}
                          {c.expiredAt && <>, masa aktif sampai {formatWIB(c.expiredAt, 'dd MMM yyyy')}</>}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {c.reasons.map((r) => (
                            <li key={r} className="text-[11px] text-foreground/80 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[0.45rem] before:w-1.5 before:h-px before:bg-warning">
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="px-3 sm:px-4 py-3 border-t border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                <p className="text-[11px] text-muted-foreground max-w-lg">
                  Pelanggan prabayar yang masa aktifnya sudah lewat akan diisolir lagi oleh Auto Isolir. Jika sudah membayar, perpanjang masa aktifnya dulu.
                </p>
                <button
                  onClick={applyRepair}
                  disabled={repairBusy || repairSelected.size === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-success text-white hover:bg-success/90 disabled:opacity-50 transition shrink-0"
                >
                  {repairBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  Aktifkan {repairSelected.size} pelanggan
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Toolbar */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        {selected.size > 0 ? (
          <>
            <span className="text-sm text-foreground font-medium flex-1">{selected.size} dipilih</span>
            <div className="flex gap-2">
              {canEdit && (
                <button
                  onClick={handleBulkReactivate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-success/10 border border-success/30 text-success hover:bg-success/20 transition"
                >
                  <Power className="w-3.5 h-3.5" />
                  Aktifkan
                </button>
              )}
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
              <button
                onClick={() => setSelected(new Set())}
                aria-label="Batalkan pilihan"
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="search"
                placeholder="Cari nama, username, ID pelanggan, telepon, paket, atau area"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 transition text-xs text-primary"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor Excel
            </button>
          </>
        )}
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {t('pppoe.loadingData')}
          </div>
        ) : pageUsers.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <UserX className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-foreground">
              {users.length === 0 ? 'Belum ada pelanggan yang berhenti' : 'Tidak ada yang cocok dengan pencarian'}
            </p>
            {users.length > 0 && (
              <button onClick={() => setSearchQuery('')} className="mt-2 text-xs text-primary hover:underline">
                Hapus pencarian
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile */}
            <ul className="md:hidden divide-y divide-border">
              {pageUsers.map((u) => (
                <li key={u.id} className={`p-3 ${selected.has(u.id) ? 'bg-primary/5' : ''}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${u.name}`}
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="mt-1 w-3.5 h-3.5 rounded border-border accent-primary shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <a href={`/admin/pppoe/users/${u.id}`} className="text-sm font-semibold text-foreground hover:text-primary truncate block">{u.name}</a>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">
                            {u.username}{u.customerId ? ` / ${u.customerId}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-foreground">{stoppedFor(u.updatedAt)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatWIB(u.updatedAt, 'dd/MM/yy')}</p>
                        </div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div><dt className="text-muted-foreground">Paket</dt><dd className="text-foreground">{u.profile.name}</dd></div>
                        <div><dt className="text-muted-foreground">Area</dt><dd className="text-foreground">{u.area?.name || '-'}</dd></div>
                        <div><dt className="text-muted-foreground">Telepon</dt><dd className="text-foreground">{u.phone || '-'}</dd></div>
                        {u.note && <div className="col-span-2"><dt className="text-muted-foreground">Catatan</dt><dd className="text-foreground line-clamp-2">{u.note}</dd></div>}
                      </dl>
                      <div className="mt-2.5">
                        {renderRowActions(u, false)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-left text-[11px] text-muted-foreground">
                    <th className="pl-4 pr-2 py-2.5 w-8">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua di halaman ini"
                        checked={allPageSelected}
                        onChange={togglePage}
                        className="w-3.5 h-3.5 rounded border-border accent-primary"
                      />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Pelanggan</th>
                    <th className="px-3 py-2.5 font-medium">Paket</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Area</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Telepon</th>
                    <th className="px-3 py-2.5 font-medium">Berhenti</th>
                    <th className="px-3 py-2.5 font-medium hidden xl:table-cell">Catatan</th>
                    <th className="pl-3 pr-4 py-2.5"><span className="sr-only">{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageUsers.map((u) => (
                    <tr key={u.id} className={selected.has(u.id) ? 'bg-primary/5' : 'hover:bg-muted/40'}>
                      <td className="pl-4 pr-2 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${u.name}`}
                          checked={selected.has(u.id)}
                          onChange={() => toggle(u.id)}
                          className="w-3.5 h-3.5 rounded border-border accent-primary"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <a href={`/admin/pppoe/users/${u.id}`} className="font-medium text-foreground hover:text-primary">{u.name}</a>
                        <p className="text-[11px] font-mono text-muted-foreground">
                          {u.username}{u.customerId ? ` / ${u.customerId}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{u.profile.name}</td>
                      <td className="px-3 py-2.5 text-foreground hidden lg:table-cell">{u.area?.name || '-'}</td>
                      <td className="px-3 py-2.5 text-foreground hidden lg:table-cell">{u.phone || '-'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <p className="font-semibold text-foreground">{stoppedFor(u.updatedAt)}</p>
                        <p className="text-[11px] text-muted-foreground">sejak {formatWIB(u.updatedAt, 'dd MMM yyyy')}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden xl:table-cell">
                        <span className="text-muted-foreground line-clamp-2 max-w-[16rem]" title={u.note ?? undefined}>{u.note || '-'}</span>
                      </td>
                      <td className="pl-3 pr-4 py-2.5">
                        {renderRowActions(u, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="px-3 py-2 border-t border-border">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={filteredUsers.length}
            limit={pageSize}
            onPageChange={setCurrentPage}
            pageSizeOptions={[10, 25, 50, 100]}
            onLimitChange={(v) => { setPageSize(v); setCurrentPage(1); }}
            alwaysVisible
          />
        </div>
      </div>

      {total > users.length && (
        <p className="text-[11px] text-muted-foreground text-center">
          Menampilkan {users.length} dari {total} pelanggan terbaru. Gunakan ekspor Excel untuk data lengkap.
        </p>
      )}

      {/* Delete confirmation */}
      {deleteUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeDeleteModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="bg-card border border-border rounded-xl p-5 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-title" className="text-base font-semibold text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              Hapus pelanggan permanen
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5">
              Data pelanggan beserta tagihannya akan dihapus dan tidak bisa dikembalikan. Untuk menghentikan layanan saja, biarkan pelanggan di daftar ini.
            </p>
            <label htmlFor="delete-password" className="block text-xs font-medium text-foreground mt-4 mb-1">
              Password superadmin
            </label>
            <input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-lg focus:outline-none focus:border-destructive/50"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !deleting && deletePassword.trim()) handleDelete(); }}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={closeDeleteModal}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deletePassword.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition"
              >
                {deleting ? 'Menghapus…' : 'Hapus permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
