'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, StatusPill, LoadingState, ErrorState, EmptyState, chipClass, ui, fmtRp, toneText } from '@/components/collector/ui';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { formatWIB } from '@/lib/timezone';
import { showError, showSuccess, showWarning } from '@/lib/sweetalert';
import { cn } from '@/lib/utils';
import { Search, Unplug, ChevronDown, X, Loader2, Wallet, Upload, Phone, CheckCircle } from 'lucide-react';

const PAGE_SIZE = 50;
const fmtDate = (d: string | null) => d ? formatWIB(d, 'dd MMM yyyy') : '-';

export default function CollectorIsolirPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Cabut ONT dialog
  const [cabutTarget, setCabutTarget] = useState<any>(null);
  const [cabutNotes, setCabutNotes] = useState('');
  const [cabutLoading, setCabutLoading] = useState(false);

  // Payment dialog
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; amount: number; customerName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payLoading, setPayLoading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiAdmin<{ users: any[] }>(`/api/collector/isolir?${scopeQuery(scope).slice(1)}`);
      setUsers(res.users || []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Daftar pelanggan isolir gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { loadData(); }, [loadData]);

  // Escape closes whichever dialog is open.
  useEffect(() => {
    if (!payModal && !cabutTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPayModal(null);
      setCabutTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payModal, cabutTarget]);

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.customerId || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q);
  });
  const visible = filtered.slice(0, visibleCount);

  // Open invoices plus Cabut ONT for one customer; shared by phone cards and the desktop table.
  const renderInvoices = (u: any) => (
    <>
      {u.invoices && u.invoices.length > 0 ? (
        <ul className="space-y-2">
          {u.invoices.map((inv: any) => (
            <li key={inv.id} className="rounded-xl border border-border bg-background p-3 md:flex md:items-center md:gap-4">
              <div className="flex items-start justify-between gap-3 md:flex-1 md:min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{fmtRp(inv.amount)}</p>
                  <p className="text-xs text-muted-foreground break-words">#{inv.invoiceNumber} · jatuh tempo {fmtDate(inv.dueDate)}</p>
                </div>
                <StatusPill tone={inv.status === 'OVERDUE' ? 'red' : 'amber'}>{inv.status === 'OVERDUE' ? 'Lewat tempo' : 'Belum bayar'}</StatusPill>
              </div>
              <div className="mt-3 md:mt-0 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <button type="button" onClick={() => openPayModal(inv, u.name, 'transfer')} className={cn(ui.btnSecondary, 'h-10')}>
                  <Upload className="w-4 h-4" /> Transfer
                </button>
                <button type="button" onClick={() => openPayModal(inv, u.name, 'cash')} className={cn(ui.btnPrimary, 'h-10')}>
                  <Wallet className="w-4 h-4" /> Lunas tunai
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground py-2">Tidak ada tagihan terbuka.</p>
      )}
      <div className="mt-3 flex md:justify-end">
        <button
          type="button"
          onClick={() => { setCabutTarget(u); setCabutNotes(''); }}
          className={cn(ui.btnSecondary, 'w-full md:w-auto text-red-700 dark:text-red-400')}
        >
          <Unplug className="w-4 h-4" /> Catat cabut ONT
        </button>
      </div>
    </>
  );

  const submitCabut = async () => {
    if (!cabutTarget) return;
    setCabutLoading(true);
    try {
      await apiAdmin('/api/collector/ont-removals', {
        method: 'POST',
        body: JSON.stringify({ username: cabutTarget.username, notes: cabutNotes }),
      });
      showSuccess(`Cabut ONT untuk ${cabutTarget.name} tercatat`);
      setCabutTarget(null);
      setCabutNotes('');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Cabut ONT gagal dicatat');
    } finally {
      setCabutLoading(false);
    }
  };

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
    setPayModal({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: inv.amount, customerName });
    setPaymentMethod(method);
    setProofPreview(null);
    setProofFile(null);
  };

  const handlePay = async () => {
    if (!payModal) return;
    if (paymentMethod === 'transfer' && !proofPreview) {
      showWarning('Unggah bukti transfer dulu');
      return;
    }
    setPayLoading(true);
    try {
      let proofData = proofPreview;
      if (proofFile && paymentMethod === 'transfer') {
        try {
          proofData = await compressImage(proofFile, 1200, 0.8);
        } catch {
          // keep the uncompressed preview
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
      showError(err instanceof ApiError ? err.message : 'Tagihan gagal ditandai lunas');
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Pelanggan Isolir" description="Pelanggan di wilayah tugas Anda yang internetnya sedang diputus" />

      <ScopeFilter value={scope} onChange={(v) => { setScope(v); setVisibleCount(PAGE_SIZE); }} />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className={cn(ui.input, 'pl-9 pr-11')}
          placeholder="Cari nama, ID, username, No. HP"
          aria-label="Cari pelanggan isolir"
        />
        {search && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState label="Memuat pelanggan isolir..." />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={loadData} />
      ) : users.length === 0 ? (
        <EmptyState icon={<CheckCircle className="w-5 h-5" />} title="Tidak ada pelanggan isolir" hint="Semua pelanggan di wilayah tugas Anda sedang aktif." />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Search className="w-5 h-5" />} title="Tidak ada yang cocok" hint="Ubah kata kunci pencarian." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">{filtered.length} pelanggan isolir</p>

          {/* Table: tablets and up. A row opens to its open invoices and Cabut ONT. */}
          <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Pelanggan</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Paket</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">Router / Area</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Telepon</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">Aktif s/d</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Tunggakan</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="sr-only">Buka</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(u => {
                  const open = expandedUser === u.id;
                  return (
                    <Fragment key={u.id}>
                      <tr className={cn('align-top', open ? 'bg-muted/40' : 'hover:bg-muted/40')}>
                        <td className="px-3 py-3 min-w-[12rem]">
                          <p className="font-semibold text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.customerId || u.username}{u.customerId ? ` · ${u.username}` : ''}</p>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          {u.profile ? <><p className="text-foreground">{u.profile.name}</p><p className="text-xs text-muted-foreground">{fmtRp(u.profile.price)}/bln</p></> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell">
                          <p className="text-foreground">{u.router?.name || '-'}</p>
                          <p className="text-xs text-muted-foreground">{u.area?.name || '-'}</p>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap">
                          {u.phone ? <a href={`tel:${u.phone}`} className="text-blue-700 dark:text-blue-400 hover:underline">{u.phone}</a> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell whitespace-nowrap text-muted-foreground">{fmtDate(u.expiredAt)}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {!u.is_paid ? (
                            <>
                              <p className={cn('font-bold', toneText('red'))}>{fmtRp(u.unpaid_amount)}</p>
                              <p className="text-xs text-muted-foreground">{u.unpaid_count} tagihan</p>
                            </>
                          ) : <p className={cn('font-semibold', toneText('green'))}>Lunas</p>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => setExpandedUser(open ? null : u.id)} aria-expanded={open} className={cn(open ? ui.btnSecondary : ui.btnPrimary, 'h-9 px-3 text-xs pointer-coarse:h-11')}>
                            {open ? 'Tutup' : 'Tindak'}
                            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/40">
                          <td colSpan={7} className="px-3 pb-3">
                            {u.address && <p className="text-xs text-muted-foreground mb-2">Alamat: <span className="text-foreground">{u.address}</span></p>}
                            {renderInvoices(u)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards: phones */}
          <ul className="md:hidden space-y-2">
            {visible.map(u => {
              const open = expandedUser === u.id;
              return (
                <li key={u.id} className={ui.card}>
                  <button
                    type="button"
                    onClick={() => setExpandedUser(open ? null : u.id)}
                    aria-expanded={open}
                    className="w-full text-left p-4 flex items-start gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-foreground truncate">{u.name}</p>
                        <StatusPill tone="red">Isolir</StatusPill>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {[u.customerId || u.username, u.phone, u.area?.name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {!u.is_paid ? (
                        <>
                          <p className={cn('text-sm font-bold', toneText('red'))}>{fmtRp(u.unpaid_amount)}</p>
                          <p className="text-xs text-muted-foreground">{u.unpaid_count} tagihan</p>
                        </>
                      ) : (
                        <p className={cn('text-sm font-semibold', toneText('green'))}>Lunas</p>
                      )}
                    </div>
                    <ChevronDown className={cn('w-5 h-5 mt-0.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
                  </button>

                  {open && (
                    <div className="border-t border-border px-4 pb-4">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 text-xs">
                        {u.profile && (<div><dt className="text-muted-foreground">Paket</dt><dd className="text-foreground font-medium">{u.profile.name} · {fmtRp(u.profile.price)}</dd></div>)}
                        <div><dt className="text-muted-foreground">Aktif s/d</dt><dd className="text-foreground font-medium">{fmtDate(u.expiredAt)}</dd></div>
                        <div><dt className="text-muted-foreground">Username</dt><dd className="text-foreground font-medium break-all">{u.username}</dd></div>
                        <div><dt className="text-muted-foreground">Tipe</dt><dd className="text-foreground font-medium">{u.subscriptionType === 'POSTPAID' ? 'Pascabayar' : 'Prabayar'} · {u.connectionType || 'PPPOE'}</dd></div>
                        {u.router && (<div><dt className="text-muted-foreground">Router/NAS</dt><dd className="text-foreground font-medium">{u.router.name}</dd></div>)}
                        {u.phone && (<div><dt className="text-muted-foreground">Telepon</dt><dd><a href={`tel:${u.phone}`} className="font-medium text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone}</a></dd></div>)}
                        {u.address && (<div className="col-span-2"><dt className="text-muted-foreground">Alamat</dt><dd className="text-foreground">{u.address}</dd></div>)}
                      </dl>

                      {renderInvoices(u)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {visibleCount < filtered.length && (
            <button type="button" onClick={() => setVisibleCount(c => c + PAGE_SIZE)} className={cn(ui.btnSecondary, 'mt-4 w-full')}>
              Tampilkan {Math.min(PAGE_SIZE, filtered.length - visibleCount)} lagi ({visibleCount} dari {filtered.length})
            </button>
          )}
        </>
      )}

      {/* Cabut ONT dialog */}
      {cabutTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cabut-title">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setCabutTarget(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h3 id="cabut-title" className="text-lg font-bold text-foreground">Catat cabut ONT</h3>
            <p className="text-sm text-muted-foreground">{cabutTarget.name} · {cabutTarget.username}</p>
            <label htmlFor="cabut-notes" className="block text-sm font-medium text-foreground mt-4 mb-1">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
            <textarea
              id="cabut-notes"
              value={cabutNotes}
              onChange={e => setCabutNotes(e.target.value)}
              rows={3}
              className={cn(ui.input, 'h-auto py-2 resize-none')}
              placeholder="Contoh: ONT diambil, adaptor tertinggal"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCabutTarget(null)} className={ui.btnSecondary}>Batal</button>
              <button
                type="button"
                onClick={submitCabut}
                disabled={cabutLoading}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {cabutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />} Catat cabut
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment dialog */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setPayModal(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto">
            <h3 id="pay-title" className="text-lg font-bold text-foreground">Tandai lunas</h3>
            <p className="text-sm text-muted-foreground">{payModal.customerName} · #{payModal.invoiceNumber}</p>

            <div className="mt-4 rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">Jumlah diterima</p>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">{fmtRp(payModal.amount)}</p>
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-foreground mb-2">Cara bayar</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'cash', label: 'Tunai', icon: Wallet },
                  { key: 'transfer', label: 'Transfer', icon: Upload },
                ].map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={paymentMethod === m.key}
                      onClick={() => { setPaymentMethod(m.key); if (m.key === 'cash') { setProofPreview(null); setProofFile(null); } }}
                      className={chipClass(paymentMethod === m.key) + ' h-11 flex items-center justify-center gap-2'}
                    >
                      <Icon className="w-4 h-4" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {paymentMethod === 'transfer' && (
              <div className="mt-4">
                <p className="text-sm font-medium text-foreground mb-2">Bukti transfer</p>
                {proofPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a picked file */}
                    <img src={proofPreview} alt="Bukti transfer" className="w-full rounded-xl border border-border max-h-48 object-contain" />
                    <button type="button" aria-label="Hapus bukti" onClick={() => { setProofPreview(null); setProofFile(null); }} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 cursor-pointer hover:bg-muted focus-within:ring-2 focus-within:ring-blue-600">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Ambil foto atau pilih gambar</span>
                    <input type="file" accept="image/*" onChange={handleProofSelect} className="sr-only" />
                  </label>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              Tagihan ditandai lunas dan tidak bisa dibatalkan dari sini. Internet pelanggan dibuka kembali setelah lunas.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPayModal(null)} className={ui.btnSecondary}>Batal</button>
              <button type="button" onClick={handlePay} disabled={payLoading} className={ui.btnPrimary}>
                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Tandai lunas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
