'use client';

import { useState } from 'react';
import { Wrench, Search, RefreshCw, Loader2, Plus, X, Phone, Mail } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';

interface Technician {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  isActive: boolean;
  requireOtp: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const emptyForm = { name: '', phoneNumber: '', email: '', requireOtp: true };

export default function AdminTechniciansPage() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useApiQuery<{ technicians?: Technician[] }>('/api/admin/technicians', { staleTime: 30000 });
  const technicians = data?.technicians || [];

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/admin/technicians') });

  const filtered = technicians.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.phoneNumber.includes(search)
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowCreate(true);
  };

  const openEdit = (t: Technician) => {
    setEditing(t);
    setForm({ name: t.name, phoneNumber: t.phoneNumber, email: t.email || '', requireOtp: t.requireOtp });
    setShowCreate(true);
  };

  const submit = async () => {
    if (!form.name.trim() || (!editing && !form.phoneNumber.trim())) {
      showError('Nama dan nomor telepon wajib diisi');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiAdmin(`/api/admin/technicians/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() || null, requireOtp: form.requireOtp }),
        });
        showSuccess('Data teknisi berhasil diperbarui');
      } else {
        await apiAdmin('/api/admin/technicians', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            phoneNumber: form.phoneNumber.trim(),
            email: form.email.trim() || undefined,
            requireOtp: form.requireOtp,
          }),
        });
        showSuccess('Teknisi berhasil didaftarkan');
      }
      setShowCreate(false);
      invalidate();
    } catch (err: any) {
      showError(err?.message || 'Gagal menyimpan data teknisi');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: Technician) => {
    try {
      await apiAdmin(`/api/admin/technicians/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      showSuccess(t.isActive ? 'Teknisi dinonaktifkan' : 'Teknisi diaktifkan');
      invalidate();
    } catch {
      showError('Gagal mengubah status teknisi');
    }
  };

  const remove = async (t: Technician) => {
    const ok = await showConfirm(`Hapus akun teknisi "${t.name}"? Tindakan ini tidak bisa dibatalkan.`, 'Hapus Teknisi');
    if (!ok) return;
    try {
      await apiAdmin(`/api/admin/technicians/${t.id}`, { method: 'DELETE' });
      showSuccess('Teknisi dihapus');
      invalidate();
    } catch {
      showError('Gagal menghapus teknisi');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Kelola Teknisi
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Akun teknisi (login OTP via WhatsApp) yang dipakai portal /technician
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={invalidate} className="h-8 px-3 bg-muted hover:bg-muted/70 text-foreground text-xs font-medium rounded-md transition-colors flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-md transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Tambah Teknisi
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / nomor telepon..."
          className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Belum ada teknisi terdaftar</p>
        </div>
      ) : (
        <div className="overflow-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-semibold text-muted-foreground">Nama</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Kontak</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Wajib OTP</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Login Terakhir</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="px-4 py-3 font-medium text-foreground cursor-pointer hover:underline" onClick={() => openEdit(t)}>
                    {t.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {t.phoneNumber}</p>
                    {t.email && <p className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {t.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`inline-flex px-2 py-0.5 rounded-full font-bold ${t.requireOtp ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-slate-500/10 text-slate-500'}`}>
                      {t.requireOtp ? 'Ya' : 'Tidak'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t.lastLoginAt ? formatWIB(t.lastLoginAt, 'dd MMM yyyy HH:mm') : 'Belum pernah'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(t)}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold transition ${t.isActive ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'}`}
                    >
                      {t.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(t)} className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? 'Edit Teknisi' : 'Tambah Teknisi'}</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nama</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nomor Telepon (WhatsApp)</label>
                <input
                  value={form.phoneNumber}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  placeholder="0812xxxxxxx"
                  disabled={!!editing}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground disabled:opacity-60"
                />
                {editing && <p className="text-[10px] text-muted-foreground mt-1">Nomor telepon tidak bisa diubah setelah dibuat.</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email (opsional)</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requireOtp}
                  onChange={(e) => setForm((f) => ({ ...f, requireOtp: e.target.checked }))}
                  className="w-4 h-4"
                />
                <span className="text-sm text-foreground">Wajib verifikasi OTP saat login</span>
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 bg-muted text-muted-foreground text-sm font-bold rounded-lg transition">
                Batal
              </button>
              <button disabled={saving} onClick={submit} className="flex-1 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-bold rounded-lg transition">
                {saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
