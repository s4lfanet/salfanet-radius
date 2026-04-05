'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff, MapPin, Map } from 'lucide-react';
import { formatWIB, formatLocalDate } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showWarning } from '@/lib/sweetalert';

interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  profile: { id: string; name: string };
  router?: { id: string; name: string } | null;
  area?: { id: string; name: string } | null;
  ipAddress: string | null;
  expiredAt: string | null;
  latitude: number | null;
  longitude: number | null;
  subscriptionType?: 'PREPAID' | 'POSTPAID';
  billingDay?: number | null;
  balance?: number;
  autoRenewal?: boolean;
  autoIsolationEnabled?: boolean;
  macAddress?: string | null;
  comment?: string | null;
  idCardNumber?: string | null;
  idCardPhoto?: string | null;
  installationPhotos?: string[] | null;
}

interface Session {
  id: string;
  sessionId: string;
  startTime: Date;
  stopTime: Date | null;
  durationFormatted: string;
  download: string;
  upload: string;
  total: string;
  nasIp: string;
  terminateCause: string;
  macAddress?: string;
  isOnline: boolean;
}

interface AuthLog {
  id: number;
  username: string;
  reply: string;
  authdate: Date;
  success: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  createdAt: Date;
}

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (data: any) => Promise<void>;
  profiles: any[];
  routers: any[];
  areas?: any[];
  currentLatLng?: { lat: string; lng: string };
  onLatLngChange?: (lat: string, lng: string) => void;
}

