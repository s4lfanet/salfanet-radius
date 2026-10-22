'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';
import { PageHeader, StatusPill, customerStatus, chipClass, LoadingState, ErrorState, EmptyState, ui, fmtRp, toneText } from '@/components/collector/ui';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { printInvoiceStandard, printInvoiceThermal } from '@/lib/invoice-print';
import { BluetoothPrinter, type ThermalReceiptData } from '@/lib/bluetooth-printer';
import { formatWIB } from '@/lib/timezone';
import { showError, showSuccess, showWarning } from '@/lib/sweetalert';
import { cn } from '@/lib/utils';
import { Users, Search, CheckCircle, Loader2, ChevronDown, X, Upload, Printer, Bluetooth, MessageCircle, FileText, Wallet, MapPin, Phone, CalendarClock, LocateFixed } from 'lucide-react';

const PAGE_SIZE = 50;
const fmtDate = (d: string) => d ? formatWIB(d, 'dd MMM yyyy') : '-';

export default function CollectorBillingPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unpaid');
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; amount: number; customerName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payLoading, setPayLoading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [promiseModal, setPromiseModal] = useState<{ userId: string; invoiceId: string; customerName: string } | null>(null);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');
  const [promiseLoading, setPromiseLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'capturing' | 'ok' | 'denied'>('capturing');
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [btPrinter, setBtPrinter] = useState<BluetoothPrinter | null>(null);
  const [btConnected, setBtConnected] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const printMenuRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiAdmin<{ users: any[] }>(`/api/collector/users?filter=${filter}${scopeQuery(scope)}`);
      setUsers(res.users || []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat data pelanggan');
    }
    finally { setLoading(false); }
  }, [filter, scope]);

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

  const handlePrintA4 = async (invoiceId: string) => {
    setActionLoading(`a4-${invoiceId}`);
    setShowPrintMenu(null);
    try {
      await printInvoiceStandard(invoiceId, (type, title, desc) => {
        if (type === 'error') showError(desc || title, title);
      });
    } catch (_err) {
      showError('Gagal mencetak invoice');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintThermal = async (invoiceId: string) => {
    setActionLoading(`thermal-${invoiceId}`);
    setShowPrintMenu(null);
    try {
      await printInvoiceThermal(invoiceId, (type, title, desc) => {
        if (type === 'error') showError(desc || title, title);
      });
    } catch (_err) {
      showError('Gagal mencetak struk');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBluetoothConnect = async () => {
    if (!BluetoothPrinter.isSupported()) {
      showWarning('Bluetooth printing tidak tersedia. Gunakan Chrome/Edge di Android atau APK Salfanet Collector.');
      return;
    }
    setActionLoading('bt-connect');
    try {
      const printer = new BluetoothPrinter();
      const ok = await printer.connect();
      if (ok) {
        setBtPrinter(printer);
        setBtConnected(true);
      }
    } catch (err: any) {
      showError(err.message || 'Gagal connect ke printer Bluetooth');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBluetoothDisconnect = async () => {
    if (btPrinter) {
      await btPrinter.disconnect();
      setBtPrinter(null);
      setBtConnected(false);
    }
  };

  const handlePrintBluetooth = async (invoiceId: string) => {
    setShowPrintMenu(null);
    if (!btPrinter || !btConnected) {
      // Try to connect first
      if (!BluetoothPrinter.isSupported()) {
        showWarning('Bluetooth printing tidak tersedia. Gunakan Chrome/Edge di Android atau APK Salfanet Collector.');
        return;
      }
      setActionLoading(`bt-${invoiceId}`);
      try {
        const printer = new BluetoothPrinter();
        const ok = await printer.connect();
        if (!ok) {
          showError('Gagal connect ke printer Bluetooth');
          return;
        }
        setBtPrinter(printer);
        setBtConnected(true);

        // Fetch invoice data and print
        const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success || !data.data) {
          showError('Gagal mengambil data invoice');
          return;
        }
        const inv = data.data;
        const receiptData: ThermalReceiptData = {
          company: inv.company,
          customer: inv.customer,
          invoice: inv.invoice,
          items: inv.items,
          additionalFees: inv.additionalFees,
          amountFormatted: inv.amountFormatted,
        };
        await printer.printReceipt(receiptData);
        showSuccess('Struk berhasil dicetak via Bluetooth');
      } catch (err: any) {
        showError(err.message || 'Gagal mencetak via Bluetooth');
      } finally {
        setActionLoading(null);
      }
      return;
    }

    // Already connected - just print
    setActionLoading(`bt-${invoiceId}`);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: 'include' });
      const data = await res.json();
      if (!data.success || !data.data) {
        showError('Gagal mengambil data invoice');
        return;
      }
      const inv = data.data;
      const receiptData: ThermalReceiptData = {
        company: inv.company,
        customer: inv.customer,
        invoice: inv.invoice,
        items: inv.items,
        additionalFees: inv.additionalFees,
        amountFormatted: inv.amountFormatted,
      };
      await btPrinter.printReceipt(receiptData);
    } catch (err: any) {
      showError(err.message || 'Gagal mencetak via Bluetooth');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendWhatsApp = async (invoiceId: string, invoiceNumber: string, customerName: string) => {
    setActionLoading(`wa-${invoiceId}`);
    try {
      const res = await apiAdmin<{ success: boolean; message?: string; error?: string }>('/api/collector/send-invoice', {
        method: 'POST',
        body: JSON.stringify({ invoiceId }),
      });
      if (res.success) {
        showSuccess(`Bukti pembayaran lunas terkirim via WhatsApp ke pelanggan ${customerName}`);
      } else {
        showError(res.error || 'Gagal mengirim WhatsApp');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mengirim WhatsApp';
      showError(msg);
    } finally {
      setActionLoading(null);
    }
  };

  // Close print menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) {
        setShowPrintMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePay = async () => {
    if (!payModal) return;
    if (paymentMethod === 'transfer' && !proofPreview) {
      showWarning('Harap upload bukti transfer terlebih dahulu');
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
      showError(msg);
    } finally {
      setPayLoading(false);
    }
  };

  const captureGps = () => {
    setGpsStatus('capturing');
    setGpsCoords(null);
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGpsStatus('ok');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const openPromiseModal = (userId: string, invoiceId: string, customerName: string) => {
    setPromiseModal({ userId, invoiceId, customerName });
    setPromiseDate('');
    setPromiseNotes('');
    captureGps();
  };

  const handleCreatePromise = async () => {
    if (!promiseModal) return;
    if (!promiseDate) { showWarning('Pilih tanggal janji bayar'); return; }
    if (new Date(promiseDate) <= new Date()) { showWarning('Tanggal janji harus di masa depan'); return; }
    if (gpsStatus !== 'ok' || !gpsCoords) {
      showWarning('Lokasi GPS wajib didapat terlebih dahulu. Aktifkan izin lokasi lalu coba lagi.');
      return;
    }
    setPromiseLoading(true);
    try {
      await apiAdmin('/api/collector/promise', {
        method: 'POST',
        body: JSON.stringify({
          userId: promiseModal.userId,
          invoiceId: promiseModal.invoiceId,
          promiseDate,
          notes: promiseNotes || null,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude,
        }),
      });
      showSuccess('Janji bayar tercatat dengan lokasi GPS. Akses internet pelanggan dibuka kembali.');
      setPromiseModal(null);
      loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal membuat janji bayar';
      showError(msg);
    } finally {
      setPromiseLoading(false);
    }
  };

  // Escape closes whichever dialog is open.
  useEffect(() => {
    if (!payModal && !promiseModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPayModal(null);
      setPromiseModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payModal, promiseModal]);

  const openPay = (inv: any, u: any, method: 'cash' | 'transfer') => {
    setPayModal({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: inv.amount, customerName: u.name });
    setPaymentMethod(method);
    setProofPreview(null);
    setProofFile(null);
  };

  const busy = (id: string) => actionLoading === `a4-${id}` || actionLoading === `thermal-${id}` || actionLoading === `bt-${id}`;

  // "Tagih" on the Pelanggan page links here with ?q=<username>.
  const [linkedQuery, setLinkedQuery] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) { setSearch(q); setLinkedQuery(q); }
  }, []);
  // Open that customer once the list has it.
  useEffect(() => {
    if (!linkedQuery || loading) return;
    const match = users.find((u) => u.username === linkedQuery);
    if (match) setExpandedUser(match.id);
    setLinkedQuery(null);
  }, [linkedQuery, loading, users]);

  // One customer's invoices with their actions; shared by phone cards and the desktop table.
  const renderInvoices = (u: any) => (
    u.invoices && u.invoices.length > 0 ? (
      <ul className="space-y-2">
        {u.invoices.map((inv: any) => {
          const paid = inv.status === 'PAID';
          return (
            <li key={inv.id} className="rounded-xl border border-border bg-background p-3 md:flex md:items-center md:gap-4">
              <div className="flex items-start justify-between gap-3 md:flex-1 md:min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{fmtRp(inv.amount)}</p>
                  <p className="text-xs text-muted-foreground break-words">#{inv.invoiceNumber} · jatuh tempo {fmtDate(inv.dueDate)}</p>
                </div>
                <StatusPill tone={paid ? 'green' : inv.status === 'OVERDUE' ? 'red' : 'amber'}>
                  {paid ? 'Lunas' : inv.status === 'OVERDUE' ? 'Lewat tempo' : 'Belum bayar'}
                </StatusPill>
              </div>

              {!paid ? (
                <div className="mt-3 md:mt-0 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <button type="button" onClick={() => openPromiseModal(u.id, inv.id, u.name)} className={cn(ui.btnSecondary, 'h-10 text-amber-700 dark:text-amber-400')}>
                    <CalendarClock className="w-4 h-4" /> Janji bayar
                  </button>
                  <button type="button" onClick={() => openPay(inv, u, 'transfer')} className={cn(ui.btnSecondary, 'h-10')}>
                    <Upload className="w-4 h-4" /> Transfer
                  </button>
                  <button type="button" onClick={() => openPay(inv, u, 'cash')} className={cn(ui.btnPrimary, 'h-10 col-span-2 sm:col-span-1')}>
                    <Wallet className="w-4 h-4" /> Lunas tunai
                  </button>
                </div>
              ) : (
                <div className="mt-3 md:mt-0 flex flex-wrap justify-end gap-2">
                  <div className="relative" ref={showPrintMenu === inv.id ? printMenuRef : null}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowPrintMenu(showPrintMenu === inv.id ? null : inv.id); }}
                      disabled={busy(inv.id)}
                      aria-expanded={showPrintMenu === inv.id}
                      className={cn(ui.btnSecondary, 'h-10')}
                    >
                      {busy(inv.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Cetak
                    </button>
                    {showPrintMenu === inv.id && (
                      <div className="absolute right-0 bottom-full mb-1 z-20 rounded-xl border border-border bg-card py-1 min-w-[200px]" role="menu">
                        <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); handlePrintA4(inv.id); }} className="w-full flex items-center gap-2 h-11 px-3 text-sm text-foreground hover:bg-muted text-left">
                          <FileText className="w-4 h-4" /> Invoice A4
                        </button>
                        <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); handlePrintThermal(inv.id); }} className="w-full flex items-center gap-2 h-11 px-3 text-sm text-foreground hover:bg-muted text-left">
                          <Printer className="w-4 h-4" /> Struk 80mm
                        </button>
                        <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); handlePrintBluetooth(inv.id); }} className="w-full flex items-center gap-2 h-11 px-3 text-sm text-foreground hover:bg-muted text-left">
                          <Bluetooth className="w-4 h-4" /> Printer Bluetooth
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSendWhatsApp(inv.id, inv.invoiceNumber, u.name); }}
                    disabled={actionLoading === `wa-${inv.id}`}
                    className={cn(ui.btnSecondary, 'h-10')}
                  >
                    {actionLoading === `wa-${inv.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Kirim bukti lunas
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground py-2">Belum ada tagihan untuk pelanggan ini.</p>
    )
  );

  const amountCell = (u: any, align: 'left' | 'right' = 'right') => (
    !u.is_paid ? (
      <div className={align === 'right' ? 'text-right' : ''}>
        <p className={cn('text-sm font-bold', toneText('red'))}>{fmtRp(u.unpaid_amount)}</p>
        <p className="text-xs text-muted-foreground">{u.unpaid_count} tagihan</p>
      </div>
    ) : u.invoices?.length > 0 ? (
      <p className={cn('text-sm font-semibold', toneText('green'))}>Lunas</p>
    ) : (
      <p className="text-xs text-muted-foreground">Tanpa tagihan</p>
    )
  );

  return (
    <div>
      <PageHeader
        title="Tagihan"
        description="Tandai lunas saat menerima pembayaran, atau catat janji bayar"
        actions={
          btConnected ? (
            <div className="flex items-center gap-2">
              <StatusPill tone="green"><Bluetooth className="w-3.5 h-3.5 mr-1" />Printer terhubung</StatusPill>
              <button type="button" onClick={handleBluetoothDisconnect} className={cn(ui.btnSecondary, 'h-9 px-3 text-xs')}>Putuskan</button>
            </div>
          ) : (
            <button type="button" onClick={handleBluetoothConnect} disabled={actionLoading === 'bt-connect'} className={cn(ui.btnSecondary, 'w-full sm:w-auto')}>
              {actionLoading === 'bt-connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
              Hubungkan printer Bluetooth
            </button>
          )
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
      <div className="relative lg:w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className={cn(ui.input, 'pl-9 pr-11')}
          placeholder="Cari nama, ID, username, No. HP"
          aria-label="Cari pelanggan"
        />
        {search && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="Filter tagihan">
        {[
          { key: 'unpaid', label: 'Belum bayar' },
          { key: 'paid', label: 'Lunas' },
          { key: 'all', label: 'Semua' },
        ].map(f => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setVisibleCount(PAGE_SIZE); }} className={chipClass(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      </div>

      <ScopeFilter value={scope} onChange={(v) => { setScope(v); setVisibleCount(PAGE_SIZE); }} />

      {loadError && users.length > 0 && (
        <div className={cn(ui.card, 'p-3 mb-3 flex items-center justify-between gap-3')} role="alert">
          <span className={cn('text-sm', toneText('red'))}>Data terbaru gagal dimuat, yang tampil mungkin belum terbaru.</span>
          <button type="button" onClick={loadData} className={cn(ui.btnSecondary, 'h-9 px-3 text-xs shrink-0')}>Coba lagi</button>
        </div>
      )}

      {loading ? (
        <LoadingState label="Memuat tagihan..." />
      ) : loadError && users.length === 0 ? (
        <ErrorState message={loadError} onRetry={loadData} />
      ) : visible.length === 0 ? (
        filter === 'unpaid' && !search
          ? <EmptyState icon={<CheckCircle className="w-5 h-5" />} title="Semua tagihan sudah lunas" hint="Tidak ada pelanggan dengan tagihan terbuka di wilayah tugas Anda." />
          : <EmptyState icon={<Users className="w-5 h-5" />} title="Tidak ada yang cocok" hint="Ubah kata kunci atau pilih filter Semua." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">{filtered.length} pelanggan</p>

          {/* Table: tablets and up. A row opens to its invoices. */}
          <div className={cn(ui.card, 'hidden md:block overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Pelanggan</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Paket</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden xl:table-cell">Router / Area</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Telepon</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Tagihan</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="sr-only">Buka</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(u => {
                  const st = customerStatus(u.status);
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
                        <td className="px-3 py-3"><StatusPill tone={st.tone}>{st.label}</StatusPill></td>
                        <td className="px-3 py-3 whitespace-nowrap">{amountCell(u)}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedUser(open ? null : u.id)}
                            aria-expanded={open}
                            className={cn(open ? ui.btnSecondary : ui.btnPrimary, 'h-9 px-3 text-xs')}
                          >
                            {open ? 'Tutup' : u.is_paid ? 'Lihat' : 'Tagih'}
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
              const st = customerStatus(u.status);
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
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
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
                      ) : u.invoices?.length > 0 ? (
                        <p className={cn('text-sm font-semibold', toneText('green'))}>Lunas</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Tanpa tagihan</p>
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
              Tagihan ditandai lunas dan tidak bisa dibatalkan dari sini. Pelanggan menerima bukti lunas lewat WhatsApp.
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

      {/* Promise-to-pay dialog */}
      {promiseModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="promise-title">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setPromiseModal(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto">
            <h3 id="promise-title" className="text-lg font-bold text-foreground">Janji bayar</h3>
            <p className="text-sm text-muted-foreground">{promiseModal.customerName}</p>

            {/* GPS is mandatory: it records that the visit happened here. */}
            <div
              className={cn(
                'mt-4 rounded-xl p-3 flex items-center gap-2 text-sm',
                gpsStatus === 'ok' ? 'bg-emerald-600/10 ' + toneText('green') : gpsStatus === 'denied' ? 'bg-red-600/10 ' + toneText('red') : 'bg-muted text-muted-foreground',
              )}
              role="status"
            >
              {gpsStatus === 'capturing' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
              {gpsStatus === 'ok' && <LocateFixed className="w-4 h-4 shrink-0" />}
              {gpsStatus === 'denied' && <MapPin className="w-4 h-4 shrink-0" />}
              <span className="flex-1">
                {gpsStatus === 'capturing' && 'Mengambil lokasi GPS...'}
                {gpsStatus === 'ok' && gpsCoords && `Lokasi tercatat (${gpsCoords.latitude.toFixed(5)}, ${gpsCoords.longitude.toFixed(5)})`}
                {gpsStatus === 'denied' && 'Lokasi tidak didapat. Izinkan akses lokasi, lalu coba lagi.'}
              </span>
              {gpsStatus === 'denied' && (
                <button type="button" onClick={captureGps} className="shrink-0 h-9 px-3 rounded-lg text-xs font-semibold underline">Coba lagi</button>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="promise-date" className="block text-sm font-medium mb-1 text-foreground">Tanggal janji bayar</label>
                <input
                  id="promise-date"
                  type="date"
                  value={promiseDate}
                  onChange={e => setPromiseDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  className={ui.input}
                />
              </div>
              <div>
                <label htmlFor="promise-notes" className="block text-sm font-medium mb-1 text-foreground">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
                <textarea
                  id="promise-notes"
                  value={promiseNotes}
                  onChange={e => setPromiseNotes(e.target.value)}
                  placeholder="Contoh: bayar setelah gajian tanggal 25"
                  rows={3}
                  className={cn(ui.input, 'h-auto py-2')}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Lokasi Anda dicatat sebagai bukti kunjungan. Internet pelanggan dibuka sampai tanggal janji.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPromiseModal(null)} className={ui.btnSecondary}>Batal</button>
              <button type="button" onClick={handleCreatePromise} disabled={promiseLoading || gpsStatus !== 'ok'} className={ui.btnPrimary}>
                {promiseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Simpan janji
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
