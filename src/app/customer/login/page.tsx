'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Shield, Smartphone, Lock, ArrowRight, Loader2, ChevronLeft, Wifi, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function CustomerLoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expiresIn, setExpiresIn] = useState(5);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [footerText, setFooterText] = useState('');
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [otpSendFailed, setOtpSendFailed] = useState(false);
  const [userDataForBypass, setUserDataForBypass] = useState<any>(null);

  useEffect(() => {
    // If already logged in as customer, redirect to customer portal
    const existingToken = localStorage.getItem('customer_token');
    if (existingToken) {
      router.replace('/customer');
      return;
    }

    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company.name) {
          setCompanyName(data.company.name);
        }
        if (data.success && data.company.logo) {
          setCompanyLogo(data.company.logo);
        }
        if (data.success && data.company.footerCustomer) {
          setFooterText(data.company.footerCustomer);
        } else if (data.success && data.company.poweredBy) {
          setFooterText(`Powered by ${data.company.poweredBy}`);
        }
      })
      .catch(err => console.error('Load company name error:', err))
      .finally(() => setBrandLoaded(true));
  }, [router]);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const checkRes = await fetch('/api/customer/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });

      const checkData = await checkRes.json();

      if (!checkData.success) {
        setError(checkData.error || 'Nomor tidak terdaftar');
        setLoading(false);
        return;
      }

      if (!checkData.requireOTP) {
        localStorage.setItem('customer_token', checkData.token);
        localStorage.setItem('customer_user', JSON.stringify(checkData.user));
        router.push('/customer');
        return;
      }

      const userPhone = checkData.user?.phone || identifier;
      setUserDataForBypass({ phone: userPhone, user: checkData.user });

      const res = await fetch('/api/customer/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: userPhone }),
      });

      const data = await res.json();

      if (data.success) {
        setPhone(userPhone);
        setExpiresIn(data.expiresIn || 5);
        setStep('otp');
        setOtpSendFailed(false);
      } else {
        setError(data.error || 'Gagal mengirim OTP. Layanan WhatsApp mungkin sedang tidak tersedia.');
        setOtpSendFailed(true);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otpCode: otp }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('customer_token', data.token);
        localStorage.setItem('customer_user', JSON.stringify(data.user));
        router.push('/customer');
      } else {
        setError(data.error || 'Kode OTP salah');
      }
    } catch (err: any) {
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setOtp('');
    setError('');
  };

  if (!brandLoaded) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-slate-950 transition-colors duration-300">
      {/* ── Left Panel: Login Form ── */}
      <div className="flex items-start justify-center w-full lg:w-[420px] min-h-screen bg-white dark:bg-slate-800 shadow-xl dark:shadow-slate-900/50 px-8 pt-14 pb-10 flex-shrink-0 relative">

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300 transition-all shadow-sm"
          title={isDark ? 'Mode Terang' : 'Mode Gelap'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-500" />}
        </button>

        <div className="w-full max-w-[320px]">

          {/* Logo */}
          <div className="flex justify-center mb-5">
            {companyLogo ? (
              <div className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 shadow-sm">
                <Image unoptimized src={companyLogo} alt={companyName} width={120} height={48} className="max-h-12 max-w-[120px] w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/25">
                <Shield className="w-7 h-7 text-white" />
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold mb-6">
            {step === 'otp' ? 'Verifikasi Kode OTP' : 'Portal Pelanggan'}
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                  placeholder="08123456789 atau ID Pelanggan"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 -mt-1">
                Nomor WhatsApp terdaftar atau ID Pelanggan 8 digit
              </p>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
                ) : (
                  <>Masuk<ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              {otpSendFailed && userDataForBypass && (
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const bypassRes = await fetch('/api/customer/auth/bypass-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: userDataForBypass.phone }),
                      });
                      const bypassData = await bypassRes.json();
                      if (bypassData.success) {
                        localStorage.setItem('customer_token', bypassData.token);
                        localStorage.setItem('customer_user', JSON.stringify(bypassData.user));
                        router.push('/customer');
                      } else {
                        setError(bypassData.error || 'Login gagal');
                      }
                    } catch {
                      setError('Terjadi kesalahan saat login');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Emergency Bypass (Tanpa OTP)
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
                <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <input
                  type="text"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  className="flex-1 px-4 py-4 text-center text-xl font-mono tracking-widest bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
                  placeholder="000000"
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <p className="text-xs text-center text-gray-400 dark:text-slate-500">
                Kode dikirim ke <strong className="text-blue-600 dark:text-blue-400">{identifier}</strong>
                <br />Berlaku {expiresIn} menit
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={loading}
                  className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 text-gray-700 dark:text-slate-300 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />Kembali
                </button>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Memverifikasi...</> : 'Verifikasi'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                disabled={loading}
                className="w-full text-xs text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                Kirim Ulang Kode
              </button>
            </form>
          )}

          {/* Register Buttons */}
          {step === 'phone' && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs text-center text-gray-400 dark:text-slate-500 mb-3 uppercase tracking-wider font-medium">Pendaftaran Baru</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/daftar')}
                  className="py-2.5 px-3 bg-gray-50 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-all"
                >
                  Daftar Pelanggan
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/agent')}
                  className="py-2.5 px-3 bg-gray-50 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-all"
                >
                  Daftar Agen
                </button>
              </div>
              <button
                type="button"
                onClick={() => router.push('/evoucher')}
                className="w-full mt-3 py-2.5 bg-gray-50 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Wifi className="w-4 h-4" />
                Beli Voucher WiFi
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-6">{footerText}</p>
          <p className="text-center mt-2">
            <a
              href="/admin/login"
              className="text-xs text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Admin? Masuk di sini →
            </a>
          </p>
        </div>
      </div>

      {/* ── Right Panel: Brand Info ── */}
      <div className="hidden lg:flex flex-1 bg-gray-50 dark:bg-slate-900 items-center justify-center p-12">
        <div className="max-w-xl w-full">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-3 leading-tight">
            {companyName || 'Salfanet Radius'}
          </h1>
          <hr className="border-gray-300 dark:border-slate-700 mb-6" />
          <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
            Portal layanan mandiri pelanggan ISP. Cek tagihan, bayar online, dan pantau status langganan internet Anda kapan saja dan di mana saja.
          </p>
          <div className="grid grid-cols-3 gap-6 mb-8 text-center">
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Tagihan Online</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Lihat dan unduh invoice kapan saja</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Bayar Mudah</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">QRIS, transfer bank, dan retail</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Notifikasi WA</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Pengingat tagihan otomatis via WhatsApp</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
            <p><span className="font-bold">Invoice Digital:</span> Unduh &amp; cetak tagihan bulanan dengan mudah.</p>
            <p><span className="font-bold">Riwayat Pembayaran:</span> Pantau semua histori transaksi kapan saja.</p>
            <p><span className="font-bold">Portal Self-Service:</span> Tidak perlu telepon, kelola akun sendiri.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