export default function UserDetailModal({
  isOpen,
  onClose,
  user,
  onSave,
  profiles,
  areas = [],
  routers,
  currentLatLng,
  onLatLngChange,
}: UserDetailModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('info');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    profileId: '',
    areaId: '',
    routerId: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    ipAddress: '',
    expiredAt: '',
    billingDay: 1,
    latitude: '',
    longitude: '',
    subscriptionType: 'PREPAID' as 'PREPAID' | 'POSTPAID',
    macAddress: '',
    comment: '',
    idCardNumber: '',
    idCardPhoto: '',
    installationPhotos: [] as string[],
    autoIsolationEnabled: true,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        password: '',
        areaId: user.area?.id || '',
        profileId: user.profile.id,
        routerId: user.router?.id || '',
        name: user.name,
        phone: user.phone,
        email: user.email || '',
        address: user.address || '',
        ipAddress: user.ipAddress || '',
        expiredAt: user.expiredAt ? user.expiredAt.split('T')[0] : '',
        billingDay: user.billingDay ?? (user.expiredAt && (user.subscriptionType ?? 'POSTPAID') === 'POSTPAID' ? new Date(user.expiredAt).getDate() : 1),
        latitude: user.latitude?.toString() || '',
        longitude: user.longitude?.toString() || '',
        subscriptionType: user.subscriptionType ?? 'POSTPAID',
        macAddress: user.macAddress || '',
        comment: user.comment || '',
        idCardNumber: user.idCardNumber || '',
        idCardPhoto: user.idCardPhoto || '',
        installationPhotos: user.installationPhotos || [],
        autoIsolationEnabled: user.autoIsolationEnabled !== false,
      });
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab !== 'info') {
      loadTabData(activeTab);
    }
  }, [user, activeTab]);

  // Sync lat/lng from parent (for map picker)
  useEffect(() => {
    if (currentLatLng) {
      setFormData(prev => ({
        ...prev,
        latitude: currentLatLng.lat,
        longitude: currentLatLng.lng,
      }));
    }
  }, [currentLatLng]);

  const loadTabData = async (tab: string) => {
    if (!user) return;
    setLoading(true);
    try {
      {
        const res = await fetch(`/api/pppoe/users/${user.id}/activity?type=${tab === 'sessions' ? 'sessions' : tab === 'auth' ? 'auth' : 'invoices'}`);
        const data = await res.json();

        if (data.success) {
          if (tab === 'sessions') {
            setSessions(data.data);
          } else if (tab === 'auth') {
            setAuthLogs(data.data);
          } else if (tab === 'invoices') {
            setInvoices(data.data);
          }
        }
      }
    } catch (error) {
      console.error('Load tab data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ ...formData, id: user?.id });
    onClose();
  };

  const handleUploadIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIdCard(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'idCard');
      const res = await fetch('/api/upload/pppoe-customer', { method: 'POST', body: fd });
      const result = await res.json();
      if (result.success) { setFormData(prev => ({ ...prev, idCardPhoto: result.url })); }
      else { await showError(result.error || 'Upload KTP gagal'); }
    } catch { await showError('Upload KTP gagal'); }
    finally { setUploadingIdCard(false); }
  };

  const handleUploadInstallation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const res = await fetch('/api/upload/pppoe-customer', { method: 'POST', body: fd });
      const result = await res.json();
      if (result.success) { setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, result.url] })); }
      else { await showError(result.error || 'Upload foto instalasi gagal'); }
    } catch { await showError('Upload foto instalasi gagal'); }
    finally { setUploadingInstallation(false); }
  };

  // Theme-aware class constants
  const inputCls = "w-full px-3 py-2 border border-border dark:border-[#bc13fe]/40 bg-background dark:bg-[#0a0520]/50 text-foreground dark:text-[#e0d0ff] rounded-lg focus:border-primary dark:focus:border-[#00f7ff] focus:ring-1 focus:ring-primary dark:focus:ring-[#00f7ff] focus:outline-none transition-all placeholder:text-muted-foreground dark:placeholder:text-[#e0d0ff]/30";
  const selectCls = inputCls;
  const textareaCls = inputCls;
  const labelCls = "block text-sm font-medium mb-1 text-foreground dark:text-[#e0d0ff]";
  const labelCls2 = "block text-sm font-medium mb-2 text-foreground dark:text-[#e0d0ff]";

  if (!isOpen || !user) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm modal-overlay p-4 animate-in fade-in-0 duration-200" style={{ zIndex: 9999 }}>
      <div className="bg-card dark:bg-gradient-to-br dark:from-[#0a0520] dark:to-[#1a0f35] rounded-xl shadow-xl dark:shadow-[0_0_40px_rgba(188,19,254,0.3)] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-border dark:border-[#bc13fe]/50 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border dark:border-[#bc13fe]/30 bg-slate-100 dark:bg-[#1a0f35]">
          <div>
            <h2 className="text-2xl font-bold modal-title-override">
              User Details
            </h2>
            <p className="text-sm text-gray-600 dark:text-[#e0d0ff]/70 mt-1">
              {user.username}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground dark:text-[#e0d0ff] dark:hover:text-[#00f7ff] dark:hover:bg-[#bc13fe]/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-border dark:border-[#bc13fe]/30">
          <div className="flex px-6">
            {[
              { id: 'info', label: t('userModal.userInfo') },
              { id: 'sessions', label: t('userModal.sessions') },
              { id: 'auth', label: t('userModal.authLogs') },
              { id: 'invoices', label: t('userModal.invoices') },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id
                  ? 'border-primary text-primary dark:border-[#00f7ff] dark:text-[#00f7ff] bg-primary/10 dark:bg-[#00f7ff]/10 dark:shadow-[0_2px_10px_rgba(0,247,255,0.3)]'
                  : 'border-transparent text-muted-foreground dark:text-[#e0d0ff]/60 hover:text-foreground dark:hover:text-[#e0d0ff] hover:bg-muted dark:hover:bg-[#bc13fe]/10'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('userModal.username')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.password')}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className={`${inputCls} pr-10`}
                      placeholder={t('userModal.passwordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.name')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.phone')}</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.email')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.profile')}</label>
                  <select
                    value={formData.profileId}
                    onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
                    className={selectCls}
                    required
                  >
                    <option value="">{t('userModal.selectProfile')}</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.router')}</label>
                  <select
                    value={formData.routerId}
                    onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}
                    className={selectCls}
                  >
                    <option value="">{t('userModal.autoAssign')}</option>
                    {routers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Area</label>
                  <select
                    value={formData.areaId}
                    onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                    className={selectCls}
                  >
                    <option value="">Pilih Area</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('userModal.ipAddress')}</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    className={inputCls}
                    placeholder={t('userModal.ipPlaceholder')}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>{t('userModal.address')}</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className={textareaCls}
                    rows={2}
                  />
                </div>

                {/* GPS Location */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-foreground dark:text-[#e0d0ff]">{t('userModal.gpsLocation')}</label>
                    <div className="flex gap-2">
                      {onLatLngChange && (
                        <button
                          type="button"
                          onClick={() => {
                            // Notify parent to open map picker with current values
                            onLatLngChange(formData.latitude, formData.longitude);
                          }}
                          className="inline-flex items-center px-3 py-1 text-xs bg-primary/10 text-primary dark:bg-[#00f7ff]/20 dark:text-[#00f7ff] border border-primary/50 dark:border-[#00f7ff]/50 rounded hover:bg-primary/20 dark:hover:bg-[#00f7ff]/30 transition"
                        >
                          <Map className="h-3 w-3 mr-1" />
                          Pilih di Peta
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          // Geolocation API requires HTTPS (except localhost)
                          const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

                          if (!isSecure) {
                            await showWarning('GPS Auto memerlukan koneksi HTTPS.\n\nUntuk menggunakan fitur ini:\n1. Akses aplikasi melalui HTTPS, atau\n2. Gunakan "Pilih di Peta" untuk memilih lokasi manual');
                            return;
                          }

                          if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                              (position) => {
                                setFormData({
                                  ...formData,
                                  latitude: position.coords.latitude.toFixed(6),
                                  longitude: position.coords.longitude.toFixed(6),
                                });
                              },
                              async (error) => {
                                let errorMessage = 'Gagal mendapatkan lokasi: ';
                                switch (error.code) {
                                  case error.PERMISSION_DENIED:
                                    errorMessage += 'Akses lokasi ditolak. Silakan izinkan akses lokasi di browser Anda.';
                                    break;
                                  case error.POSITION_UNAVAILABLE:
                                    errorMessage += 'Informasi lokasi tidak tersedia.';
                                    break;
                                  case error.TIMEOUT:
                                    errorMessage += 'Waktu permintaan lokasi habis.';
                                    break;
                                  default:
                                    errorMessage += error.message;
                                }
                                await showError(errorMessage);
                              }
                            );
                          } else {
                            await showError('Geolocation tidak didukung oleh browser ini.');
                          }
                        }}
                        className="inline-flex items-center px-3 py-1 text-xs bg-green-100 text-green-600 dark:bg-[#00ff88]/20 dark:text-[#00ff88] border border-green-300 dark:border-[#00ff88]/50 rounded hover:bg-green-200 dark:hover:bg-[#00ff88]/30 transition"
                      >
                        <MapPin className="h-3 w-3 mr-1" />
                        GPS Auto
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="Latitude"
                      className={`${inputCls} text-sm`}
                    />
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="Longitude"
                      className={`${inputCls} text-sm`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50 mt-1">
                    {t('userModal.gpsNote')}
                  </p>
                </div>

                {/* Subscription Type */}
                <div className="col-span-2">
                  <label className={labelCls2}>{t('userModal.subscriptionType')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'POSTPAID' ? 'border-primary dark:border-[#00f7ff] bg-primary/10 dark:bg-[#00f7ff]/10 shadow-md dark:shadow-[0_0_10px_rgba(0,247,255,0.3)]' : 'border-border dark:border-[#bc13fe]/30 hover:border-primary/50 dark:hover:border-[#00f7ff]/50'}`}>
                      <input
                        type="radio"
                        name="subscriptionType"
                        value="POSTPAID"
                        checked={formData.subscriptionType === 'POSTPAID'}
                        onChange={(e) => setFormData({ ...formData, subscriptionType: e.target.value as 'POSTPAID' })}
                        className="w-4 h-4 accent-primary dark:accent-[#00f7ff] border-border dark:border-[#bc13fe]/50 focus:ring-primary dark:focus:ring-[#00f7ff]"
                      />
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium text-foreground dark:text-[#e0d0ff]">📅 {t('userModal.postpaid')}</div>
                        <div className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50">Tagihan bulanan, tanggal tetap</div>
                      </div>
                    </label>
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'PREPAID' ? 'border-primary dark:border-[#bc13fe] bg-primary/10 dark:bg-[#bc13fe]/10 shadow-md dark:shadow-[0_0_10px_rgba(188,19,254,0.3)]' : 'border-border dark:border-[#bc13fe]/30 hover:border-primary/50 dark:hover:border-[#bc13fe]/50'}`}>
                      <input
                        type="radio"
                        name="subscriptionType"
                        value="PREPAID"
                        checked={formData.subscriptionType === 'PREPAID'}
                        onChange={(e) => setFormData({ ...formData, subscriptionType: e.target.value as 'PREPAID' })}
                        className="w-4 h-4 accent-primary dark:accent-[#bc13fe] border-border dark:border-[#bc13fe]/50 focus:ring-primary dark:focus:ring-[#bc13fe]"
                      />
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium text-foreground dark:text-[#e0d0ff]">⏰ {t('userModal.prepaid')}</div>
                        <div className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50">Bayar dimuka, validitas terbatas</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Billing Day - POSTPAID Only */}
                {formData.subscriptionType === 'POSTPAID' && (
                  <div>
                    <label className={labelCls}>
                      📅 Tanggal Tagihan
                    </label>
                    <select
                      value={formData.billingDay}
                      onChange={(e) => {
                        const bd = Math.min(Math.max(parseInt(e.target.value), 1), 28);
                        const now = new Date();
                        const next = new Date(now);
                        next.setMonth(next.getMonth() + 1);
                        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
                        next.setDate(Math.min(bd, lastDay));
                        const yyyy = next.getFullYear();
                        const mm = String(next.getMonth() + 1).padStart(2, '0');
                        const dd = String(next.getDate()).padStart(2, '0');
                        setFormData({ ...formData, billingDay: bd, expiredAt: `${yyyy}-${mm}-${dd}` });
                      }}
                      className={selectCls}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day} className="bg-background dark:bg-[#0a0520]">
                          Tanggal {day}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50 mt-1">
                      Tanggal jatuh tempo bulanan. Ubah tanggal → otomatis update expired ke bulan depan.
                    </p>
                  </div>
                )}

                {/* Expired At - Shows for both PREPAID and POSTPAID */}
                <div className={formData.subscriptionType === 'POSTPAID' ? '' : 'col-span-2'}>
                  <label className={labelCls}>
                    {formData.subscriptionType === 'POSTPAID' ? '⏰ Expired Saat Ini' : t('userModal.expiredAt')}
                  </label>
                  <input
                    type="date"
                    value={formData.expiredAt}
                    onChange={(e) => setFormData({ ...formData, expiredAt: e.target.value })}
                    className={inputCls}
                  />
                  <p className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50 mt-1">
                    {formData.subscriptionType === 'POSTPAID' 
                      ? '📌 Untuk testing: expiredAt = tanggal tagihan bulan depan (auto calculated)' 
                      : 'Tanggal kadaluarsa paket. Kosongkan untuk auto dari profile.'}
                  </p>
                </div>

                {/* MAC Address & Comment */}
                <div>
                  <label className={labelCls}>MAC Address</label>
                  <input
                    type="text"
                    value={formData.macAddress}
                    onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Komentar / Catatan</label>
                  <input
                    type="text"
                    value={formData.comment}
                    onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                    placeholder="Catatan tambahan..."
                    className={inputCls}
                  />
                </div>

                {/* Aksi Jatuh Tempo */}
                <div className="col-span-2">
                  <label className={labelCls}>⚡ Aksi Jatuh Tempo</label>
                  <select
                    value={formData.autoIsolationEnabled ? 'isolate' : 'keep'}
                    onChange={(e) => setFormData({ ...formData, autoIsolationEnabled: e.target.value === 'isolate' })}
                    className={selectCls}
                  >
                    <option value="isolate">ISOLIR INTERNET (Suspend) — isolir otomatis saat expired</option>
                    <option value="keep">TETAP TERHUBUNG (No Action) — tidak isolir meski expired</option>
                  </select>
                  <p className="text-xs text-muted-foreground dark:text-[#e0d0ff]/50 mt-1">
                    Pilih tindakan otomatis saat tanggal tagihan / expired terlewati.
                  </p>
                </div>
              </div>

              {/* Dokumen KTP */}
              <div className="border border-border dark:border-[#bc13fe]/30 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground dark:text-[#e0d0ff]">🪪 Dokumen Identitas (KTP)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>No. NIK KTP</label>
                    <input
                      type="text"
                      value={formData.idCardNumber}
                      onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value })}
                      placeholder="3201234567890123"
                      maxLength={16}
                      className={`${inputCls} text-sm`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Upload Foto KTP</label>
                    <div className="flex gap-2 items-center">
                      <input type="file" accept="image/*" onChange={handleUploadIdCard} disabled={uploadingIdCard} className="hidden" id="idCardUploadEdit" />
                      <label htmlFor="idCardUploadEdit" className={`flex-1 px-3 py-1.5 text-xs text-center border border-border dark:border-[#bc13fe]/40 rounded cursor-pointer hover:bg-muted dark:hover:bg-[#bc13fe]/10 text-muted-foreground dark:text-[#e0d0ff]/70 ${uploadingIdCard ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {uploadingIdCard ? '⏳ Mengupload...' : '📎 Upload Foto KTP'}
                      </label>
                    </div>
                  </div>
                </div>
                {formData.idCardPhoto && (
                  <div className="relative">
                    <img src={formData.idCardPhoto} alt="KTP" className="w-full h-28 object-cover rounded border border-border dark:border-[#bc13fe]/30" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <button type="button" onClick={() => setFormData({ ...formData, idCardPhoto: '' })} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">×</button>
                  </div>
                )}
              </div>

              {/* Foto Instalasi */}
              <div className="border border-border dark:border-[#00f7ff]/20 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground dark:text-[#e0d0ff]">📷 Foto Instalasi</p>
                <div>
                  <input type="file" accept="image/*" onChange={handleUploadInstallation} disabled={uploadingInstallation} className="hidden" id="installationUploadEdit" />
                  <label htmlFor="installationUploadEdit" className={`w-full block px-3 py-1.5 text-xs text-center border border-border dark:border-[#00f7ff]/30 rounded cursor-pointer hover:bg-muted dark:hover:bg-[#00f7ff]/10 text-muted-foreground dark:text-[#e0d0ff]/70 ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {uploadingInstallation ? '⏳ Mengupload...' : '📸 Upload Foto Instalasi'}
                  </label>
                  <p className="text-[9px] text-muted-foreground dark:text-[#e0d0ff]/40 mt-1">Bisa upload beberapa foto. Maks. 5MB per foto.</p>
                </div>
                {formData.installationPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formData.installationPhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img src={photo} alt={`Instalasi ${index + 1}`} className="w-full h-16 object-cover rounded border border-border dark:border-[#00f7ff]/20" />
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, i) => i !== index) }))} className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] hover:bg-red-600">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border dark:border-[#bc13fe]/30">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-lg transition-all dark:text-[#e0d0ff] dark:bg-[#bc13fe]/20 dark:hover:bg-[#bc13fe]/30 dark:border-[#bc13fe]/50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-md transition-all dark:bg-gradient-to-r dark:from-[#00f7ff] dark:to-[#bc13fe] dark:text-white dark:hover:from-[#00f7ff]/80 dark:hover:to-[#bc13fe]/80 dark:shadow-[0_0_15px_rgba(0,247,255,0.4)]"
                >
                  {t('common.saveChanges')}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'sessions' && (
            <div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary dark:text-[#00f7ff]" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground dark:text-[#e0d0ff]/50">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('userModal.noSessions')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 border border-border dark:border-[#bc13fe]/30 rounded-lg bg-muted/30 dark:bg-[#0a0520]/30"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {session.isOnline ? (
                              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                <CheckCircle2 className="w-3 h-3" />
                                {t('userModal.online')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {t('userModal.offline')}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {session.durationFormatted}
                            </span>
                          </div>
                          <p className="text-sm font-medium mt-1">
                            {formatWIB(session.startTime, 'dd MMM yyyy HH:mm')}
                            {session.stopTime && (
                              <> - {formatWIB(session.stopTime, 'HH:mm')}</>
                            )}
                          </p>
                          {session.macAddress && session.macAddress !== '-' && (
                            <p className="text-xs text-gray-500 mt-1 font-mono">
                              MAC: {session.macAddress}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>↓ {session.download}</div>
                          <div>↑ {session.upload}</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            Total: {session.total}
                          </div>
                        </div>
                      </div>
                      {session.terminateCause && !session.isOnline && (
                        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                          Terminate: {session.terminateCause}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'auth' && (
            <div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary dark:text-[#00f7ff]" />
                </div>
              ) : authLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground dark:text-[#e0d0ff]/50">
                  <XCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('userModal.noAuthLogs')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {authLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {log.success ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{log.reply}</p>
                          <p className="text-xs text-gray-500">
                            {formatLocalDate(log.authdate, 'dd MMM yyyy HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${log.success
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                          }`}
                      >
                        {log.success ? t('userModal.success') : t('userModal.rejected')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary dark:text-[#00f7ff]" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground dark:text-[#e0d0ff]/50">
                  <p>{t('userModal.noInvoices')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-4 border border-border dark:border-[#bc13fe]/30 rounded-lg bg-muted/30 dark:bg-[#0a0520]/30"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{invoice.invoiceNumber}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Due: {formatWIB(invoice.dueDate, 'dd MMM yyyy')}
                          </p>
                          {invoice.paidAt && (
                            <p className="text-xs text-green-600 mt-1">
                              Paid: {formatWIB(invoice.paidAt, 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">
                            {new Intl.NumberFormat('id-ID', {
                              style: 'currency',
                              currency: 'IDR',
                              minimumFractionDigits: 0,
                            }).format(invoice.amount)}
                          </p>
                          <span
                            className={`inline-block text-xs px-2 py-1 rounded mt-1 ${invoice.status === 'PAID'
                              ? 'bg-green-50 text-green-700'
                              : invoice.status === 'PENDING'
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-red-50 text-red-700'
                              }`}
                          >
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
