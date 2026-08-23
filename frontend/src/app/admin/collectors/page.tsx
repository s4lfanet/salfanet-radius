'use client';

import { useState } from 'react';
import { Users, Search, RefreshCw, Loader2, Plus, X, Phone, Mail, MapPin } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { showSuccess, showError } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';

interface Collector {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  areaId: string | null;
  areaName: string | null;
  lastLogin: string | null;
  createdAt: string;
}

interface Area {
  id: string;
  name: string;
}

const emptyForm = { username: '', name: '', email: '', phone: '', password: '', areaId: '' };

export default function AdminCollectorsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useApiQuery<{ collectors?: Collector[] }>('/api/collector/list', { staleTime: 30000 });
  const collectors = data?.collectors || [];

  const { data: areasData } = useApiQuery<{ areas: Area[] } | Area[]>('/api/pppoe/areas', { staleTime: 5 * 60 * 1000 });
  const areas: Area[] = Array.isArray(areasData) ? areasData : (areasData?.areas || []);

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Collector | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/collector/list') });

  const filtered = collectors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowCreate(true);
  };

  const openEdit = (c: Collector) => {
    setEditing(c);
    setForm({ username: c.username, name: c.name, email: c.email || '', phone: c.phone || '', password: '', areaId: c.areaId || '' });
    setShowCreate(true);
  };

  const submit = async () => {
    if (!form.username.trim() || !form.name.trim() || !form.areaId) {
      showError('Username, nama, dan area wajib diisi');
      return;
    }
    if (!editing && !form.password.trim()) {
      showError('Password wajib diisi untuk kolektor baru');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        role: 'COLLECTOR',
        areaId: form.areaId,
      };
      if (form.password.trim()) payload.password = form.password.trim();

      if (editing) {
        await apiAdmin(`/api/admin/users/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showSuccess('Data kolektor berhasil diperbarui');
      } else {
        await apiAdmin('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showSuccess('Kolektor berhasil didaftarkan');
      }
      setShowCreate(false);
      invalidate();
    } catch (err: any) {
      showError(err?.message || 'Gagal menyimpan data kolektor');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Collector) => {
    try {
      await apiAdmin(`/api/admin/users/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: c.username, name: c.name, role: 'COLLECTOR', areaId: c.areaId, isActive: !c.isActive }),
      });
      showSuccess(c.isActive ? 'Kolektor dinonaktifkan' : 'Kolektor diaktifkan');
      invalidate();
    } catch {
      showError('Gagal mengubah status kolektor');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5" /> Kelola Kolektor
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Akun kolektor (penagih lapangan) beserta area yang ditugaskan
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={invalidate} className="h-8 px-3 bg-muted hover:bg-muted/70 text-foreground text-xs font-medium rounded-md transition-colors flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-md transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Tambah Kolektor
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / username / nomor telepon..."
          className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Belum ada kolektor terdaftar</p>
        </div>
      ) : (
        <div className="overflow-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-semibold text-muted-foreground">Nama</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Kontak</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Area</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Login Terakhir</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="px-4 py-3 font-medium text-foreground cursor-pointer hover:underline" onClick={() => openEdit(c)}>
                    {c.name}
                    <p className="text-xs text-muted-foreground font-normal">@{c.username}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</p>}
                    {c.email && <p className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {c.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.areaName ? (
                      <span className="flex items-center gap-1 text-foreground"><MapPin className="w-3 h-3" /> {c.areaName}</span>
                    ) : (
                      <span className="text-red-500">Belum di-assign</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.lastLogin ? formatWIB(c.lastLogin, 'dd MMM yyyy HH:mm') : 'Belum pernah'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(c)}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold transition ${c.isActive ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'}`}
                    >
                      {c.isActive ? 'Aktif' : 'Nonaktif'}
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
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? 'Edit Kolektor' : 'Tambah Kolektor'}</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  disabled={!!editing}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nama</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Nomor Telepon</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0812xxxxxxx"
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email (opsional)</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  Password {editing && <span className="text-muted-foreground">(kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Area yang Ditugaskan</label>
                <select
                  value={form.areaId}
                  onChange={(e) => setForm((f) => ({ ...f, areaId: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground"
                >
                  <option value="">-- Pilih Area --</option>
                  {areas.map((area) => (<option key={area.id} value={area.id}>{area.name}</option>))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Kolektor hanya bisa mengelola pelanggan di area ini.</p>
              </div>
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
