'use client';

import { useEffect, useState } from 'react';
import { useToast, CyberToastProvider } from '@/components/cyberpunk/CyberToast';
import { UserPlus, Loader2, Wifi, CheckCircle, MapPin, Phone, Mail, Home, Package, FileText, Gift, CreditCard, Camera, X, Map } from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import { CameraPhotoInput } from '@/components/CameraPhotoInput';

export const dynamic = 'force-dynamic';

interface Profile {
  id: string;
  name: string;
  price: number;
  downloadSpeed: number;
  uploadSpeed: number;
  description: string | null;
}

interface Area {
  id: string;
  name: string;
}

function DaftarPageInner() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [companyName, setCompanyName] = useState('SALFANET RADIUS');
  const [poweredBy, setPoweredBy] = useState('SALFANET RADIUS');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    areaId: '',
    profileId: '',
    notes: '',
    referralCode: '',
    idCardNumber: '',
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [idCardPhoto, setIdCardPhoto] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  const { addToast } = useToast();

  useEffect(() => {
    loadCompanyName();
    loadProfiles();
    loadAreas();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setFormData(prev => ({ ...prev, referralCode: ref.toUpperCase() }));
  }, []);

  const loadCompanyName = async () => {
    try {
      const res = await fetch('/api/public/company');
      const data = await res.json();
      if (data.success && data.company.name) setCompanyName(data.company.name);
      if (data.success && data.company.poweredBy) setPoweredBy(data.company.poweredBy);
    } catch (error) { console.error('Load company error:', error); }
  };

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/public/profiles');
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (error) { console.error('Failed to load profiles:', error); }
    finally { setLoading(false); }
  };

  const loadAreas = async () => {
    try {
      const res = await fetch('/api/public/areas');
      const data = await res.json();
      setAreas(data.areas || []);
    } catch (error) { console.error('Failed to load areas:', error); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.address || !formData.profileId) {
      addToast({ type: 'error', title: 'Form Tidak Lengkap', description: 'Mohon lengkapi semua field yang wajib diisi' });
      return;
    }
    if (!formData.idCardNumber || formData.idCardNumber.trim().length < 16) {
      addToast({ type: 'error', title: 'Nomor KTP Wajib', description: 'Mohon masukkan nomor KTP (16 digit)' });
      return;
    }
    if (!idCardPhoto) {
      addToast({ type: 'error', title: 'Foto KTP Wajib', description: 'Mohon upload foto KTP Anda' });
      return;
    }
    if (!formData.latitude || !formData.longitude) {
      addToast({ type: 'error', title: 'Lokasi Diperlukan', description: 'Mohon pilih lokasi GPS Anda di peta' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, idCardPhoto }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        addToast({ type: 'error', title: 'Gagal', description: data.error || 'Gagal mengirim pendaftaran' });
      }
    } catch (error) {
      addToast({ type: 'error', title: 'Error', description: 'Gagal mengirim pendaftaran' });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProfile = profiles.find((p) => p.id === formData.profileId);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 drop-shadow-[0_0_20px_rgba(6,182,212,0.6)] relative z-10" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>

        <div className="relative z-10 bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-green-500/50 p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(0,255,136,0.3)]">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-green-500/50 shadow-[0_0_30px_rgba(0,255,136,0.4)]">
            <CheckCircle className="w-8 h-8 text-green-500 drop-shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-green-500 to-brand-500 bg-clip-text text-transparent mb-2">
            Pendaftaran Berhasil!
          </h2>
          <p className="text-sm text-muted-foreground/80 mb-6">
            Terima kasih telah mendaftar. Tim kami akan segera menghubungi Anda.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              setFormData({ name: '', phone: '', email: '', address: '', areaId: '', profileId: '', notes: '', referralCode: '', idCardNumber: '', latitude: null, longitude: null });
              setIdCardPhoto('');
            }}
            className="w-full px-4 py-3 bg-gradient-to-r from-violet-500 to-brand-500 hover:from-violet-600 hover:to-brand-600 text-white text-sm font-bold rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(139,92,246,0.4)] hover:shadow-[0_0_30px_rgba(139,92,246,0.6)]"
          >
            Daftar Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted relative py-6 px-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-lg mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-brand-500 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.5)] mb-4">
            <Wifi className="w-8 h-8 text-white " />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-500 via-white to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]">
            {companyName}
          </h1>
          <p className="text-sm text-muted-foreground/80 mt-1">Daftar Layanan Internet</p>
        </div>

        {/* Form Card */}
        <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-violet-500/30 p-5 shadow-[0_0_50px_rgba(139,92,246,0.2)]">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 bg-violet-500/20 rounded-lg border border-violet-500/30 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-violet-500 drop-shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
            </div>
            <h2 className="text-base font-bold text-white">Formulir Pendaftaran</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Info Section */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-8 h-[1px] bg-gradient-to-r from-brand-500 to-transparent"></span>
                Informasi Pribadi
              </p>

              {/* Name */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-brand-500" />
                  Nama Lengkap <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nama lengkap Anda"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand-500" />
                  Nomor WhatsApp <span className="text-pink-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none"
                  required
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">Untuk komunikasi</p>
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-500" />
                  Email
                </label>
                <input
                  type="email"
                  placeholder="email@example.com (opsional)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none"
                />
              </div>

              {/* Address */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Home className="w-3.5 h-3.5 text-brand-500" />
                  Alamat Lengkap <span className="text-pink-500">*</span>
                </label>
                <textarea
                  placeholder="Jalan, RT/RW, Kelurahan, Kecamatan"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none resize-none"
                  rows={2}
                  required
                />
              </div>

              {/* Area */}
              {areas.length > 0 && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                    <Map className="w-3.5 h-3.5 text-brand-500" />
                    Area / Zona Layanan
                  </label>
                  <select
                    value={formData.areaId}
                    onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-card">-- Pilih area layanan (opsional) --</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id} className="bg-card">{area.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Pilih area jika tersedia untuk mempercepat proses</p>
                </div>
              )}

              {/* GPS Location */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-500" />
                  Lokasi GPS <span className="text-pink-500">*</span>
                </label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Auto GPS Button */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!navigator.geolocation) {
                        addToast({ type: 'error', title: 'GPS Tidak Didukung', description: 'Browser Anda tidak mendukung GPS' });
                          return;
                        }

                        setSubmitting(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setFormData({
                              ...formData,
                              latitude: position.coords.latitude,
                              longitude: position.coords.longitude,
                            });
                            addToast({ type: 'success', title: 'Berhasil!', description: 'Lokasi GPS berhasil didapatkan' });
                            setSubmitting(false);
                          },
                          (error) => {
                            let errorMsg = 'Gagal mendapatkan lokasi GPS';
                            if (error.code === 1) errorMsg = 'Akses lokasi ditolak. Mohon aktifkan izin lokasi di browser Anda.';
                            else if (error.code === 2) errorMsg = 'Lokasi tidak tersedia';
                            else if (error.code === 3) errorMsg = 'Timeout mendapatkan lokasi';
                            addToast({ type: 'error', title: 'GPS Error', description: errorMsg });
                            setSubmitting(false);
                          },
                          {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0,
                          }
                        );
                      }}
                      disabled={submitting}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold bg-gradient-to-r from-violet-500 to-brand-500 hover:from-violet-600 hover:to-brand-600 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                    >
                      {submitting ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengambil...</>
                      ) : (
                        <><MapPin className="w-3.5 h-3.5" />📍 Otomatis</>
                      )}
                    </button>

                    {/* Manual GPS Button */}
                    <button
                      type="button"
                      onClick={() => setMapPickerOpen(true)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold border-2 border-brand-500 text-brand-500 hover:bg-brand-500/10 rounded-xl transition-all"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      🗺️ Manual
                    </button>
                  </div>

                  {formData.latitude && formData.longitude && (
                    <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl">
                      <p className="text-xs text-green-500 font-bold flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Lokasi GPS Tersimpan
                      </p>
                      <p className="text-[10px] text-brand-500 mt-1 font-mono">
                        📍 Lat: {formData.latitude.toFixed(6)}, Lng: {formData.longitude.toFixed(6)}
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                  💡 Pilih "Otomatis" untuk GPS real-time atau "Manual" untuk pilih di peta
                </p>
              </div>
            </div>

            {/* Package Selection Section */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-8 h-[1px] bg-gradient-to-r from-brand-500 to-transparent"></span>
                Pilih Paket
              </p>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Package className="w-3.5 h-3.5 text-brand-500" />
                  Paket Internet <span className="text-pink-500">*</span>
                </label>
                <select
                  value={formData.profileId}
                  onChange={(e) => setFormData({ ...formData, profileId: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none appearance-none cursor-pointer"
                  required
                >
                  <option value="" className="bg-card">Pilih paket internet</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id} className="bg-card">
                      {profile.name} - {formatCurrency(profile.price)}/bln
                    </option>
                  ))}
                </select>
              </div>

              {selectedProfile && (
                <div className="bg-gradient-to-br from-violet-500/20 to-brand-500/20 p-4 rounded-xl border border-violet-500/30">
                  <h4 className="text-xs font-bold text-brand-500 mb-2 uppercase tracking-wide">Detail Paket</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground/70">Paket:</span>
                      <span className="font-bold text-white">{selectedProfile.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground/70">Harga:</span>
                      <span className="font-bold text-green-500 text-base">{formatCurrency(selectedProfile.price)}/bln</span>
                    </div>
                    {selectedProfile.description && (
                      <p className="pt-2 border-t border-violet-500/20 text-muted-foreground/80 text-xs">{selectedProfile.description}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ID Card Section */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest flex items-center gap-2">
                <span className="w-8 h-[1px] bg-gradient-to-r from-brand-500 to-transparent"></span>
                Dokumen Identitas (Wajib)
              </p>

              {/* KTP Number */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-brand-500" />
                  Nomor KTP <span className="text-pink-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="16 digit nomor KTP"
                  value={formData.idCardNumber}
                  onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                  maxLength={16}
                  required
                  className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none font-mono tracking-widest"
                />
              </div>

              {/* KTP Photo */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Camera className="w-3.5 h-3.5 text-brand-500" />
                  Foto KTP <span className="text-pink-500">*</span>
                </label>
                <CameraPhotoInput
                  photoUrl={idCardPhoto}
                  onRemove={() => setIdCardPhoto('')}
                  uploading={uploadingPhoto}
                  onUploadFile={async (file) => {
                    setUploadingPhoto(true);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      const res = await fetch('/api/public/upload-registration', { method: 'POST', body: fd });
                      const data = await res.json();
                      if (data.success) {
                        setIdCardPhoto(data.url);
                        return data.url;
                      }
                      addToast({ type: 'error', title: 'Upload Gagal', description: data.error || 'Gagal upload foto KTP' });
                      return null;
                    } catch {
                      addToast({ type: 'error', title: 'Upload Gagal', description: 'Gagal upload foto KTP' });
                      return null;
                    } finally {
                      setUploadingPhoto(false);
                    }
                  }}
                  onGpsCapture={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                  theme="dark"
                  hint="JPG/PNG/WebP, maks. 3MB"
                  previewClassName="h-32"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <FileText className="w-3.5 h-3.5 text-brand-500" />
                Catatan (Opsional)
              </label>
              <textarea
                placeholder="Catatan atau permintaan khusus"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none resize-none"
                rows={2}
              />
            </div>

            {/* Referral Code */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <Gift className="w-3.5 h-3.5 text-brand-500" />
                Kode Referral (Opsional)
              </label>
              <input
                type="text"
                placeholder="Masukkan kode referral (jika ada)"
                value={formData.referralCode}
                onChange={(e) => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
                maxLength={10}
                className="w-full px-3 py-2.5 text-sm bg-card border-2 border-violet-500/30 rounded-xl text-white placeholder-muted-foreground/40 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all outline-none font-mono tracking-widest uppercase"
              />
              {formData.referralCode && (
                <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Bonus saldo akan diberikan setelah aktivasi!
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-brand-500 hover:from-violet-600 hover:to-brand-600 disabled:from-gray-600 disabled:to-gray-600 text-white text-sm font-bold rounded-xl transition-all duration-300 shadow-[0_0_25px_rgba(139,92,246,0.4)] hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] disabled:shadow-none"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Mengirim...</>
              ) : (
                <><UserPlus className="w-4 h-4" />Kirim Pendaftaran</>
              )}
            </button>

            <p className="text-[10px] text-center text-muted-foreground/60">
              Dengan mendaftar, Anda menyetujui syarat dan ketentuan layanan
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          Powered by <span className="text-brand-500">{poweredBy}</span>
        </p>
      </div>

      <MapPicker
        isOpen={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        onSelect={(lat, lng) => {
          setFormData({ ...formData, latitude: lat, longitude: lng });
          setMapPickerOpen(false);
        }}
        initialLat={formData.latitude || undefined}
        initialLng={formData.longitude || undefined}
      />
    </div>
  );
}

export default function DaftarPage() {
  return (
    <CyberToastProvider>
      <DaftarPageInner />
    </CyberToastProvider>
  );
}
