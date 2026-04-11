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
      <div className="hidden lg:flex flex-1 bg-gray-50 dark:bg-slate-900 items-center justify-center p-12">
        <div className="max-w-xl w-full">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-3 leading-tight">
            {companyName || 'Salfanet Radius'}
          </h1>
          <hr className="border-gray-300 dark:border-slate-700 mb-6" />
          <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
            Portal agen resmi untuk mengelola penjualan voucher, memantau komisi, dan mendaftarkan pelanggan baru di wilayah Anda.
          </p>
          <div className="grid grid-cols-3 gap-6 mb-8 text-center">
            <div>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-1">Komisi Realtime</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Pantau komisi penjualan secara langsung</p>
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-1">Voucher Hotspot</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Jual voucher WiFi dengan harga agen</p>
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mb-1">Rekap Penjualan</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Laporan penjualan harian dan bulanan</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
            <p><span className="font-bold">Deposit Agent:</span> Kelola saldo deposit untuk pembelian voucher.</p>
            <p><span className="font-bold">Kelola Voucher:</span> Cetak dan distribusikan voucher ke pelanggan.</p>
            <p><span className="font-bold">Monitor Pelanggan:</span> Pantau pelanggan yang didaftarkan melalui akun Anda.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
