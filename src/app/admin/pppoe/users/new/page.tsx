'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { showSuccess, showError } from '@/lib/sweetalert';
import { ArrowLeft, MapPin, Map, Eye, EyeOff, Loader2, X } from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import {
  ModalInput, ModalSelect, ModalLabel,
} from '@/components/cyberpunk';

interface Profile { id: string; name: string; groupName: string; price: number; }
interface Router { id: string; name: string; nasname: string; ipAddress: string; }
interface Area { id: string; name: string; }

export default function NewPppoeUserPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [uploadingInstallation, setUploadingInstallation] = useState(false);

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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'id_card');
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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'installation');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) setFormData(prev => ({ ...prev, installationPhotos: [...prev.installationPhotos, data.url] }));
      else await showError('Gagal upload foto instalasi');
    } catch { await showError('Gagal upload foto instalasi'); }
    finally { setUploadingInstallation(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        ...(formData.expiredAt && {
          expiredAt: (() => {
            // datetime-local gives YYYY-MM-DDTHH:mm (16 chars) — no seconds, invalid ISO
            // Normalize by appending :00 if needed, then convert as WIB end-of-day
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
        await showSuccess('User PPPoE berhasil ditambahkan');
        router.push('/admin/pppoe/users');
      } else {
        await showError(data.error || 'Gagal menyimpan user PPPoE');
      }
    } catch { await showError('Gagal menyimpan user PPPoE'); }
    finally { setSaving(false); }
  };

  const field = (key: keyof typeof formData, val: string | boolean) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/pppoe/users')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </button>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent">
            Tambah User PPPoE
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Buat akun pelanggan PPPoE baru</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Akun RADIUS */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">Akun RADIUS</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <ModalLabel required>Username</ModalLabel>
              <ModalInput
                type="text"
                value={formData.username}
                onChange={(e) => field('username', e.target.value)}
                placeholder="pppoe-username"
                required
              />
            </div>
            <div>
              <ModalLabel required>Password</ModalLabel>
              <div className="relative">
                <ModalInput
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => field('password', e.target.value)}
                  placeholder="password"
                  required
                  className="pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <ModalLabel required>Paket</ModalLabel>
            <ModalSelect value={formData.profileId} onChange={(e) => field('profileId', e.target.value)} required>
              <option value="">-- Pilih Paket --</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} - Rp {p.price.toLocaleString('id-ID')}</option>
              ))}
            </ModalSelect>
          </div>

          <div>
            <ModalLabel>NAS / Router</ModalLabel>
            <ModalSelect value={formData.routerId} onChange={(e) => field('routerId', e.target.value)}>
              <option value="">— Pilih NAS (opsional) —</option>
              {routers.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.ipAddress})</option>
              ))}
            </ModalSelect>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <ModalLabel>IP Statis</ModalLabel>
              <ModalInput
                type="text"
                value={formData.ipAddress}
                onChange={(e) => field('ipAddress', e.target.value)}
                placeholder="Kosongkan jika dinamis"
              />
            </div>
            <div>
              <ModalLabel required>Tipe Langganan</ModalLabel>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-center p-2.5 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'POSTPAID' ? 'border-primary bg-primary/10 dark:border-[#00f7ff] dark:bg-[#00f7ff]/10' : 'border-border hover:border-primary/50'}`}>
                  <input type="radio" name="subscriptionType" value="POSTPAID" checked={formData.subscriptionType === 'POSTPAID'} onChange={() => field('subscriptionType', 'POSTPAID')} className="w-3 h-3 accent-primary" />
                  <div className="ml-1.5">
                    <div className="text-[10px] font-medium">📅 Postpaid</div>
                    <div className="text-[9px] text-muted-foreground">Tagihan bulanan</div>
                  </div>
                </label>
                <label className={`flex items-center p-2.5 border-2 rounded-lg cursor-pointer transition-all ${formData.subscriptionType === 'PREPAID' ? 'border-primary bg-primary/10 dark:border-[#bc13fe] dark:bg-[#bc13fe]/10' : 'border-border hover:border-primary/50'}`}>
                  <input type="radio" name="subscriptionType" value="PREPAID" checked={formData.subscriptionType === 'PREPAID'} onChange={() => field('subscriptionType', 'PREPAID')} className="w-3 h-3 accent-primary" />
                  <div className="ml-1.5">
                    <div className="text-[10px] font-medium">🎫 Prepaid</div>
                    <div className="text-[9px] text-muted-foreground">Bayar di muka</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div>
            <ModalLabel>Expired At (Auto-calculated)</ModalLabel>
            <ModalInput
              type="date"
              value={formData.expiredAt ? formData.expiredAt.slice(0, 10) : ''}
              onChange={(e) => field('expiredAt', e.target.value)}
            />
            {(() => {
              const profile = profiles.find(p => p.id === formData.profileId);
              if (profile) {
                const now = new Date();
                const expDate = new Date(now);
                expDate.setMonth(expDate.getMonth() + 1);
                return (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    📅 {expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · 30 hari dari sekarang
                  </p>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Data Network & Teknis */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">Data Network &amp; Teknis</h2>

          <div>
            <ModalLabel>Alamat Instalasi</ModalLabel>
            <ModalInput
              type="text"
              value={formData.address}
              onChange={(e) => field('address', e.target.value)}
              placeholder="Alamat lengkap lokasi instalasi CPE"
            />
          </div>

          <div>
            <ModalLabel>MAC/SN</ModalLabel>
            <ModalInput
              type="text"
              value={formData.macAddress}
              onChange={(e) => field('macAddress', e.target.value)}
              placeholder="00:11:22:33:44:55 atau Serial Number"
            />
          </div>

          {/* Foto Instalasi */}
          <div>
            <ModalLabel>Foto Instalasi</ModalLabel>
            <input type="file" accept="image/*" onChange={handleUploadInstallation} disabled={uploadingInstallation} className="hidden" id="installUpload" />
            <label htmlFor="installUpload" className={`w-full block px-3 py-4 text-xs text-center border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-muted-foreground ${uploadingInstallation ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {uploadingInstallation ? <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Mengupload...</span> : '📸 Tambah Foto Instalasi'}
            </label>
            <p className="text-[10px] text-muted-foreground mt-1">Max 5 file @ 5MB each ({formData.installationPhotos.length}/5)</p>
            {formData.installationPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {formData.installationPhotos.map((photo, i) => (
                  <div key={i} className="relative">
                    <img src={photo} alt={`Instalasi ${i + 1}`} className="w-full h-20 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, installationPhotos: prev.installationPhotos.filter((_, idx) => idx !== i) }))}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GPS */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <ModalLabel>Latitude</ModalLabel>
                <ModalInput
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => field('latitude', e.target.value)}
                  placeholder="-6.200000"
                />
              </div>
              <div>
                <ModalLabel>Longitude</ModalLabel>
                <ModalInput
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => field('longitude', e.target.value)}
                  placeholder="106.816666"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={async () => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (p) => {
                        setFormData(prev => ({
                          ...prev,
                          latitude: p.coords.latitude.toFixed(6),
                          longitude: p.coords.longitude.toFixed(6),
                        }));
                      },
                      async () => { await showError('Gagal mendapatkan GPS'); },
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                <MapPin className="h-3.5 w-3.5" /> Lokasi Saya
              </button>
              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary hover:bg-primary/90 text-white rounded-lg"
              >
                <Map className="h-3.5 w-3.5" /> Pilih di Map
              </button>
            </div>
          </div>

          {/* Assign ke Agent */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="assignToAgent"
              className="w-3.5 h-3.5 accent-primary"
            />
            <label htmlFor="assignToAgent" className="text-xs cursor-pointer">
              Assign ke Agent <span className="text-[10px] text-muted-foreground">(opsional — untuk tracking komisi reseller)</span>
            </label>
          </div>
        </div>

        {/* Tombol aksi */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/pppoe/users')}
            className="px-5 py-2 text-xs border border-border rounded-lg hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-5 py-2 text-xs bg-primary hover:bg-primary/90 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
            Simpan &amp; Sync RADIUS
          </button>
        </div>
      </form>

      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={(lat, lng) => {
          setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
          setShowMapPicker(false);
        }}
        initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
        initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
      />
    </div>
  );
}
