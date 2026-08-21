'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiAdmin, ApiError } from '@/lib/api';
import { User, Lock, Loader2, Wallet } from 'lucide-react';

export default function CollectorLoginPage() {
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
        if (data.success && data.company.name) setCompanyName(data.company.name);
        if (data.success && data.company.logo) setCompanyLogo(data.company.logo);
        if (data.success && data.company.footerCollector) {
          setFooterText(data.company.footerCollector);
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
      await apiAdmin('/api/collector/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      router.push('/collector/dashboard');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message || 'Login gagal');
      else setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-screen bg-gray-50 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Mobile Brand Header */}
      <div className="lg:hidden bg-gradient-to-br from-emerald-600 to-teal-500 px-6 pt-10 pb-8 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="relative z-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Portal Kolektor</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 leading-tight">{companyName}</h1>
          <p className="text-sm text-emerald-100/80 mt-2">Kelola tagihan & setoran pelanggan</p>
        </div>
      </div>

      {/* Desktop Brand Side */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-600 to-teal-500 relative overflow-hidden">
        <div className="absolute top-[-80px] right-[-80px] w-72 h-72 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-[-60px] left-[-60px] w-56 h-56 bg-white/5 rounded-full pointer-events-none" />
        <div className="flex flex-col justify-center px-16 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            {companyLogo ? (
              <Image src={companyLogo} alt="Logo" width={48} height={48} className="rounded-lg" />
            ) : (
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
            )}
            <span className="text-white font-bold text-xl">{companyName}</span>
          </div>
          <h2 className="text-4xl font-extrabold text-white leading-tight">Portal Kolektor</h2>
          <p className="text-emerald-100/80 mt-4 text-lg">Kelola tagihan, setoran, dan pencabutan ONT pelanggan dengan mudah.</p>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Masuk ke Akun</h2>
            <p className="text-muted-foreground mt-2 text-sm">Gunakan kredensial kolektor Anda</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="Masukkan username"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="Masukkan password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          {footerText && (
            <p className="mt-8 text-center text-xs text-muted-foreground">{footerText}</p>
          )}
        </div>
      </div>
    </div>
  );
}
