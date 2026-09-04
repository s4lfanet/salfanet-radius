'use client';
import { showError } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Wifi, CheckCircle, Clock, AlertCircle, CreditCard, Building2, Loader2, User, Phone, Package, Calendar, MapPin, Router, Network, Mail, Hash, Zap, QrCode, Copy, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  status: string;
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  user: {
    name: string;
    phone: string;
    email: string | null;
    username: string;
    address: string | null;
    customerId: string | null;
    subscriptionType: string;
    status: string;
    profile: { name: string; price: number; downloadSpeed: number; uploadSpeed: number; } | null;
    area: { name: string; } | null;
    router: { shortname: string; } | null;
  } | null;
}

interface PaymentGateway { id: string; name: string; provider: string; isActive: boolean; }
interface CompanySetting { name: string; address: string | null; phone: string | null; email: string | null; qrisEnabled?: boolean; qrisMerchantName?: string | null; }

interface QrisData {
  qrString: string;
  uniqueAmount: number;
  expiresAt: string;
  orderId: string;
}

export default function PaymentPage() {
  const params = useParams();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [company, setCompany] = useState<CompanySetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [duitkuMethods, setDuitkuMethods] = useState<{ code: string; name: string; group: string }[]>([]);
  const [loadingDuitkuMethods, setLoadingDuitkuMethods] = useState(false);
  const [qrisData, setQrisData] = useState<QrisData | null>(null);
  const [qrisPaid, setQrisPaid] = useState(false);
  const [qrisExpired, setQrisExpired] = useState(false);
  const [qrisCopied, setQrisCopied] = useState(false);
  const [qrisCountdown, setQrisCountdown] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadInvoice(); }, [token]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/invoices/by-token/${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load invoice'); return; }
      setInvoice(data.invoice);
      setPaymentGateways(data.paymentGateways || []);
      setCompany(data.company || null);
      // If Duitku is in the list, fetch its payment methods
      if ((data.paymentGateways || []).some((g: PaymentGateway) => g.provider === 'duitku')) {
        fetchDuitkuMethods(data.invoice?.amount || 10000);
      }
    } catch (err) { setError('Failed to load invoice'); } finally { setLoading(false); }
  };

  const fetchDuitkuMethods = async (amount: number) => {
    setLoadingDuitkuMethods(true);
    try {
      const res = await fetch(`/api/payment/duitku-methods?amount=${amount}`);
      const data = await res.json();
      setDuitkuMethods(data.methods || []);
    } catch {
      // Use empty = will show nothing for Duitku methods
    } finally {
      setLoadingDuitkuMethods(false);
    }
  };

  const formatDate = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy');

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PAID: 'bg-green-500/20 text-green-500 border border-green-500/40',
      PENDING: 'bg-pink-500/20 text-pink-500 border border-pink-500/40',
      OVERDUE: 'bg-red-500/20 text-[#ff6b8a] border border-red-500/40'
    };
    const icons: Record<string, React.ReactNode> = { PAID: <CheckCircle className="w-3 h-3" />, PENDING: <Clock className="w-3 h-3" />, OVERDUE: <AlertCircle className="w-3 h-3" /> };
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg ${styles[status] || 'bg-gray-100'}`}>{icons[status]} {status}</span>;
  };

  const handlePayment = async (gateway: string, paymentMethod?: string) => {
    if (!invoice) return;
    setProcessing(true);
    try {
      const body: { invoiceId: string; gateway: string; paymentMethod?: string; paymentToken: string } = { invoiceId: invoice.id, gateway, paymentToken: token };
      if (paymentMethod) body.paymentMethod = paymentMethod;
      const res = await fetch('/api/payment/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { await showError(data.error || 'Failed'); return; }
      if (data.isQrisOwn && data.qrString) {
        setQrisData({ qrString: data.qrString, uniqueAmount: data.uniqueAmount, expiresAt: data.expiresAt, orderId: data.orderId });
        return;
      }
      if (data.paymentUrl) window.location.href = data.paymentUrl; else await showError('Payment URL not available');
    } catch { await showError('Failed to process payment'); } finally { setProcessing(false); }
  };

  // QRIS polling
  useEffect(() => {
    if (!qrisData) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/qris-status?orderId=${qrisData.orderId}`);
        const data = await res.json();
        if (data.status === 'paid') {
          setQrisPaid(true);
          clearInterval(pollInterval);
          setTimeout(() => window.location.reload(), 2000);
        } else if (data.status === 'expired' || (data.expiresAt && new Date(data.expiresAt) < new Date())) {
          setQrisExpired(true);
          clearInterval(pollInterval);
        }
      } catch { /* ignore poll errors */ }
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [qrisData]);

  // QRIS countdown timer
  useEffect(() => {
    if (!qrisData) return;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(qrisData.expiresAt).getTime() - Date.now()) / 1000));
      setQrisCountdown(remaining);
      if (remaining === 0) setQrisExpired(true);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [qrisData]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const copyQrisString = () => {
    if (qrisData) {
      navigator.clipboard.writeText(qrisData.qrString);
      setQrisCopied(true);
      setTimeout(() => setQrisCopied(false), 2000);
    }
  };

  if (loading) return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      <div className="text-center relative z-10">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-brand-500 drop-shadow-[0_0_20px_rgba(6,182,212,0.6)] mb-3" />
        <p className="text-xs text-muted-foreground/70">Loading...</p>
      </div>
    </div>
  );

  if (error || !invoice) return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-red-500/50 p-6 max-w-sm w-full text-center shadow-[0_0_50px_rgba(255,68,102,0.2)]">
        <AlertCircle className="w-12 h-12 text-[#ff6b8a] mx-auto mb-3 drop-shadow-[0_0_15px_rgba(255,68,102,0.5)]" />
        <h2 className="text-base font-bold text-white mb-1">Tagihan Tidak Ditemukan</h2>
        <p className="text-xs text-muted-foreground/70">{error || 'Link pembayaran tidak valid atau sudah kadaluarsa.'}</p>
      </div>
    </div>
  );

  if (invoice.status === 'PAID') return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-green-500/50 p-6 max-w-sm w-full text-center shadow-[0_0_50px_rgba(0,255,136,0.2)]">
        <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500/50 shadow-[0_0_30px_rgba(0,255,136,0.3)]">
          <CheckCircle className="w-7 h-7 text-green-500 drop-shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
        </div>
        <h2 className="text-base font-bold text-white mb-1">Pembayaran Diterima</h2>
        <p className="text-xs text-muted-foreground/70 mb-4">Tagihan ini sudah dibayar</p>
        <div className="bg-card/50 rounded-xl p-4 text-left space-y-2">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground/60">Tagihan</span><span className="font-mono font-bold text-white">{invoice.invoiceNumber}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground/60">Jumlah</span><span className="font-bold text-green-500">{formatCurrency(invoice.amount)}</span></div>
          {invoice.paidAt && <div className="flex justify-between text-xs"><span className="text-muted-foreground/60">Dibayar</span><span className="text-white">{formatDate(invoice.paidAt)}</span></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted relative py-6 px-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-lg mx-auto space-y-4 relative z-10">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-brand-500 rounded-full mb-3 shadow-[0_0_20px_rgba(139,92,246,0.4)]">
            <Wifi className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white">Tagihan Pembayaran</span>
          </div>
          <p className="text-xs text-muted-foreground/70">Silakan periksa detail tagihan Anda di bawah ini</p>
        </div>

        {/* Invoice Card */}
        <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-violet-500/30 overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="bg-gradient-to-r from-violet-500 to-brand-500 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">Detail Tagihan</span>
              {getStatusBadge(invoice.status)}
            </div>
          </div>
          <div className="p-4 space-y-4">
            {/* Invoice Number */}
            <div className="flex justify-between items-center pb-3 border-b border-violet-500/20">
              <span className="text-xs text-muted-foreground/60">Nomor Tagihan</span>
              <span className="font-mono font-bold text-sm text-brand-500">{invoice.invoiceNumber}</span>
            </div>

            {/* Customer Info */}
            <div>
              <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-6 h-[1px] bg-gradient-to-r from-brand-500 to-transparent"></span>
                Informasi Pelanggan
              </p>
              <div className="bg-card/50 rounded-xl p-3 space-y-2.5">
                {/* Nama */}
                <div className="flex justify-between items-start text-xs gap-2">
                  <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><User className="w-3 h-3 text-violet-500" />Nama</span>
                  <span className="font-semibold text-white text-right">{invoice.user?.name || invoice.customerName}</span>
                </div>
                {/* Username */}
                {invoice.user?.username && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Hash className="w-3 h-3 text-violet-500" />Username</span>
                    <span className="font-mono text-brand-500 text-right">{invoice.user.username}</span>
                  </div>
                )}
                {/* Customer ID */}
                {invoice.user?.customerId && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Hash className="w-3 h-3 text-brand-500" />ID Pelanggan</span>
                    <span className="font-mono text-white text-right">{invoice.user.customerId}</span>
                  </div>
                )}
                {/* Telepon */}
                <div className="flex justify-between items-start text-xs gap-2">
                  <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Phone className="w-3 h-3 text-brand-500" />Telepon</span>
                  <span className="font-medium text-white text-right">{invoice.user?.phone || invoice.customerPhone}</span>
                </div>
                {/* Email */}
                {invoice.user?.email && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Mail className="w-3 h-3 text-pink-500" />Email</span>
                    <span className="font-medium text-white text-right break-all">{invoice.user.email}</span>
                  </div>
                )}
                {/* Alamat */}
                {invoice.user?.address && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><MapPin className="w-3 h-3 text-pink-500" />Alamat</span>
                    <span className="font-medium text-white text-right max-w-[60%]">{invoice.user.address}</span>
                  </div>
                )}
                {/* Area */}
                {invoice.user?.area?.name && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Network className="w-3 h-3 text-violet-500" />Area</span>
                    <span className="font-medium text-white text-right">{invoice.user.area.name}</span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-violet-500/15 pt-2 space-y-2.5">
                  {/* Paket */}
                  {invoice.user?.profile && (
                    <div className="flex justify-between items-start text-xs gap-2">
                      <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Package className="w-3 h-3 text-pink-500" />Paket</span>
                      <div className="text-right">
                        <p className="font-semibold text-white">{invoice.user.profile.name}</p>
                        {(invoice.user.profile.downloadSpeed > 0) && (
                          <p className="text-[10px] text-brand-500/70 flex items-center justify-end gap-1"><Zap className="w-2.5 h-2.5" />{invoice.user.profile.downloadSpeed}M / {invoice.user.profile.uploadSpeed}M</p>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Tipe & Status */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><CreditCard className="w-3 h-3 text-brand-500" />Tipe</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        invoice.user?.subscriptionType === 'PREPAID'
                          ? 'bg-pink-500/20 text-pink-500 border border-pink-500/30'
                          : 'bg-brand-500/15 text-brand-500 border border-brand-500/30'
                      }`}>{invoice.user?.subscriptionType || 'POSTPAID'}</span>
                    </div>
                  </div>
                  {/* Router */}
                  {invoice.user?.router?.shortname && (
                    <div className="flex justify-between items-start text-xs gap-2">
                      <span className="text-muted-foreground/60 flex items-center gap-1.5 shrink-0"><Router className="w-3 h-3 text-violet-500" />Router</span>
                      <span className="font-medium text-white text-right">{invoice.user.router.shortname}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-gradient-to-br from-violet-500/20 to-brand-500/20 rounded-xl p-5 text-center border border-violet-500/30">
              <p className="text-[10px] text-muted-foreground/60 mb-1">Total Tagihan</p>
              <p className="text-3xl font-bold text-brand-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]">{formatCurrency(invoice.amount)}</p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card/50 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground/60 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3 text-violet-500" />Tanggal Terbit</p>
                <p className="text-xs font-medium text-white">{formatDate(invoice.createdAt)}</p>
              </div>
              <div className="bg-card/50 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground/60 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3 text-brand-500" />Jatuh Tempo</p>
                <p className="text-xs font-medium text-white">{formatDate(invoice.dueDate)}</p>
              </div>
            </div>

            {/* Overdue Warning */}
            {invoice.status === 'OVERDUE' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#ff6b8a] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[#ff6b8a]">Pembayaran Terlambat</p>
                    <p className="text-[10px] text-[#ff6b8a]/80 mt-0.5">Segera lakukan pembayaran.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-violet-500/30 overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="px-4 py-3 border-b border-violet-500/20">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-brand-500" />
              Metode Pembayaran
            </h2>
          </div>
          <div className="p-4">
            {/* QRIS Mandiri option */}
            {company?.qrisEnabled && (
              <button
                               onClick={() => handlePayment('qris_own')}
                disabled={processing}
                className="w-full flex items-center justify-between p-4 bg-card/50 border-2 border-violet-500/20 rounded-xl hover:border-brand-500/50 hover:bg-card/80 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all disabled:opacity-50 mb-2"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-violet-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    <QrCode className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">QRIS Mandiri</p>
                    <p className="text-[10px] text-muted-foreground/60">Scan QR — tanpa biaya gateway</p>
                  </div>
                </div>
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                ) : (
                  <span className="text-[10px] text-brand-500 font-medium">Bayar QR →</span>
                )}
              </button>
            )}
            {paymentGateways.length === 0 && !company?.qrisEnabled ? (
              <div className="text-center py-6">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/60">Tidak ada metode pembayaran tersedia.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {paymentGateways.map((gateway) => {
                  // For Duitku: show individual payment method options
                  if (gateway.provider === 'duitku') {
                    if (loadingDuitkuMethods) {
                      return (
                        <div key={gateway.id} className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-brand-500 mr-2" />
                          <span className="text-xs text-muted-foreground/60">Memuat metode Duitku...</span>
                        </div>
                      );
                    }
                    if (duitkuMethods.length > 0) {
                      return (
                        <div key={gateway.id} className="space-y-2">
                          <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest px-1">{gateway.name}</p>
                          {duitkuMethods.map((method) => (
                            <button
                              key={method.code}
                              onClick={() => handlePayment('duitku', method.code)}
                              disabled={processing}
                              className="w-full flex items-center justify-between p-4 bg-card/50 border-2 border-violet-500/20 rounded-xl hover:border-brand-500/50 hover:bg-card/80 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all disabled:opacity-50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-brand-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                                  <CreditCard className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-left">
                                  <p className="text-xs font-bold text-white">{method.name}</p>
                                  <p className="text-[10px] text-muted-foreground/60 uppercase">{method.code}</p>
                                </div>
                              </div>
                              {processing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                              ) : (
                                <span className="text-[10px] text-brand-500 font-medium">Bayar →</span>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    // Fallback: show single Duitku button with SP default
                  }

                  return (
                    <button
                      key={gateway.id}
                      onClick={() => handlePayment(gateway.provider)}
                      disabled={processing}
                      className="w-full flex items-center justify-between p-4 bg-card/50 border-2 border-violet-500/20 rounded-xl hover:border-brand-500/50 hover:bg-card/80 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-brand-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                          <CreditCard className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">{gateway.name}</p>
                          <p className="text-[10px] text-muted-foreground/60 capitalize">{gateway.provider}</p>
                        </div>
                      </div>
                      {processing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                      ) : (
                        <span className="text-[10px] text-brand-500 font-medium">Bayar Sekarang →</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Company Info */}
        {company && (
          <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-violet-500/30 p-4 text-center shadow-[0_0_30px_rgba(139,92,246,0.1)]">
            <h3 className="text-sm font-bold text-white">{company.name}</h3>
            {company.address && <p className="text-[10px] text-muted-foreground/60 mt-1">📍 {company.address}</p>}
            <div className="flex flex-wrap justify-center gap-3 text-[10px] text-muted-foreground/60 mt-2">
              {company.phone && <span>📞 {company.phone}</span>}
              {company.email && <span>✉️ {company.email}</span>}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center space-y-1">
          <p className="text-[10px] text-muted-foreground/50">Pembayaran aman didukung oleh</p>
          <p className="text-xs font-bold bg-gradient-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">{company?.name || 'ISP Billing'}</p>
        </div>
      </div>

      {/* QRIS Mandiri QR Modal */}
      {qrisData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => !qrisPaid && setQrisData(null)}>
          <div className="bg-muted border-2 border-brand-500/40 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            {qrisPaid ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500/50">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-lg font-bold text-white mb-2">Pembayaran Berhasil!</h2>
                <p className="text-xs text-muted-foreground/70">Tagihan telah dilunasi. Halaman akan dimuat ulang...</p>
              </div>
            ) : qrisExpired ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500/50">
                  <AlertCircle className="w-8 h-8 text-[#ff6b8a]" />
                </div>
                <h2 className="text-lg font-bold text-white mb-2">QRIS Kadaluarsa</h2>
                <p className="text-xs text-muted-foreground/70 mb-4">Waktu pembayaran telah habis. Silakan buat QR baru.</p>
                <button onClick={() => setQrisData(null)} className="px-6 py-2 bg-gradient-to-r from-brand-500 to-violet-500 text-white rounded-lg text-sm font-medium">
                  Tutup
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                    <QrCode className="w-5 h-5 text-brand-500" />
                    QRIS Mandiri
                  </h2>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{company?.qrisMerchantName || company?.name || 'Merchant'}</p>
                </div>

                {/* QR Code */}
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-4 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrisData.qrString)}`}
                      alt="QRIS Code"
                      className="w-60 h-60"
                    />
                  </div>
                </div>

                {/* Amount */}
                <div className="bg-card/80 rounded-xl p-4 mb-3 text-center">
                  <p className="text-[10px] text-muted-foreground/60 mb-1">Transfer TEPAT sejumlah:</p>
                  <p className="text-2xl font-bold text-brand-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                    Rp {qrisData.uniqueAmount.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[10px] text-amber-400 mt-1">⚠️ Transfer tepat jumlah ini untuk verifikasi otomatis</p>
                </div>

                {/* Countdown */}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-muted-foreground/60" />
                  <span className={`text-sm font-mono font-bold ${qrisCountdown < 60 ? 'text-[#ff6b8a]' : 'text-brand-500'}`}>
                    {formatCountdown(qrisCountdown)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">menunggu pembayaran...</span>
                </div>

                {/* Copy QR String */}
                <button
                  onClick={copyQrisString}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-card/50 border border-violet-500/30 rounded-lg text-xs text-muted-foreground/70 hover:bg-card/80 transition mb-3"
                >
                  {qrisCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {qrisCopied ? 'QR String disalin!' : 'Salin QR String'}
                </button>

                <button
                  onClick={() => setQrisData(null)}
                  className="w-full py-2 text-xs text-muted-foreground/60 hover:text-white transition"
                >
                  Batalkan
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
