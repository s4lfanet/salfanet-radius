'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, CreditCard, Banknote, Loader2, CheckCircle, AlertCircle,
  RefreshCw, ChevronRight, X, Check, Building2, Upload, ImageIcon,
  Clock, Calendar, Zap, Info, ChevronLeft,
} from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const BANK_OPTIONS = [
  'BCA', 'BNI', 'BRI', 'Mandiri', 'BSI',
  'CIMB Niaga', 'Dana', 'OVO', 'GoPay', 'ShopeePay',
];

interface UserInfo {
  id: string;
  name: string;
  username: string;
  phone: string;
  status: string;
  expiredAt: string | null;
  profile: { id: string; name: string; downloadSpeed: number; uploadSpeed: number; price: number };
}

interface PackageOption {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  price: number;
}

interface PaymentGateway {
  id: string;
  name: string;
  provider: string;
}

interface CreatedInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  paymentLink: string | null;
  newExpiredDate: string;
}

type Step = 'select' | 'payment-choice' | 'online-pay' | 'offline-pay' | 'success';

export default function RenewalPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const toast = useCallback((type: 'success' | 'error' | 'info' | 'warning', title: string, desc?: string) => {
    addToast({ type, title, description: desc, duration: type === 'error' ? 8000 : 5000 });
  }, [addToast]);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [canRenew, setCanRenew] = useState<boolean | null>(null);
  const [cantRenewReason, setCantRenewReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<CreatedInvoice | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [selectedGateway, setSelectedGateway] = useState('');
  const [processingGateway, setProcessingGateway] = useState(false);

  // Manual payment state
  const [bankName, setBankName] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [accountName, setAccountName] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submittingManual, setSubmittingManual] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (!token) { router.push('/customer/login'); return; }
    loadData();
  }, [router]);

  const loadData = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;
    setLoading(true);
    try {
      const [meRes, pkgRes, gwRes, renewRes] = await Promise.all([
        fetch('/api/customer/me', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/customer/packages', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/public/payment-gateways'),
        fetch('/api/customer/renewal', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const meData = await meRes.json();
      const pkgData = await pkgRes.json();
      const gwData = await gwRes.json();
      const renewData = await renewRes.json();

      if (meData.user || meData.id) {
        const u = meData.user || meData;
        setUser(u);
        setSelectedPackageId(u.profile?.id || '');
      }
      if (pkgData.success) {
        setPackages(pkgData.packages || []);
      }
      if (gwData.success) {
        const gws = gwData.gateways || [];
        setPaymentGateways(gws);
        if (gws.length > 0) setSelectedGateway(gws[0].provider);
      }
      if (renewData.success !== false) {
        setCanRenew(true);
      } else {
        setCanRenew(false);
        setCantRenewReason(renewData.error || 'Perpanjangan belum tersedia');
      }
    } catch {
      toast('error', 'Gagal', 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRenewal = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token || !selectedPackageId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/customer/renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newProfileId: selectedPackageId !== user?.profile?.id ? selectedPackageId : undefined }),
      });
      const data = await res.json();
      if (data.success && data.invoice) {
        setCreatedInvoice(data.invoice);
        setStep('payment-choice');
      } else {
        toast('error', 'Gagal', data.error || 'Gagal membuat invoice perpanjangan');
      }
    } catch {
      toast('error', 'Gagal', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmGateway = async () => {
    if (!createdInvoice || !selectedGateway) return;
    setProcessingGateway(true);
    const token = localStorage.getItem('customer_token');
    try {
      const res = await fetch('/api/customer/invoice/regenerate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoiceId: createdInvoice.id, gateway: selectedGateway }),
      });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
        setStep('success');
      } else if (createdInvoice.paymentLink) {
        window.open(createdInvoice.paymentLink, '_blank', 'noopener,noreferrer');
        setStep('success');
      } else {
        toast('error', 'Gagal', data.error || 'Gagal membuat link pembayaran');
      }
    } catch {
      if (createdInvoice.paymentLink) {
        window.open(createdInvoice.paymentLink, '_blank', 'noopener,noreferrer');
        setStep('success');
      } else {
        toast('error', 'Gagal', 'Terjadi kesalahan');
      }
    } finally {
      setProcessingGateway(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(file);
    setProofPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmitManual = async () => {
    if (!createdInvoice) return;
    const finalBank = customBank.trim() || bankName;
    if (!finalBank) { toast('warning', 'Wajib Diisi', 'Pilih atau masukkan metode pembayaran/nama bank'); return; }
    if (!accountName.trim()) { toast('warning', 'Wajib Diisi', 'Masukkan nama lengkap pengirim'); return; }
    if (!proofFile) { toast('warning', 'Bukti Transfer', 'Upload bukti transfer diperlukan'); return; }

    setSubmittingManual(true);
    const token = localStorage.getItem('customer_token');
    const formData = new FormData();
    formData.append('bankName', finalBank);
    formData.append('accountName', accountName.trim());
    if (paymentNotes.trim()) formData.append('notes', paymentNotes.trim());
    formData.append('file', proofFile);
    try {
      const res = await fetch(`/api/customer/invoices/${createdInvoice.id}/manual-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast('success', 'Berhasil', 'Bukti transfer dikirim. Menunggu konfirmasi admin.');
        setStep('success');
      } else {
        toast('error', 'Gagal', data.error || 'Gagal mengirim pembayaran. Silakan coba lagi.');
      }
    } catch {
      toast('error', 'Gagal', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmittingManual(false);
    }
  };

  const selectedPkg = packages.find(p => p.id === selectedPackageId) || user?.profile;
  const isExpired = user?.expiredAt ? new Date(user.expiredAt) < new Date() : false;
  const daysLeft = user?.expiredAt
    ? Math.ceil((new Date(user.expiredAt).getTime() - Date.now()) / 86400000)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary shadow-[0_0_15px_rgba(188,19,254,0.5)]" />
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step === 'select' ? router.push('/customer') : setStep('select')} className="p-2 rounded-xl hover:bg-muted/20 border border-border/40 transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-primary drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">Perpanjang Langganan</h1>
          <p className="text-xs text-accent mt-0.5">Perpanjang paket internet Anda</p>
        </div>
      </div>

      {/* Current Account Info */}
      {user && (
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(188,19,254,0.1)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-primary/20 rounded-lg border border-primary/30">
              <Package className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Info Langganan</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wide">Username</span>
              <span className="font-mono text-white">{user.username}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wide">Paket Saat Ini</span>
              <span className="font-medium text-white">{user.profile?.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wide">Status</span>
              {isExpired
                ? <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-[9px] font-bold rounded border border-destructive/40">Expired</span>
                : <span className="px-2 py-0.5 bg-success/20 text-success text-[9px] font-bold rounded border border-success/40">Aktif</span>
              }
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wide">Berlaku Sampai</span>
              <span className={`font-medium ${isExpired ? 'text-destructive' : 'text-white'}`}>
                {user.expiredAt ? formatWIB(user.expiredAt, 'd MMM yyyy') : '-'}
                {daysLeft !== null && !isExpired && (
                  <span className="text-muted-foreground ml-1 text-[10px]">({daysLeft} hari lagi)</span>
                )}
              </span>
            </div>
          </div>
        </CyberCard>
      )}

      {/* Cannot renew warning */}
      {canRenew === false && (
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-warning/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-warning">Perpanjangan Tidak Tersedia</p>
              <p className="text-xs text-muted-foreground mt-1">{cantRenewReason}</p>
            </div>
          </div>
        </CyberCard>
      )}

      {/* STEP: Select Package */}
      {step === 'select' && canRenew !== false && (
        <div className="space-y-4">
          <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-cyan-500/30">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Pilih Paket</span>
            </div>
            <div className="space-y-2">
              {packages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Tidak ada paket tersedia</p>
              ) : (
                packages.map(pkg => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                      selectedPackageId === pkg.id
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-border/40 bg-muted/10 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-slate-800 rounded-lg border border-border/30">
                        <Package className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white">{pkg.name}</p>
                          {pkg.id === user?.profile?.id && (
                            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-bold rounded border border-primary/30">Paket Saat Ini</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{pkg.downloadSpeed}/{pkg.uploadSpeed} Mbps</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatCurrency(pkg.price)}</p>
                      <p className="text-[9px] text-muted-foreground">/bulan</p>
                    </div>
                    {selectedPackageId === pkg.id && <Check className="w-4 h-4 text-cyan-400 ml-2" />}
                  </button>
                ))
              )}
            </div>
          </CyberCard>

          {/* Summary */}
          {selectedPkg && (
            <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-success/20">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-bold text-success">Ringkasan Perpanjangan</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paket</span>
                  <span className="font-medium text-white">{selectedPkg.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga</span>
                  <span className="font-bold text-white">{formatCurrency(selectedPkg.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Perpanjangan</span>
                  <span className="text-white">+30 hari</span>
                </div>
                {user?.expiredAt && (
                  <div className="flex justify-between pt-1 border-t border-border/30">
                    <span className="text-muted-foreground">Berlaku hingga (estimasi)</span>
                    <span className="font-bold text-success">
                      {formatWIB(new Date(new Date(user.expiredAt) > new Date()
                        ? new Date(new Date(user.expiredAt).getTime() + 30 * 86400000)
                        : new Date(Date.now() + 30 * 86400000)).toISOString(), 'd MMM yyyy')}
                    </span>
                  </div>
                )}
              </div>
            </CyberCard>
          )}

          <CyberButton
            onClick={handleCreateRenewal}
            disabled={!selectedPackageId || creating}
            className="w-full"
            variant="cyan"
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Membuat Invoice...</>
            ) : (
              <><Zap className="w-4 h-4" /> Perpanjang Sekarang</>
            )}
          </CyberButton>

          <p className="text-[10px] text-muted-foreground text-center">
            Invoice akan dibuat dan Anda dapat memilih metode pembayaran selanjutnya
          </p>
        </div>
      )}

      {/* STEP: Payment Choice */}
      {step === 'payment-choice' && createdInvoice && (
        <div className="space-y-4">
          <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-success/30">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="text-xs font-bold text-success">Invoice Berhasil Dibuat</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. Invoice</span>
                <span className="font-mono font-bold text-white">{createdInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah</span>
                <span className="font-bold text-white">{formatCurrency(createdInvoice.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Berlaku Baru s.d</span>
                <span className="font-bold text-success">{formatWIB(createdInvoice.newExpiredDate, 'd MMM yyyy')}</span>
              </div>
            </div>
          </CyberCard>

          <div className="space-y-3">
            <p className="text-xs font-bold text-white">Pilih Metode Pembayaran</p>
            <button
              onClick={() => paymentGateways.length > 0 ? setStep('online-pay') : (createdInvoice.paymentLink ? window.open(createdInvoice.paymentLink, '_blank') : toast('warning', 'Tidak tersedia', 'Payment gateway tidak dikonfigurasi'))}
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
              onClick={() => setStep('offline-pay')}
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
        </div>
      )}

      {/* STEP: Online Payment */}
      {step === 'online-pay' && createdInvoice && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('payment-choice')} className="p-1.5 rounded-lg border border-border/40 hover:bg-muted/20 transition">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-white">Pilih Payment Gateway</span>
          </div>
          <div className="space-y-2">
            {paymentGateways.map(gw => (
              <button
                key={gw.id}
                onClick={() => setSelectedGateway(gw.provider)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${
                  selectedGateway === gw.provider ? 'border-cyan-400 bg-cyan-500/10' : 'border-border/40 bg-muted/10 hover:border-cyan-500/40'
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
          <CyberButton onClick={handleConfirmGateway} disabled={!selectedGateway || processingGateway} className="w-full" variant="cyan">
            {processingGateway ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : <><CreditCard className="w-4 h-4" /> Bayar Sekarang</>}
          </CyberButton>
          <p className="text-[10px] text-muted-foreground text-center">Anda akan diarahkan ke halaman pembayaran gateway</p>
        </div>
      )}

      {/* STEP: Manual Payment */}
      {step === 'offline-pay' && createdInvoice && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('payment-choice')} className="p-1.5 rounded-lg border border-border/40 hover:bg-muted/20 transition">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-white">Upload Bukti Transfer</span>
          </div>

          <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-purple-500/30 space-y-3">
            {/* Bank Name */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Metode / Bank Pengirim *</label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {BANK_OPTIONS.map(b => (
                  <button key={b} type="button" onClick={() => { setBankName(b); setCustomBank(''); }}
                    className={`px-2 py-1.5 text-[10px] rounded-lg border-2 transition font-medium ${bankName === b && !customBank ? 'border-purple-400 bg-purple-500/20 text-purple-300' : 'border-border/40 text-muted-foreground hover:border-purple-500/40'}`}>
                    {b}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Atau ketik nama bank lain..."
                value={customBank} onChange={e => { setCustomBank(e.target.value); setBankName(''); }}
                className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-muted/20 focus:outline-none focus:border-purple-400" />
            </div>

            {/* Account Name */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Nama Pengirim *</label>
              <input type="text" placeholder="Nama lengkap sesuai rekening"
                value={accountName} onChange={e => setAccountName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-muted/20 focus:outline-none focus:border-purple-400" />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Catatan (opsional)</label>
              <input type="text" placeholder="Misalnya: Transfer via mobile banking BCA"
                value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-muted/20 focus:outline-none focus:border-purple-400" />
            </div>

            {/* Proof Upload */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Bukti Transfer *</label>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
              {proofPreviewUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofPreviewUrl} alt="Proof" className="w-full max-h-48 object-contain rounded-lg border border-purple-500/30" />
                  <button onClick={() => { setProofFile(null); if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl); setProofPreviewUrl(null); }}
                    className="absolute top-2 right-2 p-1 bg-red-500/80 rounded-full hover:bg-red-500">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-purple-500/40 rounded-xl hover:border-purple-400 hover:bg-purple-500/5 transition">
                  <Upload className="w-6 h-6 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Tap untuk upload foto bukti transfer</span>
                  <span className="text-[10px] text-muted-foreground/60">JPG, PNG, WebP (maks. 5 MB)</span>
                </button>
              )}
            </div>

            <CyberButton onClick={handleSubmitManual} disabled={submittingManual} className="w-full" variant="purple">
              {submittingManual ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</> : <><Banknote className="w-4 h-4" /> Kirim Bukti Transfer</>}
            </CyberButton>
            <p className="text-[10px] text-muted-foreground text-center">Pembayaran akan dikonfirmasi admin dalam 1×24 jam</p>
          </CyberCard>
        </div>
      )}

      {/* STEP: Success */}
      {step === 'success' && (
        <CyberCard className="p-6 bg-card/80 backdrop-blur-xl border-2 border-success/40 text-center shadow-[0_0_30px_rgba(0,255,136,0.15)]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/20 border-2 border-success/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,255,136,0.3)]">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-base font-bold text-white mb-2">Pembayaran Dikirim!</h3>
          <p className="text-xs text-muted-foreground mb-1">
            {createdInvoice ? `Invoice ${createdInvoice.invoiceNumber}` : 'Invoice perpanjangan'} sedang diproses.
          </p>
          <p className="text-[11px] text-muted-foreground mb-4">
            Langganan Anda akan diperpanjang setelah pembayaran dikonfirmasi.
          </p>
          <div className="space-y-2">
            <CyberButton onClick={() => router.push('/customer/history')} className="w-full" variant="cyan" size="sm">
              <Clock className="w-3.5 h-3.5" /> Lihat Riwayat Pembayaran
            </CyberButton>
            <CyberButton onClick={() => router.push('/customer')} className="w-full" variant="ghost" size="sm">
              Kembali ke Beranda
            </CyberButton>
          </div>
        </CyberCard>
      )}
    </div>
  );
}
