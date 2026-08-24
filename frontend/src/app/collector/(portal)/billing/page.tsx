'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { Users, Search, CheckCircle, Loader2, ChevronDown, X, Upload, Image as ImageIcon } from 'lucide-react';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CollectorBillingPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unpaid');
  const [visibleCount, setVisibleCount] = useState(20);
  const [payingInvoice, setPayingInvoice] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; amount: number; customerName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payLoading, setPayLoading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdmin<{ users: any[] }>(`/api/collector/users?filter=${filter}`);
      setUsers(res.users || []);
    } catch {}
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadData() }, [loadData]);

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.customerId || '').toLowerCase().includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const compressImage = (file: File, maxW: number, quality: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('no ctx')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePay = async () => {
    if (!payModal) return;
    if (paymentMethod === 'transfer' && !proofPreview) {
      alert('Harap upload bukti transfer terlebih dahulu');
      return;
    }
    setPayLoading(true);
    try {
      let proofData = proofPreview;
      if (proofFile && paymentMethod === 'transfer') {
        try {
          proofData = await compressImage(proofFile, 1200, 0.8);
        } catch {
          // fallback to raw preview
        }
      }
      await apiAdmin('/api/collector/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: payModal.invoiceId, paymentMethod, collectorProof: proofData }),
      });
      setPayModal(null);
      setPaymentMethod('cash');
      setProofPreview(null);
      setProofFile(null);
      loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal menandai lunas';
      alert(msg);
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Tagihan Pelanggan</h2>
        <p className="text-sm text-muted-foreground mt-1">Tandai invoice sebagai lunas saat menerima pembayaran</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'unpaid', label: 'Belum Bayar' },
          { key: 'all', label: 'Semua' },
          { key: 'paid', label: 'Lunas' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setVisibleCount(20); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f.key
                ? 'bg-emerald-600 text-white'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(20); }}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cari nama, username, ID..."
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Memuat...</div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          Tidak ada data.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(u => (
              <div key={u.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{u.name}</span>
                      {u.status === 'suspended' || u.status === 'isolated' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">Isolir</span>
                      ) : null}
                      {!u.is_paid && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                          {u.unpaid_count} belum bayar
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {u.customerId || u.username} · {u.phone || '—'}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {!u.is_paid && (
                      <div className="text-sm font-bold text-orange-600">{fmtRp(u.unpaid_amount)}</div>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground inline-block transition-transform ${expandedUser === u.id ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {expandedUser === u.id && (
                  <div className="border-t border-border p-4 bg-accent/30">
                    {u.invoices && u.invoices.length > 0 ? (
                      <div className="space-y-2">
                        {u.invoices.map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between gap-4 py-2 px-3 rounded-lg bg-card border border-border">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                #{inv.invoiceNumber}
                                {inv.status === 'PAID' && (
                                  <span className="ml-2 text-xs text-emerald-600 font-medium">Lunas</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Jatuh tempo: {fmtDate(inv.dueDate)}
                                {inv.paymentMethod && ` · ${inv.paymentMethod}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-foreground">{fmtRp(inv.amount)}</div>
                              {inv.status !== 'PAID' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPayModal({
                                      invoiceId: inv.id,
                                      invoiceNumber: inv.invoiceNumber,
                                      amount: inv.amount,
                                      customerName: u.name,
                                    });
                                  }}
                                  className="mt-1 text-xs px-3 py-1 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all"
                                >
                                  Tandai Lunas
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-4">Tidak ada invoice</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="text-center mt-4">
              <button
                onClick={() => setVisibleCount(c => c + 20)}
                className="px-6 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent"
              >
                Muat {Math.min(20, filtered.length - visibleCount)} lagi ({visibleCount}/{filtered.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPayModal(null)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-1">Konfirmasi Pembayaran</h3>
            <p className="text-sm text-muted-foreground mb-4">Invoice #{payModal.invoiceNumber} - {payModal.customerName}</p>

            <div className="bg-accent/30 rounded-lg p-3 mb-4">
              <div className="text-xs text-muted-foreground">Jumlah Tagihan</div>
              <div className="text-xl font-bold text-foreground">{fmtRp(payModal.amount)}</div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">Metode Pembayaran</label>
              <div className="flex gap-2">
                {[
                  { key: 'cash', label: 'Tunai' },
                  { key: 'transfer', label: 'Transfer' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setPaymentMethod(m.key); if (m.key === 'cash') { setProofPreview(null); setProofFile(null); } }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      paymentMethod === m.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-accent text-muted-foreground hover:bg-accent/80'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'transfer' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">Bukti Transfer</label>
                {proofPreview ? (
                  <div className="relative">
                    <img src={proofPreview} alt="Bukti Transfer" className="w-full rounded-lg border border-border max-h-48 object-contain" />
                    <button
                      onClick={() => { setProofPreview(null); setProofFile(null); }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-accent/30 transition-all">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Klik untuk upload bukti transfer</span>
                    <input type="file" accept="image/*" onChange={handleProofSelect} className="hidden" />
                  </label>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent"
              >
                Batal
              </button>
              <button
                onClick={handlePay}
                disabled={payLoading}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
