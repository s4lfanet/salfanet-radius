'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Wifi, Receipt, Loader2, ExternalLink, Edit2, X, Check, Package, Zap, FileText, MessageSquare, Gift, PauseCircle, Banknote, RefreshCw, Upload } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { formatWIB, nowWIB } from '@/lib/timezone';

// Hardcoded Indonesian translations
const translations: Record<string, string> = {
  'auth.logout': 'Keluar',
  'common.name': 'Nama',
  'common.phone': 'Telepon',
  'common.status': 'Status',
  'common.save': 'Simpan',
  'common.edit': 'Edit',
  'auth.username': 'Username',
  'customer.accountInfo': 'Info Akun',
  'customer.package': 'Paket',
  'customer.speed': 'Kecepatan',
  'customer.expired': 'Expired',
  'customer.active': 'Aktif',
  'customer.expiredDate': 'Tanggal Expired',
  'customer.daysLeft': 'hari lagi',
  'customer.changePackage': 'Ubah Paket',
  'customer.depositBalance': 'Saldo Deposit',
  'customer.currentBalance': 'Saldo Saat Ini',
  'customer.packagePrice': 'Harga Paket',
  'customer.lowBalanceWarning': 'Saldo tidak cukup untuk perpanjangan otomatis!',
  'customer.autoRenewal': 'Perpanjangan Otomatis',
  'customer.autoRenewalInfo': 'Paket akan otomatis diperpanjang saat expired',
  'customer.topUpDirect': 'Top-Up Langsung (Otomatis)',
  'customer.requestManual': 'Request Manual',
  'customer.whatsappAdmin': 'WA Admin',
  'customer.ontWifi': 'ONT / WiFi',
  'customer.ontNotFound': 'ONT tidak ditemukan atau belum terhubung',
  'customer.model': 'Model',
  'customer.serialNumber': 'Serial Number',
  'customer.ontStatus': 'Status ONT',
  'customer.connected': 'Terhubung',
  'customer.disconnected': 'Terputus',
  'customer.ipPppoe': 'IP PPPoE',
  'customer.softwareVer': 'Software Ver',
  'customer.rxPower': 'RX Power',
  'customer.temperature': 'Temperature',
  'customer.uptime': 'Uptime',
  'customer.deviceId': 'Device ID',
  'customer.connectedDevices': 'Perangkat Terhubung',
  'customer.wifiSettings': 'Pengaturan WiFi',
  'customer.deviceConnected': 'perangkat',
  'customer.wifiName': 'Nama WiFi (SSID)',
  'customer.wifiNamePlaceholder': 'Masukkan nama WiFi',
  'customer.wifiPassword': 'Password WiFi',
  'customer.wifiPasswordPlaceholder': 'Minimal 8 karakter',
  'customer.securityModeNote': 'Keamanan: WPA2-PSK/WPA3',
  'customer.ssid': 'SSID',
  'customer.connectedDevicesTitle': 'Perangkat Terhubung',
  'customer.unknownDevice': 'Perangkat Tidak Dikenal',
  'customer.online': 'Online',
  'customer.offline': 'Offline',
  'customer.invoices': 'Tagihan',
  'customer.noInvoices': 'Tidak ada tagihan',
  'customer.paid': 'Lunas',
  'customer.cancelled': 'Dibatalkan',
  'customer.overdue': 'Terlambat',
  'customer.unpaid': 'Belum Bayar',
  'customer.dueDate': 'Jatuh Tempo',
  'customer.payNow': 'Bayar Sekarang',
  'customer.processing': 'Memproses',
  'customer.generateLink': 'Buat Link',
  'customer.noGatewayAvailable': 'Payment gateway belum tersedia. Hubungi admin untuk top-up manual.',
  'customer.failedGeneratePaymentLink': 'Gagal membuat link pembayaran',
  'customer.failedContactServer': 'Gagal menghubungi server',
  'customer.ssidRequired': 'SSID wajib diisi',
  'customer.passwordLength': 'Password minimal 8 karakter',
  'customer.deviceNotFound': 'Device tidak ditemukan',
  'customer.wifiUpdateSuccess': 'WiFi berhasil diupdate',
  'customer.failedUpdateWifi': 'Gagal update WiFi',
};

const t = (key: string) => translations[key] || key;

