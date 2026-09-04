'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { apiAdmin, ApiError } from '@/lib/api/client';
import { printInvoiceStandard, printInvoiceThermal } from '@/lib/invoice-print';
import { BluetoothPrinter, type ThermalReceiptData } from '@/lib/bluetooth-printer';
import { formatWIB } from '@/lib/timezone';
import { Users, Search, CheckCircle, Loader2, ChevronDown, X, Upload, Printer, Bluetooth, MessageCircle, FileText, Wallet, MapPin, Wifi, Calendar, Phone } from 'lucide-react';

const PAGE_SIZE = 50;
const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtDate = (d: string) => d ? formatWIB(d, 'dd MMM yyyy') : '—';

export default function CollectorBillingPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unpaid');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; amount: number; customerName: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [payLoading, setPayLoading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [btPrinter, setBtPrinter] = useState<BluetoothPrinter | null>(null);
  const [btConnected, setBtConnected] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState<string | null>(null);
  const printMenuRef = useRef<HTMLDivElement | null>(null);

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
        if (type === 'error') alert(`${title}${desc ? ': ' + desc : ''}`);
      });
    } catch (err) {
      alert('Gagal mencetak invoice');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintThermal = async (invoiceId: string) => {
    setActionLoading(`thermal-${invoiceId}`);
    setShowPrintMenu(null);
    try {
      await printInvoiceThermal(invoiceId, (type, title, desc) => {
        if (type === 'error') alert(`${title}${desc ? ': ' + desc : ''}`);
      });
    } catch (err) {
      alert('Gagal mencetak struk');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBluetoothConnect = async () => {
    if (!BluetoothPrinter.isSupported()) {
      alert('Bluetooth printing tidak tersedia.\nGunakan Chrome/Edge di Android atau APK Salfanet Collector.');
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
      alert(err.message || 'Gagal connect ke printer Bluetooth');
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
        alert('Bluetooth printing tidak tersedia.\nGunakan Chrome/Edge di Android atau APK Salfanet Collector.');
        return;
      }
      setActionLoading(`bt-${invoiceId}`);
      try {
        const printer = new BluetoothPrinter();
        const ok = await printer.connect();
        if (!ok) {
          alert('Gagal connect ke printer Bluetooth');
          return;
        }
        setBtPrinter(printer);
        setBtConnected(true);

        // Fetch invoice data and print
        const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success || !data.data) {
          alert('Gagal mengambil data invoice');
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
        alert('Struk berhasil dicetak via Bluetooth');
      } catch (err: any) {
        alert(err.message || 'Gagal mencetak via Bluetooth');
      } finally {
        setActionLoading(null);
      }
      return;
    }

    // Already connected — just print
    setActionLoading(`bt-${invoiceId}`);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: 'include' });
      const data = await res.json();
      if (!data.success || !data.data) {
        alert('Gagal mengambil data invoice');
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
      alert(err.message || 'Gagal mencetak via Bluetooth');
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
        alert(`Bukti pembayaran lunas terkirim via WhatsApp ke pelanggan ${customerName}`);
      } else {
        alert(res.error || 'Gagal mengirim WhatsApp');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mengirim WhatsApp';
      alert(msg);
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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Tagihan Pelanggan</h2>
          <p className="text-sm text-muted-foreground mt-1">Tandai invoice sebagai lunas saat menerima pembayaran</p>
        </div>
        {/* Bluetooth printer status */}
        <div className="flex items-center gap-2">
          {btConnected ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Bluetooth className="w-4 h-4" />
                Printer terhubung
              </span>
              <button
                onClick={handleBluetoothDisconnect}
                className="text-xs text-red-500 hover:text-red-600"
              >
                Putus
              </button>
            </div>
          ) : (
            <button
              onClick={handleBluetoothConnect}
              disabled={actionLoading === 'bt-connect'}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent transition-all"
            >
              {actionLoading === 'bt-connect' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bluetooth className="w-3.5 h-3.5" />
              )}
              Hubungkan Printer BT
            </button>
          )}
        </div>
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
            onClick={() => { setFilter(f.key); setVisibleCount(PAGE_SIZE); }}
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
          onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cari nama, username, ID, No. HP..."
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
          {/* Table */}
          <div className="overflow-x-auto bg-card border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-accent/50 border-b border-border">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Pelanggan</th>
                  <th className="px-3 py-3 font-medium">Paket</th>
                  <th className="px-3 py-3 font-medium">Area</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Expired</th>
                  <th className="px-3 py-3 font-medium text-right">Tagihan</th>
                  <th className="px-3 py-3 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(u => (
                  <Fragment key={u.id}>
                    <tr className="hover:bg-accent/30 transition-colors">
                      {/* Pelanggan */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                            className="p-0.5 rounded hover:bg-muted"
                          >
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedUser === u.id ? 'rotate-180' : ''}`} />
                          </button>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{u.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="font-mono">{u.customerId || u.username}</span>
                              <span>·</span>
                              <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{u.phone || '—'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Paket */}
                      <td className="px-3 py-3">
                        {u.profile ? (
                          <div>
                            <div className="text-xs font-medium text-foreground flex items-center gap-1">
                              <Wifi className="w-3 h-3 text-muted-foreground" />
                              {u.profile.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{fmtRp(u.profile.price)}/bln</div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* Area */}
                      <td className="px-3 py-3">
                        {u.area ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {u.area.name}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* Status */}
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' :
                          u.status === 'isolated' || u.status === 'suspended' ? 'bg-red-500/10 text-red-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {u.status === 'active' ? 'Aktif' : u.status === 'isolated' || u.status === 'suspended' ? 'Isolir' : u.status}
                        </span>
                      </td>
                      {/* Expired */}
                      <td className="px-3 py-3">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(u.expiredAt)}
                        </span>
                      </td>
                      {/* Tagihan */}
                      <td className="px-3 py-3 text-right">
                        {!u.is_paid ? (
                          <div>
                            <div className="text-sm font-bold text-orange-600">{fmtRp(u.unpaid_amount)}</div>
                            <div className="text-xs text-muted-foreground">{u.unpaid_count} invoice</div>
                          </div>
                        ) : u.invoices?.length > 0 ? (
                          <span className="text-xs text-emerald-600 font-medium">Lunas</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {/* Aksi */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                            className="text-xs text-emerald-600 font-medium hover:underline"
                          >
                            {u.invoices?.length || 0} invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded invoice rows */}
                    {expandedUser === u.id && (
                      <tr className="bg-accent/20">
                        <td colSpan={7} className="px-3 py-3">
                          {/* Customer detail */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">Username:</span>{' '}
                              <span className="font-mono text-foreground">{u.username}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tipe:</span>{' '}
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
                            {u.address && (
                              <div className="col-span-2 md:col-span-4">
                                <span className="text-muted-foreground">Alamat:</span>{' '}
                                <span className="text-foreground">{u.address}</span>
                              </div>
                            )}
                          </div>

                          {/* Invoice table */}
                          {u.invoices && u.invoices.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border border-border">
                              <table className="w-full text-xs">
                                <thead className="bg-card border-b border-border">
                                  <tr className="text-left text-muted-foreground">
                                    <th className="px-3 py-2 font-medium">No. Invoice</th>
                                    <th className="px-3 py-2 font-medium">Jatuh Tempo</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium text-right">Jumlah</th>
                                    <th className="px-3 py-2 font-medium text-center">Aksi</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {u.invoices.map((inv: any) => (
                                    <tr key={inv.id} className="bg-card/50">
                                      <td className="px-3 py-2 font-mono text-foreground">#{inv.invoiceNumber}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                                      <td className="px-3 py-2">
                                        {inv.status === 'PAID' ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600">Lunas</span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-600">{inv.status}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-foreground">{fmtRp(inv.amount)}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-1">
                                          {/* Unpaid: Cash + TF buttons */}
                                          {inv.status !== 'PAID' && (
                                            <>
                                              <button
                                                onClick={() => {
                                                  setPayModal({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: inv.amount, customerName: u.name });
                                                  setPaymentMethod('cash');
                                                  setProofPreview(null);
                                                  setProofFile(null);
                                                }}
                                                className="px-2 py-1 text-[11px] rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all flex items-center gap-1"
                                                title="Bayar Tunai"
                                              >
                                                <Wallet className="w-3 h-3" />
                                                Cash
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setPayModal({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: inv.amount, customerName: u.name });
                                                  setPaymentMethod('transfer');
                                                  setProofPreview(null);
                                                  setProofFile(null);
                                                }}
                                                className="px-2 py-1 text-[11px] rounded bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all flex items-center gap-1"
                                                title="Upload Bukti Transfer"
                                              >
                                                <Upload className="w-3 h-3" />
                                                TF
                                              </button>
                                            </>
                                          )}
                                          {/* Paid: Print + WhatsApp buttons */}
                                          {inv.status === 'PAID' && (
                                            <>
                                              <div className="relative" ref={showPrintMenu === inv.id ? printMenuRef : null}>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowPrintMenu(showPrintMenu === inv.id ? null : inv.id);
                                                  }}
                                                  disabled={actionLoading?.startsWith('a4-') && actionLoading === `a4-${inv.id}` || actionLoading?.startsWith('thermal-') && actionLoading === `thermal-${inv.id}` || actionLoading?.startsWith('bt-') && actionLoading === `bt-${inv.id}`}
                                                  className="p-1 rounded text-muted-foreground hover:bg-accent transition-all"
                                                  title="Cetak"
                                                >
                                                  {actionLoading === `a4-${inv.id}` || actionLoading === `thermal-${inv.id}` || actionLoading === `bt-${inv.id}` ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                  ) : (
                                                    <Printer className="w-3.5 h-3.5" />
                                                  )}
                                                </button>
                                                {showPrintMenu === inv.id && (
                                                  <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
                                                    <button
                                                      onClick={(e) => { e.stopPropagation(); handlePrintA4(inv.id); }}
                                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
                                                    >
                                                      <FileText className="w-3.5 h-3.5" />
                                                      Cetak Invoice A4
                                                    </button>
                                                    <button
                                                      onClick={(e) => { e.stopPropagation(); handlePrintThermal(inv.id); }}
                                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
                                                    >
                                                      <Printer className="w-3.5 h-3.5" />
                                                      Cetak Struk 80mm
                                                    </button>
                                                    <button
                                                      onClick={(e) => { e.stopPropagation(); handlePrintBluetooth(inv.id); }}
                                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent text-left"
                                                    >
                                                      <Bluetooth className="w-3.5 h-3.5" />
                                                      Cetak via Bluetooth
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleSendWhatsApp(inv.id, inv.invoiceNumber, u.name);
                                                }}
                                                disabled={actionLoading === `wa-${inv.id}`}
                                                className="p-1 rounded text-muted-foreground hover:text-green-600 hover:bg-accent transition-all"
                                                title="Kirim Bukti Lunas via WhatsApp"
                                              >
                                                {actionLoading === `wa-${inv.id}` ? (
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                  <MessageCircle className="w-3.5 h-3.5" />
                                                )}
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground text-center py-3">Tidak ada invoice</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < filtered.length && (
            <div className="text-center mt-4">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="px-6 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2"
              >
                <ChevronDown className="w-4 h-4" /> Muat {Math.min(PAGE_SIZE, filtered.length - visibleCount)} lagi ({visibleCount}/{filtered.length})
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
