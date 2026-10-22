'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiAdmin, ApiError } from '@/lib/api';
import { Loader2, Wallet, Sun, Moon, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { ui } from '@/components/collector/ui';
import { cn } from '@/lib/utils';

export default function CollectorLoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setError(err instanceof ApiError ? err.message || 'Login gagal' : 'Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  if (!brandLoaded) {
    return <div className="min-h-dvh bg-background" />;
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Pakai tema terang' : 'Pakai tema gelap'}
          className="h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm">
          {/* The one place the brand gradient appears (DESIGN.md): the login badge. */}
          <div className="flex justify-center mb-5">
            {companyLogo ? (
              <div className="w-20 h-20 p-2 rounded-[20px] bg-white border border-border flex items-center justify-center overflow-hidden">
                <Image unoptimized src={companyLogo} alt={companyName} width={160} height={80} className="max-h-full max-w-full w-auto h-auto object-contain" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-[20px] bg-gradient-to-br from-[#2563EB] to-[#4F46E5] text-white flex items-center justify-center" aria-hidden>
                <Wallet className="w-9 h-9" />
              </div>
            )}
          </div>

          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-foreground">{companyName || 'Portal Kolektor'}</h1>
            <p className="text-sm text-muted-foreground mt-1">Masuk ke portal kolektor</p>
          </div>

          <form onSubmit={handleLogin} className={cn(ui.card, 'p-5 space-y-4')} noValidate>
            {error && (
              <div className="p-3 rounded-xl bg-red-600/10 flex items-start gap-2" role="alert">
                <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                className={ui.input}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={cn(ui.input, 'pr-11')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading || !username || !password} className={cn(ui.btnPrimary, 'w-full')}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Memeriksa...</> : 'Masuk'}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Lupa password? Minta admin menggantinya di Kelola Kolektor.
          </p>
          {footerText && <p className="text-center text-xs text-muted-foreground mt-2">{footerText}</p>}
        </div>
      </main>
    </div>
  );
}
