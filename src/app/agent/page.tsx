'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LogIn, Phone, Loader2, Shield, Ticket, MessageCircle } from 'lucide-react';
import { showError } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';

export default function AgentLoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [poweredBy, setPoweredBy] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [brandLoaded, setBrandLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/public/company')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.company) {
          if (data.company.logo) setCompanyLogo(data.company.logo);
          if (data.company.name) setCompanyName(data.company.name);
          if (data.company.footerAgent) {
            setPoweredBy(data.company.footerAgent);
          }
          if (data.company.phone) {
            let formattedPhone = data.company.phone.replace(/[^0-9]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.slice(1);
            if (!formattedPhone.startsWith('62')) formattedPhone = '62' + formattedPhone;
            setCompanyPhone(formattedPhone);
          }
        }
      })
      .catch(() => {})
      .finally(() => setBrandLoaded(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/agent/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('agentData', JSON.stringify(data.agent));
        localStorage.setItem('agentToken', data.token);
        router.push('/agent/dashboard');
      } else {
        setError(data.error || t('agent.portal.errors.loginFailed'));
        await showError(data.error || t('agent.portal.errors.loginFailed'));
      }
    } catch (error) {
      setError(t('agent.portal.errors.tryAgain'));
      await showError(t('agent.portal.errors.tryAgain'));
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
              <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/25">
                <Ticket className="w-7 h-7 text-white" />
              </div>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-center text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-6">
            {t('agent.portal.loginSubtitle')}
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 flex-shrink-0" />{error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-200 dark:focus-within:ring-indigo-800/50 transition-all">
              <div className="bg-indigo-600 px-4 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08123456789"
                required
                className="flex-1 px-4 py-3 text-sm bg-blue-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t('agent.portal.loggingIn')}...</>
              ) : (
                <><LogIn className="w-4 h-4" />{t('agent.portal.login')}</>
              )}
            </button>
          </form>

          {/* WhatsApp contact */}
          {companyPhone && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-700 text-center">
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">{t('agent.portal.notRegistered')}</p>
              <a
                href={`https://wa.me/${companyPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {t('agent.portal.contactAdmin')}
              </a>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-8">{poweredBy}</p>
        </div>
      </div>

      {/* ── Right Panel: Brand Info ── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 items-center justify-center p-14 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-100/60 dark:bg-indigo-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-violet-100/50 dark:bg-violet-900/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-lg w-full relative z-10">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Portal Agen</span>
          </div>
          <h1 className="text-5xl font-extrabold leading-tight mb-1">
            <span className="text-slate-800 dark:text-white">{(companyName || 'Salfanet Radius').split(' ').slice(0, -1).join(' ')} </span>
            <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">{(companyName || 'Salfanet Radius').split(' ').slice(-1)[0]}</span>
          </h1>
          <p className="text-base text-gray-500 dark:text-slate-400 mb-8 leading-relaxed">
            Portal agen resmi untuk mengelola penjualan voucher, memantau komisi, dan mendaftarkan pelanggan baru di wilayah Anda.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Komisi Realtime</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-snug">Pantau komisi secara langsung</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Voucher Hotspot</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-snug">Jual voucher harga agen</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Rekap Penjualan</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 leading-snug">Laporan harian &amp; bulanan</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { color: 'bg-indigo-500', text: 'Deposit Agent — Kelola saldo deposit untuk pembelian voucher' },
              { color: 'bg-violet-500', text: 'Kelola Voucher — Cetak dan distribusikan voucher ke pelanggan' },
              { color: 'bg-purple-500', text: 'Monitor Pelanggan — Pantau pelanggan yang didaftarkan lewat akun Anda' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/70 dark:bg-slate-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-slate-700/50">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.color}`} />
                <p className="text-sm text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: item.text }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
