'use client';

import { useState, useEffect, useCallback } from 'react';
import { Unplug, Search, RefreshCw, Loader2, Plus, X, MapPin } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';

interface OntTask {
  id: string;
  username: string;
  customerName: string;
  customerId: string | null;
  address: string | null;
  areaName: string | null;
  technicianName: string;
  reason: string | null;
  status: string;
  createdAt: string;
  completedNotes: string | null;
  cancelReason: string | null;
}

interface Technician {
  id: string;
  name: string;
  phoneNumber: string;
  _source: string;
}

interface IsolatedCustomer {
  id: string;
  username: string;
  name: string;
  areaName: string | null;
  totalUnpaid: number;
}

export default function AdminOntRemovalTasksPage() {
  const [tasks, setTasks] = useState<OntTask[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | 'CANCELLED' | ''>('PENDING');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: '', assignedTechnicianId: '', reason: '' });
  const [isolatedCustomers, setIsolatedCustomers] = useState<IsolatedCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const qs = status ? `?status=${status}` : '';
      const data = await apiAdmin<{ tasks?: OntTask[] }>(`/api/admin/ont-removal-tasks${qs}`);
      setTasks(data.tasks || []);
    } catch {
      showError('Gagal memuat data tugas cabut ONT');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchTechnicians = useCallback(async () => {
    try {
      const data = await apiAdmin<{ technicians?: Technician[] }>('/api/tickets/dispatch-data');
      setTechnicians(data.technicians || []);
    } catch {
      // best-effort
    }
  }, []);

  // Customers eligible for cabut ONT — sourced from the isolated/suspended
  // customer list, same source the standalone "Pelanggan Isolir" page uses.
  const fetchIsolatedCustomers = useCallback(async () => {
    try {
      const data = await apiAdmin<{ success?: boolean; data?: IsolatedCustomer[] }>('/api/admin/isolated-users');
      setIsolatedCustomers(data.data || []);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchTechnicians();
    fetchIsolatedCustomers();
  }, [fetchTechnicians, fetchIsolatedCustomers]);

  const matchingCustomers = customerSearch.trim()
    ? isolatedCustomers.filter((c) =>
        c.username.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.name.toLowerCase().includes(customerSearch.toLowerCase())
      ).slice(0, 20)
    : isolatedCustomers.slice(0, 20);

  const selectCustomer = (c: IsolatedCustomer) => {
    setForm((f) => ({ ...f, username: c.username }));
    setCustomerSearch(`${c.name} (${c.username})`);
    setShowCustomerDropdown(false);
  };

  const filtered = tasks.filter((t) =>
    t.username.toLowerCase().includes(search.toLowerCase()) ||
    t.customerName.toLowerCase().includes(search.toLowerCase())
  );

  const createTask = async () => {
    if (!form.username.trim() || !form.assignedTechnicianId) {
      showError('Username pelanggan dan teknisi wajib diisi');
      return;
    }
    setCreating(true);
    try {
      await apiAdmin('/api/admin/ont-removal-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          assignedTechnicianId: form.assignedTechnicianId,
          reason: form.reason.trim() || undefined,
        }),
      });
      showSuccess('Tugas cabut ONT berhasil dibuat');
      setShowCreate(false);
      setForm({ username: '', assignedTechnicianId: '', reason: '' });
      setCustomerSearch('');
      fetchTasks();
      fetchIsolatedCustomers();
    } catch (err: any) {
      showError(err?.message || 'Gagal membuat tugas');
    } finally {
      setCreating(false);
    }
  };

  const cancelTask = async (id: string) => {
    const ok = await showConfirm('Batalkan tugas cabut ONT ini?', 'Batalkan Tugas');
    if (!ok) return;
    try {
      await apiAdmin(`/api/admin/ont-removal-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason: 'Dibatalkan oleh admin' }),
      });
      showSuccess('Tugas dibatalkan');
      fetchTasks();
    } catch {
      showError('Gagal membatalkan tugas');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500/10 rounded-xl flex items-center justify-center">
            <Unplug className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Tugas Cabut ONT</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} tugas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTasks} className="p-2 bg-muted border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setForm({ username: '', assignedTechnicianId: '', reason: '' });
              setCustomerSearch('');
              setShowCreate(true);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-xl transition"
          >
            <Plus className="w-4 h-4" /> Buat Tugas
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari username / nama..." className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400" />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'PENDING', label: 'Pending' },
            { key: 'COMPLETED', label: 'Selesai' },
            { key: 'CANCELLED', label: 'Dibatalkan' },
            { key: '', label: 'Semua' },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setStatus(f.key)} className={`px-3 py-2 text-xs font-bold rounded-xl transition ${status === f.key ? 'bg-orange-600 text-white' : 'bg-muted border border-border text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Unplug className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Tidak ada tugas</p>
        </div>
      ) : (
        <div className="overflow-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-semibold text-muted-foreground">Pelanggan</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Area</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Teknisi</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Alasan</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Dibuat</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{t.username}</p>
                    <p className="text-xs text-muted-foreground">{t.customerName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.areaName ? (<span className="flex items-center gap-1 text-xs"><MapPin className="w-3 h-3" />{t.areaName}</span>) : '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.technicianName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate" title={t.reason || t.completedNotes || t.cancelReason || ''}>
                    {t.reason || t.completedNotes || t.cancelReason || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                      t.status === 'PENDING' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                      t.status === 'COMPLETED' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                      'bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}>
                      {t.status === 'PENDING' ? 'Pending' : t.status === 'COMPLETED' ? 'Selesai' : 'Dibatalkan'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatWIB(t.createdAt, 'dd MMM yyyy HH:mm')}</td>
                  <td className="px-4 py-3">
                    {t.status === 'PENDING' && (
                      <button onClick={() => cancelTask(t.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium">
                        Batalkan
                      </button>
                    )}
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
              <h2 className="text-lg font-bold text-foreground">Buat Tugas Cabut ONT</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Pelanggan (terisolir)</label>
                <input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setForm((f) => ({ ...f, username: '' }));
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  placeholder="Cari username / nama pelanggan..."
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground"
                />
                {showCustomerDropdown && (
                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-card border border-border rounded-lg shadow-lg">
                    {matchingCustomers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        {isolatedCustomers.length === 0 ? 'Tidak ada pelanggan terisolir' : 'Tidak ditemukan'}
                      </p>
                    ) : (
                      matchingCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition"
                        >
                          <p className="font-medium text-foreground">{c.name} <span className="text-xs font-normal text-muted-foreground">({c.username})</span></p>
                          <p className="text-xs text-muted-foreground">{c.areaName || 'Tanpa area'}{c.totalUnpaid ? ` · Tunggakan Rp${c.totalUnpaid.toLocaleString('id-ID')}` : ''}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {!form.username && customerSearch && (
                  <p className="text-[10px] text-red-500 mt-1">Pilih pelanggan dari daftar di atas.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tugaskan ke Teknisi</label>
                <select
                  value={form.assignedTechnicianId}
                  onChange={(e) => setForm((f) => ({ ...f, assignedTechnicianId: e.target.value }))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground"
                >
                  <option value="">-- Pilih Teknisi --</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.phoneNumber})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Alasan (opsional)</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  placeholder="mis. Menunggak 3 bulan, sudah tidak berlangganan"
                  className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 bg-muted text-muted-foreground text-sm font-bold rounded-lg transition">
                Batal
              </button>
              <button disabled={creating} onClick={createTask} className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition">
                {creating ? 'Menyimpan...' : 'Buat Tugas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
