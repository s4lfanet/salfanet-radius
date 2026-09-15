'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, CheckCircle2, XCircle, Clock, Eye, EyeOff, MapPin, Map, Camera, ImageIcon, ZoomIn, IdCard, Wrench, Puzzle, CalendarClock, FileX, Plus } from 'lucide-react';
import { formatWIB, formatLocalDate, todayWIBStr, nowWIB, isExpiredWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showWarning, showConfirm } from '@/lib/sweetalert';
import { apiAdmin } from '@/lib/api';
import { CameraPhotoInput } from '@/components/CameraPhotoInput';
import { CameraViewfinder } from '@/components/CameraViewfinder';
import type { PppoeProfile, PppoeArea, Router } from '@/types/api/pppoe';

interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: string;
  profile: { id: string; name: string } | null;
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
  createdAt?: string | null;
  discount?: number | null;
  discountNote?: string | null;
  connectionType?: 'PPPOE' | 'STATIC_IP' | 'HOTSPOT' | null;
  registeredByTechnicianId?: string | null;
  registeredByTechnician?: { id: string; name: string } | null;
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
  onSave: (data: Record<string, unknown>) => Promise<void>;
  profiles: Pick<PppoeProfile, 'id' | 'name'>[];
  routers: Pick<Router, 'id' | 'name'>[];
  areas?: Pick<PppoeArea, 'id' | 'name'>[];
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);
  const [installCameraOpen, setInstallCameraOpen] = useState(false);

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
    registeredAt: '',
    discount: 0,
    discountNote: '',
    connectionType: 'PPPOE' as 'PPPOE' | 'STATIC_IP' | 'HOTSPOT',
    forceSyncMikrotik: false,
  });

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        password: '',
        areaId: user.area?.id || '',
        profileId: user.profile?.id || '',
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
        registeredAt: user.createdAt ? formatWIB(user.createdAt, 'yyyy-MM-dd') : '',
        discount: user.discount || 0,
        discountNote: user.discountNote || '',
        connectionType: user.connectionType || 'PPPOE',
        forceSyncMikrotik: false,
      });
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab !== 'info') {
      loadTabData(activeTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const data = await apiAdmin<{ success: boolean; data: Session[] | AuthLog[] | Invoice[] }>(`/api/pppoe/users/${user.id}/activity?type=${tab === 'sessions' ? 'sessions' : tab === 'auth' ? 'auth' : 'invoices'}`);

        if (data.success) {
          if (tab === 'sessions') {
            setSessions(data.data as Session[]);
          } else if (tab === 'auth') {
            setAuthLogs(data.data as AuthLog[]);
          } else if (tab === 'invoices') {
            setInvoices(data.data as Invoice[]);
          }
        }
      }
    } catch (error) {
      console.error('Load tab data error:', error);
      showError('Gagal memuat data tab');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // For PPPoE, don't send ipAddress (IP comes from pool)
    const submitData: Record<string, unknown> = { ...formData, id: user?.id };
    if (submitData.connectionType === 'PPPOE') {
      submitData.ipAddress = '';
    }
    // Don't send password if empty - backend will use existing password from DB
    // This prevents overwriting MikroTik secret with empty password
    if (!submitData.password) {
      delete submitData.password;
    }
    // Only send forceSyncMikrotik if checked
    if (!submitData.forceSyncMikrotik) {
      delete submitData.forceSyncMikrotik;
    }
    await onSave(submitData);
    onClose();
  };

  const handleUploadInstallation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const result = await apiAdmin<{ success: boolean; url?: string; error?: string }>('/api/upload/pppoe-customer', { method: 'POST', body: fd });
      if (result.success && result.url) { setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, result.url!] })); }
      else { await showError(result.error || 'Upload foto instalasi gagal'); }
    } catch { await showError('Upload foto instalasi gagal'); }
    finally { setUploadingInstallation(false); }
  };

  const handleCameraInstallation = async (file: File) => {
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const result = await apiAdmin<{ success: boolean; url?: string; error?: string }>('/api/upload/pppoe-customer', { method: 'POST', body: fd });
      if (result.success && result.url) {
        setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, result.url!] }));
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((p) => {
            setFormData(prev => ({ ...prev, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
          }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
        }
      } else { await showError(result.error || 'Upload foto instalasi gagal'); }
    } catch { await showError('Upload foto instalasi gagal'); }
    finally { setUploadingInstallation(false); }
  };

  // Theme-aware class constants
  const inputCls = "w-full px-3 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-colors placeholder:text-muted-foreground/60 disabled:opacity-60 disabled:cursor-not-allowed";
  const selectCls = inputCls;
  const textareaCls = inputCls;
  const labelCls = "block text-xs font-medium mb-1.5 text-muted-foreground";
  const labelCls2 = "block text-xs font-medium mb-2 text-muted-foreground";
  const hintCls = "text-[11px] text-muted-foreground/80 mt-1.5 leading-snug";
  const sectionCls = "grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 md:gap-8 py-6 border-b border-border last:border-b-0";
  const sectionHeadCls = "md:sticky md:top-0 md:self-start";
  const sectionTitleCls = "text-sm font-semibold text-foreground";
  const sectionDescCls = "text-xs text-muted-foreground mt-1 leading-relaxed";
  const smallBtnCls = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors";

  if (!isOpen || !user) return null;

  const statusMeta: Record<string, { label: string; cls: string; dot: string }> = {
    active:   { label: 'Aktif',     cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
    isolated: { label: 'Isolir',    cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',                 dot: 'bg-red-500' },
    stopped:  { label: 'Berhenti',  cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',         dot: 'bg-slate-400' },
    expired:  { label: 'Kedaluwarsa', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',       dot: 'bg-amber-500' },
    blocked:  { label: 'Diblokir',  cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',                 dot: 'bg-red-500' },
  };
  const st = statusMeta[user.status] || { label: user.status, cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
  const initials = (user.name || user.username).split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const connLabel = user.connectionType === 'STATIC_IP' ? 'Static IP' : user.connectionType === 'HOTSPOT' ? 'Hotspot' : 'PPPoE';

  return createPortal(
    <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] modal-overlay p-0 sm:p-4 animate-in fade-in-0 duration-200" style={{ zIndex: 9999 }} onClick={onClose}>
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl h-[94vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col border border-border animate-in fade-in-0 slide-in-from-bottom-6 sm:zoom-in-95 duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — identity strip */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0 border-b border-border">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-sm sm:text-base font-semibold shrink-0 select-none">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold text-foreground truncate leading-tight">{user.name}</h2>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs text-muted-foreground">
                <span className="font-mono text-foreground/80">{user.username}</span>
                <span aria-hidden className="text-border">·</span>
                <span>{user.profile?.name || 'Tanpa paket'}</span>
                <span aria-hidden className="text-border">·</span>
                <span>{connLabel}</span>
                {user.area?.name && (<><span aria-hidden className="text-border">·</span><span>{user.area.name}</span></>)}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-2 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 flex overflow-x-auto gap-0.5 [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'info', label: t('userModal.userInfo') },
              { id: 'sessions', label: t('userModal.sessions') },
              { id: 'auth', label: t('userModal.authLogs') },
              { id: 'invoices', label: t('userModal.invoices') },
              { id: 'addons', label: 'Add-ons' },
              { id: 'promise', label: 'Janji Bayar' },
              { id: 'photos', label: 'Foto' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative shrink-0 px-3 py-2.5 text-xs sm:text-[13px] font-medium whitespace-nowrap transition-colors -mb-px ${activeTab === tab.id
 ? 'text-brand-600 dark:text-brand-400'
 : 'text-muted-foreground hover:text-foreground'
 }`}
              >
                {tab.label}
                {activeTab === tab.id && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-brand-500" />}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${activeTab === 'info' ? 'px-4 sm:px-6' : 'p-4 sm:p-6'}`}>
          {activeTab === 'info' && (
            <form id="user-detail-form" onSubmit={handleSubmit}>

              {/* ── Akun & Koneksi ── */}
              <section className={sectionCls}>
                <div className={sectionHeadCls}>
                  <h3 className={sectionTitleCls}>Akun &amp; Koneksi</h3>
                  <p className={sectionDescCls}>Kredensial PPPoE, paket layanan, dan penempatan di jaringan.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('userModal.username')}</label>
                    <input type="text" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className={`${inputCls} font-mono`} required />
                  </div>
                  <div>
                    <label className={labelCls}>{t('userModal.password')}</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={`${inputCls} pr-10 font-mono`}
                        placeholder={t('userModal.passwordPlaceholder')}
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>{t('userModal.profile')}</label>
                    <select value={formData.profileId} onChange={(e) => setFormData({ ...formData, profileId: e.target.value })} className={selectCls} required>
                      <option value="">{t('userModal.selectProfile')}</option>
                      {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Tipe Koneksi</label>
                    <select value={formData.connectionType} onChange={(e) => setFormData({ ...formData, connectionType: e.target.value as 'PPPOE' | 'STATIC_IP' | 'HOTSPOT' })} className={selectCls}>
                      <option value="PPPOE">PPPoE</option>
                      <option value="STATIC_IP">Static IP (ARP)</option>
                      <option value="HOTSPOT">Hotspot</option>
                    </select>
                    {(formData.connectionType !== 'PPPOE') && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">Mengubah tipe koneksi akan sync ulang konfigurasi MikroTik (hapus entry lama, buat entry baru).</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>{t('userModal.router')}</label>
                    <select value={formData.routerId} onChange={(e) => setFormData({ ...formData, routerId: e.target.value })} className={selectCls}>
                      <option value="">{t('userModal.autoAssign')}</option>
                      {routers.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Area</label>
                    <select value={formData.areaId} onChange={(e) => setFormData({ ...formData, areaId: e.target.value })} className={selectCls}>
                      <option value="">Pilih Area</option>
                      {areas.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{t('userModal.ipAddress')}</label>
                    <input
                      type="text"
                      value={formData.ipAddress}
                      onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                      className={`${inputCls} font-mono`}
                      placeholder={formData.connectionType === 'PPPOE' ? 'Otomatis dari IP Pool' : t('userModal.ipPlaceholder')}
                      disabled={formData.connectionType === 'PPPOE'}
                    />
                    {formData.connectionType === 'PPPOE' && (<p className={hintCls}>IP diberikan otomatis dari IP Pool MikroTik/RADIUS.</p>)}
                  </div>
                  <div>
                    <label className={labelCls}>MAC Address</label>
                    <input type="text" value={formData.macAddress} onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" className={`${inputCls} font-mono`} />
                  </div>
                </div>
              </section>

              {/* ── Data Pelanggan ── */}
              <section className={sectionCls}>
                <div className={sectionHeadCls}>
                  <h3 className={sectionTitleCls}>Data Pelanggan</h3>
                  <p className={sectionDescCls}>Identitas, kontak, dan lokasi pemasangan.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('userModal.name')}</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>{t('userModal.phone')}</label>
                    <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{t('userModal.email')}</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{t('userModal.address')}</label>
                    <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={textareaCls} rows={2} />
                  </div>

                  {/* GPS Location */}
                  <div className="sm:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <label className={`${labelCls} mb-0`}>{t('userModal.gpsLocation')}</label>
                      <div className="flex gap-2 flex-wrap">
                        {onLatLngChange && (
                          <button type="button" onClick={() => { onLatLngChange(formData.latitude, formData.longitude); }} className={smallBtnCls}>
                            <Map className="h-3.5 w-3.5" />
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
                        className={smallBtnCls}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        GPS Auto
                      </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} placeholder="Latitude" className={`${inputCls} font-mono`} />
                      <input type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} placeholder="Longitude" className={`${inputCls} font-mono`} />
                    </div>
                    <p className={hintCls}>{t('userModal.gpsNote')}</p>
                    {/* GPS Map Preview */}
                    {formData.latitude && formData.longitude && (
                      <div className="mt-3 rounded-lg overflow-hidden border border-border">
                        <iframe
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(formData.longitude) - 0.005}%2C${Number(formData.latitude) - 0.005}%2C${Number(formData.longitude) + 0.005}%2C${Number(formData.latitude) + 0.005}&layer=mapnik&marker=${formData.latitude}%2C${formData.longitude}`}
                          className="w-full h-[180px] border-0"
                          title="GPS Location Map"
                          loading="lazy"
                        />
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-t border-border">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {Number(formData.latitude).toFixed(6)}, {Number(formData.longitude).toFixed(6)}
                          </span>
                          <a href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                            <MapPin className="h-3 w-3" />
                            Buka di Google Maps
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ── Langganan & Tagihan ── */}
              <section className={sectionCls}>
                <div className={sectionHeadCls}>
                  <h3 className={sectionTitleCls}>Langganan &amp; Tagihan</h3>
                  <p className={sectionDescCls}>Skema pembayaran, jatuh tempo, dan tindakan otomatis saat terlambat.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Subscription Type */}
                <div className="sm:col-span-2">
                  <label className={labelCls2}>{t('userModal.subscriptionType')}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { v: 'POSTPAID', title: t('userModal.postpaid'), desc: 'Tagihan bulanan, tanggal tetap' },
                      { v: 'PREPAID',  title: t('userModal.prepaid'),  desc: 'Bayar di muka, validitas terbatas' },
                    ] as const).map(opt => {
                      const on = formData.subscriptionType === opt.v;
                      return (
                        <label key={opt.v} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${on ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-500/40 hover:bg-muted/40'}`}>
                          <input
                            type="radio"
                            name="subscriptionType"
                            value={opt.v}
                            checked={on}
                            onChange={(e) => setFormData({ ...formData, subscriptionType: e.target.value as 'PREPAID' | 'POSTPAID' })}
                            className="mt-0.5 w-4 h-4 accent-brand-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${on ? 'text-brand-600 dark:text-brand-400' : 'text-foreground'}`}>{opt.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Billing Day - POSTPAID Only */}
                {formData.subscriptionType === 'POSTPAID' && (
                  <div>
                    <label className={labelCls}>Tanggal Tagihan</label>
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
                        <option key={day} value={day}>Tanggal {day}</option>
                      ))}
                    </select>
                    <p className={hintCls}>Jatuh tempo bulanan. Mengubah tanggal akan menggeser tanggal isolir ke bulan depan.</p>
                  </div>
                )}

                {/* Expired At - Shows for both PREPAID and POSTPAID */}
                <div className={formData.subscriptionType === 'POSTPAID' ? '' : 'sm:col-span-2'}>
                  <label className={labelCls}>Tanggal Isolir</label>
                  <input type="date" value={formData.expiredAt} onChange={(e) => setFormData({ ...formData, expiredAt: e.target.value })} className={inputCls} />
                  <p className={hintCls}>
                    {formData.subscriptionType === 'POSTPAID'
                      ? 'Dihitung otomatis dari tanggal tagihan bulan depan.'
                      : 'Tanggal kedaluwarsa paket. Kosongkan untuk mengikuti profil.'}
                  </p>
                </div>

                {/* Aksi Jatuh Tempo */}
                <div className="sm:col-span-2">
                  <label className={labelCls}>Aksi Jatuh Tempo</label>
                  <select
                    value={formData.autoIsolationEnabled ? 'isolate' : 'keep'}
                    onChange={(e) => setFormData({ ...formData, autoIsolationEnabled: e.target.value === 'isolate' })}
                    className={selectCls}
                  >
                    <option value="isolate">Isolir otomatis saat lewat jatuh tempo</option>
                    <option value="keep">Tetap terhubung, tanpa isolir otomatis</option>
                  </select>
                  <p className={hintCls}>Tindakan yang dijalankan sistem saat tanggal tagihan / isolir terlewati.</p>
                </div>

                {/* Diskon Tagihan */}
                <div>
                  <label className={labelCls}>Diskon Tagihan (Rp/bulan)</label>
                  <input type="number" min="0" value={formData.discount} onChange={(e) => setFormData({ ...formData, discount: parseInt(e.target.value) || 0 })} placeholder="0" className={inputCls} />
                  <p className={hintCls}>Dikurangi dari harga paket setiap bulan.</p>
                </div>
                <div>
                  <label className={labelCls}>Alasan Diskon</label>
                  <input type="text" value={formData.discountNote} onChange={(e) => setFormData({ ...formData, discountNote: e.target.value })} placeholder="Mis: promo loyalitas, kerabat" className={inputCls} />
                </div>
                </div>
              </section>

              {/* ── Dokumen ── */}
              <section className={sectionCls}>
                <div className={sectionHeadCls}>
                  <h3 className={sectionTitleCls}>Dokumen</h3>
                  <p className={sectionDescCls}>Identitas resmi pelanggan dan bukti foto pemasangan di lokasi.</p>
                </div>
                <div className="space-y-5">
              {/* Dokumen KTP */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><IdCard className="w-3.5 h-3.5 text-brand-500 shrink-0" />Identitas (KTP)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>No. NIK KTP</label>
                    <input
                      type="text"
                      value={formData.idCardNumber}
                      onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value })}
                      placeholder="3201234567890123"
                      maxLength={16}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Foto KTP</label>
                    <CameraPhotoInput
                      photoUrl={formData.idCardPhoto}
                      onRemove={() => setFormData({ ...formData, idCardPhoto: '' })}
                      uploading={uploadingIdCard}
                      onUploadFile={async (file) => {
                        setUploadingIdCard(true);
                        try {
                          const fd = new FormData(); fd.append('file', file); fd.append('type', 'idCard');
                          const result = await apiAdmin<{ success: boolean; url?: string; error?: string }>('/api/upload/pppoe-customer', { method: 'POST', body: fd });
                          if (result.success && result.url) { setFormData(prev => ({ ...prev, idCardPhoto: result.url! })); return result.url; }
                          await showError(result.error || 'Upload KTP gagal'); return null;
                        } catch { await showError('Upload KTP gagal'); return null; }
                        finally { setUploadingIdCard(false); }
                      }}
                      theme="light"
                    />
                  </div>
                </div>
              </div>
              {/* Foto Instalasi */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-brand-500 shrink-0" />Foto Instalasi</p>
                <div>
                  <input type="file" accept="image/*" onChange={handleUploadInstallation} disabled={uploadingInstallation} className="sr-only" id="installationUploadEdit" />
                  {installCameraOpen ? (
                    <CameraViewfinder
                      onCapture={handleCameraInstallation}
                      onClose={() => setInstallCameraOpen(false)}
                    />
                  ) : (
                  <div className="flex flex-wrap gap-2">
                    <label htmlFor={uploadingInstallation ? undefined : 'installationUploadEdit'} className={`${smallBtnCls} ${uploadingInstallation ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
                      <ImageIcon className="w-3.5 h-3.5" /> {uploadingInstallation ? 'Mengunggah...' : 'Dari Galeri'}
                    </label>
                    <button type="button" onClick={() => setInstallCameraOpen(true)} disabled={uploadingInstallation} className={`${smallBtnCls} ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Camera className="w-3.5 h-3.5" /> Ambil Foto
                    </button>
                  </div>
                  )}
                  <p className={hintCls}>Bisa lebih dari satu foto, maks. 5MB per foto. Kamera otomatis menyimpan koordinat GPS.</p>
                </div>
                {formData.installationPhotos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {formData.installationPhotos.map((photo, index) => (
                      <div key={index} className="relative group aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Instalasi ${index + 1}`} className="w-full h-full object-cover rounded-md border border-border" loading="lazy" />
                        <button type="button" aria-label="Hapus foto" onClick={() => setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, i) => i !== index) }))} className="absolute -top-1.5 -right-1.5 bg-card text-muted-foreground hover:text-red-600 border border-border shadow-sm rounded-full w-5 h-5 flex items-center justify-center transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </div>
              </section>

              {/* ── Pendaftaran ── */}
              <section className={sectionCls}>
                <div className={sectionHeadCls}>
                  <h3 className={sectionTitleCls}>Pendaftaran</h3>
                  <p className={sectionDescCls}>Riwayat PSB dan catatan internal.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Teknisi Pemasang</label>
                    <div className="px-3 py-2 text-sm rounded-lg border border-dashed border-border bg-muted/30 text-foreground">
                      {user?.registeredByTechnician?.name || 'System / Admin'}
                    </div>
                    <p className={hintCls}>Teknisi yang melakukan pendaftaran pelanggan ini.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Tanggal Register</label>
                    <input type="date" value={formData.registeredAt} onChange={(e) => setFormData({ ...formData, registeredAt: e.target.value })} className={inputCls} />
                    <p className={hintCls}>Ubah hanya untuk koreksi data historis.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Catatan Internal</label>
                    <input type="text" value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} placeholder="Catatan tambahan untuk tim" className={inputCls} />
                  </div>
                </div>
              </section>

              {/* Force Sync MikroTik */}
              {formData.connectionType === 'PPPOE' && formData.routerId && (
                <div className="py-5">
                  <label className="flex items-start gap-3 p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.forceSyncMikrotik}
                      onChange={(e) => setFormData({ ...formData, forceSyncMikrotik: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Sinkronkan PPPoE secret ke MikroTik</span>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 mt-1 leading-snug">
                        Centang jika secret belum ada di router (local-auth) atau perlu diperbarui. Sistem akan membuat/memperbarui PPP secret sesuai username, password, dan paket yang dipilih.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </form>
          )}

          {activeTab === 'sessions' && (
            <div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('userModal.noSessions')}</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {sessions.map((session) => (
                    <div key={session.id} className="p-3.5 sm:p-4 bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {session.isOnline ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {t('userModal.online')}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full shrink-0">
                                {t('userModal.offline')}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground tabular-nums">{session.durationFormatted}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground mt-1.5 truncate tabular-nums">
                            {formatWIB(session.startTime, 'dd MMM yyyy HH:mm')}
                            {session.stopTime && (<span className="text-muted-foreground"> – {formatWIB(session.stopTime, 'HH:mm')}</span>)}
                          </p>
                          {session.macAddress && session.macAddress !== '-' && (
                            <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{session.macAddress}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground shrink-0 tabular-nums leading-relaxed">
                          <div>↓ {session.download}</div>
                          <div>↑ {session.upload}</div>
                          <div className="font-medium text-foreground mt-0.5">{session.total}</div>
                        </div>
                      </div>
                      {session.terminateCause && !session.isOnline && (
                        <div className="text-[11px] text-muted-foreground mt-2.5 pt-2 border-t border-border/60">
                          Putus: {session.terminateCause}
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
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
              ) : authLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <XCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('userModal.noAuthLogs')}</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {authLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 px-3.5 py-3 bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{log.reply}</p>
                          <p className="text-[11px] text-muted-foreground truncate tabular-nums">
                            {formatLocalDate(log.authdate, 'dd MMM yyyy HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${log.success
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>
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
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileX className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('userModal.noInvoices')}</p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {invoices.map((invoice) => {
                    const invStatus: Record<string, { label: string; cls: string }> = {
                      PAID:      { label: 'Lunas',        cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                      PENDING:   { label: 'Belum Bayar',  cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                      OVERDUE:   { label: 'Jatuh Tempo',  cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
                      CANCELLED: { label: 'Dibatalkan',   cls: 'bg-muted text-muted-foreground border-border' },
                    };
                    const is = invStatus[invoice.status] || { label: invoice.status, cls: 'bg-muted text-muted-foreground border-border' };
                    return (
                      <div key={invoice.id} className="flex items-start justify-between gap-3 px-3.5 py-3.5 bg-card hover:bg-muted/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground font-mono truncate">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                            Jatuh tempo {formatWIB(invoice.dueDate, 'dd MMM yyyy')}
                          </p>
                          {invoice.paidAt && (
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                              Dibayar {formatWIB(invoice.paidAt, 'dd MMM yyyy')}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm sm:text-base font-semibold text-foreground tabular-nums">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(invoice.amount)}
                          </p>
                          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border mt-1.5 ${is.cls}`}>{is.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add-ons Tab */}
          {activeTab === 'addons' && (
            <CustomerAddonsTab userId={user.id} />
          )}

          {/* Janji Bayar Tab */}
          {activeTab === 'promise' && (
            <PaymentPromiseTab userId={user.id} userStatus={user.status} />
          )}

          {activeTab === 'photos' && (
            <div className="space-y-6">
              {/* KTP Section */}
              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-semibold text-foreground shrink-0 flex items-center gap-1.5"><IdCard className="w-4 h-4 text-brand-500 shrink-0" />Foto KTP</p>
                  {formData.idCardNumber && (
                    <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                      NIK: {formData.idCardNumber}
                    </span>
                  )}
                </div>
                {formData.idCardPhoto ? (
                  <div className="relative group cursor-pointer" onClick={() => setLightboxUrl(formData.idCardPhoto)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formData.idCardPhoto}
                      alt="Foto KTP"
                      className="w-full max-h-64 object-contain rounded-lg border border-border bg-black/5 dark:bg-black/30"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-lg">
                      <div className="flex items-center gap-1.5 text-white text-xs bg-black/60 px-3 py-1.5 rounded-full">
                        <ZoomIn className="w-3.5 h-3.5" /> Perbesar
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 h-32 rounded-lg border-2 border-dashed border-border text-muted-foreground">
                    <ImageIcon className="w-8 h-8 opacity-30" />
                    <p className="text-xs">Belum ada foto KTP</p>
                  </div>
                )}
              </div>

              {/* Installation Photos Section */}
              <div className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Wrench className="w-4 h-4 text-brand-500 shrink-0" />Foto Instalasi</p>
                  {formData.installationPhotos.length > 0 && (
                    <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {formData.installationPhotos.length} foto
                    </span>
                  )}
                </div>
                {formData.installationPhotos.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {formData.installationPhotos.map((photo, index) => (
                      <div
                        key={index}
                        className="relative group cursor-pointer"
                        onClick={() => setLightboxUrl(photo)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo}
                          alt={`Instalasi ${index + 1}`}
                          className="w-full aspect-[4/3] object-cover rounded-lg border border-border"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-lg">
                          <div className="flex items-center gap-1.5 text-white text-xs bg-black/60 px-3 py-1.5 rounded-full">
                            <ZoomIn className="w-3.5 h-3.5" /> Perbesar
                          </div>
                        </div>
                        <div className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          Foto {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 h-32 rounded-lg border-2 border-dashed border-border text-muted-foreground">
                    <Camera className="w-8 h-8 opacity-30" />
                    <p className="text-xs">Belum ada foto instalasi</p>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Untuk menambah / menghapus foto, buka tab Info Pengguna
              </p>
            </div>
          )}

          {/* Lightbox */}
          {lightboxUrl && (
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
              onClick={() => setLightboxUrl(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="Preview"
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => setLightboxUrl(null)}
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Footer — only for the editable info tab */}
        {activeTab === 'info' && (
          <div className="px-4 sm:px-6 py-3 border-t border-border bg-card flex items-center justify-between gap-3 shrink-0">
            <p className="hidden sm:block text-[11px] text-muted-foreground">
              Perubahan disimpan ke database dan disinkronkan ke RADIUS.
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="user-detail-form"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 transition-colors"
              >
                {t('common.saveChanges')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Customer Add-ons Tab ────────────────────────────────────────────────────

function CustomerAddonsTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [addons, setAddons] = useState<any[]>([]);
  const [addonTypes, setAddonTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ addonTypeId: '', priceOverride: '', startDate: todayWIBStr(), notes: '' });

  const loadAddons = async () => {
    try {
      const data = await apiAdmin<{ addons?: any[] }>(`/api/pppoe/users/${userId}/addons`);
      setAddons(data.addons || []);
    } catch (e) { console.error('Load addons error:', e); }
    finally { setLoading(false); }
  };

  const loadAddonTypes = async () => {
    try {
      const data = await apiAdmin<{ addons?: any[] }>('/api/addon-types');
      setAddonTypes(data.addons || []);
    } catch (e) { console.error('Load addon types error:', e); }
  };

  useEffect(() => { loadAddons(); loadAddonTypes(); }, [userId]);

  const handleAssign = async () => {
    if (!form.addonTypeId) { await showError('Pilih jenis layanan tambahan'); return; }
    setSaving(true);
    try {
      const data = await apiAdmin(`/api/pppoe/users/${userId}/addons`, {
        method: 'POST',
        body: JSON.stringify({
          addonTypeId: form.addonTypeId,
          priceOverride: form.priceOverride ? parseInt(form.priceOverride) : null,
          startDate: form.startDate,
          notes: form.notes || null,
        }),
      });
      await showSuccess('Layanan tambahan berhasil ditambahkan');
      setShowModal(false);
      setForm({ addonTypeId: '', priceOverride: '', startDate: todayWIBStr(), notes: '' });
      loadAddons();
    } catch (err: unknown) { await showError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };

  const handleRemove = async (addonId: string, addonName: string) => {
    const confirmed = await showConfirm(`Hentikan layanan "${addonName}"? End date akan diset ke hari ini.`);
    if (!confirmed) return;
    try {
      await apiAdmin(`/api/customer-addons/${addonId}`, { method: 'DELETE' });
      await showSuccess('Layanan tambahan dihentikan');
      loadAddons();
    } catch (err: unknown) { await showError(err instanceof Error ? err.message : String(err)); }
  };

  const active = addons.filter(a => !a.endDate || new Date(a.endDate) >= new Date());
  const past = addons.filter(a => a.endDate && isExpiredWIB(a.endDate));
  const selectedType = addonTypes.find(t => t.id === form.addonTypeId);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Memuat layanan tambahan...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Puzzle className="w-4 h-4 text-brand-500 shrink-0" />Layanan Tambahan Aktif</h3>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:opacity-90 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </div>

      {active.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg border border-border">
          <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Belum ada layanan tambahan aktif</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(a => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg border border-border">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">{a.addonType?.name || a.addonName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.addonType?.isRecurring ? 'Bulanan' : 'Sekali'} · Mulai {a.startDate ? formatWIB(a.startDate, 'd MMM yyyy') : '-'}
                  {a.notes ? ` · ${a.notes}` : ''}
                </div>
                {a.priceOverride != null && (
                  <div className="text-[10px] text-amber-500 mt-0.5">Harga custom</div>
                )}
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <span className="text-sm font-bold text-primary">Rp {Number(a.effectivePrice || a.priceOverride || a.addonType?.price || 0).toLocaleString('id-ID')}</span>
                <button
                  onClick={() => handleRemove(a.id, a.addonType?.name || a.addonName)}
                  className="shrink-0 px-2 py-1 text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded hover:bg-destructive/20 transition"
                >
                  Hentikan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer">Riwayat addon ({past.length})</summary>
          <div className="space-y-1 mt-2">
            {past.map(a => (
              <div key={a.id} className="flex justify-between p-2 bg-muted/20 rounded text-xs opacity-60">
                <span>{a.addonType?.name || a.addonName}</span>
                <span className="text-muted-foreground">Berakhir {a.endDate ? formatWIB(a.endDate, 'd MMM yyyy') : '-'}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Assign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">Tambah Layanan Tambahan</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Jenis Layanan *</label>
                <select
                  value={form.addonTypeId}
                  onChange={e => setForm(f => ({ ...f, addonTypeId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                >
                  <option value="">-- Pilih layanan --</option>
                  {addonTypes.filter(t => t.isActive).map(t => (
                    <option key={t.id} value={t.id}>{t.name} - Rp {Number(t.price).toLocaleString('id-ID')}{t.isRecurring ? '/bln' : ' (sekali)'}</option>
                  ))}
                </select>
              </div>
              {selectedType && (
                <div>
                  <label className="block text-sm font-medium mb-1">Harga Custom (opsional)</label>
                  <input
                    type="number"
                    value={form.priceOverride}
                    onChange={e => setForm(f => ({ ...f, priceOverride: e.target.value }))}
                    placeholder={`Default: Rp ${Number(selectedType.price).toLocaleString('id-ID')}`}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Tanggal Mulai</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Catatan (opsional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Catatan tambahan..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded hover:bg-muted transition">Batal</button>
              <button onClick={handleAssign} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded hover:opacity-90 transition disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payment Promise (Janji Bayar) Tab ───────────────────────────────────────

function PaymentPromiseTab({ userId, userStatus }: { userId: string; userStatus: string }) {
  const [promises, setPromises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNotes, setPromiseNotes] = useState('');

  const loadPromises = async () => {
    try {
      const data = await apiAdmin<{ promises?: any[] }>(`/api/pppoe/users/${userId}/promise`);
      setPromises(data.promises || []);
    } catch (e) { console.error('Load promises error:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPromises(); }, [userId]);

  const handleCreate = async () => {
    if (!promiseDate) { await showError('Pilih tanggal janji bayar'); return; }
    if (new Date(promiseDate) <= new Date()) { await showError('Tanggal janji harus di masa depan'); return; }
    setSaving(true);
    try {
      const data = await apiAdmin<{ message?: string }>(`/api/pppoe/users/${userId}/promise`, {
        method: 'POST',
        body: JSON.stringify({ promiseDate, notes: promiseNotes || null }),
      });
      await showSuccess(data.message || 'Janji bayar dibuat. Akses internet dibuka hingga tanggal janji.');
      setShowModal(false);
      setPromiseDate('');
      setPromiseNotes('');
      loadPromises();
    } catch (err: unknown) { await showError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };

  const handleCancel = async (promiseId: string) => {
    const confirmed = await showConfirm('Batalkan janji bayar? Pelanggan akan diisolir kembali.');
    if (!confirmed) return;
    try {
      const data = await apiAdmin<{ message?: string }>(`/api/pppoe/users/${userId}/promise`, { method: 'DELETE' });
      await showSuccess(data.message || 'Janji bayar dibatalkan. Pelanggan diisolir kembali.');
      loadPromises();
    } catch (err: unknown) { await showError(err instanceof Error ? err.message : String(err)); }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Memuat data janji bayar...</div>;

  const activePromise = promises.find(p => p.status === 'active');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-brand-500 shrink-0" />Janji Bayar</h3>
        {!activePromise && (
          <button
            onClick={() => {
              setPromiseDate(formatWIB(new Date(nowWIB().getTime() + 86400000), 'yyyy-MM-dd'));
              setShowModal(true);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Buat Janji Bayar
          </button>
        )}
      </div>

      {activePromise ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded shrink-0">AKTIF</span>
                <span className="text-sm font-medium text-foreground">
                  Janji bayar hingga {formatWIB(activePromise.promiseDate, 'd MMMM yyyy')}
                </span>
              </div>
              {activePromise.notes && (
                <p className="text-xs text-muted-foreground mb-2">{activePromise.notes}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Dibuat: {activePromise.createdAt ? formatWIB(activePromise.createdAt, 'd MMM yyyy') : '-'}
              </p>
            </div>
            <button
              onClick={() => handleCancel(activePromise.id)}
              className="shrink-0 px-2 py-1 text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded hover:bg-destructive/20 transition self-start"
            >
              Batalkan
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg border border-border">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Tidak ada janji bayar aktif</p>
        </div>
      )}

      {promises.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer">Riwayat janji bayar ({promises.length})</summary>
          <div className="space-y-1 mt-2">
            {promises.map(p => (
              <div key={p.id} className="flex justify-between items-center p-2 bg-muted/20 rounded text-xs">
                <span>
                  {formatWIB(p.promiseDate, 'd MMM yyyy')}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
 p.status === 'active' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
 p.status === 'fulfilled' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
 }`}>{p.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Create Promise Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">Buat Janji Bayar</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Pelanggan berjanji membayar tagihan pada tanggal tertentu. Akses internet akan dibuka hingga tanggal janji. Jika tidak dibayar hingga tanggal janji, pelanggan akan diisolir otomatis.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tanggal Janji Bayar *</label>
                <input
                  type="date"
                  value={promiseDate}
                  onChange={e => setPromiseDate(e.target.value)}
                  min={formatWIB(new Date(nowWIB().getTime() + 86400000), 'yyyy-MM-dd')}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Catatan (opsional)</label>
                <textarea
                  value={promiseNotes}
                  onChange={e => setPromiseNotes(e.target.value)}
                  placeholder="Mis: Janji bayar tanggal gajian..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded hover:bg-muted transition">Batal</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded hover:opacity-90 transition disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Buat Janji'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
