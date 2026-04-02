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
import { CyberCard, CyberButton, SimpleModal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalButton } from '@/components/cyberpunk';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { printInvoiceStandard, printInvoiceThermal } from '@/lib/invoice-print';

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
  const [printDialogPayment, setPrintDialogPayment] = useState<PaymentHistory | null>(null);

  // Payment method choice modal
  const [paymentChoiceVisible, setPaymentChoiceVisible] = useState(false);
  const handlePrintStandard = async (payment: PaymentHistory) => {
    await printInvoiceStandard(payment.id, toast);
  };

  const handlePrintThermal = async (payment: PaymentHistory) => {
    await printInvoiceThermal(payment.id, toast);
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

  const handlePrintInvoice = async (payment: PaymentHistory) => {
    try {
      const res = await fetch(`/api/invoices/${payment.id}/pdf`);
      const data = await res.json();
      if (!data.success || !data.data) { toast('error', 'Gagal', 'Gagal mengambil data tagihan'); return; }
      const inv = data.data;
      const fmtCurr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
      const win = window.open('', '_blank', 'width=850,height=1100');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Invoice ${inv.invoice.number}</title>
      <style>
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .topbar { display: none !important; }
          .sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; overflow: visible !important; max-width: 100% !important; width: 100% !important; margin: 0 !important; }
          .content { padding: 6mm 8mm !important; }
          .header-right { padding-top: 0 !important; overflow: visible !important; }
          .inv-title { overflow: visible !important; padding-top: 0 !important; line-height: 1.3 !important; }
          .inv-number { overflow: visible !important; line-height: 1.4 !important; }
          .meta-card, .payment-card, .paid-stamp { break-inside: avoid; page-break-inside: avoid; }
          table { table-layout: fixed; }
          th, td { word-break: break-word; }
        }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 24px 24px 80px; background: #f8fafc; }
        .sheet { background: #fff; border: 1px solid #dbe7e4; border-radius: 18px; overflow: visible; box-shadow: 0 18px 50px rgba(15, 118, 110, 0.08); max-width: 980px; margin: 0 auto; }
        .topbar { height: 7px; background: linear-gradient(90deg, #0d9488, #14b8a6, #5eead4); }
        .content { padding: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 20px; }
        .brand-wrap { display:flex; align-items:center; gap:14px; }
        .header-right { text-align:right; padding-top: 2px; }
        .logo-box { width: 78px; height: 78px; border-radius: 16px; background: linear-gradient(180deg, #ecfeff, #f0fdfa); border: 1px solid #c7f9f1; display:flex; align-items:center; justify-content:center; padding: 10px; }
        .company-name { font-size: 20px; font-weight: bold; color: #0d9488; }
        .company-sub { color: #555; margin-top: 3px; font-size: 10px; line-height: 1.6; }
        .inv-title { font-size: 26px; font-weight: bold; color: #111; letter-spacing: 2px; line-height: 1.25; padding-top: 1px; }
        .inv-number { font-size: 13px; font-weight: bold; color: #0d9488; margin: 4px 0; line-height: 1.35; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .paid-badge { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
        .pending-badge { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .divider { border: none; border-top: 2px solid #0d9488; margin: 14px 0; }
        .section-title { font-weight: bold; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 18px; }
        .meta-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
        .info-row { margin-bottom: 3px; }
        .info-label { color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #0d9488; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
        .td-right { text-align: right; }
        .total-row td { font-weight: bold; font-size: 13px; background: #f0fdfa; border-top: 2px solid #0d9488; }
        .payment-card { padding: 16px; border-radius: 14px; border: 1px solid #99f6e4; background: linear-gradient(180deg, #f0fdfa, #ffffff); }
        .payment-card-title { font-size: 13px; font-weight: 700; color: #0f766e; margin-bottom: 6px; }
        .paid-stamp { display: block; margin: 20px auto; padding: 12px 28px; border: 4px solid #10b981; border-radius: 10px; text-align: center; width: fit-content; }
        .paid-stamp-text { font-size: 24px; font-weight: bold; color: #10b981; letter-spacing: 6px; }
        .paid-stamp-sub { font-size: 11px; color: #555; margin-top: 2px; }
        .footer { margin-top: 28px; text-align: center; color: #aaa; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        .action-bar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 10px; padding: 12px 16px; background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
        .btn-print { flex: 1; padding: 12px; background: #0d9488; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-close { flex: 1; padding: 12px; background: #6b7280; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        @media (max-width: 640px) {
          body { padding: 8px 8px 80px !important; }
          .sheet { border-radius: 10px !important; max-width: 100% !important; }
          .content { padding: 14px !important; }
          .header { flex-direction: column; gap: 10px; }
          .header-right { text-align: left; padding-top: 0; }
          .inv-title { font-size: 20px; }
          .bill-grid { grid-template-columns: 1fr; gap: 12px; }
          .meta-card { padding: 10px 12px; }
          table { font-size: 10px; }
          th, td { padding: 5px 6px; }
          .paid-stamp-text { font-size: 18px; }
        }
      </style></head><body>
      <div class="sheet">
      <div class="topbar"></div>
      <div class="content">
      <div class="header">
        <div class="brand-wrap">
          ${inv.company.logo ? `<div class="logo-box"><img src="${inv.company.logo}" style="max-height:58px;max-width:58px;width:auto;object-fit:contain" alt="Logo"></div>` : ''}
          <div>
            <div class="company-name">${inv.company.name}</div>
            <div class="company-sub">
              ${inv.company.address ? `${inv.company.address}<br>` : ''}
              ${inv.company.phone ? `Telp: ${inv.company.phone}<br>` : ''}
              ${inv.company.email ? `${inv.company.email}` : ''}
            </div>
          </div>
        </div>
        <div class="header-right">
          <div class="inv-title">INVOICE</div>
          <div class="inv-number">${inv.invoice.number}</div>
          <div>${inv.invoice.status === 'PAID' ? '<span class="status-badge paid-badge">&#10003; SUDAH BAYAR</span>' : '<span class="status-badge pending-badge">BELUM BAYAR</span>'}</div>
        </div>
      </div>
      <hr class="divider">
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Dari</div>
          <div class="info-row"><strong>${inv.company.name}</strong></div>
          ${inv.company.address ? `<div class="info-row">${inv.company.address}</div>` : ''}
          ${inv.company.phone ? `<div class="info-row">Telp: ${inv.company.phone}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Kepada</div>
          <div class="info-row"><strong>${inv.customer.name}</strong></div>
          ${inv.customer.customerId ? `<div class="info-row"><span class="info-label">ID Pelanggan: </span>${inv.customer.customerId}</div>` : ''}
          ${inv.customer.phone ? `<div class="info-row"><span class="info-label">Telp: </span>${inv.customer.phone}</div>` : ''}
          ${inv.customer.username ? `<div class="info-row"><span class="info-label">Username: </span>${inv.customer.username}</div>` : ''}
        </div>
      </div>
      <div class="bill-grid">
        <div class="meta-card">
          <div class="section-title">Detail Invoice</div>
          <div class="info-row"><span class="info-label">No Invoice: </span><strong>${inv.invoice.number}</strong></div>
          <div class="info-row"><span class="info-label">Tanggal: </span>${inv.invoice.date}</div>
          <div class="info-row"><span class="info-label">Jatuh Tempo: </span>${inv.invoice.dueDate}</div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Tgl Bayar: </span>${inv.invoice.paidAt}</div>` : ''}
        </div>
        <div class="meta-card">
          <div class="section-title">Status Pembayaran</div>
          <div class="info-row"><span class="info-label">Status: </span><strong>${inv.invoice.status === 'PAID' ? '&#10003; LUNAS' : inv.invoice.status === 'OVERDUE' ? '&#9888; TERLAMBAT' : '&#9203; BELUM BAYAR'}</strong></div>
          ${inv.invoice.paidAt ? `<div class="info-row"><span class="info-label">Dibayar pada: </span>${inv.invoice.paidAt}</div>` : ''}
        </div>
      </div>
      <div class="section-title">Rincian Layanan</div>
      <table>
        <thead><tr><th>Deskripsi</th><th style="width:60px;text-align:center">Qty</th><th style="width:130px;text-align:right">Harga</th><th style="width:130px;text-align:right">Total</th></tr></thead>
        <tbody>
          ${inv.items.map((item: { description: string; quantity: number; price: number; total: number }) => `
            <tr><td>${item.description}</td><td style="text-align:center">${item.quantity}</td><td class="td-right">${fmtCurr(item.price)}</td><td class="td-right">${fmtCurr(item.total)}</td></tr>
          `).join('')}
          ${inv.tax && inv.tax.hasTax ? `
            <tr style="background:#f9fafb"><td colspan="3" style="text-align:right;font-size:11px;color:#555;padding:5px 10px">Subtotal</td><td class="td-right" style="color:#555;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.baseAmount)}</td></tr>
            <tr style="background:#fffbeb"><td colspan="3" style="text-align:right;font-size:11px;color:#d97706;padding:5px 10px">PPN ${inv.tax.taxRate}%</td><td class="td-right" style="color:#d97706;font-size:11px;padding:5px 10px">${fmtCurr(inv.tax.taxAmount)}</td></tr>
          ` : ''}
          <tr class="total-row"><td colspan="3" class="td-right">TOTAL</td><td class="td-right">${inv.amountFormatted}</td></tr>
        </tbody>
      </table>
      ${inv.invoice.paidAt ? `<div class="paid-stamp"><div class="paid-stamp-text">LUNAS</div><div class="paid-stamp-sub">Dibayar pada ${inv.invoice.paidAt}</div></div>` :
        (inv.company.bankAccounts && inv.company.bankAccounts.length > 0 ? `
        <div style="margin:18px 0;padding:16px;border:1px solid #6ee7b7;border-radius:8px;background:#f0fdfa">
          <div class="section-title" style="margin-bottom:10px">Pembayaran Manual</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${inv.company.bankAccounts.map((ba: { bankName: string; accountNumber: string; accountName: string }) => `
              <div style="border:1px solid #0d948840;border-radius:8px;padding:10px 14px;background:#fff">
                <div style="font-weight:bold;font-size:12px;color:#0d9488;margin-bottom:4px">${ba.bankName}</div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">${ba.accountNumber}</div>
                <div style="font-size:11px;color:#555;margin-top:2px">a/n ${ba.accountName}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '')}
      <div class="footer">Terima kasih atas kepercayaan Anda &mdash; ${inv.company.name}</div>
      </div>
      </div>
      <div class="action-bar no-print">
        <button class="btn-print" onclick="window.print()">&#128438; Cetak</button>
        <button class="btn-close" onclick="window.close()">&#10005; Tutup</button>
      </div>
      </body></html>`);
      win.document.close();
    } catch { toast('error', 'Gagal', 'Gagal mencetak invoice'); }
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
                        onClick={() => setPrintDialogPayment(payment)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-muted/20 hover:bg-muted/40 border border-border/50 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                        title="Pilih Jenis Print"
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

      <SimpleModal isOpen={printDialogPayment !== null} onClose={() => setPrintDialogPayment(null)} size="sm">
        <ModalHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-primary/15 border border-primary/30">
              <Printer className="w-4 h-4 text-primary" />
            </div>
            <div>
              <ModalTitle>Pilih Jenis Printer</ModalTitle>
              <ModalDescription className="font-mono">{printDialogPayment?.invoiceNumber}</ModalDescription>
            </div>
          </div>
        </ModalHeader>
        <ModalBody className="space-y-2 pb-2">
          <button
            onClick={() => {
              if (!printDialogPayment) return;
              const payment = printDialogPayment;
              setPrintDialogPayment(null);
              void handlePrintStandard(payment);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <FileText className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold">Standar Printer</div>
              <div className="text-[11px] opacity-80">A4 / Letter - invoice lengkap</div>
            </div>
          </button>
          <button
            onClick={() => {
              if (!printDialogPayment) return;
              const payment = printDialogPayment;
              setPrintDialogPayment(null);
              void handlePrintThermal(payment);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <Printer className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold">Thermal Printer</div>
              <div className="text-[11px] opacity-80">58mm / 80mm - struk kasir</div>
            </div>
          </button>
        </ModalBody>
        <ModalFooter>
          <ModalButton variant="secondary" onClick={() => setPrintDialogPayment(null)}>Batal</ModalButton>
        </ModalFooter>
      </SimpleModal>

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
