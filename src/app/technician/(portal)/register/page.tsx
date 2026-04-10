'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import {
  UserPlus, User, Phone, Mail, MapPin, Package, FileText, Loader2,
  CheckCircle, AlertCircle, Wifi, ChevronDown, Key, Globe, Calendar,
  Hash, Monitor, CreditCard, Camera, X, Gift,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { CameraPhotoInput } from '@/components/CameraPhotoInput';

interface Profile {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  price: number;
  description: string | null;
}

interface Router {
  id: string;
  name: string;
  nasname: string;
}

interface Area {
  id: string;
  name: string;
}

function formatSpeed(kbps: number) {
  return kbps >= 1000 ? `${kbps / 1000} Mbps` : `${kbps} Kbps`;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

export default function TechnicianRegisterPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ customerId: string; name: string; username: string } | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'network'>('basic');
  const [uploadingKtp, setUploadingKtp] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    referralCode: '',
    profileId: '',
    routerId: '',
    areaId: '',
    subscriptionType: 'POSTPAID',
    billingDay: '1',
    ipAddress: '',
    macAddress: '',
    comment: '',
    idCardNumber: '',
    idCardPhoto: '',
    installationPhotos: [] as string[],
  });

  useEffect(() => {
    fetch('/api/technician/form-data')
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles ?? []);
        setRouters(d.routers ?? []);
        setAreas(d.areas ?? []);
      })
      .catch(() => addToast({ type: 'error', title: 'Gagal memuat data form' }))
      .finally(() => setLoadingData(false));
  }, [addToast]);

  function setValue(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim()) { setActiveTab('basic'); return setError('Username wajib diisi'); }
    if (!form.password.trim()) { setActiveTab('basic'); return setError('Password wajib diisi'); }
    if (form.password.length < 6) { setActiveTab('basic'); return setError('Password minimal 6 karakter'); }
    if (!form.profileId) { setActiveTab('network'); return setError('Pilih paket internet terlebih dahulu'); }
    if (!form.name.trim()) { setActiveTab('basic'); return setError('Nama pelanggan wajib diisi'); }
    if (!form.phone.trim()) { setActiveTab('basic'); return setError('Nomor HP wajib diisi'); }

    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, string | number | string[]> = {
        username: form.username.trim(),
        password: form.password,
        profileId: form.profileId,
        name: form.name.trim(),
        phone: form.phone.trim(),
        subscriptionType: form.subscriptionType,
        billingDay: parseInt(form.billingDay) || 1,
      };
      if (form.email.trim()) body.email = form.email.trim();
      if (form.address.trim()) body.address = form.address.trim();
      if (form.referralCode.trim()) body.referralCode = form.referralCode.trim();
      if (form.routerId) body.routerId = form.routerId;
      if (form.areaId) body.areaId = form.areaId;
      if (form.ipAddress.trim()) body.ipAddress = form.ipAddress.trim();
      if (form.macAddress.trim()) body.macAddress = form.macAddress.trim();
      if (form.comment.trim()) body.comment = form.comment.trim();
      if (form.idCardNumber.trim()) body.idCardNumber = form.idCardNumber.trim();
      if (form.idCardPhoto.trim()) body.idCardPhoto = form.idCardPhoto.trim();
      if (form.installationPhotos.length > 0) body.installationPhotos = form.installationPhotos;

      const res = await fetch('/api/technician/customers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Gagal membuat pelanggan');
      }
      setSuccess({ customerId: data.user?.customerId ?? '', name: form.name, username: form.username });
      addToast({ type: 'success', title: 'Berhasil', description: `Pelanggan ${form.name} berhasil dibuat` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setError(msg);
      addToast({ type: 'error', title: 'Gagal', description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setForm({
      username: '', password: '', name: '', phone: '', email: '', address: '',
      referralCode: '', profileId: '', routerId: '', areaId: '', subscriptionType: 'POSTPAID',
      billingDay: '1', ipAddress: '', macAddress: '', comment: '', idCardNumber: '', idCardPhoto: '',
      installationPhotos: [],
    });
    setSuccess(null);
    setError('');
    setActiveTab('basic');
  }

  if (success) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-lg mx-auto mt-4">
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-green-200 dark:border-green-500/30 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Pelanggan Berhasil Dibuat</h2>
            <p className="text-sm text-slate-500 dark:text-[#e0d0ff]/60 mb-2">
              <span className="font-semibold text-slate-700 dark:text-white">{success.name}</span> telah berhasil didaftarkan ke sistem
            </p>
            <div className="flex flex-col gap-1 mb-4">
              <p className="text-xs font-mono text-[#bc13fe] bg-[#bc13fe]/10 px-3 py-1.5 rounded-lg inline-block">
                ID: {success.customerId}
              </p>
              <p className="text-xs font-mono text-[#00f7ff] bg-[#00f7ff]/10 px-3 py-1.5 rounded-lg inline-block">
                Username: {success.username}
              </p>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mb-6">
              Pelanggan aktif dan siap digunakan. RADIUS telah disinkronkan.
            </p>
            <button
              onClick={handleReset}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all"
            >
              Daftar Pelanggan Baru
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#bc13fe]/60 focus:ring-1 focus:ring-[#bc13fe]/30';
  const selectClass = 'w-full pl-9 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#00f7ff]/60 focus:ring-1 focus:ring-[#00f7ff]/30 appearance-none';
  const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5';

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#bc13fe]" />
            {t('techPortal.register')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mt-0.5">
            Tambah pelanggan baru langsung ke sistem PPPoE
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'basic'
                ? 'bg-white dark:bg-[#bc13fe]/20 text-slate-900 dark:text-white shadow-sm dark:shadow-[0_0_10px_rgba(188,19,254,0.3)] border border-slate-200 dark:border-[#bc13fe]/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Informasi Dasar
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('network')}
            className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'network'
                ? 'bg-white dark:bg-[#00f7ff]/20 text-slate-900 dark:text-white shadow-sm dark:shadow-[0_0_10px_rgba(0,247,255,0.3)] border border-slate-200 dark:border-[#00f7ff]/40'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" />
              Paket & Dokumen
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: Informasi Dasar */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              {/* Section: Account */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#bc13fe]" />
                  Akun PPPoE
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Username PPPoE <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.username} onChange={(e) => setValue('username', e.target.value)} placeholder="contoh: user001" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Password <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.password} onChange={(e) => setValue('password', e.target.value)} placeholder="Minimal 6 karakter" className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Personal Info */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#bc13fe]" />
                  Informasi Pelanggan
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Nama Lengkap <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.name} onChange={(e) => setValue('name', e.target.value)} placeholder="Masukkan nama lengkap pelanggan" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Nomor HP / WhatsApp <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="tel" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} placeholder="08xxxxxxxxxx" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Email <span className="text-slate-400 text-[10px]">(opsional)</span></label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="email" value={form.email} onChange={(e) => setValue('email', e.target.value)} placeholder="email@contoh.com" className={inputClass} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Alamat Lengkap <span className="text-slate-400 text-[10px]">(opsional)</span></label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
                      <textarea rows={2} value={form.address} onChange={(e) => setValue('address', e.target.value)} placeholder="Masukkan alamat lengkap pelanggan" className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Kode Referral <span className="text-slate-400 text-[10px]">(opsional)</span></label>
                    <div className="relative">
                      <Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.referralCode} onChange={(e) => setValue('referralCode', e.target.value)} placeholder="Masukkan kode referral jika ada" className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Next button */}
              <button
                type="button"
                onClick={() => setActiveTab('network')}
                className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-white font-semibold text-sm rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                Selanjutnya: Paket &amp; Dokumen
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          )}

          {/* TAB 2: Paket & Dokumen */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              {/* Section: Package & Network */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-[#00f7ff]" />
                  Paket & Jaringan
                </h2>
                {loadingData ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memuat data...
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Paket Internet <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <select value={form.profileId} onChange={(e) => setValue('profileId', e.target.value)} className={selectClass}>
                          <option value="">-- Pilih Paket Internet --</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {formatSpeed(p.downloadSpeed)}/{formatSpeed(p.uploadSpeed)} — {formatIDR(p.price)}/bln
                            </option>
                          ))}
                        </select>
                      </div>
                      {form.profileId && (() => {
                        const selected = profiles.find((p) => p.id === form.profileId);
                        if (!selected) return null;
                        return (
                          <div className="mt-2 px-4 py-3 bg-[#00f7ff]/5 dark:bg-[#00f7ff]/10 border border-[#00f7ff]/20 rounded-xl">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold text-[#00f7ff]">{selected.name}</span>
                              <span className="text-sm font-bold text-slate-700 dark:text-white">{formatIDR(selected.price)}/bln</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span>↓ {formatSpeed(selected.downloadSpeed)}</span>
                              <span>↑ {formatSpeed(selected.uploadSpeed)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className={labelClass}>Router <span className="text-slate-400 text-[10px]">(opsional)</span></label>
                      <div className="relative">
                        <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <select value={form.routerId} onChange={(e) => setValue('routerId', e.target.value)} className={selectClass}>
                          <option value="">-- Pilih Router --</option>
                          {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Area <span className="text-slate-400 text-[10px]">(opsional)</span></label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <select value={form.areaId} onChange={(e) => setValue('areaId', e.target.value)} className={selectClass}>
                          <option value="">-- Pilih Area --</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section: Billing */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#bc13fe]" />
                  Pengaturan Billing
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Tipe Langganan</label>
                    <div className="flex gap-3">
                      {['POSTPAID', 'PREPAID'].map((type) => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="subscriptionType"
                            value={type}
                            checked={form.subscriptionType === type}
                            onChange={(e) => setValue('subscriptionType', e.target.value)}
                            className="w-4 h-4 text-[#bc13fe] focus:ring-[#bc13fe]/50 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                          />
                          <span className="text-sm text-slate-700 dark:text-white">{type === 'POSTPAID' ? 'Pascabayar' : 'Prabayar'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {form.subscriptionType === 'POSTPAID' && (
                    <div>
                      <label className={labelClass}>Tanggal Tagihan</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="number" min="1" max="31" value={form.billingDay} onChange={(e) => setValue('billingDay', e.target.value)} className={inputClass} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section: KTP Document */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#bc13fe]" />
                  Dokumen Identitas (KTP) <span className="text-slate-400 text-[10px] font-normal">(opsional)</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>No. NIK KTP</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.idCardNumber} onChange={(e) => setValue('idCardNumber', e.target.value)} placeholder="3201234567890123" maxLength={16} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Foto KTP</label>
                    <CameraPhotoInput
                      photoUrl={form.idCardPhoto}
                      onRemove={() => setForm((f) => ({ ...f, idCardPhoto: '' }))}
                      uploading={uploadingKtp}
                      onUploadFile={async (file) => {
                        setUploadingKtp(true);
                        try {
                          const fd = new FormData();
                          fd.append('file', file);
                          fd.append('type', 'idCard');
                          const res = await fetch('/api/upload/pppoe-customer', { method: 'POST', body: fd });
                          const result = await res.json();
                          if (result.success) { setForm((f) => ({ ...f, idCardPhoto: result.url })); return result.url; }
                          addToast({ type: 'error', title: result.error || 'Upload KTP gagal' }); return null;
                        } catch { addToast({ type: 'error', title: 'Upload KTP gagal' }); return null; }
                        finally { setUploadingKtp(false); }
                      }}
                      theme="light"
                      hint="Format: JPG/PNG/WebP, maks. 5MB"
                    />
                  </div>

                  {/* Foto Instalasi */}
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Foto Instalasi</label>
                    <div className="space-y-2">
                      {/* Grid foto yang sudah diupload */}
                      {form.installationPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {form.installationPhotos.map((photo, index) => (
                            <div key={index} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photo} alt={`Instalasi ${index + 1}`} className="w-full h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
                              <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, installationPhotos: f.installationPhotos.filter((_, i) => i !== index) }))}
                                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Tombol tambah foto */}
                      <CameraPhotoInput
                        photoUrl=""
                        onRemove={() => {}}
                        uploading={uploadingInstallation}
                        onUploadFile={async (file) => {
                          setUploadingInstallation(true);
                          try {
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('type', 'installation');
                            const res = await fetch('/api/upload/pppoe-customer', { method: 'POST', body: fd });
                            const result = await res.json();
                            if (result.success) {
                              setForm((f) => ({ ...f, installationPhotos: [...f.installationPhotos, result.url] }));
                              return result.url;
                            }
                            addToast({ type: 'error', title: result.error || 'Upload foto instalasi gagal' }); return null;
                          } catch { addToast({ type: 'error', title: 'Upload foto instalasi gagal' }); return null; }
                          finally { setUploadingInstallation(false); }
                        }}
                        onGpsCapture={(lat, lng) => setForm((f) => ({ ...f }))}
                        theme="light"
                        hint="Bisa tambah beberapa foto. Maks. 5MB per foto. Kamera HP otomatis mengambil GPS."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Advanced (Optional) */}
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5">
                <h2 className="text-sm font-bold text-slate-700 dark:text-[#e0d0ff] mb-4 flex items-center gap-2">
                  <Hash className="w-4 h-4 text-[#00f7ff]" />
                  Pengaturan Lanjutan <span className="text-slate-400 text-[10px] font-normal">(opsional)</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Static IP Address</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.ipAddress} onChange={(e) => setValue('ipAddress', e.target.value)} placeholder="Contoh: 10.0.0.100" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>MAC Address</label>
                    <div className="relative">
                      <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="text" value={form.macAddress} onChange={(e) => setValue('macAddress', e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className={inputClass} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Catatan</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
                      <textarea rows={2} value={form.comment} onChange={(e) => setValue('comment', e.target.value)} placeholder="Catatan khusus untuk pelanggan ini (opsional)" className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white font-bold text-sm rounded-xl hover:opacity-90 disabled:opacity-70 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Membuat Pelanggan...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Buat Pelanggan Baru
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
