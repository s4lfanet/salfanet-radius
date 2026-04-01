'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatWIB } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { PauseCircle, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, Calendar } from 'lucide-react';

interface SuspendRequest {
  id: string;
  status: string;
  reason: string | null;
  startDate: string;
  endDate: string;
  adminNotes: string | null;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Menunggu Persetujuan', color: 'text-yellow-400',  icon: Clock },
  APPROVED:  { label: 'Disetujui',           color: 'text-green-400',   icon: CheckCircle2 },
  REJECTED:  { label: 'Ditolak',             color: 'text-red-400',     icon: XCircle },
  CANCELLED: { label: 'Dibatalkan',          color: 'text-gray-400',    icon: XCircle },
  COMPLETED: { label: 'Selesai',             color: 'text-blue-400',    icon: CheckCircle2 },
};

const fmt = (d: string) => formatWIB(d, 'dd MMM yyyy');

export default function CustomerSuspendPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [current, setCurrent] = useState<SuspendRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [form, setForm] = useState({ reason: '', startDate: '', endDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('customer_token');
    if (!t) { router.push('/customer/login'); return; }
    setToken(t);
    fetchCurrent(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCurrent = async (tkn: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/customer/suspend-request', {
        headers: { Authorization: `Bearer ${tkn}` },
      });
      const data = await res.json();
      setCurrent(data.data || null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.startDate) e.startDate = 'Tanggal mulai wajib diisi';
    if (!form.endDate) e.endDate = 'Tanggal selesai wajib diisi';
    if (form.startDate && form.endDate) {
      const s = new Date(form.startDate), en = new Date(form.endDate), now = new Date();
      now.setHours(0, 0, 0, 0);
      if (s < now) e.startDate = 'Tanggal mulai tidak boleh di masa lalu';
      else if (en <= s) e.endDate = 'Tanggal selesai harus setelah tanggal mulai';
      else {
        const diff = Math.ceil((en.getTime() - s.getTime()) / 86400000);
        if (diff > 90) e.endDate = 'Maksimum 90 hari';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/customer/suspend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.message || 'Gagal mengirim permintaan' }); return; }
      setMsg({ type: 'success', text: 'Permintaan suspend berhasil dikirim! Menunggu persetujuan admin.' });
      setForm({ reason: '', startDate: '', endDate: '' });
      await fetchCurrent(token);
    } catch { setMsg({ type: 'error', text: 'Terjadi kesalahan jaringan' }); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async () => {
    if (!current || !token) return;
    if (!confirm('Yakin ingin membatalkan permintaan suspend ini?')) return;
    setCancelling(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/customer/suspend-request?id=${current.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.message || 'Gagal membatalkan' }); return; }
      setMsg({ type: 'success', text: 'Permintaan suspend berhasil dibatalkan.' });
      setCurrent(null);
    } catch { setMsg({ type: 'error', text: 'Terjadi kesalahan jaringan' }); }
    finally { setCancelling(false); }
  };

  // Min date = today (WIB)
  const todayStr = formatInTimeZone(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PauseCircle className="w-8 h-8 text-[#00f7ff]" />
        <div>
          <h1 className="text-xl font-bold text-white">Suspend Sementara</h1>
          <p className="text-sm text-[#e0d0ff]/60">Ajukan jeda layanan internet sementara</p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-[#1a1135]/80 border border-[#bc13fe]/30 rounded-xl p-4 text-sm text-[#e0d0ff]/70 space-y-1">
        <p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-[#bc13fe] shrink-0 mt-0.5" />
          <span>Suspend sementara menghentikan layanan internet untuk periode tertentu (maks. 90 hari).</span></p>
        <p className="pl-6">✦ Tagihan tetap berjalan selama suspend.</p>
        <p className="pl-6">✦ Permintaan perlu disetujui oleh admin terlebih dahulu.</p>
        <p className="pl-6">✦ Layanan otomatis aktif kembali setelah periode berakhir.</p>
      </div>

      {/* Alert Message */}
      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          msg.type === 'success' ? 'bg-green-900/30 border border-green-500/50 text-green-300' : 'bg-red-900/30 border border-red-500/50 text-red-300'
        }`}>
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Current Request Status */}
      {current && (
        <CyberCard className="p-4 space-y-3">
          <p className="text-xs font-semibold text-[#e0d0ff]/50 uppercase tracking-wider">Permintaan Aktif</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(() => {
                const s = STATUS_LABEL[current.status] || STATUS_LABEL.PENDING;
                const Icon = s.icon;
                return <>
                  <Icon className={`w-5 h-5 ${s.color}`} />
                  <span className={`font-semibold ${s.color}`}>{s.label}</span>
                </>;
              })()}
            </div>
            {current.status === 'PENDING' && (
              <CyberButton
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="text-xs text-red-400 hover:text-red-300 border-red-500/30"
              >
                {cancelling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Batalkan
              </CyberButton>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[#e0d0ff]/40 text-xs">Mulai</p>
              <p className="text-white font-medium">{fmt(current.startDate)}</p>
            </div>
            <div>
              <p className="text-[#e0d0ff]/40 text-xs">Selesai</p>
              <p className="text-white font-medium">{fmt(current.endDate)}</p>
            </div>
          </div>
          {current.reason && (
            <div>
              <p className="text-[#e0d0ff]/40 text-xs">Alasan</p>
              <p className="text-[#e0d0ff] text-sm">{current.reason}</p>
            </div>
          )}
          {current.adminNotes && (
            <div className="bg-[#0a0520]/60 rounded-lg p-3 mt-1">
              <p className="text-[#e0d0ff]/40 text-xs mb-1">Catatan Admin</p>
              <p className="text-[#e0d0ff] text-sm">{current.adminNotes}</p>
            </div>
          )}
          <p className="text-[#e0d0ff]/30 text-xs">Diajukan: {fmt(current.requestedAt)}</p>
        </CyberCard>
      )}

      {/* Request Form — only show if no active PENDING/APPROVED request */}
      {(!current || ['REJECTED', 'CANCELLED', 'COMPLETED'].includes(current.status)) && (
        <CyberCard className="p-4 space-y-4">
          <p className="text-sm font-semibold text-[#00f7ff]">Ajukan Suspend Baru</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#e0d0ff]/60 mb-1 block">Tanggal Mulai *</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#bc13fe]/60" />
                <input
                  type="date"
                  min={todayStr}
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className={`w-full pl-8 pr-2 py-2 bg-[#0a0520]/80 border rounded-lg text-sm text-white focus:outline-none ${
                    errors.startDate ? 'border-red-500' : 'border-[#bc13fe]/30 focus:border-[#bc13fe]'
                  }`}
                />
              </div>
              {errors.startDate && <p className="text-red-400 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="text-xs text-[#e0d0ff]/60 mb-1 block">Tanggal Selesai *</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#bc13fe]/60" />
                <input
                  type="date"
                  min={form.startDate || todayStr}
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className={`w-full pl-8 pr-2 py-2 bg-[#0a0520]/80 border rounded-lg text-sm text-white focus:outline-none ${
                    errors.endDate ? 'border-red-500' : 'border-[#bc13fe]/30 focus:border-[#bc13fe]'
                  }`}
                />
              </div>
              {errors.endDate && <p className="text-red-400 text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#e0d0ff]/60 mb-1 block">Alasan (opsional)</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Contoh: Mudik Lebaran, renovasi rumah, perjalanan dinas..."
              rows={3}
              className="w-full px-3 py-2 bg-[#0a0520]/80 border border-[#bc13fe]/30 rounded-lg text-sm text-white placeholder-[#e0d0ff]/30 focus:outline-none focus:border-[#bc13fe] resize-none"
            />
          </div>

          <CyberButton onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengirim...</>
            ) : (
              <><PauseCircle className="w-4 h-4 mr-2" />Kirim Permintaan Suspend</>
            )}
          </CyberButton>
        </CyberCard>
      )}
    </div>
  );
}
