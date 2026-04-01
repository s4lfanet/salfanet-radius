'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Phone, Loader2, Shield, Ticket, MessageCircle } from 'lucide-react';
import { showError } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';

export default function AgentLoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyPhone, setCompanyPhone] = useState('6281234567890');
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
          if (data.company.name) { setCompanyName(data.company.name); setPoweredBy(data.company.name); }
          if (data.company.poweredBy) setPoweredBy(data.company.poweredBy);
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
    return <div className="min-h-screen bg-[#1a0f35]" />;
  }

  return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-sm w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          {companyLogo ? (
            <div className="inline-flex items-center justify-center rounded-2xl p-0.5 mb-4 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] shadow-[0_0_40px_rgba(188,19,254,0.5)]">
              <div className="rounded-[14px] bg-white px-4 py-2">
                <img src={companyLogo} alt={companyName} className="max-h-12 max-w-[120px] w-auto h-auto object-contain" />
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#bc13fe] to-[#00f7ff] rounded-2xl shadow-[0_0_40px_rgba(188,19,254,0.5)] mb-4">
              <Ticket className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </div>
          )}
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
            {t('agent.portal.title')}
          </h1>
          <p className="text-sm text-[#e0d0ff]/80 mt-1">{t('agent.portal.loginSubtitle')}</p>
          

        </div>

        {/* Login Form Card */}
        <div className="bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#bc13fe]/30 p-6 shadow-[0_0_50px_rgba(188,19,254,0.2)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-[#e0d0ff] mb-2">
                <Phone className="w-3.5 h-3.5 text-[#00f7ff]" />
                {t('agent.portal.phoneNumber')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08123456789"
                required
                className="w-full px-4 py-3 text-sm bg-[#0a0520] border-2 border-[#bc13fe]/30 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-1 focus:ring-[#00f7ff]/50 focus:shadow-[0_0_20px_rgba(0,247,255,0.3)] transition-all outline-none"
              />
            </div>

            {error && (
              <div className="bg-[#ff4466]/10 border border-[#ff4466]/30 text-[#ff6b8a] px-3 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] hover:from-[#a010e0] hover:to-[#00d4dd] disabled:from-gray-600 disabled:to-gray-600 text-white text-sm font-bold rounded-xl transition-all duration-300 shadow-[0_0_25px_rgba(188,19,254,0.4)] hover:shadow-[0_0_35px_rgba(188,19,254,0.6)] disabled:shadow-none"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t('agent.portal.loggingIn')}...</>
              ) : (
                <><LogIn className="w-4 h-4" />{t('agent.portal.login')}</>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-[#bc13fe]/30"></div>
            <span className="text-[10px] text-[#e0d0ff]/50 uppercase tracking-wider">{t('agent.portal.or')}</span>
            <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-[#bc13fe]/30"></div>
          </div>

          {/* Contact Admin */}
          <div className="text-center">
            <p className="text-xs text-[#e0d0ff]/70 mb-2">
              {t('agent.portal.notRegistered')}
            </p>
            <a
              href={`https://wa.me/${companyPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#00ff88] hover:text-[#00f7ff] font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              {t('agent.portal.contactAdmin')}
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#e0d0ff]/50 mt-6">
          <>Powered by <span className="text-[#00f7ff]">{poweredBy}</span></>
        </p>
      </div>
    </div>
  );
}
