'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';
import { User, Lock, Loader2, Wrench } from 'lucide-react';

export default function TechnicianLoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company.name) {
          setCompanyName(data.company.name);
        }
        if (data.success && data.company.logo) {
          setCompanyLogo(data.company.logo);
        }
        if (data.success && data.company.footerTechnician) {
          setFooterText(data.company.footerTechnician);
        } else if (data.success && data.company.poweredBy) {
          setFooterText(`Powered by ${data.company.poweredBy}`);
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoaded(true));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/technician/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/technician/dashboard');
      } else {
        setError(data.error || 'Login gagal');
      }
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-slate-950">
      {/* ── Left Panel: Login Form ── */}
      <div className="flex items-start justify-center w-full lg:w-[420px] min-h-screen bg-white dark:bg-slate-800 shadow-xl dark:shadow-slate-900/50 px-8 pt-14 pb-10 flex-shrink-0">
        <div className="w-full max-w-[320px]">

          {/* Logo */}
          <div className="flex justify-center mb-5">
            {companyLogo ? (
              <div className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-700 shadow-sm">
                <Image unoptimized src={companyLogo} alt={companyName} width={120} height={48} className="max-h-12 max-w-[120px] w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/25">
                <Wrench className="w-7 h-7 text-white" />
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-blue-600 dark:text-blue-400 font-semibold mb-6">
            Portal Teknisi
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
              <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                required
                autoComplete="username"
                className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800/50 transition-all">
              <div className="bg-blue-600 px-4 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                required
                autoComplete="current-password"
                className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</>
              ) : (
                <><Wrench className="w-4 h-4" />Masuk</>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-8">{footerText}</p>
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
            Portal khusus teknisi lapangan untuk menerima tiket kerja, mendokumentasikan instalasi, dan mendaftarkan pelanggan baru langsung dari lokasi.
          </p>
          <div className="grid grid-cols-3 gap-6 mb-8 text-center">
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Tiket Kerja</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Terima dan selesaikan tiket gangguan dengan mudah</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Foto Lapangan</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Catat foto instalasi dan KTP pelanggan langsung dari kamera</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Real-time</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Update status pekerjaan langsung ke sistem</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
            <p><span className="font-bold">Manajemen Tiket:</span> Terima, proses, dan tutup tiket gangguan pelanggan.</p>
            <p><span className="font-bold">Foto Dokumentasi:</span> Upload foto instalasi dan KTP langsung dari kamera HP.</p>
            <p><span className="font-bold">Registrasi Pelanggan:</span> Daftarkan pelanggan baru langsung dari lapangan.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

