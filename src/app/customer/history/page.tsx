'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatWIB } from '@/lib/timezone';
import { 
  Receipt, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Loader2, 
  CreditCard,
  Calendar,
  RefreshCw,
  Banknote,
  FileText,
  ExternalLink,
  Eye,
  X,
  Hash,
  Wallet,
  Package,
  Upload,
  Building2,
  Check,
  ChevronRight,
  ShieldCheck,
  ImageIcon,
  Info,
  Printer,
} from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { useToast } from '@/components/cyberpunk/CyberToast';

export const dynamic = 'force-dynamic';

// -- BANK OPTIONS (same as mobile APK) -----------------------------------------
const BANK_OPTIONS = [
  'BCA', 'BNI', 'BRI', 'Mandiri', 'BSI',
  'CIMB Niaga', 'Dana', 'OVO', 'GoPay', 'ShopeePay',
];

// Invoice type labels
const INVOICE_TYPE_LABEL: Record<string, string> = {
  MONTHLY: 'Bulanan',
  INSTALLATION: 'Pemasangan',
  ADDON: 'Tambahan',
  TOPUP: 'Top Up',
  RENEWAL: 'Perpanjangan',
};

// Payment source config
const PAYMENT_SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  gateway: { label: 'Payment Gateway', color: 'text-cyan-400' },
  manual:  { label: 'Transfer Bank',   color: 'text-purple-400' },
  admin:   { label: 'Dikonfirmasi Admin', color: 'text-success' },
};

interface PaymentHistory {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  paymentToken: string | null;
  createdAt: string;
  paymentLink: string | null;
  invoiceType: string | null;
  isPackageChange: boolean;
  packageChangeDescription: string | null;
  manualPaymentId: string | null;
  manualPaymentStatus: string | null;
  manualPaymentBank: string | null;
  manualPaymentAccountName: string | null;
  manualPaymentRejectionReason: string | null;
  paymentSource: string | null;
}

interface PaymentGateway {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
}

