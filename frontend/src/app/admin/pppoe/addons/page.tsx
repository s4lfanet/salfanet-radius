'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Package, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';

interface AddonType {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isRecurring: boolean;
  isActive: boolean;
  createdAt: string;
  _count?: { customerAddons: number };
}

export default function AddonTypesPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const [addons, setAddons] = useState<AddonType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AddonType | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', isRecurring: true });
  const [saving, setSaving] = useState(false);

  const fetchAddons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/addon-types', { cache: 'no-store' });
      if (res.ok) { const data = await res.json(); setAddons(data.addons || []); }
    } catch (e) { console.error('Fetch addons error:', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', price: '', isRecurring: true });
    setShowModal(true);
  };

  const openEdit = (addon: AddonType) => {
    setEditing(addon);
    setForm({ name: addon.name, description: addon.description || '', price: String(addon.price), isRecurring: addon.isRecurring });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { await showError('Nama addon wajib diisi'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseInt(form.price) || 0,
        isRecurring: form.isRecurring,
      };
      const url = editing ? `/api/addon-types/${editing.id}` : '/api/addon-types';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      await showSuccess(editing ? 'Addon diperbarui' : 'Addon berhasil dibuat');
      setShowModal(false);
      fetchAddons();
    } catch (err: any) { await showError(err.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (addon: AddonType) => {
    try {
      await fetch(`/api/addon-types/${addon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !addon.isActive }),
      });
      fetchAddons();
    } catch (e) { await showError('Gagal mengubah status'); }
  };

  const handleDelete = async (addon: AddonType) => {
    const confirmed = await showConfirm(`Hapus layanan "${addon.name}"? Jika masih digunakan pelanggan aktif, addon akan dinonaktifkan.`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/addon-types/${addon.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      await showSuccess(data.message);
      fetchAddons();
    } catch (err: any) { await showError(err.message); }
  };

  if (permLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground dark:text-[#e0d0ff] flex items-center gap-2">
            <Package className="h-5 w-5" />
            Layanan Tambahan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola jenis layanan add-on (STB, IPTV, dll.) untuk pelanggan</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAddons} className="p-2 border border-border rounded hover:bg-muted transition" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={openCreate} className="inline-flex items-center px-3 py-2 text-sm bg-primary text-white dark:bg-[#00f7ff] dark:text-[#0a0520] rounded hover:opacity-90 transition">
            <Plus className="h-4 w-4 mr-1" /> Tambah Addon
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border dark:border-[#bc13fe]/30 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Memuat...</div>
        ) : addons.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Belum ada layanan tambahan.</p>
            <button onClick={openCreate} className="mt-3 inline-flex items-center px-3 py-2 text-sm bg-primary text-white dark:bg-[#00f7ff] dark:text-[#0a0520] rounded hover:opacity-90 transition">
              <Plus className="h-4 w-4 mr-1" /> Buat Addon Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Nama Layanan</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Keterangan</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Harga</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Tipe</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-[#bc13fe]/20">
                {addons.map(a => (
                  <tr key={a.id} className={`hover:bg-muted/30 ${!a.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-sm font-medium text-foreground dark:text-[#e0d0ff]">{a.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">{a.description || '—'}</td>
                    <td className="px-3 py-2 text-sm font-bold text-primary dark:text-[#00f7ff]">Rp {Number(a.price).toLocaleString('id-ID')}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${a.isRecurring ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                        {a.isRecurring ? 'Bulanan' : 'Sekali'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleToggleActive(a)} className="inline-flex items-center gap-1 text-xs cursor-pointer" style={{ color: a.isActive ? '#10b981' : undefined }}>
                        {a.isActive ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        {a.isActive ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(a)} className="p-1.5 text-[#00f7ff] hover:bg-[#00f7ff]/10 rounded" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(a)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded" title="Hapus">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-background dark:bg-[#0a0520] border border-border dark:border-[#bc13fe]/30 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground dark:text-[#e0d0ff] flex items-center gap-2">
                <Package className="h-5 w-5" />
                {editing ? 'Edit Layanan Tambahan' : 'Tambah Layanan Tambahan'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nama Layanan <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  placeholder="Mis: Sewa STB, IPTV Premium"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded dark:bg-[#0a0520] dark:border-[#bc13fe]/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Keterangan <span className="text-muted-foreground">(opsional)</span></label>
                <input
                  type="text"
                  placeholder="Deskripsi singkat layanan ini"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded dark:bg-[#0a0520] dark:border-[#bc13fe]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Harga (Rp)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded dark:bg-[#0a0520] dark:border-[#bc13fe]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipe Biaya</label>
                <div className="flex gap-2 mt-1">
                  {[{ val: true, label: 'Bulanan (recurring)' }, { val: false, label: 'Sekali bayar' }].map(opt => (
                    <label key={String(opt.val)} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm border-2 transition ${form.isRecurring === opt.val ? 'border-primary dark:border-[#00f7ff] bg-primary/10 dark:bg-[#00f7ff]/10 font-medium text-primary dark:text-[#00f7ff]' : 'border-border dark:border-[#bc13fe]/30 text-muted-foreground'}`}>
                      <input type="radio" className="hidden" checked={form.isRecurring === opt.val} onChange={() => setForm(f => ({ ...f, isRecurring: opt.val }))} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded hover:bg-muted transition">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-primary text-white dark:bg-[#00f7ff] dark:text-[#0a0520] rounded hover:opacity-90 transition disabled:opacity-50">
                {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
