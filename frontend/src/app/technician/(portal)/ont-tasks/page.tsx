'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { Unplug, Search, RefreshCw, Loader2, CheckCircle2, XCircle, MapPin, Phone } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { apiAdmin } from '@/lib/api/client';
import { showConfirm } from '@/lib/sweetalert';

interface OntTask {
  id: string;
  username: string;
  customerName: string;
  customerId: string | null;
  address: string | null;
  phone: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
}

export default function TechnicianOntTasksPage() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState<OntTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | 'CANCELLED'>('PENDING');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiAdmin<{ tasks?: OntTask[] }>(`/api/technician/ont-removal-tasks?status=${status}`);
      setTasks(data.tasks || []);
    } catch {
      addToast({ type: 'error', title: 'Gagal memuat data' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = tasks.filter((t) =>
    t.username.toLowerCase().includes(search.toLowerCase()) ||
    t.customerName.toLowerCase().includes(search.toLowerCase())
  );

  const submit = async (id: string, action: 'complete' | 'cancel') => {
    if (action === 'cancel') {
      const ok = await showConfirm('Batalkan tugas cabut ONT ini?', 'Batalkan Tugas');
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await apiAdmin(`/api/technician/ont-removal-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: note.trim() || undefined }),
      });
      addToast({ type: 'success', title: action === 'complete' ? 'Tugas selesai dicatat' : 'Tugas dibatalkan' });
      setActiveId(null);
      setNote('');
      fetchData();
    } catch {
      addToast({ type: 'error', title: 'Gagal memperbarui tugas' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500/10 dark:bg-orange-500/20 rounded-xl flex items-center justify-center">
            <Unplug className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Tugas Cabut ONT</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} tugas</p>
          </div>
        </div>
        <button onClick={fetchData} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari username / nama..." className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'PENDING', label: 'Pending' },
            { key: 'COMPLETED', label: 'Selesai' },
            { key: 'CANCELLED', label: 'Dibatalkan' },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setStatus(f.key)} className={`px-3 py-2 text-xs font-bold rounded-xl transition ${status === f.key ? 'bg-[#bc13fe] text-white shadow-[0_0_15px_rgba(188,19,254,0.4)]' : 'bg-slate-100 dark:bg-[#1a0f35] border border-border text-muted-foreground hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground/70">
          <Unplug className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Tidak ada tugas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task) => (
            <div key={task.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{task.username}</p>
                    <p className="text-xs text-muted-foreground">{task.customerName}{task.customerId ? ` (${task.customerId})` : ''}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    task.status === 'PENDING' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                    task.status === 'COMPLETED' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                    'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    {task.status === 'PENDING' ? 'Pending' : task.status === 'COMPLETED' ? 'Selesai' : 'Dibatalkan'}
                  </span>
                </div>
                {task.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {task.address}
                  </p>
                )}
                {task.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {task.phone}
                  </p>
                )}
                {task.reason && (
                  <p className="text-xs text-muted-foreground/80 italic">&quot;{task.reason}&quot;</p>
                )}
              </div>

              {task.status === 'PENDING' && (
                <div className="border-t border-slate-100 dark:border-[#bc13fe]/10 bg-input/50 p-3 space-y-2">
                  {activeId === task.id ? (
                    <>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Catatan (opsional)..."
                        className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={submitting}
                          onClick={() => submit(task.id, 'complete')}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Selesai
                        </button>
                        <button
                          disabled={submitting}
                          onClick={() => submit(task.id, 'cancel')}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
                        >
                          <XCircle className="w-4 h-4" /> Batalkan
                        </button>
                        <button
                          disabled={submitting}
                          onClick={() => { setActiveId(null); setNote(''); }}
                          className="px-3 py-2 bg-slate-200 dark:bg-[#1a0f35] text-muted-foreground text-xs font-bold rounded-lg transition"
                        >
                          Tutup
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => { setActiveId(task.id); setNote(''); }}
                      className="w-full px-3 py-2 bg-[#bc13fe] hover:bg-[#a010e0] text-white text-xs font-bold rounded-lg transition"
                    >
                      Proses Tugas
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