export default function PaymentHistoryPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const toast = useCallback((type: 'success'|'error'|'info'|'warning', title: string, description?: string) => {
    addToast({ type, title, description, duration: type === 'error' ? 8000 : 5000 });
  }, [addToast]);

  // Core data state
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);

  // Detail modal
  const [selectedDetail, setSelectedDetail] = useState<PaymentHistory | null>(null);

  // Payment method choice modal
  const [paymentChoiceVisible, setPaymentChoiceVisible] = useState(false);
  const [selectedPaymentInvoice, setSelectedPaymentInvoice] = useState<PaymentHistory | null>(null);

  // Online gateway dialog
  const [gatewayDialogVisible, setGatewayDialogVisible] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState('');
  const [processingGateway, setProcessingGateway] = useState(false);

  // Offline / manual payment dialog
  const [offlineDialogVisible, setOfflineDialogVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submittingOffline, setSubmittingOffline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (!token) { router.push('/customer/login'); return; }
    loadPaymentHistory();
    loadPaymentGateways();

    // Auto-refresh when admin confirms or rejects a payment
    const handleAdminUpdate = () => loadPaymentHistory();
    window.addEventListener('customer-data-refresh', handleAdminUpdate);

    // Also refresh on tab focus and every 60s (catches deletions too)
    const handleVisible = () => { if (!document.hidden) loadPaymentHistory(); };
    document.addEventListener('visibilitychange', handleVisible);
    const interval = setInterval(loadPaymentHistory, 60_000);

    return () => {
      window.removeEventListener('customer-data-refresh', handleAdminUpdate);
      document.removeEventListener('visibilitychange', handleVisible);
      clearInterval(interval);
    };
  }, [router]);

  const loadPaymentHistory = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;
    try {
      const res = await fetch('/api/customer/payment-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setPayments(data.payments || []);
    } catch (error) {
      console.error('Load payment history error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPaymentGateways = async () => {
    try {
      const res = await fetch('/api/public/payment-gateways');
      const data = await res.json();
      if (data.success) {
        const gateways = data.gateways || [];
        setPaymentGateways(gateways);
        if (gateways.length > 0) setSelectedGateway(gateways[0].provider);
      }
    } catch { /* ignore */ }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPaymentHistory();
    loadPaymentGateways();
  };

  const handlePayInvoice = (payment: PaymentHistory) => {
    setSelectedPaymentInvoice(payment);
    setPaymentChoiceVisible(true);
  };

  const handleChooseOnline = () => {
    setPaymentChoiceVisible(false);
    if (paymentGateways.length === 0) {
      toast('error', 'Gateway Tidak Tersedia', 'Payment gateway tidak tersedia. Hubungi admin.');
      return;
    }
    setGatewayDialogVisible(true);
  };

  const handleChooseOffline = () => {
    setPaymentChoiceVisible(false);
    setBankName('');
    setCustomBank('');
    setAccountNumber('');
    setAccountName('');
    setPaymentNotes('');
    setProofFile(null);
    setProofPreviewUrl(null);
    setOfflineDialogVisible(true);
  };

  const handleConfirmGateway = async () => {
    if (!selectedPaymentInvoice || !selectedGateway) return;
    setProcessingGateway(true);
    setGatewayDialogVisible(false);
    const token = localStorage.getItem('customer_token');
    try {
      const res = await fetch('/api/customer/invoice/regenerate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ invoiceId: selectedPaymentInvoice.id, gateway: selectedGateway })
      });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => loadPaymentHistory(), 2000);
      } else {
        toast('error', 'Gagal Membuat Pembayaran', data.error || 'Gagal membuat link pembayaran');
      }
    } catch {
      toast('error', 'Gagal', 'Terjadi kesalahan saat membuat pembayaran');
    } finally {
      setProcessingGateway(false);
      setSelectedPaymentInvoice(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(file);
    setProofPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmitOfflinePayment = async () => {
    const finalBank = customBank.trim() || bankName;
    if (!selectedPaymentInvoice) return;
    if (!finalBank) { toast('warning', 'Wajib Diisi', 'Pilih atau masukkan metode pembayaran/nama bank'); return; }
    if (!accountName.trim()) { toast('warning', 'Wajib Diisi', 'Masukkan nama lengkap pengirim'); return; }
    if (!proofFile) { toast('warning', 'Bukti Transfer', 'Upload bukti transfer diperlukan'); return; }

    setSubmittingOffline(true);
    const token = localStorage.getItem('customer_token');
    try {
      // Step 1: Create manual payment record
      const payRes = await fetch('/api/customer/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          invoiceId: selectedPaymentInvoice.id,
          amount: selectedPaymentInvoice.amount,
          method: finalBank,
          accountNumber: accountNumber.trim() || undefined,
          accountName: accountName.trim(),
          notes: paymentNotes.trim() || undefined,
        })
      });
      const payData = await payRes.json();
      if (!payData.success) {
        toast('error', 'Gagal', payData.message || 'Gagal membuat pembayaran');
        return;
      }

      // Step 2: Upload proof image
      const paymentId = payData.data?.id;
      if (paymentId && proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        await fetch(`/api/customer/payments/${paymentId}/proof`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd
        });
      }

      setOfflineDialogVisible(false);
      setSelectedPaymentInvoice(null);
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
      loadPaymentHistory();
      toast('success', 'Pembayaran Terkirim', 'Bukti transfer berhasil dikirim. Menunggu konfirmasi dari admin.');
    } catch {
      toast('error', 'Gagal', 'Gagal mengirim pembayaran. Silakan coba lagi.');
    } finally {
      setSubmittingOffline(false);
    }
  };

  const handlePayLink = (payment: PaymentHistory) => {
    if (payment.paymentLink && payment.paymentLink.trim() !== '' && !payment.paymentLink.includes('localhost')) {
      window.open(payment.paymentLink, '_blank', 'noopener,noreferrer');
    } else if (payment.paymentToken) {
      window.open(`/pay/${payment.paymentToken}`, '_blank');
    }
  };

  const handlePrintInvoice = (payment: PaymentHistory) => {
    const invoiceLabel = payment.isPackageChange ? 'Ganti Paket' : (payment.invoiceType ? (INVOICE_TYPE_LABEL[payment.invoiceType] || payment.invoiceType) : 'Bulanan');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <title>Invoice ${payment.invoiceNumber}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:400px;margin:30px auto;color:#111;font-size:13px}
        h1{font-size:18px;margin:0 0 4px}
        .sub{color:#666;font-size:11px;margin-bottom:16px}
        hr{border:none;border-top:1px solid #ddd;margin:12px 0}
        .row{display:flex;justify-content:space-between;margin:5px 0}
        .label{color:#888}
        .amt{font-size:18px;font-weight:bold;color:#333;margin:8px 0}
        .paid-badge{background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold}
        .footer{color:#aaa;font-size:10px;text-align:center;margin-top:20px}
      </style>
      </head><body>
      <h1>Nota Pembayaran</h1>
      <div class="sub">Invoice Lunas</div>
      <hr>
      <div class="row"><span class="label">No. Invoice</span><span><b>${payment.invoiceNumber}</b></span></div>
      <div class="row"><span class="label">Jenis</span><span>${invoiceLabel}</span></div>
      <div class="row"><span class="label">Jatuh Tempo</span><span>${formatDate(payment.dueDate)}</span></div>
      ${payment.paidAt ? `<div class="row"><span class="label">Dibayar</span><span>${formatDateTime(payment.paidAt)}</span></div>` : ''}
      ${payment.paymentSource ? `<div class="row"><span class="label">Via</span><span>${payment.paymentSource === 'gateway' ? 'Payment Gateway' : payment.paymentSource === 'manual' ? 'Transfer Bank' : 'Admin'}</span></div>` : ''}
      ${payment.manualPaymentBank ? `<div class="row"><span class="label">Bank</span><span>${payment.manualPaymentBank}</span></div>` : ''}
      <hr>
      <div class="amt">Total: Rp ${payment.amount.toLocaleString('id-ID')}</div>
      <span class="paid-badge">✓ LUNAS</span>
      <div class="footer">Dokumen ini dicetak otomatis oleh sistem billing</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy');

  const formatDateTime = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy HH:mm');

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PAID': return { icon: CheckCircle, text: 'Lunas', bgColor: 'bg-success/20', textColor: 'text-success', borderColor: 'border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]' };
      case 'PENDING': return { icon: Clock, text: 'Menunggu', bgColor: 'bg-warning/20', textColor: 'text-warning', borderColor: 'border-warning/40 shadow-[0_0_5px_rgba(255,170,0,0.3)]' };
      case 'OVERDUE': return { icon: AlertCircle, text: 'Terlambat', bgColor: 'bg-destructive/20', textColor: 'text-destructive', borderColor: 'border-destructive/40 shadow-[0_0_5px_rgba(255,51,102,0.3)]' };
      default: return { icon: Clock, text: status, bgColor: 'bg-muted/20', textColor: 'text-muted-foreground', borderColor: 'border-muted/40' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary shadow-[0_0_15px_rgba(188,19,254,0.5)]" />
      </div>
    );
  }

  const pendingPayments = payments.filter(p => p.status === 'PENDING' || p.status === 'OVERDUE');
  const paidPayments = payments.filter(p => p.status === 'PAID');
  const totalPaidAmount = paidPayments.reduce((s, p) => s + p.amount, 0);
  const totalPendingAmount = pendingPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-3 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-primary drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">Riwayat Pembayaran</h1>
          <p className="text-xs text-accent mt-0.5">Lihat status invoice Anda</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 bg-primary/20 rounded-xl hover:bg-primary/30 transition-colors disabled:opacity-50 border border-primary/30 text-xs font-bold text-primary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {payments.length === 0 && (
        <CyberCard className="p-10 text-center bg-card/80 backdrop-blur-xl border-2 border-primary/30">
          <Receipt className="w-14 h-14 mx-auto mb-3 text-primary/40" />
          <h3 className="text-sm font-bold text-white mb-1">Tidak Ada Tagihan</h3>
          <p className="text-xs text-muted-foreground">Belum ada tagihan yang dicatat</p>
        </CyberCard>
      )}

      {/* Pending / Overdue Section */}
      {pendingPayments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-warning/20 rounded-lg border border-warning/30"><Clock className="w-4 h-4 text-warning" /></div>
            <h2 className="text-sm font-bold text-warning drop-shadow-[0_0_5px_rgba(255,170,0,0.5)]">
              Belum Bayar
              <span className="ml-2 px-2 py-0.5 bg-warning/20 text-warning text-[10px] rounded-full border border-warning/30">{pendingPayments.length}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {pendingPayments.map((payment) => {
              const config = getStatusConfig(payment.status);
              const StatusIcon = config.icon;
              const canPay = payment.manualPaymentStatus !== 'pending';
              const hasLink = (payment.paymentLink && payment.paymentLink.trim() !== '') || !!payment.paymentToken;
              const invoiceLabel = payment.isPackageChange ? 'Ganti Paket' : (payment.invoiceType ? (INVOICE_TYPE_LABEL[payment.invoiceType] || payment.invoiceType) : null);

              return (
                <CyberCard key={payment.id} className={`bg-card/80 backdrop-blur-xl border-2 ${config.borderColor} overflow-hidden`}>
                  <div className={`h-1 w-full ${payment.status === 'OVERDUE' ? 'bg-destructive' : 'bg-warning'}`} />
                  <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
                          <StatusIcon className={`w-3.5 h-3.5 ${config.textColor}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-mono text-xs font-bold text-white tracking-wide">{payment.invoiceNumber}</p>
                            {invoiceLabel && (
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md border ${
                                payment.isPackageChange
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                  : 'bg-primary/20 text-primary border-primary/30'
                              }`}>{invoiceLabel}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Dibuat: {formatDate(payment.createdAt)}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-lg border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {config.text}
                      </span>
                    </div>

                    {/* Package change description */}
                    {payment.isPackageChange && payment.packageChangeDescription && (
                      <div className="mb-3 flex items-center gap-2 px-2.5 py-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
                        <Package className="w-3 h-3 text-purple-400 flex-shrink-0" />
                        <span className="text-[10px] text-purple-300">{payment.packageChangeDescription}</span>
                      </div>
                    )}

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Jatuh Tempo</p>
                        <p className="text-xs font-semibold text-white flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-accent" />
                          {formatDate(payment.dueDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Jumlah Tagihan</p>
                        <p className="text-sm font-bold text-white mt-0.5">{formatCurrency(payment.amount)}</p>
                      </div>
                    </div>

                    {/* Manual payment status banners */}
                    {payment.manualPaymentStatus === 'pending' && (
                      <div className="mb-3 flex items-center gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                        <p className="text-[11px] text-yellow-300">
                          Bukti transfer {payment.manualPaymentBank ? `(${payment.manualPaymentBank}) ` : ''}sudah dikirim, menunggu konfirmasi admin.
                        </p>
                      </div>
                    )}
                    {payment.manualPaymentStatus === 'rejected' && (
                      <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <p className="text-[11px] text-red-300 font-semibold">Pembayaran ditolak. Silakan kirim ulang bukti transfer.</p>
                        </div>
                        {payment.manualPaymentRejectionReason && (
                          <p className="text-[10px] text-red-300/70 ml-5">Alasan: {payment.manualPaymentRejectionReason}</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedDetail(payment)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg text-[10px] font-bold text-primary transition-colors flex-shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detail
                      </button>
                      {canPay && (
                        <button
                          onClick={() => hasLink ? handlePayLink(payment) : handlePayInvoice(payment)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-[10px] font-bold text-cyan-300 transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Bayar Sekarang
                          {hasLink && <ExternalLink className="w-3 h-3 ml-auto" />}
                        </button>
                      )}
                      {!canPay && !payment.manualPaymentStatus && (
                        <CyberButton onClick={() => handlePayInvoice(payment)} variant="cyan" size="sm" className="flex-1">
                          <CreditCard className="w-3.5 h-3.5" />
                          Bayar Sekarang
                        </CyberButton>
                      )}
                    </div>
                  </div>
                </CyberCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Paid Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-success/20 rounded-lg border border-success/30"><CheckCircle className="w-4 h-4 text-success" /></div>
          <h2 className="text-sm font-bold text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">
            Lunas
            <span className="ml-2 px-2 py-0.5 bg-success/20 text-success text-[10px] rounded-full border border-success/30">{paidPayments.length}</span>
          </h2>
        </div>

        {paidPayments.length === 0 ? (
          <CyberCard className="p-6 text-center bg-card/80 backdrop-blur-xl border-2 border-muted/30">
            <Banknote className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Belum ada riwayat pembayaran</p>
          </CyberCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {paidPayments.map((payment) => {
              const invoiceLabel = payment.isPackageChange ? 'Ganti Paket' : (payment.invoiceType ? (INVOICE_TYPE_LABEL[payment.invoiceType] || payment.invoiceType) : null);
              const sourceConfig = payment.paymentSource ? PAYMENT_SOURCE_CONFIG[payment.paymentSource] : null;

              return (
                <CyberCard key={payment.id} className="bg-card/80 backdrop-blur-xl border-2 border-success/20 shadow-[0_0_15px_rgba(0,255,136,0.05)] overflow-hidden">
                  <div className="h-0.5 w-full bg-gradient-to-r from-success/40 to-success/10" />
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-success/10 border border-success/20">
                          {payment.isPackageChange ? <Package className="w-3.5 h-3.5 text-purple-400" /> : <Receipt className="w-3.5 h-3.5 text-success" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-mono text-xs font-bold text-white tracking-wide">{payment.invoiceNumber}</p>
                            {invoiceLabel && (
                              <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md border ${
                                payment.isPackageChange
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                  : 'bg-success/15 text-success border-success/30'
                              }`}>{invoiceLabel}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Dibuat: {formatDate(payment.createdAt)}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-lg border bg-success/15 text-success border-success/30">
                        <CheckCircle className="w-2.5 h-2.5" />
                        Lunas
                      </span>
                    </div>

                    {/* Detail */}
                    <div className="space-y-1.5 p-2.5 bg-success/5 rounded-lg border border-success/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Jumlah</span>
                        <span className="text-sm font-bold text-white">{formatCurrency(payment.amount)}</span>
                      </div>
                      {payment.paidAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Dibayar</span>
                          <span className="text-[10px] text-success font-semibold flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" />
                            {formatDateTime(payment.paidAt)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Jatuh Tempo</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(payment.dueDate)}</span>
                      </div>
                      {sourceConfig && (
                        <div className="flex items-center justify-between pt-1 border-t border-success/10">
                          <span className="text-[10px] text-muted-foreground">Via</span>
                          <span className={`text-[10px] font-semibold ${sourceConfig.color}`}>
                            {sourceConfig.label}
                            {payment.manualPaymentBank ? ` (${payment.manualPaymentBank})` : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Detail + Print Buttons */}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setSelectedDetail(payment)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-success/10 hover:bg-success/20 border border-success/30 rounded-lg text-[10px] font-bold text-success transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Lihat Detail
                      </button>
                      <button
                        onClick={() => handlePrintInvoice(payment)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted/20 hover:bg-muted/40 border border-border/50 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                        title="Cetak Nota"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </CyberCard>
              );
            })}
          </div>
        )}
      </div>

      {/* -- PAYMENT METHOD CHOICE MODAL ---------------------------------- */}
      {paymentChoiceVisible && selectedPaymentInvoice && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setPaymentChoiceVisible(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm">
              <CyberCard className="bg-[#0a0514]/95 backdrop-blur-xl border-2 border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.15)] overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-[#bc13fe]" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">Pilih Metode Pembayaran</h3>
                      <p className="text-[10px] text-muted-foreground">Invoice: {selectedPaymentInvoice.invoiceNumber}</p>
                    </div>
                    <button onClick={() => setPaymentChoiceVisible(false)} className="p-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/50"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                  <p className="text-base font-bold text-cyan-400 mb-4">{formatCurrency(selectedPaymentInvoice.amount)}</p>
                  <div className="space-y-3">
                    <button
                      onClick={handleChooseOnline}
                      className="w-full flex items-center gap-3 p-4 bg-cyan-500/10 hover:bg-cyan-500/20 border-2 border-cyan-500/40 rounded-xl transition-all text-left"
                    >
                      <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30"><CreditCard className="w-5 h-5 text-cyan-400" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">Bayar Online</p>
                        <p className="text-[10px] text-muted-foreground">Payment Gateway (Midtrans, Xendit, dll)</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-cyan-400" />
                    </button>
                    <button
                      onClick={handleChooseOffline}
                      className="w-full flex items-center gap-3 p-4 bg-purple-500/10 hover:bg-purple-500/20 border-2 border-purple-500/40 rounded-xl transition-all text-left"
                    >
                      <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/30"><Building2 className="w-5 h-5 text-purple-400" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">Transfer Manual</p>
                        <p className="text-[10px] text-muted-foreground">Upload bukti transfer, tunggu konfirmasi admin</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-purple-400" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 text-center mt-3">Pembayaran offline memerlukan persetujuan admin</p>
                </div>
              </CyberCard>
            </div>
          </div>
        </>
      )}

      {/* -- GATEWAY SELECTION DIALOG ------------------------------------ */}
      {gatewayDialogVisible && selectedPaymentInvoice && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setGatewayDialogVisible(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm">
              <CyberCard className="bg-[#0a0514]/95 backdrop-blur-xl border-2 border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.15)] overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-[#bc13fe]" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white">Pilih Payment Gateway</h3>
                    <button onClick={() => setGatewayDialogVisible(false)} className="p-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/50"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {paymentGateways.map(gw => (
                      <button
                        key={gw.id}
                        onClick={() => setSelectedGateway(gw.provider)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                          selectedGateway === gw.provider
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-border/40 bg-muted/10 hover:border-cyan-500/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-slate-800 rounded-lg border border-border/30"><CreditCard className="w-4 h-4 text-cyan-400" /></div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-white">{gw.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{gw.provider}</p>
                          </div>
                        </div>
                        {selectedGateway === gw.provider && <Check className="w-4 h-4 text-cyan-400" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setGatewayDialogVisible(false)} className="flex-1 py-2.5 bg-muted/20 hover:bg-muted/30 border border-border/50 rounded-lg text-xs font-bold text-muted-foreground transition-colors">Batal</button>
                    <CyberButton onClick={handleConfirmGateway} disabled={processingGateway || !selectedGateway} variant="cyan" size="sm" className="flex-1">
                      {processingGateway ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : <><CreditCard className="w-4 h-4" />Lanjutkan</>}
                    </CyberButton>
                  </div>
                </div>
              </CyberCard>
            </div>
          </div>
        </>
      )}

      {/* -- OFFLINE PAYMENT FORM ---------------------------------------- */}
      {offlineDialogVisible && selectedPaymentInvoice && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => !submittingOffline && setOfflineDialogVisible(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md max-h-[90vh] flex flex-col">
              <CyberCard className="bg-[#0a0514]/95 backdrop-blur-xl border-2 border-purple-500/40 shadow-[0_0_30px_rgba(188,19,254,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
                <div className="h-1 w-full bg-gradient-to-r from-purple-400 to-[#bc13fe] flex-shrink-0" />
                <div className="p-5 border-b border-purple-500/20 flex items-center justify-between flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-white">Pembayaran Offline</h3>
                    <p className="text-[10px] text-muted-foreground">{selectedPaymentInvoice.invoiceNumber} � {formatCurrency(selectedPaymentInvoice.amount)}</p>
                  </div>
                  {!submittingOffline && <button onClick={() => setOfflineDialogVisible(false)} className="p-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/50"><X className="w-4 h-4 text-muted-foreground" /></button>}
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                  {/* Bank/Method chips */}
                  <div>
                    <p className="text-xs font-bold text-white mb-2">Metode Pembayaran *</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {BANK_OPTIONS.map(bank => (
                        <button
                          key={bank}
                          onClick={() => { setBankName(bank); setCustomBank(''); }}
                          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${
                            bankName === bank && !customBank
                              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
                              : 'bg-muted/20 border-border/40 text-muted-foreground hover:border-cyan-500/40'
                          }`}
                        >
                          {bank}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Atau ketik nama bank/metode lain"
                      value={customBank}
                      onChange={e => { setCustomBank(e.target.value); setBankName(''); }}
                      className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>

                  {/* Account number (optional) */}
                  <div>
                    <p className="text-xs font-bold text-white mb-1.5">No. Rekening / E-Wallet <span className="text-muted-foreground font-normal">(opsional)</span></p>
                    <input
                      type="text"
                      placeholder="Contoh: 1234567890"
                      value={accountNumber}
                      onChange={e => setAccountNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>

                  {/* Account name (required) */}
                  <div>
                    <p className="text-xs font-bold text-white mb-1.5">Nama Lengkap Pengirim *</p>
                    <input
                      type="text"
                      placeholder="Sesuai rekening/e-wallet"
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-cyan-500/60"
                    />
                  </div>

                  {/* Notes (optional) */}
                  <div>
                    <p className="text-xs font-bold text-white mb-1.5">Catatan <span className="text-muted-foreground font-normal">(opsional)</span></p>
                    <textarea
                      placeholder="Catatan tambahan..."
                      value={paymentNotes}
                      onChange={e => setPaymentNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-cyan-500/60 resize-none"
                    />
                  </div>

                  {/* Proof upload */}
                  <div>
                    <p className="text-xs font-bold text-white mb-1.5">Bukti Transfer *</p>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    {proofPreviewUrl ? (
                      <div className="relative rounded-lg overflow-hidden border border-success/30">
                        <img src={proofPreviewUrl} alt="Bukti transfer" className="w-full max-h-40 object-contain bg-black" />
                        <button
                          onClick={() => { setProofFile(null); if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl); setProofPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full hover:bg-red-500"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center gap-2 py-6 border-2 border-dashed border-border/50 rounded-xl hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
                      >
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Klik untuk upload foto bukti transfer</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <Info className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    <p className="text-[10px] text-yellow-300/80">Pembayaran akan diverifikasi admin dalam 1�24 jam</p>
                  </div>
                </div>

                <div className="p-5 border-t border-purple-500/20 flex gap-2 flex-shrink-0">
                  <button onClick={() => setOfflineDialogVisible(false)} disabled={submittingOffline} className="flex-1 py-2.5 bg-muted/20 hover:bg-muted/30 border border-border/50 rounded-lg text-xs font-bold text-muted-foreground transition-colors disabled:opacity-50">
                    Batal
                  </button>
                  <CyberButton
                    onClick={handleSubmitOfflinePayment}
                    disabled={submittingOffline || (!bankName && !customBank.trim()) || !accountName.trim() || !proofFile}
                    variant="cyan"
                    size="sm"
                    className="flex-1"
                  >
                    {submittingOffline ? <><Loader2 className="w-4 h-4 animate-spin" />Mengirim...</> : <><ShieldCheck className="w-4 h-4" />Kirim Pembayaran</>}
                  </CyberButton>
                </div>
              </CyberCard>
            </div>
          </div>
        </>
      )}

      {/* -- DETAIL MODAL ------------------------------------------------- */}
      {selectedDetail && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedDetail(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm">
              <CyberCard className={`bg-[#0a0514]/95 backdrop-blur-xl border-2 overflow-hidden ${
                selectedDetail.status === 'PAID' ? 'border-success/40 shadow-[0_0_30px_rgba(0,255,136,0.15)]' :
                selectedDetail.status === 'OVERDUE' ? 'border-destructive/40 shadow-[0_0_30px_rgba(255,51,102,0.15)]' :
                'border-warning/40 shadow-[0_0_30px_rgba(255,170,0,0.15)]'
              }`}>
                <div className={`h-1 w-full ${
                  selectedDetail.status === 'PAID' ? 'bg-gradient-to-r from-success to-success/30' :
                  selectedDetail.status === 'OVERDUE' ? 'bg-gradient-to-r from-destructive to-destructive/30' :
                  'bg-gradient-to-r from-warning to-warning/30'
                }`} />
                <div className="p-5">
                  {/* Modal Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg border ${
                        selectedDetail.status === 'PAID' ? 'bg-success/20 border-success/30' :
                        selectedDetail.status === 'OVERDUE' ? 'bg-destructive/20 border-destructive/30' :
                        'bg-warning/20 border-warning/30'
                      }`}>
                        <Receipt className={`w-4 h-4 ${selectedDetail.status === 'PAID' ? 'text-success' : selectedDetail.status === 'OVERDUE' ? 'text-destructive' : 'text-warning'}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Detail Invoice</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border mt-0.5 ${
                          selectedDetail.status === 'PAID' ? 'bg-success/15 text-success border-success/30' :
                          selectedDetail.status === 'OVERDUE' ? 'bg-destructive/15 text-destructive border-destructive/30' :
                          'bg-warning/15 text-warning border-warning/30'
                        }`}>{getStatusConfig(selectedDetail.status).text}</span>
                      </div>
                    </div>
                    <button onClick={() => setSelectedDetail(null)} className="p-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/50"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>

                  <div className="space-y-2.5">
                    {/* Invoice number */}
                    <div className="flex items-center gap-3 p-3 bg-muted/10 rounded-xl border border-border/40">
                      <div className="p-1.5 bg-primary/20 rounded-lg border border-primary/30 flex-shrink-0"><Hash className="w-3.5 h-3.5 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">No. Invoice</p>
                        <p className="text-xs font-mono font-bold text-white truncate">{selectedDetail.invoiceNumber}</p>
                      </div>
                      {selectedDetail.isPackageChange && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 flex-shrink-0">Ganti Paket</span>}
                    </div>

                    {/* Amount */}
                    <div className="flex items-center gap-3 p-3 bg-muted/10 rounded-xl border border-border/40">
                      <div className="p-1.5 bg-accent/20 rounded-lg border border-accent/30 flex-shrink-0"><Wallet className="w-3.5 h-3.5 text-accent" /></div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Jumlah Tagihan</p>
                        <p className="text-base font-bold text-white">{formatCurrency(selectedDetail.amount)}</p>
                      </div>
                    </div>

                    {/* Package change description */}
                    {selectedDetail.isPackageChange && selectedDetail.packageChangeDescription && (
                      <div className="flex items-center gap-3 p-3 bg-purple-500/5 rounded-xl border border-purple-500/20">
                        <div className="p-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30 flex-shrink-0"><Package className="w-3.5 h-3.5 text-purple-400" /></div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Permintaan</p>
                          <p className="text-xs font-semibold text-purple-300">{selectedDetail.packageChangeDescription}</p>
                        </div>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-muted/10 rounded-xl border border-border/40">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Dibuat</p>
                        <p className="text-[11px] font-semibold text-white">{formatDate(selectedDetail.createdAt)}</p>
                      </div>
                      <div className="p-2.5 bg-muted/10 rounded-xl border border-border/40">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">Jatuh Tempo</p>
                        <p className="text-[11px] font-semibold text-white">{formatDate(selectedDetail.dueDate)}</p>
                      </div>
                    </div>

                    {/* Paid At */}
                    {selectedDetail.paidAt && (
                      <div className="flex items-center gap-3 p-3 bg-success/5 rounded-xl border border-success/20">
                        <div className="p-1.5 bg-success/20 rounded-lg border border-success/30 flex-shrink-0"><CheckCircle className="w-3.5 h-3.5 text-success" /></div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Tanggal Bayar</p>
                          <p className="text-[11px] font-bold text-success">{formatDateTime(selectedDetail.paidAt)}</p>
                        </div>
                        {selectedDetail.paymentSource && PAYMENT_SOURCE_CONFIG[selectedDetail.paymentSource] && (
                          <span className={`ml-auto text-[10px] font-semibold ${PAYMENT_SOURCE_CONFIG[selectedDetail.paymentSource].color}`}>
                            {PAYMENT_SOURCE_CONFIG[selectedDetail.paymentSource].label}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Manual payment rejection */}
                    {selectedDetail.manualPaymentStatus === 'rejected' && selectedDetail.manualPaymentRejectionReason && (
                      <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                        <p className="text-[10px] text-red-400 font-bold mb-1">Alasan Penolakan</p>
                        <p className="text-[11px] text-red-300">{selectedDetail.manualPaymentRejectionReason}</p>
                      </div>
                    )}

                    {/* Payment link (for pending only) */}
                    {(selectedDetail.status === 'PENDING' || selectedDetail.status === 'OVERDUE') && (
                      <div className="p-3 bg-muted/10 rounded-xl border border-border/40">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1.5">Link Pembayaran</p>
                        {selectedDetail.paymentLink && selectedDetail.paymentLink.trim() !== '' && !selectedDetail.paymentLink.includes('localhost') ? (
                          <a href={selectedDetail.paymentLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300">
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            {selectedDetail.paymentLink.length > 40 ? selectedDetail.paymentLink.substring(0, 40) + '...' : selectedDetail.paymentLink}
                          </a>
                        ) : selectedDetail.paymentToken ? (
                          <a href={`/pay/${selectedDetail.paymentToken}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300">
                            <ExternalLink className="w-3 h-3" />
                            /pay/{selectedDetail.paymentToken}
                          </a>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/60 italic">Tidak ada link pembayaran</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Modal Actions */}
                  <div className="flex gap-2 mt-4">
                    {(selectedDetail.status === 'PENDING' || selectedDetail.status === 'OVERDUE') && selectedDetail.manualPaymentStatus !== 'pending' && (
                      <CyberButton
                        onClick={() => { setSelectedDetail(null); handlePayInvoice(selectedDetail); }}
                        variant="cyan" size="sm" className="flex-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Bayar Sekarang
                      </CyberButton>
                    )}
                    <button onClick={() => setSelectedDetail(null)} className="flex-1 px-4 py-2 bg-muted/20 hover:bg-muted/30 border border-border/50 rounded-lg text-xs font-bold text-muted-foreground transition-colors">
                      Tutup
                    </button>
                  </div>
                </div>
              </CyberCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
