'use client';
import { showSuccess, showError, showWarning } from '@/lib/sweetalert';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, ShoppingCart, Loader2, CheckCircle, Zap, Clock, Phone, User, ChevronLeft, Mail, Bell } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  sellingPrice: number;
  downloadSpeed: number;
  uploadSpeed: number;
  validityValue: number;
  validityUnit: string;
  eVoucherAccess: boolean;
}

export default function EVoucherPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', notificationMethod: 'both' });
  const [poweredBy, setPoweredBy] = useState('SALFANET RADIUS');

  useEffect(() => { loadProfiles(); loadCompanySettings(); }, []);

  const loadCompanySettings = async () => {
    try {
      const res = await fetch('/api/company');
      if (res.ok) {
        const data = await res.json();
        if (data.poweredBy) setPoweredBy(data.poweredBy);
      }
    } catch (error) { console.error('Load company error:', error); }
  };

  const loadProfiles = async () => {
    try {
      const res = await fetch('/api/evoucher/profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch (error) { console.error('Load profiles error:', error); }
    finally { setLoading(false); }
  };

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) { await showWarning('Silakan pilih paket terlebih dahulu'); return; }

    setPurchasing(true);
    try {
      const res = await fetch('/api/evoucher/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          profileId: selectedProfile.id, 
          customerName: formData.name, 
          customerPhone: formData.phone,
          customerEmail: formData.email,
          notificationMethod: formData.notificationMethod,
          quantity: 1 
        }),
      });

      const data = await res.json();
      if (res.ok) router.push(data.order.paymentLink);
      else await showError(data.error || 'Gagal membuat pesanan');
    } catch (error) {
      await showError('Gagal membuat pesanan. Silakan coba lagi.');
    } finally { setPurchasing(false); }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatValidity = (value: number, unit: string) => {
    const unitMap: { [key: string]: string } = { MINUTES: 'Menit', HOURS: 'Jam', DAYS: 'Hari', MONTHS: 'Bulan' };
    return `${value} ${unitMap[unit] || unit}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a0f35] flex items-center justify-center relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#bc13fe]/35 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ff44cc]/25 rounded-full blur-[100px]" />
          <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[60%] h-[60%] bg-[#00f7ff]/15 rounded-full blur-[150px]" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.8)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a0f35] flex flex-col p-4 relative overflow-hidden">
      {/* Cyberpunk Background Effects - Neon Purple Theme */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#bc13fe]/35 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ff44cc]/25 rounded-full blur-[100px]" />
        <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[60%] h-[60%] bg-[#00f7ff]/15 rounded-full blur-[150px]" />
        {/* Grid pattern - Purple tint */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.1)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>
      
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 mb-5 relative z-10">
        {/* Title Section */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#281441]/80 border-2 border-[#bc13fe]/50 rounded-xl shadow-[0_0_40px_rgba(188,19,254,0.5)] mb-3 backdrop-blur-md">
            <Wifi className="w-7 h-7 text-[#bc13fe] drop-shadow-[0_0_15px_rgba(188,19,254,0.9)]" />
          </div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] drop-shadow-[0_0_25px_rgba(188,19,254,0.6)]">Beli Voucher WiFi</h1>
          <p className="text-sm text-[#e0d0ff]/80 tracking-wide">Pilih paket sesuai kebutuhan Anda</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Packages */}
          <div className="lg:col-span-2">
            <h2 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] to-white mb-4 flex items-center gap-2 drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]">
              <Zap className="w-5 h-5 text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]" />
              Paket Tersedia
            </h2>
            
            {profiles.length === 0 ? (
              <div className="bg-[#281441]/50 backdrop-blur-md border-2 border-dashed border-[#bc13fe]/40 rounded-lg p-6 text-center">
                <Wifi className="w-8 h-8 text-[#bc13fe]/60 mx-auto mb-2" />
                <p className="text-sm text-[#e0d0ff]/60">Belum ada paket tersedia</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => setSelectedProfile(profile)}
                    className={`bg-card/80 backdrop-blur-xl rounded-lg p-4 cursor-pointer transition-all ${
                      selectedProfile?.id === profile.id 
                        ? 'border-2 border-[#00f7ff] shadow-[0_0_30px_rgba(0,247,255,0.4)]' 
                        : 'border-2 border-[#bc13fe]/30 hover:border-[#00f7ff]/50 hover:shadow-[0_0_20px_rgba(0,247,255,0.2)]'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#00f7ff]/10 text-[#00f7ff] border border-[#00f7ff]/50 text-[11px] font-semibold rounded-md mb-2 shadow-[0_0_8px_rgba(0,247,255,0.3)]">
                          <Clock className="w-3 h-3" />
                          {formatValidity(profile.validityValue, profile.validityUnit)}
                        </span>
                        <h3 className="text-base font-bold text-white line-clamp-1 mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{profile.name}</h3>
                        <div className="flex items-center text-xs text-[#e0d0ff]/80 mt-1">
                          <Clock className="w-3.5 h-3.5 mr-1 text-[#00f7ff] drop-shadow-[0_0_6px_rgba(0,247,255,0.6)]" />
                          {formatValidity(profile.validityValue, profile.validityUnit)}
                        </div>
                      </div>
                      {selectedProfile?.id === profile.id && (
                        <CheckCircle className="w-5 h-5 text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]" />
                      )}
                    </div>
                    <div className="pt-3 border-t border-[#bc13fe]/30 flex justify-between items-center">
                      <div>
                        <p className="text-[11px] text-[#e0d0ff]/60 font-medium uppercase tracking-wider">Harga</p>
                        <p className="text-base font-bold text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.6)]">{formatCurrency(profile.sellingPrice)}</p>
                      </div>
                      <button className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                        selectedProfile?.id === profile.id 
                          ? 'bg-[#00f7ff] text-black shadow-[0_0_20px_rgba(0,247,255,0.6)]' 
                          : 'border-2 border-[#00f7ff]/50 text-[#00f7ff] hover:border-[#00f7ff] hover:bg-[#00f7ff]/10 hover:shadow-[0_0_15px_rgba(0,247,255,0.4)]'
                      }`}>
                        {selectedProfile?.id === profile.id ? 'Dipilih' : 'Pilih'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Form */}
          <div>
            <div className="bg-card/80 backdrop-blur-xl border-2 border-[#bc13fe]/30 rounded-lg shadow-[0_0_30px_rgba(188,19,254,0.15)] sticky top-4">
              <div className="p-4 border-b-2 border-[#bc13fe]/30">
                <h3 className="flex items-center gap-2 text-base font-bold text-[#bc13fe] drop-shadow-[0_0_8px_rgba(188,19,254,0.6)]">
                  <ShoppingCart className="w-5 h-5 text-[#bc13fe] drop-shadow-[0_0_8px_rgba(188,19,254,0.8)]" />
                  Ringkasan Pesanan
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {selectedProfile ? (
                  <div className="bg-[#bc13fe]/10 border-2 border-[#bc13fe]/30 rounded-lg p-3 shadow-[0_0_15px_rgba(188,19,254,0.2)]">
                    <p className="text-xs font-bold text-[#00f7ff] uppercase mb-2 tracking-wider drop-shadow-[0_0_6px_rgba(0,247,255,0.6)]">Paket Dipilih</p>
                    <p className="text-base font-bold text-white mb-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{selectedProfile.name}</p>
                    <p className="text-xs text-[#e0d0ff]/80">
                      {formatValidity(selectedProfile.validityValue, selectedProfile.validityUnit)}
                    </p>
                    <div className="pt-3 mt-3 border-t-2 border-[#bc13fe]/30 flex justify-between items-baseline">
                      <span className="text-xs text-[#00f7ff] font-semibold uppercase tracking-wide drop-shadow-[0_0_6px_rgba(0,247,255,0.5)]">Total Bayar</span>
                      <span className="text-xl font-bold text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.8)]">{formatCurrency(selectedProfile.sellingPrice)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card/50 border-2 border-dashed border-[#bc13fe]/30 rounded-lg p-5 text-center">
                    <Wifi className="w-8 h-8 text-[#bc13fe]/60 mx-auto mb-2" />
                    <p className="text-sm text-[#e0d0ff]/60 font-medium">Pilih paket terlebih dahulu</p>
                  </div>
                )}

                <form onSubmit={handlePurchase} className="space-y-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#00f7ff] mb-2 uppercase tracking-wide drop-shadow-[0_0_6px_rgba(0,247,255,0.5)]">
                      <User className="w-3.5 h-3.5 text-[#00f7ff]" /> Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Masukkan nama Anda"
                      className="w-full px-3 py-2 text-sm border-2 border-[#bc13fe]/30 rounded-lg bg-card/50 text-white placeholder:text-[#e0d0ff]/40 focus:ring-2 focus:ring-[#00f7ff] focus:border-[#00f7ff] focus:shadow-[0_0_10px_rgba(0,247,255,0.3)] transition"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#00f7ff] mb-2 uppercase tracking-wide drop-shadow-[0_0_6px_rgba(0,247,255,0.5)]">
                      <Bell className="w-3.5 h-3.5 text-[#00f7ff]" /> Kirim Notifikasi Melalui
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="whatsapp"
                          checked={formData.notificationMethod === 'whatsapp'}
                          onChange={(e) => setFormData({ ...formData, notificationMethod: e.target.value })}
                          className="w-3.5 h-3.5 text-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]"
                        />
                        <span className="text-xs text-[#e0d0ff]/80">WhatsApp saja</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="email"
                          checked={formData.notificationMethod === 'email'}
                          onChange={(e) => setFormData({ ...formData, notificationMethod: e.target.value })}
                          className="w-3.5 h-3.5 text-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]"
                        />
                        <span className="text-xs text-[#e0d0ff]/80">Email saja</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="both"
                          checked={formData.notificationMethod === 'both'}
                          onChange={(e) => setFormData({ ...formData, notificationMethod: e.target.value })}
                          className="w-3.5 h-3.5 text-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]"
                        />
                        <span className="text-xs text-[#e0d0ff]/80">WhatsApp & Email</span>
                      </label>
                    </div>
                  </div>

                  {(formData.notificationMethod === 'whatsapp' || formData.notificationMethod === 'both') && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#00f7ff] mb-2 uppercase tracking-wide drop-shadow-[0_0_6px_rgba(0,247,255,0.5)]">
                        <Phone className="w-3.5 h-3.5 text-[#00f7ff]" /> Nomor WhatsApp *
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        placeholder="08123456789"
                        className="w-full px-3 py-2 text-sm border-2 border-[#bc13fe]/30 rounded-lg bg-card/50 text-white placeholder:text-[#e0d0ff]/40 focus:ring-2 focus:ring-[#00f7ff] focus:border-[#00f7ff] focus:shadow-[0_0_10px_rgba(0,247,255,0.3)] transition"
                      />
                    </div>
                  )}

                  {(formData.notificationMethod === 'email' || formData.notificationMethod === 'both') && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[#00f7ff] mb-2 uppercase tracking-wide drop-shadow-[0_0_6px_rgba(0,247,255,0.5)]">
                        <Mail className="w-3.5 h-3.5 text-[#00f7ff]" /> Email *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        placeholder="email@contoh.com"
                        className="w-full px-3 py-2 text-sm border-2 border-[#bc13fe]/30 rounded-lg bg-card/50 text-white placeholder:text-[#e0d0ff]/40 focus:ring-2 focus:ring-[#00f7ff] focus:border-[#00f7ff] focus:shadow-[0_0_10px_rgba(0,247,255,0.3)] transition"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedProfile || purchasing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00f7ff] hover:bg-[#00f7ff]/90 disabled:bg-[#bc13fe]/20 disabled:cursor-not-allowed disabled:shadow-none disabled:text-[#e0d0ff]/40 text-black font-bold rounded-lg transition-all shadow-[0_0_20px_rgba(0,247,255,0.5)] hover:shadow-[0_0_30px_rgba(0,247,255,0.7)] text-sm"
                  >
                    {purchasing ? (
                      <><Loader2 className="w-5 h-5 animate-spin" />Memproses...</>
                    ) : (
                      <><ShoppingCart className="w-5 h-5" />Beli Sekarang</>
                    )}
                  </button>

                  <p className="text-xs text-center text-[#e0d0ff]/60 font-medium">
                    Dengan melanjutkan, Anda menyetujui syarat & ketentuan
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 py-4 border-t border-primary/30">
        <p className="text-center text-[10px] text-gray-500">Powered by {poweredBy}</p>
      </div>
    </div>
  );
}
