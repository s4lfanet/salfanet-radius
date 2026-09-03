'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin, ApiError } from '@/lib/api/client';
import {
  UserX, Search, Unplug, ChevronDown, X, Loader2,
  Wallet, Upload, MapPin, Wifi, Calendar, Phone,
  CheckCircle,
} from 'lucide-react';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CollectorIsolirPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Cabut ONT modal
  const [showCabutModal, setShowCabutModal] = useState(false);
  const [cabutTarget, setCabutTarget] = useState<any>(null);
  const [cabutNotes, setCabutNotes] = useState('');
  const [cabutLoading, setCabutLoading] = useState(false);

  // Payment modal
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; amount: number; customerName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payLoading, setPayLoading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await apiAdmin<{ users: any[] }>('/api/collector/isolir');
      setUsers(res.users || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData() }, [loadData]);

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.customerId || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  const openCabutModal = (u: any) => {
    setCabutTarget(u);
    setCabutNotes('');
    setShowCabutModal(true);
  };

  const submitCabut = async () => {
    if (!cabutTarget) return;
    setCabutLoading(true);
    try {
      await apiAdmin('/api/collector/ont-removals', {
        method: 'POST',
        body: JSON.stringify({ username: cabutTarget.username, notes: cabutNotes }),
      });
      setShowCabutModal(false);
      setCabutTarget(null);
      setCabutNotes('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mencatat';
      alert(msg);
    } finally {
      setCabutLoading(false);
    }
  };

  // ─── Payment handlers ────────────────────────────────────────────────
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

  const openPayModal = (inv: any, customerName: string, method: string) => {
    setPayModal({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      customerName,
    });
    setPaymentMethod(method);
    setProofPreview(null);
    setProofFile(null);
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
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Pelanggan Terisolir</h2>
          <p className="text-sm text-muted-foreground mt-1">Pelanggan di wilayahmu yang sedang isolir</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-600 text-sm font-bold">
          {users.length} Pelanggan
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(20); }}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cari nama, username, ID, No. HP..."
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Memuat...</div>
      ) : visible.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <UserX className="w-10 h-10 mx-auto mb-3 opacity-20" />
          {search ? `Tidak ada hasil untuk "${search}"` : 'Tidak ada pelanggan terisolir saat ini.'}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(u => (
              <div key={u.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Header row — click to expand */}
                <div
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{u.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">Isolir</span>
                      {!u.is_paid && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                          {u.unpaid_count} belum bayar
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{u.customerId || u.username}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone || '—'}</span>
                    </div>
                    {/* Quick info badges */}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {u.profile && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <Wifi className="w-3 h-3" />{u.profile.name}
                        </span>
                      )}
                      {u.area && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{u.area.name}
                        </span>
                      )}
                      {u.expiredAt && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />Exp: {fmtDate(u.expiredAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-3">
                    {!u.is_paid && (
                      <div className="text-sm font-bold text-orange-600">{fmtRp(u.unpaid_amount)}</div>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedUser === u.id ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedUser === u.id && (
                  <div className="border-t border-border p-4 bg-accent/30 space-y-3">
                    {/* Customer details */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Username:</span>{' '}
                        <span className="font-mono text-foreground">{u.username}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tipe Langganan:</span>{' '}
                        <span className="text-foreground">{u.subscriptionType === 'POSTPAID' ? 'Pascabayar' : 'Prabayar'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Koneksi:</span>{' '}
                        <span className="text-foreground">{u.connectionType || 'PPPOE'}</span>
                      </div>
                      {u.router && (
                        <div>
                          <span className="text-muted-foreground">Router:</span>{' '}
                          <span className="text-foreground">{u.router.name}</span>
                        </div>
                      )}
                      {u.profile && (
                        <div>
                          <span className="text-muted-foreground">Paket:</span>{' '}
                          <span className="text-foreground">{u.profile.name} ({fmtRp(u.profile.price)}/bln)</span>
                        </div>
                      )}
                      {u.address && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Alamat:</span>{' '}
                          <span className="text-foreground">{u.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Invoices */}
                    {u.invoices && u.invoices.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-foreground">Tagihan Belum Lunas:</p>
                        {u.invoices.map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-card border border-border">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                #{inv.invoiceNumber}
                                <span className="ml-2 text-xs text-orange-600 font-medium">{inv.status}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Jatuh tempo: {fmtDate(inv.dueDate)}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 flex items-center gap-2">
                              <div className="text-sm font-bold text-foreground">{fmtRp(inv.amount)}</div>
                              <div className="flex gap-1">
                                {/* Bayar Cash */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); openPayModal(inv, u.name, 'cash'); }}
                                  className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all flex items-center gap-1"
                                  title="Bayar Tunai"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                  Cash
                                </button>
                                {/* Upload Bukti TF */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); openPayModal(inv, u.name, 'transfer'); }}
                                  className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all flex items-center gap-1"
                                  title="Upload Bukti Transfer"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  TF
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-2">Tidak ada tagihan belum lunas</div>
                    )}

                    {/* Cabut ONT button */}
                    <div className="pt-2 border-t border-border">
                      <button
                        onClick={(e) => { e.stopPropagation(); openCabutModal(u); }}
                        className="w-full py-2 rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
                      >
                        <Unplug className="w-4 h-4" />
                        Catat Cabut ONT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="text-center mt-4">
              <button
                onClick={() => setVisibleCount(c => c + 20)}
                className="px-6 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2"
              >
                <ChevronDown className="w-4 h-4" /> Muat {Math.min(20, filtered.length - visibleCount)} lagi ({visibleCount}/{filtered.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* Cabut ONT Modal */}
      {showCabutModal && cabutTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCabutModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-1">Catat Cabut ONT</h3>
            <p className="text-sm text-muted-foreground mb-4">{cabutTarget.name} ({cabutTarget.username})</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">Catatan (opsional)</label>
              <textarea
                value={cabutNotes}
                onChange={e => setCabutNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="Catatan pencabutan..."
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCabutModal(false)} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent">
                Batal
              </button>
              <button
                onClick={submitCabut}
                disabled={cabutLoading}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cabutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                Catat
              </button>
            </div>
          </div>
        </div>
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
                  { key: 'cash', label: 'Tunai', icon: Wallet },
                  { key: 'transfer', label: 'Transfer', icon: Upload },
                ].map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      onClick={() => { setPaymentMethod(m.key); if (m.key === 'cash') { setProofPreview(null); setProofFile(null); } }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        paymentMethod === m.key
                          ? 'bg-emerald-600 text-white'
                          : 'bg-accent text-muted-foreground hover:bg-accent/80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentMethod === 'transfer' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">Bukti Transfer</label>
                <p className="text-xs text-muted-foreground mb-2">Bukti transfer akan dikirim ke admin untuk verifikasi.</p>
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

            {paymentMethod === 'cash' && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Pembayaran tunai akan langsung mengaktifkan pelanggan.
                </p>
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
