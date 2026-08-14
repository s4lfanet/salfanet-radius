'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { ArrowLeft, MapPin, Map, Eye, EyeOff, Loader2, X, ChevronRight, ChevronLeft, CheckCircle, Camera, Wifi, WifiOff } from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import { ModalInput, ModalSelect, ModalLabel } from '@/components/cyberpunk';
import { todayWIBStr, parseDateAsWIB } from '@/lib/timezone';
import { pppoeApi, networkApi, buildUrl } from '@/lib/api';
import type { PppoeUser } from '@/lib/api';

interface Profile { id: string; name: string; groupName: string; price: number; }
interface Router { id: string; name: string; nasname: string; ipAddress: string; authMode?: string; }
interface Area { id: string; name: string; }

const STEPS = [
  { id: 'pelanggan', label: 'Data Pelanggan', icon: '👤' },
  { id: 'pembayaran', label: 'Data Pembayaran', icon: '💳' },
  { id: 'secret', label: 'Data Secret', icon: '🔐' },
];

export default function NewPppoeUserPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);
  const [hasPppoeAccount, setHasPppoeAccount] = useState(true);
  const [firstInvoice, setFirstInvoice] = useState<'none' | 'prorate' | 'full'>('prorate');
  const [formWarnings, setFormWarnings] = useState<{ nik: string; phone: string }>({ nik: '', phone: '' });
  const [createPppSecret, setCreatePppSecret] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    profileId: '',
    routerId: '',
    areaId: '',
    ipAddress: '',
    subscriptionType: 'POSTPAID' as 'POSTPAID' | 'PREPAID',
    billingDay: '1',
    expiredAt: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    latitude: '',
    longitude: '',
    macAddress: '',
    idCardNumber: '',
    idCardPhoto: '',
    installationPhotos: [] as string[],
    followRoad: false,
    comment: '',
    registeredAt: todayWIBStr(),
    autoIsolationEnabled: true,
    odp: '',
    discount: '',
    discountNote: '',
    connectionType: 'PPPOE' as 'PPPOE' | 'STATIC_IP' | 'HOTSPOT',
  });

  useEffect(() => {
    Promise.all([
      pppoeApi.listProfiles(),
      networkApi.listRouters(),
      pppoeApi.listAreas(),
    ]).then(([profilesData, routersData, areasData]) => {
      setProfiles(profilesData.profiles || []);
      setRouters(routersData.routers || []);
      setAreas(areasData.areas || []);
    }).catch(console.error);
  }, []);

  // Check duplicate NIK/phone against existing users
  useEffect(() => {
    if (!formData.idCardNumber || formData.idCardNumber.length < 16) {
      setFormWarnings(w => ({ ...w, nik: '' }));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await pppoeApi.listUsers({ search: formData.idCardNumber });
        const found = (data.users || []).find((u: PppoeUser) => u.idCardNumber === formData.idCardNumber);
        setFormWarnings(w => ({ ...w, nik: found ? `⚠️ NIK sudah terdaftar: ${found.name}` : '' }));
      } catch { /* ignore */ }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [formData.idCardNumber]);

  useEffect(() => {
    if (!formData.phone || formData.phone.length < 8) {
      setFormWarnings(w => ({ ...w, phone: '' }));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await pppoeApi.listUsers({ search: formData.phone });
        const found = (data.users || []).find((u: PppoeUser) => u.phone === formData.phone);
        setFormWarnings(w => ({ ...w, phone: found ? `⚠️ No HP sudah terdaftar: ${found.name}` : '' }));
      } catch { /* ignore */ }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [formData.phone]);

  const handleUploadIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIdCard(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'idCard');
      const res = await fetch(buildUrl('/api/upload/pppoe-customer'), { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (data.url) setFormData(prev => ({ ...prev, idCardPhoto: data.url }));
      else await showError('Gagal upload foto KTP');
    } catch { await showError('Gagal upload foto KTP'); }
    finally { setUploadingIdCard(false); }
  };

  const handleUploadInstallation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInstallation(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'installation');
      const res = await fetch(buildUrl('/api/upload/pppoe-customer'), { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (data.url) setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, data.url] }));
      else await showError('Gagal upload foto instalasi');
    } catch { await showError('Gagal upload foto instalasi'); }
    finally { setUploadingInstallation(false); }
  };

  // ── Step Validation ──────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    if (!formData.name?.trim()) { showError('Nama lengkap pelanggan wajib diisi'); return false; }
    if (!formData.phone?.trim()) { showError('No HP / WhatsApp wajib diisi'); return false; }
    if (formData.idCardNumber && !/^\d{16}$/.test(formData.idCardNumber.trim())) {
      showError('NIK harus tepat 16 digit angka'); return false;
    }
    if (!formData.idCardPhoto) { showError('Foto KTP wajib diupload'); return false; }
    if (!formData.latitude?.trim() || !formData.longitude?.trim()) { showError('GPS lokasi pelanggan wajib diisi. Klik tombol "Pakai GPS Saya" atau pilih di peta.'); return false; }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!formData.profileId) { showError('Paket internet wajib dipilih'); return false; }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (hasPppoeAccount) {
      if (!formData.username?.trim()) { showError('Username PPPoE wajib diisi'); return false; }
      if (!formData.password?.trim()) { showError('Password PPPoE wajib diisi'); return false; }
    }
    if ((formData.connectionType === 'STATIC_IP' || formData.connectionType === 'HOTSPOT') && !formData.ipAddress?.trim()) {
      showError('IP Address wajib diisi untuk Static/Hotspot'); return false;
    }
    return true;
  };

  const handleNext = () => {
    if (wizardStep === 1) {
      if (validateStep1()) setWizardStep(2);
    } else if (wizardStep === 2) {
      if (validateStep2()) setWizardStep(3);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateStep3()) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        username: hasPppoeAccount ? formData.username : '',
        password: hasPppoeAccount ? formData.password : '',
        noPppoeAccount: !hasPppoeAccount,
        firstInvoice,
        createPppSecret: hasPppoeAccount && createPppSecret,
        discount: formData.discount ? parseInt(formData.discount) : 0,
        ...(formData.expiredAt && {
          expiredAt: (() => {
            const raw = formData.expiredAt;
            const normalized = raw.length === 16 ? raw + ':00' : raw;
            const d = new Date(normalized);
            return isNaN(d.getTime()) ? undefined : d.toISOString();
          })()
        }),
      };
      try {
        await pppoeApi.createUser(payload);
        await showSuccess('Pelanggan berhasil ditambahkan');
        router.push('/admin/pppoe/users');
      } catch (error: unknown) {
        await showError((error instanceof Error ? error.message : String(error)) || 'Gagal menyimpan pelanggan');
      }
    } catch { await showError('Gagal menyimpan pelanggan'); }
    finally { setSaving(false); }
  };

  const field = (key: keyof typeof formData, val: string | boolean) => {
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      if (key === 'subscriptionType') {
        setFirstInvoice(val === 'PREPAID' ? 'full' : 'prorate');
      }
      return next;
    });
  };

  const handlePhoneChange = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.startsWith('0') && v.length > 1) v = '62' + v.slice(1);
    field('phone', v);
  };

  const prorateInfo = useMemo(() => {
    if (formData.subscriptionType !== 'POSTPAID') return null;
    const profile = profiles.find(p => p.id === formData.profileId);
    if (!profile) return null;
    const billingDay = parseInt(formData.billingDay) || 1;
    const today = formData.registeredAt ? parseDateAsWIB(formData.registeredAt) : new Date();
    const year = today.getUTCFullYear(); const month = today.getUTCMonth(); const currentDay = today.getUTCDate();
    let nextBilling: Date;
    if (currentDay < billingDay) { nextBilling = new Date(Date.UTC(year, month, billingDay)); }
    else { nextBilling = new Date(Date.UTC(year, month + 1, billingDay)); }
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysActive = Math.max(1, Math.ceil((nextBilling.getTime() - today.getTime()) / msPerDay));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const basePrice = profile.price - (formData.discount ? parseInt(formData.discount) : 0);
    const prorateAmount = Math.ceil((daysActive / daysInMonth) * basePrice);
    return { daysActive, daysInMonth, nextBilling, prorateAmount, fullPrice: basePrice, profileName: profile.name, isFullMonth: daysActive >= daysInMonth };
  }, [formData.subscriptionType, formData.profileId, formData.billingDay, formData.registeredAt, profiles, formData.discount]);

  const selectedRouter = routers.find(r => r.id === formData.routerId);
  const showPppSecretCheckbox = selectedRouter?.authMode === 'radius' && hasPppoeAccount && formData.connectionType === 'PPPOE';

  return (
    <div className="flex flex-col min-h-screen p-4 max-w-2xl mx-auto gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.push('/admin/pppoe/users')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc]">
            Registrasi Pelanggan Baru
          </h1>
          <p className="text-[10px] text-muted-foreground">PSB — Pasang Baru</p>
        </div>
      </div>

      {/* Wizard Steps Indicator */}
      <div className="flex items-center justify-center gap-1 flex-shrink-0 py-1">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <div className={`flex flex-col items-center ${wizardStep >= i + 1 ? '' : 'opacity-40'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${wizardStep > i + 1 ? 'bg-emerald-500 text-white' : wizardStep === i + 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                {wizardStep > i + 1 ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className="text-[9px] mt-1 text-muted-foreground hidden sm:block">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-8 h-0.5 mx-1 ${wizardStep > i + 1 ? 'bg-emerald-500' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <form onSubmit={handleSubmit} className="space-y-3 pb-2">

          {/* ════════ STEP 1: Data Pelanggan ════════ */}
          {wizardStep === 1 && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Identitas Pelanggan</p>
                <div>
                  <ModalLabel required>Nama Lengkap</ModalLabel>
                  <ModalInput type="text" value={formData.name} onChange={(e) => field('name', e.target.value)} placeholder="Sesuai KTP" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel required>No. HP / WhatsApp</ModalLabel>
                    <ModalInput type="tel" inputMode="numeric" value={formData.phone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="628123456789" />
                    {formWarnings.phone && <p className="text-[10px] text-amber-500 mt-1">{formWarnings.phone}</p>}
                  </div>
                  <div>
                    <ModalLabel>No. NIK (KTP)</ModalLabel>
                    <ModalInput type="text" inputMode="numeric" value={formData.idCardNumber} maxLength={16}
                      onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 16); field('idCardNumber', v); }}
                      placeholder="3201234567890123" />
                    {formWarnings.nik && <p className="text-[10px] text-amber-500 mt-1">{formWarnings.nik}</p>}
                  </div>
                </div>
                <div>
                  <ModalLabel>Email (opsional)</ModalLabel>
                  <ModalInput type="email" value={formData.email} onChange={(e) => field('email', e.target.value)} placeholder="email@contoh.com" />
                </div>
                <div>
                  <ModalLabel>Alamat</ModalLabel>
                  <textarea value={formData.address} onChange={(e) => field('address', e.target.value)} placeholder="Alamat lengkap pelanggan" rows={2}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
              </div>

              {/* Foto KTP — dengan kamera HP */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🪪 Foto KTP <span className="text-destructive">*</span></p>
                {formData.idCardPhoto ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={formData.idCardPhoto} alt="KTP" className="w-full max-w-xs h-32 object-cover rounded-lg border-2 border-emerald-500" />
                    <button type="button" onClick={() => field('idCardPhoto', '')}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600">
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-[10px] text-emerald-500 mt-1">✓ Foto KTP siap</p>
                  </div>
                ) : (
                  <>
                    {/* Camera capture — untuk HP */}
                    <input type="file" accept="image/*" capture="environment" onChange={handleUploadIdCard} disabled={uploadingIdCard} className="hidden" id="idCardCamera" />
                    <label htmlFor="idCardCamera" className={`w-full flex flex-col items-center justify-center gap-1 px-3 py-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-muted-foreground ${uploadingIdCard ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {uploadingIdCard ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                      <span className="text-xs font-medium">📷 Ambil Foto KTP / Pilih Gambar</span>
                      <span className="text-[10px] text-muted-foreground">Kamera HP atau upload dari galeri</span>
                    </label>
                  </>
                )}
              </div>

              {/* GPS Lokasi */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📍 Lokasi Pelanggan <span className="text-destructive">*</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <ModalLabel>Latitude</ModalLabel>
                    <ModalInput type="number" step="any" value={formData.latitude} onChange={(e) => field('latitude', e.target.value)} placeholder="-6.200000" />
                  </div>
                  <div>
                    <ModalLabel>Longitude</ModalLabel>
                    <ModalInput type="number" step="any" value={formData.longitude} onChange={(e) => field('longitude', e.target.value)} placeholder="106.816666" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (p) => setFormData(prev => ({ ...prev, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })),
                        async () => { await showError('Gagal mendapatkan GPS'); },
                        { enableHighAccuracy: true, timeout: 10000 }
                      );
                    }
                  }} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg">
                    <MapPin className="h-3.5 w-3.5" /> Pakai GPS Saya
                  </button>
                  <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg">
                    <Map className="h-3.5 w-3.5" /> Pilih di Peta
                  </button>
                </div>
              </div>

              {/* Foto Instalasi (opsional) */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📸 Foto Instalasi (opsional)</p>
                <input type="file" accept="image/*" capture="environment" onChange={handleUploadInstallation} disabled={uploadingInstallation || formData.installationPhotos.length >= 5} className="hidden" id="installUpload" />
                <label htmlFor="installUpload" className={`w-full block px-3 py-3 text-xs text-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-muted-foreground ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingInstallation ? <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Mengupload...</span> : '📸 Tambah Foto Instalasi'}
                </label>
                <p className="text-[10px] text-muted-foreground">Maks. 5 foto ({formData.installationPhotos.length}/5)</p>
                {formData.installationPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formData.installationPhotos.map((photo, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Instalasi ${i + 1}`} className="w-full h-16 object-cover rounded border" />
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, idx) => idx !== i) }))}
                          className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ STEP 2: Data Pembayaran ════════ */}
          {wizardStep === 2 && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Paket & Langganan</p>
                <div>
                  <ModalLabel required>Paket Internet</ModalLabel>
                  <ModalSelect value={formData.profileId} onChange={(e) => field('profileId', e.target.value)}>
                    <option value="">-- Pilih Paket --</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — Rp {p.price.toLocaleString('id-ID')}</option>)}
                  </ModalSelect>
                  {formData.profileId && (() => {
                    const p = profiles.find(x => x.id === formData.profileId);
                    if (!p) return null;
                    const discount = formData.discount ? parseInt(formData.discount) : 0;
                    const net = Math.max(0, p.price - discount);
                    return (
                      <div className="mt-2 text-xs">
                        {discount > 0 ? (
                          <div className="space-y-0.5">
                            <span className="text-muted-foreground line-through">Rp {p.price.toLocaleString('id-ID')}</span>
                            <span className="text-primary font-semibold ml-2">→ Rp {net.toLocaleString('id-ID')}/bln</span>
                          </div>
                        ) : (
                          <span className="text-primary font-semibold">💰 Rp {p.price.toLocaleString('id-ID')}/bulan</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2.5 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'POSTPAID' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
                    <input type="radio" name="subscriptionType" value="POSTPAID" checked={formData.subscriptionType === 'POSTPAID'} onChange={() => field('subscriptionType', 'POSTPAID')} className="w-3 h-3 accent-primary" />
                    <div><p className="text-[10px] font-semibold">📅 Postpaid</p><p className="text-[9px] text-muted-foreground">Pakai dulu, bayar nanti</p></div>
                  </label>
                  <label className={`flex items-center gap-2 p-2.5 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'PREPAID' ? 'border-purple-500 bg-purple-500/10' : 'border-border hover:border-purple-400/40'}`}>
                    <input type="radio" name="subscriptionType" value="PREPAID" checked={formData.subscriptionType === 'PREPAID'} onChange={() => field('subscriptionType', 'PREPAID')} className="w-3 h-3 accent-purple-500" />
                    <div><p className="text-[10px] font-semibold">🎫 Prepaid</p><p className="text-[9px] text-muted-foreground">Bayar dulu, langsung aktif</p></div>
                  </label>
                </div>
                {formData.subscriptionType === 'POSTPAID' && (
                  <div>
                    <ModalLabel>Tanggal Tagihan</ModalLabel>
                    <ModalSelect value={formData.billingDay} onChange={(e) => field('billingDay', e.target.value)}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(day => <option key={day} value={day}>Tanggal {day}</option>)}
                    </ModalSelect>
                  </div>
                )}
                {formData.subscriptionType === 'PREPAID' && (
                  <div>
                    <ModalLabel>Tanggal Expired (opsional)</ModalLabel>
                    <ModalInput type="date" value={formData.expiredAt ? formData.expiredAt.slice(0, 10) : ''} onChange={(e) => field('expiredAt', e.target.value)} />
                    <p className="text-[10px] text-muted-foreground mt-1">Kosongkan untuk hitung otomatis dari validitas paket.</p>
                  </div>
                )}
              </div>

              {/* Diskon */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">💰 Diskon (opsional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel>Nominal Diskon</ModalLabel>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                      <ModalInput type="number" min="0" value={formData.discount} onChange={(e) => field('discount', e.target.value)} placeholder="0" className="pl-8" />
                    </div>
                  </div>
                  <div>
                    <ModalLabel>Alasan Diskon</ModalLabel>
                    <ModalInput type="text" value={formData.discountNote} onChange={(e) => field('discountNote', e.target.value)} placeholder="Ketua RT, warga kurang mampu..." />
                  </div>
                </div>
              </div>

              {/* Tagihan Pertama */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">💳 Tagihan Pertama</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => { if (firstInvoice === 'none') setFirstInvoice('prorate'); }}
                    className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center ${firstInvoice !== 'none' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-muted/40 hover:border-emerald-400'}`}>
                    <span className="text-base">🏠</span>
                    <span className={`text-[9px] font-bold ${firstInvoice !== 'none' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>Bayar di Awal</span>
                    <span className="text-[8px] text-muted-foreground">Invoice dibuat saat pemasangan</span>
                  </button>
                  <button type="button" onClick={() => setFirstInvoice('none')}
                    className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center ${firstInvoice === 'none' ? 'border-border bg-muted' : 'border-border/40 bg-muted/30 hover:border-border'}`}>
                    <span className="text-base">⏰</span>
                    <span className="text-[9px] font-bold">Bayar Setelah Pemakaian</span>
                    <span className="text-[8px] text-muted-foreground">Dibuat otomatis oleh sistem</span>
                  </button>
                </div>
                {firstInvoice !== 'none' && formData.subscriptionType === 'POSTPAID' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className={`flex flex-col items-center p-2 border-2 rounded-lg cursor-pointer transition-all text-center ${firstInvoice === 'prorate' ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40' : 'border-border bg-background hover:border-emerald-400'}`}>
                      <input type="radio" name="firstInvoice" value="prorate" checked={firstInvoice === 'prorate'} onChange={() => setFirstInvoice('prorate')} className="sr-only" />
                      <span className="text-sm">📅</span>
                      <span className={`text-[9px] font-bold ${firstInvoice === 'prorate' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>Prorate</span>
                      {prorateInfo ? (
                        <>
                          <span className="text-[9px] font-bold text-emerald-600">Rp {prorateInfo.prorateAmount.toLocaleString('id-ID')}</span>
                          <span className="text-[8px] text-muted-foreground">{prorateInfo.daysActive} hari s/d tgl {prorateInfo.nextBilling.getDate()}</span>
                        </>
                      ) : <span className="text-[8px] text-muted-foreground">Pilih paket dulu</span>}
                    </label>
                    <label className={`flex flex-col items-center p-2 border-2 rounded-lg cursor-pointer transition-all text-center ${firstInvoice === 'full' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                      <input type="radio" name="firstInvoice" value="full" checked={firstInvoice === 'full'} onChange={() => setFirstInvoice('full')} className="sr-only" />
                      <span className="text-sm">💰</span>
                      <span className={`text-[9px] font-bold ${firstInvoice === 'full' ? 'text-primary' : ''}`}>Sebulan Penuh</span>
                      {prorateInfo ? <span className="text-[9px] font-bold">Rp {prorateInfo.fullPrice.toLocaleString('id-ID')}</span> : <span className="text-[8px] text-muted-foreground">1 bulan penuh</span>}
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ STEP 3: Data Secret ════════ */}
          {wizardStep === 3 && (
            <div className="space-y-3 animate-fade-in">
              {/* Tipe Koneksi */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tipe Koneksi</p>
                <div className={`rounded-xl border p-3 flex items-start gap-3 cursor-pointer transition-all select-none ${hasPppoeAccount ? 'border-primary/50 bg-primary/5' : 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20'}`}
                  onClick={() => setHasPppoeAccount(!hasPppoeAccount)}>
                  <div className={`mt-0.5 w-8 h-4 rounded-full flex-shrink-0 relative transition-colors ${hasPppoeAccount ? 'bg-primary' : 'bg-amber-400'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${hasPppoeAccount ? 'left-4' : 'left-0.5'}`} />
                  </div>
                  <div>
                    {hasPppoeAccount ? (
                      <>
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Wifi className="w-3 h-3" /> PPPoE</p>
                        <p className="text-[10px] text-muted-foreground">Login via PPPoE dengan username & password</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Tanpa PPPoE (IP Statis / MAC)</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500">Username di-generate otomatis</p>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <ModalLabel>Tipe Koneksi</ModalLabel>
                  <ModalSelect value={formData.connectionType} onChange={(e) => { field('connectionType', e.target.value as 'PPPOE' | 'STATIC_IP' | 'HOTSPOT'); if (e.target.value !== 'PPPOE') setHasPppoeAccount(false); else setHasPppoeAccount(true); }}>
                    <option value="PPPOE">PPPoE</option>
                    <option value="STATIC_IP">Static IP (ARP)</option>
                    <option value="HOTSPOT">Static IP (Hotspot Binding)</option>
                  </ModalSelect>
                </div>
              </div>

              {/* Kredensial */}
              {hasPppoeAccount && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Kredensial PPPoE</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModalLabel required>Username</ModalLabel>
                      <ModalInput type="text" value={formData.username} onChange={(e) => field('username', e.target.value.replace(/\s/g, ''))} placeholder="pppoe-username" />
                    </div>
                    <div>
                      <ModalLabel required>Password</ModalLabel>
                      <div className="relative">
                        <ModalInput type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => field('password', e.target.value)} placeholder="password" className="pr-8" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* IP Statis untuk non-PPPoE */}
              {(formData.connectionType === 'STATIC_IP' || formData.connectionType === 'HOTSPOT') && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">IP Address</p>
                  <div>
                    <ModalLabel required>IP Address Static</ModalLabel>
                    <ModalInput type="text" value={formData.ipAddress} onChange={(e) => field('ipAddress', e.target.value)} placeholder="192.168.60.100" />
                  </div>
                  <div>
                    <ModalLabel>MAC Address (opsional)</ModalLabel>
                    <ModalInput type="text" value={formData.macAddress} onChange={(e) => field('macAddress', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
                  </div>
                </div>
              )}

              {/* Jaringan */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Jaringan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel required>NAS / Router</ModalLabel>
                    <ModalSelect value={formData.routerId} onChange={(e) => field('routerId', e.target.value)}>
                      <option value="">-- Pilih Router --</option>
                      {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </ModalSelect>
                  </div>
                  <div>
                    <ModalLabel>Area</ModalLabel>
                    <ModalSelect value={formData.areaId} onChange={(e) => field('areaId', e.target.value)}>
                      <option value="">— Tanpa Area —</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </ModalSelect>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel>ODP (Reference)</ModalLabel>
                    <ModalInput type="text" value={formData.odp} onChange={(e) => field('odp', e.target.value)} placeholder="ODP-01-GRD" />
                  </div>
                  <div>
                    <ModalLabel>IP Statis PPPoE (opsional)</ModalLabel>
                    <ModalInput type="text" value={hasPppoeAccount ? formData.ipAddress : ''} onChange={(e) => field('ipAddress', e.target.value)} placeholder="Kosongkan jika dinamis" disabled={!hasPppoeAccount} />
                  </div>
                </div>
              </div>

              {/* PPP Secret Checkbox — conditional on router auth_mode */}
              {showPppSecretCheckbox && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-400/50 rounded-xl p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={createPppSecret} onChange={() => setCreatePppSecret(!createPppSecret)} className="w-4 h-4 accent-amber-500" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Buat PPP Secret di MikroTik</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">Router ini menggunakan mode RADIUS. Centang jika juga ingin membuat PPP Secret lokal di MikroTik.</p>
                    </div>
                  </label>
                </div>
              )}

              {/* Pengaturan Tambahan */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pengaturan Tambahan</p>
                <div>
                  <ModalLabel>⚡ Aksi Jatuh Tempo</ModalLabel>
                  <select value={formData.autoIsolationEnabled ? 'isolate' : 'keep'} onChange={(e) => field('autoIsolationEnabled', e.target.value === 'isolate')}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="isolate">ISOLIR INTERNET — isolir otomatis saat expired</option>
                    <option value="keep">TETAP TERHUBUNG — tidak isolir meski expired</option>
                  </select>
                </div>
                <div>
                  <ModalLabel>📅 Tanggal Pemasangan</ModalLabel>
                  <ModalInput type="date" value={formData.registeredAt} onChange={(e) => field('registeredAt', e.target.value)} />
                </div>
                <div>
                  <ModalLabel>Catatan (opsional)</ModalLabel>
                  <textarea value={formData.comment} onChange={(e) => field('comment', e.target.value)} placeholder="Catatan tambahan..." rows={2}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
              </div>

              {/* Konfirmasi */}
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-xs mb-1">
                  <CheckCircle className="h-4 w-4" /> Konfirmasi Pendaftaran
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  Semua data telah diisi. Klik "Daftarkan Pelanggan" untuk menyimpan ke sistem.
                </p>
              </div>
            </div>
          )}

      </form>
      </div>

      {/* Bottom Bar — Wizard Navigation */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-2 border-t border-border">
        <button type="button" onClick={() => setWizardStep(s => Math.max(1, s - 1))} disabled={wizardStep === 1}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
        </button>
        <div className="flex-1 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button key={i} type="button" onClick={() => setWizardStep(i + 1)}
              className={`h-2 rounded-full transition-all ${wizardStep === i + 1 ? 'bg-primary w-4' : i + 1 < wizardStep ? 'bg-emerald-500 w-2' : 'bg-border w-2'}`} />
          ))}
        </div>
        {wizardStep < STEPS.length ? (
          <button type="button" onClick={handleNext}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg">
            Berikutnya <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={() => handleSubmit()}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50 font-medium">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Daftarkan Pelanggan
          </button>
        )}
      </div>

      <MapPicker isOpen={showMapPicker} onClose={() => setShowMapPicker(false)}
        onSelect={(lat, lng) => { setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) })); setShowMapPicker(false); }}
        initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
        initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined} />
    </div>
  );
}