interface CustomerUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  expiredAt: Date;
  balance?: number;
  autoRenewal?: boolean;
  customerId?: string | null;
  profile: {
    name: string;
    downloadSpeed: number;
    uploadSpeed: number;
    price?: number;
  };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  paymentLink: string | null;
  paymentToken: string | null;
  manualPaymentStatus: string | null;
}

export default function CustomerDashboard() {
  const router = useRouter();
  const { addToast } = useToast();
  const toast = (type: 'success'|'error'|'info'|'warning', title: string, desc?: string) =>
    addToast({ type, title, description: desc, duration: type === 'error' ? 8000 : 5000 });
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ontDevice, setOntDevice] = useState<any>(null);
  const [loadingOnt, setLoadingOnt] = useState(true);
  const [editingWifi, setEditingWifi] = useState<number | null>(null); // WLAN index being edited
  const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
  const [updatingWifi, setUpdatingWifi] = useState(false);
  const [companyName, setCompanyName] = useState('SALFANET RADIUS');
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);
  const [manualPayModal, setManualPayModal] = useState<{id: string; invoiceNumber: string; amount: number} | null>(null);
  const [manualForm, setManualForm] = useState({ bankName: '', accountName: '', notes: '', file: null as File | null });
  const [submittingManual, setSubmittingManual] = useState(false);
  const [adminBankAccounts, setAdminBankAccounts] = useState<{bankName: string; accountNumber: string; accountName: string}[]>([]);
  const [selectedAdminBank, setSelectedAdminBank] = useState<{bankName: string; accountNumber: string; accountName: string} | null>(null);

  useEffect(() => {
    loadCompanyName();
    loadUserData();
    loadInvoices();
    loadOntDevice();
    loadPaymentGateways();

    // Auto-refresh invoices when user comes back from another page
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadInvoices();
      }
    };

    // Auto-refresh when admin makes changes (payment confirmed, etc.)
    const handleAdminUpdate = () => {
      loadInvoices();
      loadUserData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('customer-data-refresh', handleAdminUpdate);

    // Poll invoices every 30s so new transactions appear automatically
    const interval = setInterval(() => {
      loadInvoices();
    }, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('customer-data-refresh', handleAdminUpdate);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadPaymentGateways = async () => {
    try {
      const res = await fetch('/api/public/payment-gateways');
      const data = await res.json();
      if (data.success) {
        setPaymentGateways(data.gateways || []);
      }
    } catch (error) {
      console.error('Load payment gateways error:', error);
    }
  };

  const handleRegeneratePayment = async (invoiceId: string, invoiceNumber: string) => {
    if (paymentGateways.length === 0) {
      toast('warning', 'Gateway Tidak Tersedia', t('customer.noGatewayAvailable'));
      return;
    }

    // Use first available gateway
    const gateway = paymentGateways[0].provider;
    
    setGeneratingPayment(invoiceId);
    const token = localStorage.getItem('customer_token');

    try {
      const res = await fetch('/api/customer/invoice/regenerate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ invoiceId, gateway })
      });

      const data = await res.json();

      if (data.success && data.paymentUrl) {
        // Refresh invoices to update payment link
        await loadInvoices();
        
        // Open payment URL
        window.open(data.paymentUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast('error', 'Gagal', data.error || t('customer.failedGeneratePaymentLink'));
      }
    } catch (error) {
      console.error('Regenerate payment error:', error);
      toast('error', 'Gagal', t('customer.failedContactServer'));
    } finally {
      setGeneratingPayment(null);
    }
  };

  const loadCompanyName = async () => {
    try {
      const [pubRes, infoRes] = await Promise.all([
        fetch('/api/public/company'),
        fetch('/api/company/info'),
      ]);
      const pubData = await pubRes.json();
      if (pubData.success && pubData.company?.name) setCompanyName(pubData.company.name);
      const infoData = await infoRes.json();
      if (infoData.success && Array.isArray(infoData.data?.bankAccounts)) {
        setAdminBankAccounts(infoData.data.bankAccounts);
      }
    } catch (error) { console.error('Load company info error:', error); }
  };

  const loadUserData = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) { router.push('/customer/login'); return; }

    try {
      const res = await fetch('/api/customer/me', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      if (data.success) {
        setUser(data.user);
        localStorage.setItem('customer_user', JSON.stringify(data.user));
      } else {
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_user');
        router.push('/customer/login');
      }
    } catch (error) {
      const userData = localStorage.getItem('customer_user');
      if (userData) { try { setUser(JSON.parse(userData)); } catch (e) { router.push('/customer/login'); } }
      else router.push('/customer/login');
    } finally { setLoading(false); }
  };

  const loadInvoices = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;
    try {
      const res = await fetch('/api/customer/invoices', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setInvoices(data.data?.invoices || []);
    } catch (error) { console.error('Load invoices error:', error); }
  };

  const handleSubmitManual = async () => {
    if (!manualPayModal) return;
    const token = localStorage.getItem('customer_token');
    if (!token) { router.push('/customer/login'); return; }
    setSubmittingManual(true);
    const finalBankName = selectedAdminBank ? selectedAdminBank.bankName : manualForm.bankName.trim();
    try {
      const body = new FormData();
      body.append('bankName', finalBankName);
      body.append('accountName', manualForm.accountName.trim());
      if (manualForm.notes.trim()) body.append('notes', manualForm.notes.trim());
      if (manualForm.file) body.append('file', manualForm.file);
      const res = await fetch(`/api/customer/invoices/${manualPayModal.id}/manual-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (data.success) {
        toast('success', 'Bukti Transfer Terkirim', 'Admin akan mengkonfirmasi dalam 1×24 jam');
        setManualPayModal(null);
        setManualForm({ bankName: '', accountName: '', notes: '', file: null });
        setSelectedAdminBank(null);
        loadInvoices();
      } else {
        toast('error', 'Gagal', data.error || 'Gagal mengirim bukti transfer');
      }
    } catch {
      toast('error', 'Error', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSubmittingManual(false);
    }
  };

  const loadOntDevice = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;
    try {
      // Load WiFi data for device info and connected devices
      const wifiRes = await fetch('/api/customer/wifi', { headers: { 'Authorization': `Bearer ${token}` } });
      const wifiData = await wifiRes.json();
      if (wifiData.success && wifiData.device) {
        setOntDevice(wifiData.device);
        setConnectedDevices(wifiData.device.connectedHosts || []);
      } else if (wifiData.reason === 'not_configured') {
        // GenieACS not set up — silently skip, no device info available
      }
    } catch (error) { 
      console.error('[Customer Dashboard] Load device error:', error); 
    }
    finally { setLoadingOnt(false); }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const handleUpdateWifi = async () => {
    if (!wifiForm.ssid) { 
      toast('warning', 'Wajib Diisi', t('customer.ssidRequired'));
      return; 
    }
    
    // Validate password if provided
    if (wifiForm.password && (wifiForm.password.length < 8 || wifiForm.password.length > 63)) {
      toast('warning', 'Password Tidak Valid', t('customer.passwordLength'));
      return;
    }

    if (!ontDevice?._id) {
      toast('error', 'Gagal', t('customer.deviceNotFound'));
      return;
    }

    setUpdatingWifi(true);
    const token = localStorage.getItem('customer_token');
    try {
      const res = await fetch('/api/customer/wifi', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: ontDevice._id,
          wlanIndex: editingWifi ?? 1,
          ssid: wifiForm.ssid,
          password: wifiForm.password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', 'WiFi Berhasil Diperbarui', t('customer.wifiUpdateSuccess'));
        setEditingWifi(null);
        setWifiForm({ ssid: '', password: '' });
        setTimeout(() => loadOntDevice(), 3000);
      } else {
        toast('error', 'Gagal', data.error || t('customer.failedUpdateWifi'));
      }
    } catch (error) { 
      toast('error', 'Gagal', t('customer.failedUpdateWifi'));
    } finally { 
      setUpdatingWifi(false); 
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    router.push('/customer/login');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!user) return null;

  const expiredDate = new Date(user.expiredAt);
  const isExpired = expiredDate < nowWIB();
  const daysLeft = Math.ceil((expiredDate.getTime() - nowWIB().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="p-3 lg:p-6 max-w-2xl mx-auto space-y-4">
      {/* ── Hero Status Card ─────────────────────────────────────────── */}
      <div className={`rounded-2xl p-5 relative overflow-hidden ${
        isExpired
          ? 'bg-gradient-to-br from-red-900/60 to-slate-900 border-2 border-red-500/40'
          : user.status === 'active'
          ? 'bg-gradient-to-br from-cyan-900/50 to-slate-900 border-2 border-cyan-500/30'
          : 'bg-gradient-to-br from-yellow-900/50 to-slate-900 border-2 border-yellow-500/30'
      }`}>
        {/* Decorative circles */}
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="relative z-10">
          {/* Top row: name + status badge */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/70">Selamat Datang</p>
              <h1 className="text-lg font-extrabold text-white mt-0.5 leading-tight">{user.name}</h1>
              <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
            </div>
            {isExpired
              ? <span className="px-2.5 py-1 bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full border border-red-500/40">Expired</span>
              : user.status === 'active'
              ? <span className="px-2.5 py-1 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-full border border-green-500/40">Aktif</span>
              : user.status === 'isolated'
              ? <span className="px-2.5 py-1 bg-orange-500/20 text-orange-400 text-[10px] font-bold rounded-full border border-orange-500/40">Terisolir</span>
              : <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-full border border-yellow-500/40">{user.status}</span>
            }
          </div>
          {/* Package + expiry info */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-400/70 mb-0.5">Paket</p>
              <p className="text-sm font-bold text-white leading-tight">{user.profile.name}</p>
              <p className="text-[10px] text-muted-foreground">{user.profile.downloadSpeed}/{user.profile.uploadSpeed} Mbps</p>
            </div>
            <div className={`rounded-xl p-2.5 ${isExpired ? 'bg-red-500/10' : 'bg-white/5'}`}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-cyan-400/70 mb-0.5">Berlaku S/D</p>
              <p className={`text-sm font-bold leading-tight ${isExpired ? 'text-red-400' : 'text-white'}`}>
                {formatWIB(user.expiredAt, 'd MMM yyyy')}
              </p>
              <p className={`text-[10px] font-medium ${isExpired ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-green-400'}`}>
                {isExpired ? 'Sudah expired' : daysLeft <= 0 ? 'Hari ini!' : `${daysLeft} hari lagi`}
              </p>
            </div>
          </div>
          {/* CTA Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/customer/renewal')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded-xl transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Perpanjang
            </button>
            <button
              onClick={() => router.push('/customer/invoices')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/20 active:scale-95"
            >
              <FileText className="w-3.5 h-3.5" />
              Tagihan
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Actions Grid ────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Menu Cepat</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            { name: 'Riwayat',      href: '/customer/history',       icon: Receipt,       color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/30' },
            { name: 'Perpanjang',   href: '/customer/renewal',       icon: RefreshCw,     color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/30' },
            { name: 'WiFi',         href: '/customer/wifi',          icon: Wifi,          color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30' },
            { name: 'Bantuan',      href: '/customer/tickets',       icon: MessageSquare, color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/30' },
            { name: 'Tagihan',      href: '/customer/invoices',      icon: FileText,      color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/30' },
            { name: 'Upgrade',      href: '/customer/upgrade',       icon: Package,       color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30' },
            { name: 'Referral',     href: '/customer/referral',      icon: Gift,          color: 'text-pink-400',    bg: 'bg-pink-500/10 border-pink-500/30' },
            { name: 'Profil',       href: '/customer/profile',       icon: User,          color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-500/30' },
          ] as const).map(({ name, href, icon: Icon, color, bg }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-all active:scale-95 ${bg}`}
            >
              <Icon className={`w-5 h-5 ${color}`} />
              <span className={`text-[9px] font-bold text-center leading-tight ${color}`}>{name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Pending Invoice Alert ─────────────────────────────────────── */}
      {invoices.filter(inv => inv.status === 'PENDING' || inv.status === 'OVERDUE').length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Tagihan Belum Dibayar</p>
          {invoices.filter(inv => inv.status === 'PENDING' || inv.status === 'OVERDUE').slice(0, 3).map(invoice => (
            <div key={invoice.id} className={`rounded-xl border-2 p-3 flex items-center gap-3 ${invoice.status === 'OVERDUE' ? 'bg-red-500/5 border-red-500/30' : 'bg-yellow-500/5 border-yellow-500/30'}`}>
              <div className={`p-2 rounded-lg flex-shrink-0 ${invoice.status === 'OVERDUE' ? 'bg-red-500/20' : 'bg-yellow-500/20'}`}>
                <Receipt className={`w-4 h-4 ${invoice.status === 'OVERDUE' ? 'text-red-400' : 'text-yellow-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white font-mono">{invoice.invoiceNumber}</p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(invoice.amount)} · JT {formatWIB(invoice.dueDate, 'd MMM')}</p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                {invoice.manualPaymentStatus === 'pending' ? (
                  <span className="text-[9px] text-yellow-400 font-medium">Menunggu...</span>
                ) : (
                  <>
                    {invoice.paymentLink && !invoice.paymentLink.includes('localhost') ? (
                      <button onClick={() => window.open(invoice.paymentLink ?? undefined, '_blank', 'noopener,noreferrer')}
                        className="px-2.5 py-1.5 bg-cyan-500 text-black text-[9px] font-bold rounded-lg flex items-center gap-1">
                        Bayar <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    ) : (
                      <button onClick={() => handleRegeneratePayment(invoice.id, invoice.invoiceNumber)}
                        disabled={generatingPayment === invoice.id}
                        className="px-2.5 py-1.5 bg-yellow-500 text-black text-[9px] font-bold rounded-lg flex items-center gap-1 disabled:opacity-50">
                        {generatingPayment === invoice.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                        Buat Link
                      </button>
                    )}
                    <button onClick={() => setManualPayModal({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount })}
                      className="px-2.5 py-1.5 bg-purple-600 text-white text-[9px] font-bold rounded-lg flex items-center gap-1">
                      <Banknote className="w-2.5 h-2.5" /> Bukti
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {invoices.filter(inv => inv.status === 'PENDING' || inv.status === 'OVERDUE').length > 3 && (
            <button onClick={() => router.push('/customer/invoices')} className="w-full text-center text-xs text-cyan-400 py-1 hover:underline">
              Lihat semua tagihan →
            </button>
          )}
        </div>
      )}

      {/* ── ONT/WiFi + All Invoices (desktop 2-col) ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ONT/WiFi Card */}
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-accent/30 shadow-[0_0_30px_rgba(0,247,255,0.15)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-accent/20 rounded-lg border border-accent/30 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-accent" />
              </div>
              <h2 className="text-sm font-bold text-accent uppercase tracking-wider">{t('customer.ontWifi')}</h2>
            </div>
            {ontDevice && (
              <button onClick={() => router.push('/customer/wifi')} className="text-[10px] text-cyan-400 hover:underline">Detail →</button>
            )}
          </div>
          
          {loadingOnt ? <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
          : !ontDevice ? <div className="text-center py-4 text-muted-foreground text-xs"><Wifi className="w-8 h-8 mx-auto mb-1 opacity-30" /><p>{t('customer.ontNotFound')}</p></div>
          : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/20 rounded-lg p-2"><span className="text-muted-foreground block text-[9px] uppercase font-bold">{t('customer.model')}</span><span className="font-medium text-white text-[11px]">{ontDevice.manufacturer} {ontDevice.model}</span></div>
                <div className="bg-muted/20 rounded-lg p-2"><span className="text-muted-foreground block text-[9px] uppercase font-bold">{t('customer.ontStatus')}</span>
                  <span className={`text-[11px] font-bold ${ontDevice.status === 'Online' ? 'text-green-400' : 'text-red-400'}`}>{ontDevice.status}</span>
                </div>
                <div className="bg-muted/20 rounded-lg p-2"><span className="text-muted-foreground block text-[9px] uppercase font-bold">{t('customer.rxPower')}</span><span className="text-[11px] text-red-300">{ontDevice.signalStrength?.rxPower || '-'}</span></div>
                <div className="bg-muted/20 rounded-lg p-2"><span className="text-muted-foreground block text-[9px] uppercase font-bold">{t('customer.connectedDevices')}</span><span className="text-[11px] font-bold text-cyan-300">{Array.isArray(ontDevice.connectedHosts) ? ontDevice.connectedHosts.length : 0}</span></div>
              </div>
              
              {/* WiFi SSIDs */}
              {ontDevice.wlanConfigs && ontDevice.wlanConfigs.length > 0 && (
                <div className="pt-2 border-t border-accent/20 space-y-2">
                  <span className="text-[9px] font-bold text-accent uppercase tracking-wide">{t('customer.wifiSettings')}</span>
                  {ontDevice.wlanConfigs.map((wlan: any) => {
                    const isEditing = editingWifi === wlan.index;
                    const wlanDevices = connectedDevices.filter((d: any) => d.associatedDevice === String(wlan.index));
                    return (
                      <div key={wlan.index} className="rounded-lg border border-accent/20 bg-accent/5 p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Wifi className="w-3 h-3 text-accent" />
                            <span className="text-[10px] font-bold text-white truncate max-w-[130px]">{wlan.ssid || '(belum ada SSID)'}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${wlan.enabled ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{wlan.band || (wlan.index >= 5 ? '5GHz' : '2.4GHz')}</span>
                          </div>
                          {!isEditing && (
                            <button onClick={() => { setEditingWifi(wlan.index); setWifiForm({ ssid: wlan.ssid || '', password: '' }); }} className="text-[10px] text-primary flex items-center gap-0.5 shrink-0">
                              <Edit2 className="w-2.5 h-2.5" />{t('common.edit')}
                            </button>
                          )}
                        </div>
                        {isEditing && (
                          <div className="space-y-1.5 pt-1">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('customer.wifiName')}</label>
                              <input type="text" value={wifiForm.ssid} onChange={(e) => setWifiForm({ ...wifiForm, ssid: e.target.value })} className="w-full px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder={t('customer.wifiNamePlaceholder')} autoComplete="off" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('customer.wifiPassword')}</label>
                              <input type="text" value={wifiForm.password} onChange={(e) => setWifiForm({ ...wifiForm, password: e.target.value })} className="w-full px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder={t('customer.wifiPasswordPlaceholder')} autoComplete="off" />
                              <p className="text-[9px] text-muted-foreground mt-0.5">{t('customer.securityModeNote')}</p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={handleUpdateWifi} disabled={updatingWifi} className="flex-1 px-2 py-1 bg-teal-600 text-white text-[10px] rounded disabled:opacity-50 flex items-center justify-center gap-1">
                                {updatingWifi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}{t('common.save')}
                              </button>
                              <button onClick={() => { setEditingWifi(null); setWifiForm({ ssid: '', password: '' }); }} className="px-2 py-1 border text-[10px] rounded"><X className="w-3 h-3" /></button>
                            </div>
                          </div>
                        )}
                        {wlanDevices.length > 0 && (
                          <div className="pt-1 border-t border-border/50 space-y-1">
                            <p className="text-[9px] text-muted-foreground">{wlanDevices.length} perangkat terhubung</p>
                            {wlanDevices.map((device: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-medium truncate">{device.hostname && device.hostname !== '-' ? device.hostname : device.macAddress}</p>
                                  <p className="text-[9px] text-muted-foreground font-mono truncate">{device.ipAddress && device.ipAddress !== '-' ? device.ipAddress : device.macAddress}</p>
                                </div>
                                {device.signalStrength && device.signalStrength !== '-' && <span className="text-[9px] text-muted-foreground shrink-0">{device.signalStrength}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CyberCard>

        {/* All Invoices Card */}
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-success/30 shadow-[0_0_30px_rgba(0,255,136,0.15)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-success/20 rounded-lg border border-success/30 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-success" />
              </div>
              <h2 className="text-sm font-bold text-success uppercase tracking-wider">{t('customer.invoices')}</h2>
            </div>
            <button onClick={() => router.push('/customer/invoices')} className="text-[10px] text-cyan-400 hover:underline">Semua →</button>
          </div>
          
          {invoices.length === 0 ? <div className="text-center py-4 text-muted-foreground text-xs"><Receipt className="w-8 h-8 mx-auto mb-1 opacity-30" /><p>{t('customer.noInvoices')}</p></div>
          : (
            <div className="space-y-2">
              {invoices.slice(0, 5).map((invoice) => {
                const isPaid = invoice.status === 'PAID';
                const isPending = invoice.status === 'PENDING';
                const isOverdue = invoice.status === 'OVERDUE';
                const isCancelled = invoice.status === 'CANCELLED';
                return (
                  <div key={invoice.id} className="border border-border/30 rounded-xl p-2.5 bg-card/60">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="font-mono text-xs font-semibold text-white truncate">{invoice.invoiceNumber}</p>
                          {isPaid ? <span className="px-1.5 py-0.5 bg-success/20 text-success text-[9px] rounded-full font-bold flex-shrink-0">Lunas</span>
                          : isCancelled ? <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[9px] rounded-full font-bold flex-shrink-0">Batal</span>
                          : isOverdue ? <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] rounded-full font-bold flex-shrink-0">Terlambat</span>
                          : <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[9px] rounded-full font-bold flex-shrink-0">Belum Bayar</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] text-muted-foreground">JT {formatWIB(invoice.dueDate, 'd MMM yyyy')}</p>
                          <p className="text-xs font-bold text-white">{formatCurrency(invoice.amount)}</p>
                        </div>
                      </div>
                      {!isPaid && !isCancelled && invoice.manualPaymentStatus !== 'pending' && (isPending || isOverdue) && (
                        <div className="flex flex-col gap-1 ml-1 flex-shrink-0">
                          {invoice.paymentLink && !invoice.paymentLink.includes('localhost') ? (
                            <button onClick={() => window.open(invoice.paymentLink ?? undefined, '_blank', 'noopener,noreferrer')} className="px-2 py-1 bg-cyan-500 text-black text-[9px] font-bold rounded-lg flex items-center gap-0.5">
                              Bayar <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          ) : (
                            <button onClick={() => handleRegeneratePayment(invoice.id, invoice.invoiceNumber)} disabled={generatingPayment === invoice.id} className="px-2 py-1 bg-yellow-500 text-black text-[9px] font-bold rounded-lg disabled:opacity-50">
                              {generatingPayment === invoice.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          <button onClick={() => setManualPayModal({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount })} className="px-2 py-1 bg-purple-600 text-white text-[9px] font-bold rounded-lg">
                            <Banknote className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                      {!isPaid && !isCancelled && invoice.manualPaymentStatus === 'pending' && (
                        <span className="text-[9px] text-yellow-400 font-medium ml-1">Menunggu...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CyberCard>
      </div>

      {/* Manual Payment Proof Modal */}
      {manualPayModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 pb-20 sm:pb-0 px-4 pt-4">
          <div className="bg-card border border-primary/30 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-[0_0_40px_rgba(188,19,254,0.2)]">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Kirim Bukti Transfer</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{manualPayModal.invoiceNumber} — {formatCurrency(manualPayModal.amount)}</p>
                </div>
                <button onClick={() => setManualPayModal(null)} className="p-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/50">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-3">
                {/* Admin bank account selector */}
                <div>
                  <label className="text-xs font-bold text-white mb-1.5 block">Transfer ke Rekening *</label>
                  {adminBankAccounts.length > 0 ? (
                    <div className="space-y-2">
                      {adminBankAccounts.map((acc, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedAdminBank(acc === selectedAdminBank ? null : acc);
                            setManualForm(f => ({ ...f, bankName: acc === selectedAdminBank ? '' : acc.bankName }));
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                            selectedAdminBank === acc
                              ? 'border-cyan-400 bg-cyan-500/10'
                              : 'border-border/40 bg-muted/10 hover:border-cyan-500/40'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-bold text-white">{acc.bankName}</p>
                            <p className="font-mono text-sm text-cyan-300 tracking-wider mt-0.5">{acc.accountNumber}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">a/n {acc.accountName}</p>
                          </div>
                          {selectedAdminBank === acc && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input type="text" placeholder="Contoh: BCA, BNI, Mandiri..." value={manualForm.bankName} onChange={e => setManualForm(f => ({ ...f, bankName: e.target.value }))} className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-white mb-1.5 block">Nama Pengirim *</label>
                  <input type="text" placeholder="Nama sesuai rekening" value={manualForm.accountName} onChange={e => setManualForm(f => ({ ...f, accountName: e.target.value }))} className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary/60" />
                </div>
                <div>
                  <label className="text-xs font-bold text-white mb-1.5 block">Catatan <span className="text-muted-foreground font-normal">(opsional)</span></label>
                  <textarea placeholder="Catatan tambahan..." value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-muted/20 border border-border/50 rounded-lg text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-primary/60 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-white mb-1.5 block">Bukti Transfer *</label>
                  <input type="file" accept="image/*" onChange={e => setManualForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer" />
                  {manualForm.file && <p className="text-[10px] text-success mt-1">✓ {manualForm.file.name}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setManualPayModal(null); setManualForm({ bankName: '', accountName: '', notes: '', file: null }); setSelectedAdminBank(null); }} className="flex-1 py-2.5 bg-muted/20 hover:bg-muted/30 border border-border/50 rounded-lg text-xs font-bold text-muted-foreground transition-colors">
                  Batal
                </button>
                <button onClick={handleSubmitManual} disabled={submittingManual || !(selectedAdminBank || manualForm.bankName.trim()) || !manualForm.accountName.trim() || !manualForm.file} className="flex-1 py-2.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 rounded-lg text-xs font-bold text-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {submittingManual ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengirim...</> : <><Upload className="w-3.5 h-3.5" />Kirim Bukti</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
