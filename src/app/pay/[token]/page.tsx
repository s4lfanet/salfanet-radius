'use client';
import { showError } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Wifi, CheckCircle, Clock, AlertCircle, CreditCard, Building2, Loader2, User, Phone, Package, Calendar, MapPin, Router, Network, Mail, Hash, Zap } from 'lucide-react';

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
interface CompanySetting { companyName: string; address: string | null; phone: string | null; email: string | null; }

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

  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  const formatDate = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy');

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PAID: 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40',
      PENDING: 'bg-[#ff44cc]/20 text-[#ff44cc] border border-[#ff44cc]/40',
      OVERDUE: 'bg-[#ff4466]/20 text-[#ff6b8a] border border-[#ff4466]/40'
    };
    const icons: Record<string, React.ReactNode> = { PAID: <CheckCircle className="w-3 h-3" />, PENDING: <Clock className="w-3 h-3" />, OVERDUE: <AlertCircle className="w-3 h-3" /> };
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg ${styles[status] || 'bg-gray-100'}`}>{icons[status]} {status}</span>;
  };

  const handlePayment = async (gateway: string, paymentMethod?: string) => {
    if (!invoice) return;
    setProcessing(true);
    try {
      const body: any = { invoiceId: invoice.id, gateway };
      if (paymentMethod) body.paymentMethod = paymentMethod;
      const res = await fetch('/api/payment/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { await showError(data.error || 'Failed'); return; }
      if (data.paymentUrl) window.location.href = data.paymentUrl; else await showError('Payment URL not available');
    } catch { await showError('Failed to process payment'); } finally { setProcessing(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      <div className="text-center relative z-10">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] mb-3" />
        <p className="text-xs text-[#e0d0ff]/70">Loading...</p>
      </div>
    </div>
  );

  if (error || !invoice) return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ff4466]/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#ff4466]/50 p-6 max-w-sm w-full text-center shadow-[0_0_50px_rgba(255,68,102,0.2)]">
        <AlertCircle className="w-12 h-12 text-[#ff6b8a] mx-auto mb-3 drop-shadow-[0_0_15px_rgba(255,68,102,0.5)]" />
        <h2 className="text-base font-bold text-white mb-1">Tagihan Tidak Ditemukan</h2>
        <p className="text-xs text-[#e0d0ff]/70">{error || 'Link pembayaran tidak valid atau sudah kadaluarsa.'}</p>
      </div>
    </div>
  );

  if (invoice.status === 'PAID') return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00ff88]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#00ff88]/50 p-6 max-w-sm w-full text-center shadow-[0_0_50px_rgba(0,255,136,0.2)]">
        <div className="w-14 h-14 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#00ff88]/50 shadow-[0_0_30px_rgba(0,255,136,0.3)]">
          <CheckCircle className="w-7 h-7 text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
        </div>
        <h2 className="text-base font-bold text-white mb-1">Pembayaran Diterima</h2>
        <p className="text-xs text-[#e0d0ff]/70 mb-4">Tagihan ini sudah dibayar</p>
        <div className="bg-[#0a0520]/50 rounded-xl p-4 text-left space-y-2">
          <div className="flex justify-between text-xs"><span className="text-[#e0d0ff]/60">Tagihan</span><span className="font-mono font-bold text-white">{invoice.invoiceNumber}</span></div>
          <div className="flex justify-between text-xs"><span className="text-[#e0d0ff]/60">Jumlah</span><span className="font-bold text-[#00ff88]">{formatCurrency(invoice.amount)}</span></div>
          {invoice.paidAt && <div className="flex justify-between text-xs"><span className="text-[#e0d0ff]/60">Dibayar</span><span className="text-white">{formatDate(invoice.paidAt)}</span></div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden py-6 px-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/15 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/15 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-lg mx-auto space-y-4 relative z-10">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] rounded-full mb-3 shadow-[0_0_20px_rgba(188,19,254,0.4)]">
            <Wifi className="w-4 h-4 text-white" />
            <span className="text-xs font-bold text-white">Tagihan Pembayaran</span>
          </div>
          <p className="text-xs text-[#e0d0ff]/70">Silakan periksa detail tagihan Anda di bawah ini</p>
        </div>

        {/* Invoice Card */}
        <div className="bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#bc13fe]/30 overflow-hidden shadow-[0_0_30px_rgba(188,19,254,0.15)]">
          <div className="bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">Detail Tagihan</span>
              {getStatusBadge(invoice.status)}
            </div>
          </div>
          <div className="p-4 space-y-4">
            {/* Invoice Number */}
            <div className="flex justify-between items-center pb-3 border-b border-[#bc13fe]/20">
              <span className="text-xs text-[#e0d0ff]/60">Nomor Tagihan</span>
              <span className="font-mono font-bold text-sm text-[#00f7ff]">{invoice.invoiceNumber}</span>
            </div>

            {/* Customer Info */}
            <div>
              <p className="text-[10px] font-bold text-[#00f7ff] uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-6 h-[1px] bg-gradient-to-r from-[#00f7ff] to-transparent"></span>
                Informasi Pelanggan
              </p>
              <div className="bg-[#0a0520]/50 rounded-xl p-3 space-y-2.5">
                {/* Nama */}
                <div className="flex justify-between items-start text-xs gap-2">
                  <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><User className="w-3 h-3 text-[#bc13fe]" />Nama</span>
                  <span className="font-semibold text-white text-right">{invoice.user?.name || invoice.customerName}</span>
                </div>
                {/* Username */}
                {invoice.user?.username && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Hash className="w-3 h-3 text-[#bc13fe]" />Username</span>
                    <span className="font-mono text-[#00f7ff] text-right">{invoice.user.username}</span>
                  </div>
                )}
                {/* Customer ID */}
                {invoice.user?.customerId && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Hash className="w-3 h-3 text-[#00f7ff]" />ID Pelanggan</span>
                    <span className="font-mono text-white text-right">{invoice.user.customerId}</span>
                  </div>
                )}
                {/* Telepon */}
                <div className="flex justify-between items-start text-xs gap-2">
                  <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Phone className="w-3 h-3 text-[#00f7ff]" />Telepon</span>
                  <span className="font-medium text-white text-right">{invoice.user?.phone || invoice.customerPhone}</span>
                </div>
                {/* Email */}
                {invoice.user?.email && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Mail className="w-3 h-3 text-[#ff44cc]" />Email</span>
                    <span className="font-medium text-white text-right break-all">{invoice.user.email}</span>
                  </div>
                )}
                {/* Alamat */}
                {invoice.user?.address && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><MapPin className="w-3 h-3 text-[#ff44cc]" />Alamat</span>
                    <span className="font-medium text-white text-right max-w-[60%]">{invoice.user.address}</span>
                  </div>
                )}
                {/* Area */}
                {invoice.user?.area?.name && (
                  <div className="flex justify-between items-start text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Network className="w-3 h-3 text-[#bc13fe]" />Area</span>
                    <span className="font-medium text-white text-right">{invoice.user.area.name}</span>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-[#bc13fe]/15 pt-2 space-y-2.5">
                  {/* Paket */}
                  {invoice.user?.profile && (
                    <div className="flex justify-between items-start text-xs gap-2">
                      <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Package className="w-3 h-3 text-[#ff44cc]" />Paket</span>
                      <div className="text-right">
                        <p className="font-semibold text-white">{invoice.user.profile.name}</p>
                        {(invoice.user.profile.downloadSpeed > 0) && (
                          <p className="text-[10px] text-[#00f7ff]/70 flex items-center justify-end gap-1"><Zap className="w-2.5 h-2.5" />{invoice.user.profile.downloadSpeed}M / {invoice.user.profile.uploadSpeed}M</p>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Tipe & Status */}
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><CreditCard className="w-3 h-3 text-[#00f7ff]" />Tipe</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        invoice.user?.subscriptionType === 'PREPAID'
                          ? 'bg-[#ff44cc]/20 text-[#ff44cc] border border-[#ff44cc]/30'
                          : 'bg-[#00f7ff]/15 text-[#00f7ff] border border-[#00f7ff]/30'
                      }`}>{invoice.user?.subscriptionType || 'POSTPAID'}</span>
                    </div>
                  </div>
                  {/* Router */}
                  {invoice.user?.router?.shortname && (
                    <div className="flex justify-between items-start text-xs gap-2">
                      <span className="text-[#e0d0ff]/60 flex items-center gap-1.5 shrink-0"><Router className="w-3 h-3 text-[#bc13fe]" />Router</span>
                      <span className="font-medium text-white text-right">{invoice.user.router.shortname}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-gradient-to-br from-[#bc13fe]/20 to-[#00f7ff]/20 rounded-xl p-5 text-center border border-[#bc13fe]/30">
              <p className="text-[10px] text-[#e0d0ff]/60 mb-1">Total Tagihan</p>
              <p className="text-3xl font-bold text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.5)]">{formatCurrency(invoice.amount)}</p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0520]/50 rounded-xl p-3">
                <p className="text-[10px] text-[#e0d0ff]/60 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3 text-[#bc13fe]" />Tanggal Terbit</p>
                <p className="text-xs font-medium text-white">{formatDate(invoice.createdAt)}</p>
              </div>
              <div className="bg-[#0a0520]/50 rounded-xl p-3">
                <p className="text-[10px] text-[#e0d0ff]/60 mb-0.5 flex items-center gap-1"><Calendar className="w-3 h-3 text-[#00f7ff]" />Jatuh Tempo</p>
                <p className="text-xs font-medium text-white">{formatDate(invoice.dueDate)}</p>
              </div>
            </div>

            {/* Overdue Warning */}
            {invoice.status === 'OVERDUE' && (
              <div className="bg-[#ff4466]/10 border border-[#ff4466]/30 rounded-xl p-3">
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
        <div className="bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#bc13fe]/30 overflow-hidden shadow-[0_0_30px_rgba(188,19,254,0.15)]">
          <div className="px-4 py-3 border-b border-[#bc13fe]/20">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#00f7ff]" />
              Metode Pembayaran
            </h2>
          </div>
          <div className="p-4">
            {paymentGateways.length === 0 ? (
              <div className="text-center py-6">
                <Building2 className="w-10 h-10 text-[#e0d0ff]/40 mx-auto mb-2" />
                <p className="text-xs text-[#e0d0ff]/60">Tidak ada metode pembayaran tersedia.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {paymentGateways.map((gateway) => {
                  // For Duitku: show individual payment method options
                  if (gateway.provider === 'duitku') {
                    if (loadingDuitkuMethods) {
                      return (
                        <div key={gateway.id} className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[#00f7ff] mr-2" />
                          <span className="text-xs text-[#e0d0ff]/60">Memuat metode Duitku...</span>
                        </div>
                      );
                    }
                    if (duitkuMethods.length > 0) {
                      return (
                        <div key={gateway.id} className="space-y-2">
                          <p className="text-[10px] font-bold text-[#00f7ff] uppercase tracking-widest px-1">{gateway.name}</p>
                          {duitkuMethods.map((method) => (
                            <button
                              key={method.code}
                              onClick={() => handlePayment('duitku', method.code)}
                              disabled={processing}
                              className="w-full flex items-center justify-between p-4 bg-[#0a0520]/50 border-2 border-[#bc13fe]/20 rounded-xl hover:border-[#00f7ff]/50 hover:bg-[#0a0520]/80 hover:shadow-[0_0_20px_rgba(0,247,255,0.1)] transition-all disabled:opacity-50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(188,19,254,0.3)]">
                                  <CreditCard className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-left">
                                  <p className="text-xs font-bold text-white">{method.name}</p>
                                  <p className="text-[10px] text-[#e0d0ff]/60 uppercase">{method.code}</p>
                                </div>
                              </div>
                              {processing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#00f7ff]" />
                              ) : (
                                <span className="text-[10px] text-[#00f7ff] font-medium">Bayar →</span>
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
                      className="w-full flex items-center justify-between p-4 bg-[#0a0520]/50 border-2 border-[#bc13fe]/20 rounded-xl hover:border-[#00f7ff]/50 hover:bg-[#0a0520]/80 hover:shadow-[0_0_20px_rgba(0,247,255,0.1)] transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(188,19,254,0.3)]">
                          <CreditCard className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">{gateway.name}</p>
                          <p className="text-[10px] text-[#e0d0ff]/60 capitalize">{gateway.provider}</p>
                        </div>
                      </div>
                      {processing ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#00f7ff]" />
                      ) : (
                        <span className="text-[10px] text-[#00f7ff] font-medium">Bayar Sekarang →</span>
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
          <div className="bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#bc13fe]/30 p-4 text-center shadow-[0_0_30px_rgba(188,19,254,0.1)]">
            <h3 className="text-sm font-bold text-white">{company.companyName}</h3>
            {company.address && <p className="text-[10px] text-[#e0d0ff]/60 mt-1">📍 {company.address}</p>}
            <div className="flex flex-wrap justify-center gap-3 text-[10px] text-[#e0d0ff]/60 mt-2">
              {company.phone && <span>📞 {company.phone}</span>}
              {company.email && <span>✉️ {company.email}</span>}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center space-y-1">
          <p className="text-[10px] text-[#e0d0ff]/50">Pembayaran aman didukung oleh</p>
          <p className="text-xs font-bold bg-gradient-to-r from-[#00f7ff] to-[#bc13fe] bg-clip-text text-transparent">{company?.companyName || 'SALFANETRADIUS'}</p>
        </div>
      </div>
    </div>
  );
}
