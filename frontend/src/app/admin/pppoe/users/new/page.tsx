'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { ArrowLeft, MapPin, Map, Eye, EyeOff, Loader2, X, ChevronRight, ChevronLeft, Wifi, WifiOff } from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import { ModalInput, ModalSelect, ModalLabel } from '@/components/cyberpunk';

interface Profile { id: string; name: string; groupName: string; price: number; }
interface Router { id: string; name: string; nasname: string; ipAddress: string; }
interface Area { id: string; name: string; }

const TABS = [
  { id: 'radius', label: 'Akun RADIUS', icon: '📡' },
  { id: 'pelanggan', label: 'Data Pelanggan', icon: '👤' },
  { id: 'instalasi', label: 'Instalasi', icon: '🔧' },
  { id: 'pengaturan', label: 'Pengaturan', icon: '⚙️' },
];

export default function NewPppoeUserPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);
  const [hasPppoeAccount, setHasPppoeAccount] = useState(true);
  const [firstInvoice, setFirstInvoice] = useState<'none' | 'prorate' | 'full'>('prorate');

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
    registeredAt: new Date().toISOString().slice(0, 10),
    autoIsolationEnabled: true,
  });

  useEffect(() => {
    Promise.all([
      fetch('/api/pppoe/profiles').then(r => r.json()),
      fetch('/api/network/routers').then(r => r.json()),
      fetch('/api/pppoe/areas').then(r => r.json()),
    ]).then(([profilesData, routersData, areasData]) => {
      setProfiles(profilesData.profiles || []);
      setRouters(routersData.routers || []);
      setAreas(areasData.areas || []);
    }).catch(console.error);
  }, []);

  const handleUploadIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIdCard(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('type', 'id_card');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) setFormData(prev => ({ ...prev, idCardPhoto: data.url }));
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
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, data.url] }));
      else await showError('Gagal upload foto instalasi');
    } catch { await showError('Gagal upload foto instalasi'); }
    finally { setUploadingInstallation(false); }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.profileId) { await showError('Paket harus dipilih'); setActiveTab(0); return; }
    if (!formData.name) { await showError('Nama pelanggan wajib diisi'); setActiveTab(1); return; }
    if (!formData.phone) { await showError('No. telepon wajib diisi'); setActiveTab(1); return; }
    if (hasPppoeAccount && !formData.username) { await showError('Username PPPoE wajib diisi'); setActiveTab(0); return; }
    if (hasPppoeAccount && !formData.password) { await showError('Password PPPoE wajib diisi'); setActiveTab(0); return; }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        username: hasPppoeAccount ? formData.username : '',
        password: hasPppoeAccount ? formData.password : '',
        noPppoeAccount: !hasPppoeAccount,
        firstInvoice,
        ...(formData.expiredAt && {
          expiredAt: (() => {
            const raw = formData.expiredAt;
            const normalized = raw.length === 16 ? raw + ':00' : raw;
            const d = new Date(normalized);
            return isNaN(d.getTime()) ? undefined : d.toISOString();
          })()
        }),
      };
      const res = await fetch('/api/pppoe/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        await showSuccess('Pelanggan berhasil ditambahkan');
        router.push('/admin/pppoe/users');
      } else {
        await showError(data.error || 'Gagal menyimpan pelanggan');
      }
    } catch { await showError('Gagal menyimpan pelanggan'); }
    finally { setSaving(false); }
  };

  const field = (key: keyof typeof formData, val: string | boolean) => {
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      // Auto-reset firstInvoice when subscriptionType changes
      if (key === 'subscriptionType') {
        setFirstInvoice(val === 'PREPAID' ? 'full' : 'prorate');
      }
      return next;
    });
  };

  const tabDone = [
    !!formData.profileId && (hasPppoeAccount ? !!(formData.username && formData.password) : true),
    !!(formData.name && formData.phone),
    true,
    true,
  ];

  const prorateInfo = useMemo(() => {
    if (formData.subscriptionType !== 'POSTPAID') return null;
    const profile = profiles.find(p => p.id === formData.profileId);
    if (!profile) return null;
    const billingDay = parseInt(formData.billingDay) || 1;
    const today = formData.registeredAt ? new Date(formData.registeredAt + 'T00:00:00') : new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear(); const month = today.getMonth(); const currentDay = today.getDate();
    let nextBilling: Date;
    if (currentDay < billingDay) { nextBilling = new Date(year, month, billingDay); }
    else { nextBilling = new Date(year, month + 1, billingDay); }
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysActive = Math.max(1, Math.ceil((nextBilling.getTime() - today.getTime()) / msPerDay));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prorateAmount = Math.ceil((daysActive / daysInMonth) * profile.price);
    return { daysActive, daysInMonth, nextBilling, prorateAmount, fullPrice: profile.price, profileName: profile.name, isFullMonth: daysActive >= daysInMonth };
  }, [formData.subscriptionType, formData.profileId, formData.billingDay, formData.registeredAt, profiles]);

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
            Tambah Pelanggan
          </h1>
          <p className="text-[10px] text-muted-foreground">PPPoE / IP Statis / MAC</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 flex-shrink-0">
        {TABS.map((tab, i) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(i)}
            className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded-lg text-[10px] font-medium transition-all ${activeTab === i ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <span className="text-sm leading-none mb-0.5">{tab.icon}</span>
            <span className="leading-none hidden sm:block">{tab.label}</span>
            {tabDone[i] && activeTab !== i && <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-3 pb-2">

          {/* ── TAB 0: Akun RADIUS ─────────────────────────────────── */}
          {activeTab === 0 && (
            <>
              <div className={`rounded-xl border p-3 flex items-start gap-3 cursor-pointer transition-all select-none ${hasPppoeAccount ? 'border-primary/50 bg-primary/5' : 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20'}`}
                onClick={() => setHasPppoeAccount(!hasPppoeAccount)}>
                <div className={`mt-0.5 w-8 h-4 rounded-full flex-shrink-0 relative transition-colors ${hasPppoeAccount ? 'bg-primary' : 'bg-amber-400'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${hasPppoeAccount ? 'left-4' : 'left-0.5'}`} />
                </div>
                <div>
                  {hasPppoeAccount ? (
                    <>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Wifi className="w-3 h-3" /> Punya Akun PPPoE</p>
                      <p className="text-[10px] text-muted-foreground">Login ke router via PPPoE dengan username &amp; password</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Tanpa Akun PPPoE (IP Statis / MAC)</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">Username RADIUS di-generate otomatis. Cocok untuk pelanggan IP statis atau MAC-based.</p>
                    </>
                  )}
                </div>
              </div>

              {hasPppoeAccount && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Kredensial PPPoE</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModalLabel required>Username</ModalLabel>
                      <ModalInput type="text" value={formData.username} onChange={(e) => field('username', e.target.value)} placeholder="pppoe-username" />
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

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Paket &amp; Langganan</p>
                <div>
                  <ModalLabel required>Paket Internet</ModalLabel>
                  <ModalSelect value={formData.profileId} onChange={(e) => field('profileId', e.target.value)}>
                    <option value="">-- Pilih Paket --</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name} — Rp {p.price.toLocaleString('id-ID')}</option>)}
                  </ModalSelect>
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
                  <div className="space-y-2">
                    <div>
                      <ModalLabel>Tanggal Tagihan</ModalLabel>
                      <ModalSelect value={formData.billingDay} onChange={(e) => field('billingDay', e.target.value)}>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(day => <option key={day} value={day}>Tanggal {day}</option>)}
                      </ModalSelect>
                    </div>
                    {/* Tagihan Pertama — selalu tampil (tidak perlu profile dulu) */}
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">💳 Tagihan Pertama</p>
                      {/* Langkah 1: kapan bayar */}
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        <button
                          type="button"
                          onClick={() => { if (firstInvoice === 'none') setFirstInvoice('prorate'); }}
                          className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center w-full ${firstInvoice !== 'none' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-muted/40 hover:border-emerald-400'}`}
                        >
                          <span className="text-base">🏠</span>
                          <span className={`text-[9px] font-bold ${firstInvoice !== 'none' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>Bayar di Awal</span>
                          <span className="text-[8px] text-muted-foreground leading-tight">Invoice dibuat saat pemasangan</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFirstInvoice('none')}
                          className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center w-full ${firstInvoice === 'none' ? 'border-border bg-muted' : 'border-border/40 bg-muted/30 hover:border-border'}`}
                        >
                          <span className="text-base">⏰</span>
                          <span className="text-[9px] font-bold">Bayar Setelah Pemakaian</span>
                          <span className="text-[8px] text-muted-foreground leading-tight">Dibuat otomatis oleh sistem</span>
                        </button>
                      </div>
                      {/* Langkah 2: jika bayar di awal, pilih metode */}
                      {firstInvoice !== 'none' && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
                          <p className="text-[9px] font-semibold text-muted-foreground mb-1.5">Metode Perhitungan Tagihan:</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className={`flex flex-col items-center p-2 border-2 rounded-lg cursor-pointer transition-all text-center ${firstInvoice === 'prorate' ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40' : 'border-border bg-background hover:border-emerald-400'}`}>
                              <input type="radio" name="firstInvoice" value="prorate" checked={firstInvoice === 'prorate'} onChange={() => setFirstInvoice('prorate')} className="sr-only" />
                              <span className="text-sm mb-0.5">📅</span>
                              <span className={`text-[9px] font-bold ${firstInvoice === 'prorate' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>Prorate</span>
                              {prorateInfo ? (
                                <>
                                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Rp {prorateInfo.prorateAmount.toLocaleString('id-ID')}</span>
                                  <span className="text-[8px] text-muted-foreground leading-tight">{prorateInfo.daysActive} hari s/d tgl {prorateInfo.nextBilling.getDate()}</span>
                                </>
                              ) : (
                                <span className="text-[8px] text-muted-foreground leading-tight">Bayar sesuai hari pakai</span>
                              )}
                            </label>
                            <label className={`flex flex-col items-center p-2 border-2 rounded-lg cursor-pointer transition-all text-center ${firstInvoice === 'full' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'}`}>
                              <input type="radio" name="firstInvoice" value="full" checked={firstInvoice === 'full'} onChange={() => setFirstInvoice('full')} className="sr-only" />
                              <span className="text-sm mb-0.5">💰</span>
                              <span className={`text-[9px] font-bold ${firstInvoice === 'full' ? 'text-primary' : ''}`}>Sebulan Penuh</span>
                              {prorateInfo ? (
                                <span className="text-[9px] font-bold">Rp {prorateInfo.fullPrice.toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-[8px] text-muted-foreground leading-tight">Bayar 1 bulan penuh</span>
                              )}
                            </label>
                          </div>
                          {!prorateInfo && (
                            <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1.5">⚠️ Pilih profil paket untuk melihat estimasi tagihan</p>
                          )}
                          <p className="text-[9px] text-muted-foreground mt-1.5">
                            ℹ️ Invoice <span className="font-semibold">PENDING</span> dibuat saat simpan — bisa dibayar via portal pelanggan.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {formData.subscriptionType === 'PREPAID' && (
                  <div className="space-y-2">
                    <div>
                      <ModalLabel>Tanggal Expired</ModalLabel>
                      <ModalInput type="date" value={formData.expiredAt ? formData.expiredAt.slice(0, 10) : ''} onChange={(e) => field('expiredAt', e.target.value)} />
                      <p className="text-[10px] text-muted-foreground mt-1">Kosongkan untuk hitung otomatis dari validitas paket.</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">💳 Tagihan Pertama</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFirstInvoice('full')}
                          className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center w-full ${firstInvoice !== 'none' ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' : 'border-border/40 bg-muted/30 hover:border-purple-400'}`}
                        >
                          <span className="text-base">🏠</span>
                          <span className={`text-[9px] font-bold ${firstInvoice !== 'none' ? 'text-purple-700 dark:text-purple-300' : ''}`}>Bayar di Awal Pemasangan</span>
                          {profiles.find(p => p.id === formData.profileId) ? (
                            <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400">
                              Rp {profiles.find(p => p.id === formData.profileId)!.price.toLocaleString('id-ID')}
                            </span>
                          ) : (
                            <span className="text-[8px] text-muted-foreground">Invoice dibuat saat pemasangan</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFirstInvoice('none')}
                          className={`flex flex-col items-center gap-0.5 p-2.5 border-2 rounded-xl cursor-pointer transition-all text-center w-full ${firstInvoice === 'none' ? 'border-border bg-muted' : 'border-border/40 bg-muted/30 hover:border-border'}`}
                        >
                          <span className="text-base">⏰</span>
                          <span className="text-[9px] font-bold">Bayar Setelah Pemakaian</span>
                          <span className="text-[8px] text-muted-foreground leading-tight">Tagihan dibuat manual nanti</span>
                        </button>
                      </div>
                      {firstInvoice !== 'none' && (
                        <p className="text-[9px] text-muted-foreground mt-1.5">
                          ℹ️ Invoice <span className="font-semibold">PENDING</span> dibuat saat simpan — bisa dibayar via portal pelanggan.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Jaringan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel>IP Statis</ModalLabel>
                    <ModalInput type="text" value={formData.ipAddress} onChange={(e) => field('ipAddress', e.target.value)} placeholder="Kosongkan jika dinamis" />
                  </div>
                  <div>
                    <ModalLabel>NAS / Router</ModalLabel>
                    <ModalSelect value={formData.routerId} onChange={(e) => field('routerId', e.target.value)}>
                      <option value="">— Otomatis —</option>
                      {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </ModalSelect>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── TAB 1: Data Pelanggan ───────────────────────────────── */}
          {activeTab === 1 && (
            <>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Identitas</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel required>Nama Lengkap</ModalLabel>
                    <ModalInput type="text" value={formData.name} onChange={(e) => field('name', e.target.value)} placeholder="Sesuai KTP" />
                  </div>
                  <div>
                    <ModalLabel required>No. Telepon</ModalLabel>
                    <ModalInput type="text" value={formData.phone} onChange={(e) => field('phone', e.target.value)} placeholder="08xxxxxxxxxx" />
                  </div>
                </div>
                <div>
                  <ModalLabel>Email</ModalLabel>
                  <ModalInput type="email" value={formData.email} onChange={(e) => field('email', e.target.value)} placeholder="email@contoh.com" />
                </div>
                <div>
                  <ModalLabel>Alamat</ModalLabel>
                  <textarea value={formData.address} onChange={(e) => field('address', e.target.value)} placeholder="Alamat lengkap pelanggan" rows={2}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🪪 Dokumen KTP (opsional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel>No. NIK</ModalLabel>
                    <ModalInput type="text" value={formData.idCardNumber} onChange={(e) => field('idCardNumber', e.target.value)} placeholder="3201234567890123" maxLength={16} />
                  </div>
                  <div>
                    <ModalLabel>Foto KTP</ModalLabel>
                    <input type="file" accept="image/*" onChange={handleUploadIdCard} disabled={uploadingIdCard} className="hidden" id="idCardUpload" />
                    <label htmlFor="idCardUpload" className={`w-full flex items-center justify-center px-3 py-2 text-xs border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-muted-foreground ${uploadingIdCard ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {uploadingIdCard ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Upload...</span> : '📎 Upload KTP'}
                    </label>
                  </div>
                </div>
                {formData.idCardPhoto && (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={formData.idCardPhoto} alt="KTP" className="w-full h-24 object-cover rounded border border-border" />
                    <button type="button" onClick={() => field('idCardPhoto', '')} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── TAB 2: Instalasi ───────────────────────────────────── */}
          {activeTab === 2 && (
            <>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Perangkat</p>
                <div>
                  <ModalLabel>MAC Address / Serial Number</ModalLabel>
                  <ModalInput type="text" value={formData.macAddress} onChange={(e) => field('macAddress', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF atau Serial" />
                  <p className="text-[10px] text-muted-foreground mt-1">Untuk autentikasi MAC-based atau identifikasi perangkat.</p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📸 Foto Instalasi (opsional)</p>
                <input type="file" accept="image/*" onChange={handleUploadInstallation} disabled={uploadingInstallation} className="hidden" id="installUpload" />
                <label htmlFor="installUpload" className={`w-full block px-3 py-3 text-xs text-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-muted-foreground ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {uploadingInstallation ? <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Mengupload...</span> : '📸 Tambah Foto Instalasi'}
                </label>
                <p className="text-[10px] text-muted-foreground">Maks. 5 foto @ 5MB ({formData.installationPhotos.length}/5)</p>
                {formData.installationPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formData.installationPhotos.map((photo, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Instalasi ${i + 1}`} className="w-full h-16 object-cover rounded border" />
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, idx) => idx !== i) }))}
                          className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📍 Lokasi GPS (opsional)</p>
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
                    <MapPin className="h-3.5 w-3.5" /> Lokasi Saya
                  </button>
                  <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg">
                    <Map className="h-3.5 w-3.5" /> Pilih di Map
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── TAB 3: Pengaturan ──────────────────────────────────── */}
          {activeTab === 3 && (
            <>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pengaturan Akun</p>
                <div>
                  <ModalLabel>Area</ModalLabel>
                  <ModalSelect value={formData.areaId} onChange={(e) => field('areaId', e.target.value)}>
                    <option value="">— Tanpa Area —</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel>⚡ Aksi Jatuh Tempo</ModalLabel>
                  <select value={formData.autoIsolationEnabled ? 'isolate' : 'keep'} onChange={(e) => field('autoIsolationEnabled', e.target.value === 'isolate')}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="isolate">ISOLIR INTERNET (Suspend) — isolir otomatis saat expired</option>
                    <option value="keep">TETAP TERHUBUNG (No Action) — tidak isolir meski expired</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">Tindakan otomatis saat tanggal tagihan / expired terlewati.</p>
                </div>
                <div>
                  <ModalLabel>📅 Tanggal Daftar</ModalLabel>
                  <ModalInput type="date" value={formData.registeredAt} onChange={(e) => field('registeredAt', e.target.value)} />
                  <p className="text-[10px] text-muted-foreground mt-1">Default hari ini. Ubah untuk data historis pelanggan lama.</p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Catatan</p>
                <textarea value={formData.comment} onChange={(e) => field('comment', e.target.value)}
                  placeholder="Catatan tambahan untuk pelanggan ini..." rows={3}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>
            </>
          )}

        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-2 border-t border-border">
        <button type="button" onClick={() => setActiveTab(t => Math.max(0, t - 1))} disabled={activeTab === 0}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
        </button>
        <div className="flex-1 flex justify-center gap-1.5">
          {TABS.map((_, i) => (
            <button key={i} type="button" onClick={() => setActiveTab(i)}
              className={`h-2 rounded-full transition-all ${activeTab === i ? 'bg-primary w-4' : tabDone[i] ? 'bg-emerald-500 w-2' : 'bg-border w-2'}`} />
          ))}
        </div>
        {activeTab < TABS.length - 1 ? (
          <button type="button" onClick={() => setActiveTab(t => Math.min(TABS.length - 1, t + 1))}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg">
            Berikutnya <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="button" disabled={saving} onClick={() => handleSubmit()}
            className="inline-flex items-center gap-1 px-4 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50 font-medium">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Simpan Pelanggan
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