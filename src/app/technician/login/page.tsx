'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#1a0f35] to-slate-900" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#1a0f35] to-slate-900 relative overflow-hidden p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#bc13fe]/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-[#00f7ff]/20 rounded-full blur-[100px] animate-pulse delay-700"></div>
        <div className="absolute bottom-0 left-1/2 w-[600px] h-[400px] bg-[#ff44cc]/15 rounded-full blur-[150px] animate-pulse delay-1000"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:60px_60px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            {companyLogo ? (
              <div className="inline-flex items-center justify-center rounded-xl p-0.5 flex-shrink-0 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] shadow-[0_0_30px_rgba(188,19,254,0.5)]">
                <div className="rounded-[10px] bg-white px-3 py-2">
                  <img src={companyLogo} alt={companyName} className="max-h-10 max-w-[100px] w-auto h-auto object-contain" />
                </div>
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-xl flex-shrink-0 shadow-[0_0_30px_rgba(188,19,254,0.5)]">
                <Wrench className="h-6 w-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
              </div>
            )}
              <h1 className="text-xl sm:text-2xl font-bold leading-tight text-left text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] drop-shadow-[0_0_20px_rgba(0,247,255,0.5)] max-w-[200px]">
                {companyName}
              </h1>
          </div>
          <p className="text-sm text-[#e0d0ff]/70">
            Masuk dengan username dan password Anda
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border-2 border-[#bc13fe]/30 shadow-[0_0_50px_rgba(188,19,254,0.2)] p-8">
          <form onSubmit={handleLogin}>
            {/* Username */}
            <div className="mb-5">
              <label className="block text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5 bg-[#bc13fe]/20 rounded-lg">
                  <User className="h-4 w-4 text-[#bc13fe]" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  className="w-full pl-14 pr-4 py-4 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all text-sm"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5 bg-[#bc13fe]/20 rounded-lg">
                  <Lock className="h-4 w-4 text-[#bc13fe]" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full pl-14 pr-4 py-4 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_20px_rgba(0,247,255,0.2)] transition-all text-sm"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="mb-5 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-[#00f7ff] to-[#00d4e6] hover:shadow-[0_0_30px_rgba(0,247,255,0.5)] disabled:opacity-50 text-black text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Wrench className="h-5 w-5" />
                  Masuk
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#e0d0ff]/30 mt-6">
          {footerText}
        </p>
      </div>
    </div>
  );
}

