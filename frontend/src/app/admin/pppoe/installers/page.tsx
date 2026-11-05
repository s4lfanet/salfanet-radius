'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HardHat, Plus, Pencil, Search, RefreshCw, Power, UserCheck } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import { installerApi, INSTALLER_NONE, type Installer } from '@/lib/api/installers';
import {
  SimpleModal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter,
  ModalInput, ModalLabel, ModalButton,
} from '@/components/cyberpunk';

export default function InstallersPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listKey = buildQueryKey('/api/pppoe/installers');
  const { data, isLoading, isFetching } = useApiQuery<{ installers: Installer[]; unassignedCount: number | null }>(
    '/api/pppoe/installers',
  );
  const installers = useMemo(() => data?.installers ?? [], [data]);
  const canEdit = hasPermission('customers.edit');

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Installer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [psbPending, setPsbPending] = useState(0);
  const [importing, setImporting] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

  useEffect(() => {
    if (permLoading || !canEdit) return;
    installerApi.psbPending().then((r) => setPsbPending(r.count)).catch(() => setPsbPending(0));
  }, [permLoading, canEdit]);

  const openCreate = () => { setEditing(null); setName(''); setFormOpen(true); };
  const openEdit = (i: Installer) => { setEditing(i); setName(i.name); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); setName(''); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await installerApi.update(editing.id, { name });
        await showSuccess('Instalatur disimpan');
      } else {
        await installerApi.create(name);
        await showSuccess('Instalatur ditambahkan');
      }
      closeForm();
      refresh();
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal menyimpan instalatur');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (i: Installer) => {
    if (i.isActive) {
      const ok = await showConfirm(
        `Nonaktifkan ${i.name}? ${i.customerCount} pelanggan tetap tercatat dengan instalatur ini, tetapi namanya tidak muncul lagi di pilihan form pelanggan.`,
      );
      if (!ok) return;
    }
    try {
      await installerApi.update(i.id, { isActive: !i.isActive });
      await showSuccess(i.isActive ? `${i.name} dinonaktifkan` : `${i.name} diaktifkan kembali`);
      refresh();
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal mengubah status instalatur');
    }
  };

  const handleImport = async () => {
    const ok = await showConfirm(
      `Isi instalatur untuk ${psbPending} pelanggan PSB dari teknisi yang mendaftarkannya? Pelanggan yang sudah punya instalatur tidak diubah.`,
    );
    if (!ok) return;
    setImporting(true);
    try {
      const r = await installerApi.importFromPsb();
      await showSuccess(`${r.assigned} pelanggan diberi instalatur`);
      setPsbPending(0);
      refresh();
    } catch (error: unknown) {
      await showError(error instanceof Error ? error.message : 'Gagal mengisi instalatur');
    } finally {
      setImporting(false);
    }
  };

  const visible = installers.filter((i) =>
    (showInactive || i.isActive) && i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const inactiveCount = installers.filter((i) => !i.isActive).length;

  if (permLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (!hasPermission('customers.view')) {
    return <div className="flex items-center justify-center min-h-[50vh] text-sm text-destructive">{t('pppoe.accessDenied')}</div>;
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="w-5 h-5 text-muted-foreground" />
            Instalatur
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Teknisi atau mitra yang memasang pelanggan. Dipakai untuk mengelompokkan dan memfilter Data Pelanggan, Tagihan, Riwayat Transaksi, dan Export Data.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Tambah instalatur</span>
          </button>
        )}
      </div>

      {canEdit && psbPending > 0 && (
        <div className="bg-card border border-primary/30 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <UserCheck className="w-4 h-4 text-primary shrink-0 hidden sm:block" />
          <p className="text-xs text-foreground flex-1">
            {psbPending} pelanggan PSB belum punya instalatur, padahal tercatat siapa teknisi yang mendaftarkannya. Isi instalatur mereka dari data itu?
          </p>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-50 transition shrink-0"
          >
            {importing ? 'Mengisi…' : 'Isi dari data PSB'}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Cari nama instalatur"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            Tampilkan nonaktif ({inactiveCount})
          </label>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t('pppoe.loadingData')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.length === 0 && (
              <li className="py-10 px-6 text-center">
                <p className="text-sm text-foreground">
                  {installers.length === 0 ? 'Belum ada instalatur' : 'Tidak ada yang cocok dengan pencarian'}
                </p>
                {installers.length === 0 && canEdit && (
                  <button onClick={openCreate} className="mt-2 text-xs text-primary hover:underline">Tambah instalatur pertama</button>
                )}
              </li>
            )}
            {visible.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 sm:px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${i.isActive ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40'}`}>
                      {i.name}
                    </span>
                    {!i.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Nonaktif</span>
                    )}
                    {i.technicianId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Akun teknisi</span>
                    )}
                  </div>
                  <Link
                    href={`/admin/pppoe/users?installerId=${encodeURIComponent(i.id)}`}
                    className="text-[11px] text-muted-foreground hover:text-primary"
                  >
                    {i.customerCount} pelanggan
                  </Link>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(i)}
                      aria-label={`Ubah nama ${i.name}`}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(i)}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border transition ${
                        i.isActive
                          ? 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5'
                          : 'border-success/30 text-success bg-success/10 hover:bg-success/20'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      {i.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {data?.unassignedCount != null && (
          <div className="px-3 sm:px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Pelanggan tanpa instalatur</span>
            <Link href={`/admin/pppoe/users?installerId=${INSTALLER_NONE}`} className="text-xs font-medium text-foreground hover:text-primary">
              {data.unassignedCount} pelanggan
            </Link>
          </div>
        )}
        {isFetching && !isLoading && <div className="h-0.5 bg-primary/30 animate-pulse" />}
      </div>

      <SimpleModal isOpen={formOpen} onClose={closeForm} size="sm">
        <ModalHeader>
          <ModalTitle>{editing ? 'Ubah instalatur' : 'Tambah instalatur'}</ModalTitle>
          <ModalDescription>
            {editing ? `Nama baru langsung berlaku untuk ${editing.customerCount} pelanggan yang terhubung.` : 'Instalatur baru langsung bisa dipilih di form pelanggan.'}
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={handleSave}>
          <ModalBody>
            <ModalLabel required>Nama</ModalLabel>
            <ModalInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              placeholder="Contoh: Budi Santoso"
            />
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" variant="secondary" onClick={closeForm}>{t('common.cancel')}</ModalButton>
            <ModalButton type="submit" variant="primary" disabled={saving || !name.trim()}>
              {saving ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
            </ModalButton>
          </ModalFooter>
        </form>
      </SimpleModal>
    </div>
  );
}
