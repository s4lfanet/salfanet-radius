'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Wifi, Receipt, Loader2, ExternalLink, Edit2, X, Check, Package, Zap, FileText, MessageSquare, Gift, PauseCircle, Banknote } from 'lucide-react';
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
  const [editingWifi, setEditingWifi] = useState(false);
  const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' });
  const [updatingWifi, setUpdatingWifi] = useState(false);
  const [companyName, setCompanyName] = useState('SALFANET RADIUS');
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const [generatingPayment, setGeneratingPayment] = useState<string | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);
  const [manualPayModal, setManualPayModal] = useState<{id: string; invoiceNumber: string; amount: number} | null>(null);
  const [manualForm, setManualForm] = useState({ bankName: '', accountName: '', notes: '', file: null as File | null });
  const [submittingManual, setSubmittingManual] = useState(false);

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
      const res = await fetch('/api/public/company');
      const data = await res.json();
      if (data.success && data.company.name) setCompanyName(data.company.name);
    } catch (error) { console.error('Load company name error:', error); }
  };

  const loadUserData = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) { router.push('/login'); return; }

    try {
      const res = await fetch('/api/customer/me', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      if (data.success) {
        setUser(data.user);
        localStorage.setItem('customer_user', JSON.stringify(data.user));
      } else {
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_user');
        router.push('/login');
      }
    } catch (error) {
      const userData = localStorage.getItem('customer_user');
      if (userData) { try { setUser(JSON.parse(userData)); } catch (e) { router.push('/login'); } }
      else router.push('/login');
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
    if (!token) { router.push('/login'); return; }
    setSubmittingManual(true);
    try {
      const body = new FormData();
      body.append('bankName', manualForm.bankName.trim());
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
          wlanIndex: 1,
          ssid: wifiForm.ssid,
          password: wifiForm.password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', 'WiFi Berhasil Diperbarui', t('customer.wifiUpdateSuccess'));
        setEditingWifi(false);
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
    router.push('/login');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!user) return null;

  const expiredDate = new Date(user.expiredAt);
  const isExpired = expiredDate < nowWIB();
  const daysLeft = Math.ceil((expiredDate.getTime() - nowWIB().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="p-3 lg:p-6">
      {/* Profile Card — full width */}
      <div>
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-[0_0_30px_rgba(188,19,254,0.15)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-primary/20 rounded-lg border border-primary/30 shadow-[0_0_10px_rgba(188,19,254,0.3)]">
              <User className="w-4 h-4 text-primary drop-shadow-[0_0_5px_rgba(188,19,254,0.8)]" />
            </div>
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">{t('customer.accountInfo')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('common.name')}</span><span className="font-medium text-white">{user.name}</span></div>
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('common.phone')}</span><span className="font-medium text-white">{user.phone}</span></div>
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('auth.username')}</span><span className="font-mono text-[10px] text-white">{user.username}</span></div>
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.package')}</span><span className="font-medium text-white">{user.profile.name}</span></div>
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.speed')}</span><span className="font-medium text-white">{user.profile.downloadSpeed}/{user.profile.uploadSpeed} Mbps</span></div>
            <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('common.status')}</span>
              {isExpired ? <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-[10px] font-bold rounded border border-destructive/40 shadow-[0_0_5px_rgba(255,51,102,0.3)]">{t('customer.expired')}</span>
              : user.status === 'active' ? <span className="px-2 py-0.5 bg-success/20 text-success text-[10px] font-bold rounded border border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]">{t('customer.active')}</span>
              : <span className="px-2 py-0.5 bg-muted text-white text-[10px] font-bold rounded">{user.status}</span>}
            </div>
            <div className="col-span-2"><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.expiredDate')}</span>
              <span className="font-medium text-white">{formatWIB(user.expiredAt, 'd MMMM yyyy')}
                {!isExpired && <span className="text-muted-foreground ml-1">({daysLeft} {t('customer.daysLeft')})</span>}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-primary/20">
            <CyberButton
              onClick={() => router.push('/customer/upgrade')}
              className="w-full"
              size="sm"
              variant="purple"
            >
              <Package className="w-3.5 h-3.5" />
              {t('customer.changePackage')}
            </CyberButton>
          </div>
        </CyberCard>

      </div>

      {/* Bottom row: ONT/WiFi + Invoices */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ONT/WiFi Card */}
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-accent/30 shadow-[0_0_30px_rgba(0,247,255,0.15)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-accent/20 rounded-lg border border-accent/30 shadow-[0_0_10px_rgba(0,247,255,0.3)]">
              <Wifi className="w-4 h-4 text-accent drop-shadow-[0_0_5px_rgba(0,247,255,0.8)]" />
            </div>
            <h2 className="text-sm font-bold text-accent uppercase tracking-wider drop-shadow-[0_0_5px_rgba(0,247,255,0.5)]">{t('customer.ontWifi')}</h2>
          </div>
          
          {loadingOnt ? <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
          : !ontDevice ? <div className="text-center py-4 text-muted-foreground text-xs"><Wifi className="w-8 h-8 mx-auto mb-1 opacity-30" /><p>{t('customer.ontNotFound')}</p></div>
          : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.model')}</span><span className="font-medium text-white">{ontDevice.manufacturer} {ontDevice.model}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.serialNumber')}</span><span className="font-mono text-[10px] text-white">{ontDevice.serialNumber || '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.ontStatus')}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${ontDevice.status === 'Online' ? 'bg-success/20 text-success border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]' : 'bg-destructive/20 text-destructive border-destructive/40 shadow-[0_0_5px_rgba(255,51,102,0.3)]'}`}>{ontDevice.status}</span>
                </div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">PPPoE</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${ontDevice.pppUsername && ontDevice.pppUsername !== '-' ? 'bg-success/20 text-success border-success/40' : 'bg-muted text-muted-foreground'}`}>
                    {ontDevice.pppUsername && ontDevice.pppUsername !== '-' ? t('customer.connected') : t('customer.disconnected')}
                  </span>
                </div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.ipPppoe')}</span><span className="font-mono text-[10px] text-white">{ontDevice.ipAddress && ontDevice.ipAddress !== '-' ? ontDevice.ipAddress : '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.softwareVer')}</span><span className="font-mono text-[10px] text-white">{ontDevice.softwareVersion || '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.rxPower')}</span><span className="font-medium text-destructive">{ontDevice.signalStrength?.rxPower && ontDevice.signalStrength.rxPower !== '-' ? ontDevice.signalStrength.rxPower : '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.temperature')}</span><span className="font-medium text-white">{ontDevice.signalStrength?.temperature && ontDevice.signalStrength.temperature !== '-' ? ontDevice.signalStrength.temperature : '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.uptime')}</span><span className="font-medium text-[10px] text-white">{ontDevice.uptime && ontDevice.uptime !== '-' ? ontDevice.uptime : '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.deviceId')}</span><span className="font-mono text-[9px] break-all text-white">{ontDevice._id ? ontDevice._id.substring(0, 12) + '...' : '-'}</span></div>
                <div><span className="text-accent block text-[10px] font-bold uppercase tracking-wide">{t('customer.connectedDevices')}</span><span className="font-medium text-[10px] text-white">{Array.isArray(ontDevice.connectedHosts) ? ontDevice.connectedHosts.length : 0} device</span></div>
              </div>
              
              <div className="pt-3 border-t border-accent/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-accent uppercase tracking-wide">{t('customer.wifiSettings')}</span>
                  <span className="text-[10px] text-muted-foreground">{connectedDevices.length || 0} {t('customer.deviceConnected')}</span>
                </div>
                
                {editingWifi ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">{t('customer.wifiName')}</label>
                      <input 
                        type="text" 
                        value={wifiForm.ssid} 
                        onChange={(e) => setWifiForm({ ...wifiForm, ssid: e.target.value })} 
                        className="w-full px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        placeholder={t('customer.wifiNamePlaceholder')}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">{t('customer.wifiPassword')}</label>
                      <input 
                        type="text" 
                        value={wifiForm.password} 
                        onChange={(e) => setWifiForm({ ...wifiForm, password: e.target.value })} 
                        className="w-full px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        placeholder={t('customer.wifiPasswordPlaceholder')}
                        autoComplete="off"
                      />
                      <p className="text-[9px] text-muted-foreground mt-0.5">{t('customer.securityModeNote')}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={handleUpdateWifi} disabled={updatingWifi} className="flex-1 px-2 py-1 bg-teal-600 text-white text-[10px] rounded disabled:opacity-50 flex items-center justify-center gap-1">
                        {updatingWifi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}{t('common.save')}
                      </button>
                      <button onClick={() => { setEditingWifi(false); setWifiForm({ ssid: '', password: '' }); }} className="px-2 py-1 border text-[10px] rounded"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="grid grid-cols-2 gap-2 text-xs flex-1">
                        <div><span className="text-muted-foreground block text-[10px]">{t('customer.ssid')}</span><span className="font-medium">{ontDevice.wlanConfigs?.[0]?.ssid || 'N/A'}</span></div>
                        <div><span className="text-muted-foreground block text-[10px]">{t('common.status')}</span><span className={ontDevice.status === 'Online' ? 'text-success' : 'text-destructive'}>{ontDevice.status || 'N/A'}</span></div>
                      </div>
                      <button onClick={() => { setEditingWifi(true); setWifiForm({ ssid: ontDevice.wlanConfigs?.[0]?.ssid || '', password: '' }); }} className="text-[10px] text-primary flex items-center gap-0.5 ml-2"><Edit2 className="w-2.5 h-2.5" />{t('common.edit')}</button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Connected Devices Section */}
              {connectedDevices.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-foreground flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      {t('customer.connectedDevicesTitle')} ({connectedDevices.length})
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {connectedDevices.slice(0, 5).map((device, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${device.active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          <div>
                            <p className="text-[10px] font-medium">{device.hostname && device.hostname !== '-' ? device.hostname : t('customer.unknownDevice')}</p>
                            <p className="text-[9px] text-muted-foreground font-mono">{device.ipAddress && device.ipAddress !== '-' ? device.ipAddress : device.macAddress}</p>
                          </div>
                        </div>
                        <span className={`text-[9px] px-1 py-0.5 rounded ${device.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500'}`}>
                          {device.active ? t('customer.online') : t('customer.offline')}
                        </span>
                      </div>
                    ))}
                    {connectedDevices.length > 5 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{connectedDevices.length - 5} perangkat lainnya</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CyberCard>

        {/* Invoices Card */}
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-success/30 shadow-[0_0_30px_rgba(0,255,136,0.15)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-success/20 rounded-lg border border-success/30 shadow-[0_0_10px_rgba(0,255,136,0.3)]">
              <Receipt className="w-4 h-4 text-success drop-shadow-[0_0_5px_rgba(0,255,136,0.8)]" />
            </div>
            <h2 className="text-sm font-bold text-success uppercase tracking-wider drop-shadow-[0_0_5px_rgba(0,255,136,0.5)]">{t('customer.invoices')}</h2>
          </div>
          
          {invoices.length === 0 ? <div className="text-center py-4 text-muted-foreground text-xs"><Receipt className="w-8 h-8 mx-auto mb-1 opacity-30" /><p>{t('customer.noInvoices')}</p></div>
          : (
            <div className="space-y-2">
              {invoices.map((invoice) => {
                const dueDate = new Date(invoice.dueDate);
                const isPaid = invoice.status === 'PAID';
                const isPending = invoice.status === 'PENDING';
                const isOverdue = invoice.status === 'OVERDUE';
                const isCancelled = invoice.status === 'CANCELLED';
                
                return (
                  <div key={invoice.id} className="border border-primary/30 rounded-lg p-2.5 bg-card/60 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-mono text-xs font-semibold text-white">{invoice.invoiceNumber}</p>
                          {isPaid ? <span className="px-1.5 py-0.5 bg-success/20 text-success text-[10px] rounded border border-success/40 font-bold">{t('customer.paid')}</span>
                          : isCancelled ? <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded border border-muted/40 font-bold">{t('customer.cancelled')}</span>
                          : isOverdue ? <span className="px-1.5 py-0.5 bg-destructive/20 text-destructive text-[10px] rounded border border-destructive/40 font-bold">{t('customer.overdue')}</span>
                          : <span className="px-1.5 py-0.5 bg-warning/20 text-warning text-[10px] rounded border border-warning/40 font-bold">{t('customer.unpaid')}</span>}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-accent">{t('customer.dueDate')}: {formatWIB(invoice.dueDate, 'd MMM yyyy')}</p>
                          <p className="text-xs font-bold text-white">{formatCurrency(invoice.amount)}</p>
                        </div>
                      </div>
                      {!isPaid && !isCancelled && (isPending || isOverdue) && (
                        <div className="flex flex-col gap-1">
                          {invoice.manualPaymentStatus !== 'pending' && (
                            <>
                              {invoice.paymentLink && invoice.paymentLink.trim() !== '' && !invoice.paymentLink.includes('localhost') ? (
                                <button
                                  onClick={() => window.open(invoice.paymentLink ?? undefined, '_blank', 'noopener,noreferrer')}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-accent hover:bg-accent/90 text-black text-[10px] font-bold rounded whitespace-nowrap transition shadow-[0_0_10px_rgba(0,247,255,0.3)]"
                                >
                                  {t('customer.payNow')} <ExternalLink className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRegeneratePayment(invoice.id, invoice.invoiceNumber)}
                                  disabled={generatingPayment === invoice.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-[10px] font-bold rounded whitespace-nowrap transition disabled:opacity-50"
                                >
                                  {generatingPayment === invoice.id ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> {t('customer.processing')}</>
                                  ) : (
                                    <><Zap className="w-3 h-3" /> {t('customer.generateLink')}</>
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() => setManualPayModal({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: invoice.amount })}
                                className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded whitespace-nowrap transition"
                              >
                                <Banknote className="w-3 h-3" /> Kirim Bukti
                              </button>
                            </>
                          )}
                          {invoice.manualPaymentStatus === 'pending' && (
                            <span className="text-[10px] text-yellow-400 font-medium text-right">Menunggu konfirmasi…</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CyberCard>
      </div>

      {/* Quick Actions */}
      <div className="mt-3">
        <CyberCard className="p-3 bg-card/80 backdrop-blur-xl border-2 border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
              <Zap className="w-3.5 h-3.5 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
            </div>
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">Menu Cepat</h2>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { name: 'Semua Tagihan',  href: '/customer/invoices',      icon: FileText,      bg: 'bg-success/10',   border: 'border-success/30',   text: 'text-success' },
              { name: 'Ganti Paket',   href: '/customer/upgrade',       icon: Package,       bg: 'bg-primary/10',   border: 'border-primary/30',   text: 'text-primary' },
              { name: 'Riwayat Bayar', href: '/customer/history',       icon: Receipt,       bg: 'bg-accent/10',    border: 'border-accent/30',    text: 'text-accent' },
              { name: 'WiFi',          href: '/customer/wifi',          icon: Wifi,          bg: 'bg-blue-500/10',  border: 'border-blue-500/30',  text: 'text-blue-400' },
              { name: 'Tiket Support', href: '/customer/tickets',       icon: MessageSquare, bg: 'bg-yellow-500/10',border: 'border-yellow-500/30',text: 'text-yellow-400' },
              { name: 'Referral',      href: '/customer/referral',      icon: Gift,          bg: 'bg-pink-500/10',  border: 'border-pink-500/30',  text: 'text-pink-400' },
              { name: 'Profil Akun',   href: '/customer/profile',       icon: User,          bg: 'bg-muted/50',     border: 'border-muted',        text: 'text-muted-foreground' },
            ] as const).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.href}
                  onClick={() => router.push(action.href)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 ${action.bg} ${action.border}`}
                >
                  <Icon className={`w-4 h-4 ${action.text}`} />
                  <span className={`text-[9px] font-bold text-center leading-tight ${action.text}`}>{action.name}</span>
                </button>
              );
            })}
          </div>
        </CyberCard>
      </div>

      {/* Manual Payment Proof Modal */}
      {manualPayModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-slate-700/50">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Banknote className="w-5 h-5 text-purple-400" />
                Kirim Bukti Transfer
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {manualPayModal.invoiceNumber} · Rp {manualPayModal.amount.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Nama Bank <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="cth: BCA, Mandiri, BRI…"
                  value={manualForm.bankName}
                  onChange={e => setManualForm(f => ({ ...f, bankName: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Nama Pengirim <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="Nama sesuai rekening pengirim"
                  value={manualForm.accountName}
                  onChange={e => setManualForm(f => ({ ...f, accountName: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Bukti Transfer (Opsional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setManualForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-purple-500/20 file:text-purple-300 file:text-xs file:font-medium hover:file:bg-purple-500/30 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Catatan (Opsional)</label>
                <textarea
                  placeholder="Informasi tambahan…"
                  value={manualForm.notes}
                  onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 resize-none"
                />
              </div>
            </div>
            <div className="p-5 flex gap-3 border-t border-slate-700/50">
              <button
                onClick={() => { setManualPayModal(null); setManualForm({ bankName: '', accountName: '', notes: '', file: null }); }}
                disabled={submittingManual}
                className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmitManual}
                disabled={submittingManual || !manualForm.bankName.trim() || !manualForm.accountName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Banknote className="w-4 h-4" />Kirim</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
