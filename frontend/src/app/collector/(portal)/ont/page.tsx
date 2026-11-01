'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { showError, showSuccess } from '@/lib/sweetalert';
import { Unplug, RefreshCw, CheckCircle, XCircle, Loader2, Phone, MapPin, Users } from 'lucide-react';
import { PageHeader, StatusPill, LoadingState, ErrorState, EmptyState, ui } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

interface OntTask {
  id: string;
  username: string;
  fullname: string;
  customerId: string | null;
  phone: string;
  address: string;
  profileName: string;
  areaName: string | null;
  customerStatus: string | null;
  reason: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  completedAt: string | null;
  completedNotes: string | null;
  completedByRole: string | null;
  cancelReason: string | null;
  withTechnician: boolean;
}

const fmtWhen = (d: string) => new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<OntTask['status'], { tone: 'amber' | 'green' | 'slate'; label: string }> = {
  PENDING: { tone: 'amber', label: 'Perlu dikerjakan' },
  COMPLETED: { tone: 'green', label: 'Selesai' },
  CANCELLED: { tone: 'slate', label: 'Dibatalkan' },
};

// Cabut ONT is ordered by an admin. The collector sees the tasks given to
// them and reports the result; there is no way to start one from here.
export default function CollectorOntPage() {
  const [tasks, setTasks] = useState<OntTask[]>([]);
  const [meta, setMeta] = useState({ pending: 0, thisMonth: 0, lastMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ task: OntTask; action: 'complete' | 'cancel' } | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdmin<{ tasks: OntTask[]; pending: number; thisMonth: number; lastMonth: number }>('/api/collector/ont-removals');
      setTasks(res.tasks || []);
      setMeta({ pending: res.pending || 0, thisMonth: res.thisMonth || 0, lastMonth: res.lastMonth || 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tugas cabut ONT gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!acting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [acting]);

  const open = (task: OntTask, action: 'complete' | 'cancel') => {
    setActing({ task, action });
    setNotes('');
  };

  const submit = async () => {
    if (!acting) return;
    if (acting.action === 'cancel' && !notes.trim()) {
      showError('Tulis alasan tugas tidak bisa dikerjakan');
      return;
    }
    setSaving(true);
    try {
      await apiAdmin(`/api/collector/ont-removals/${acting.task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: acting.action, notes: notes.trim() || undefined }),
      });
      showSuccess(acting.action === 'complete' ? `Cabut ONT ${acting.task.fullname} dilaporkan selesai` : 'Tugas dikembalikan ke admin');
      setActing(null);
      loadData();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Laporan gagal dikirim');
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const detail = (t: OntTask) => (
    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
      {t.address && <p className="flex items-start gap-2"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span>{t.address}</span></p>}
      {t.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 shrink-0" /><a href={`tel:${t.phone}`} className="text-blue-700 dark:text-blue-400 hover:underline">{t.phone}</a></p>}
      {t.withTechnician && t.status === 'PENDING' && <p className="flex items-center gap-2"><Users className="w-4 h-4 shrink-0" />Teknisi juga ditugaskan; yang selesai lebih dulu menutup tugas.</p>}
      {t.reason && <p>Alasan admin: <span className="text-foreground">{t.reason}</span></p>}
      {t.status === 'COMPLETED' && <p>Selesai {t.completedAt ? fmtWhen(t.completedAt) : ''}{t.completedByRole === 'technician' ? ' oleh teknisi' : ''}{t.completedNotes ? `: ${t.completedNotes}` : ''}</p>}
      {t.status === 'CANCELLED' && t.cancelReason && <p>Dibatalkan: {t.cancelReason}</p>}
    </div>
  );

  const actions = (t: OntTask) => t.status === 'PENDING' && (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
      <button type="button" onClick={() => open(t, 'cancel')} className={cn(ui.btnSecondary, 'h-[40px] pointer-coarse:h-[44px]')}>
        <XCircle className="w-4 h-4" /> Tidak bisa
      </button>
      <button type="button" onClick={() => open(t, 'complete')} className={cn(ui.btnPrimary, 'h-[40px] pointer-coarse:h-[44px]')}>
        <CheckCircle className="w-4 h-4" /> Sudah dicabut
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Cabut ONT"
        description="Tugas pencabutan perangkat yang diperintahkan admin"
        actions={
          <button type="button" onClick={loadData} aria-label="Muat ulang" className={ui.iconBtn}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        }
      />

      <div className={cn(ui.card, 'p-4 mb-4 grid grid-cols-3 divide-x divide-border')}>
        <div className="pr-4">
          <p className="text-xs text-muted-foreground">Perlu dikerjakan</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{meta.pending}</p>
        </div>
        <div className="px-4">
          <p className="text-xs text-muted-foreground">Selesai bulan ini</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{meta.thisMonth}</p>
        </div>
        <div className="pl-4">
          <p className="text-xs text-muted-foreground">Bulan lalu</p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground">{meta.lastMonth}</p>
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <LoadingState label="Memuat tugas..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<Unplug className="w-5 h-5" />} title="Belum ada tugas cabut ONT" hint="Admin yang menentukan pelanggan mana yang perlu dicabut. Tugas muncul di sini dan di notifikasi." />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className={cn(ui.card, 'p-4')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{t.fullname}</p>
                  <p className="text-xs text-muted-foreground truncate">{[t.customerId || t.username, t.profileName, t.areaName].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <StatusPill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</StatusPill>
                  <p className="text-xs text-muted-foreground">{fmtWhen(t.createdAt)}</p>
                </div>
              </div>
              {detail(t)}
              {actions(t)}
            </li>
          ))}
        </ul>
      )}

      {acting && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Laporan cabut ONT" onClick={() => setActing(null)}>
          <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground">
              {acting.action === 'complete' ? 'Laporkan ONT sudah dicabut' : 'Tugas tidak bisa dikerjakan'}
            </h2>
            <p className="text-sm text-muted-foreground">{acting.task.fullname} · {acting.task.customerId || acting.task.username}</p>
            <label className="block text-sm">
              <span className="font-medium text-foreground">{acting.action === 'complete' ? 'Catatan (opsional)' : 'Alasan (wajib)'}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={acting.action === 'complete' ? 'mis. ONT dan adaptor diambil, kabel dibiarkan' : 'mis. Pelanggan menolak, rumah kosong'}
                className={cn(ui.input, 'mt-1 h-auto py-2 resize-none')}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setActing(null)} className={cn(ui.btnSecondary, 'h-[44px]')}>Batal</button>
              <button type="button" disabled={saving} onClick={submit} className={cn(ui.btnPrimary, 'h-[44px]')}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Kirim laporan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
