'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, DollarSign, CreditCard, Smartphone, Banknote, Loader2 } from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { showSuccess, showError } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';

export default function TopUpRequestPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    paymentMethod: 'TRANSFER' as 'TRANSFER' | 'EWALLET' | 'CASH',
    note: '',
    proofFile: null as File | null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseInt(formData.amount);
    if (isNaN(amount) || amount < 10000) {
      showError(t('customer.minimumTopup'), t('customer.invalidAmount'));
      return;
    }

    if (!formData.proofFile && formData.paymentMethod !== 'CASH') {
      showError(t('customer.uploadProofRequired'), t('customer.proofRequired'));
      return;
    }

    try {
      setSubmitting(true);

      const data = new FormData();
      data.append('amount', amount.toString());
      data.append('paymentMethod', formData.paymentMethod);
      data.append('note', formData.note);
      if (formData.proofFile) {
        data.append('proof', formData.proofFile);
      }

      const token = localStorage.getItem('customer_token');
      const response = await fetch('/api/customer/topup-request', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: data,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('customer.requestFailed'));
      }

      showSuccess(
        `${t('customer.topupRequestSentMsg')} Rp ${amount.toLocaleString('id-ID')} ${t('customer.sentToAdmin')}. ${t('customer.waitAdminConfirmation')}`,
        t('customer.requestSent')
      );

      router.push('/customer');
    } catch (error: any) {
      showError(error.message || t('customer.requestError'), t('common.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError(t('customer.maxFileSize'), t('customer.fileTooLarge'));
        e.target.value = '';
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError(t('customer.onlyImageAllowed'), t('customer.invalidFileType'));
        e.target.value = '';
        return;
      }

      setFormData(prev => ({ ...prev, proofFile: file }));
    }
  };

  return (
    <div className="py-6 px-4 md:px-6 w-full">
      {/* Back + Page Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-[#00f7ff] hover:text-[#00f7ff]/80 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('nav.backToDashboard')}
        </button>

        <CyberCard className="p-5 bg-gradient-to-r from-[#bc13fe]/20 to-[#00f7ff]/20">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#bc13fe]/30 rounded-xl border border-[#bc13fe]/50 shadow-[0_0_15px_rgba(188,19,254,0.4)] shrink-0 flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-[#bc13fe]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00f7ff] to-white drop-shadow-[0_0_20px_rgba(0,247,255,0.5)]">
                {t('customer.topupRequest')}
              </h1>
              <p className="text-[#e0d0ff]/70 text-sm mt-0.5">
                {t('customer.topupRequestDesc')}
              </p>
            </div>
          </div>
        </CyberCard>
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Form â€” takes 2/3 on desktop */}
        <div className="lg:col-span-2">
        <CyberCard className="p-6 bg-card/80 backdrop-blur-xl border-2 border-[#bc13fe]/30">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Amount */}
            <div>
              <label className="block text-sm font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">
                {t('customer.topupAmount')} <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e0d0ff]/60">
                  Rp
                </span>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full pl-12 pr-4 py-3 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_15px_rgba(0,247,255,0.2)] transition-all"
                  placeholder="10000"
                  required
                  min="10000"
                  step="1000"
                />
              </div>
              <p className="text-xs text-[#e0d0ff]/50 mt-2">
                {t('customer.minimumTopupLabel')}
              </p>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                {t('customer.paymentMethod')} <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'TRANSFER' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${formData.paymentMethod === 'TRANSFER'
                      ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_20px_rgba(0,247,255,0.3)]'
                      : 'border-[#bc13fe]/30 bg-slate-900/50 hover:border-[#00f7ff]/50'
                    }`}
                >
                  <CreditCard className={`w-6 h-6 mx-auto mb-2 ${formData.paymentMethod === 'TRANSFER' ? 'text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]' : 'text-[#e0d0ff]/50'
                    }`} />
                  <p className={`text-xs font-bold ${formData.paymentMethod === 'TRANSFER' ? 'text-[#00f7ff]' : 'text-[#e0d0ff]/50'
                    }`}>
                    {t('customer.bankTransfer')}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'EWALLET' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${formData.paymentMethod === 'EWALLET'
                      ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_20px_rgba(0,247,255,0.3)]'
                      : 'border-[#bc13fe]/30 bg-slate-900/50 hover:border-[#00f7ff]/50'
                    }`}
                >
                  <Smartphone className={`w-6 h-6 mx-auto mb-2 ${formData.paymentMethod === 'EWALLET' ? 'text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]' : 'text-[#e0d0ff]/50'
                    }`} />
                  <p className={`text-xs font-bold ${formData.paymentMethod === 'EWALLET' ? 'text-[#00f7ff]' : 'text-[#e0d0ff]/50'
                    }`}>
                    {t('customer.ewallet')}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'CASH' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${formData.paymentMethod === 'CASH'
                      ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_20px_rgba(0,247,255,0.3)]'
                      : 'border-[#bc13fe]/30 bg-slate-900/50 hover:border-[#00f7ff]/50'
                    }`}
                >
                  <Banknote className={`w-6 h-6 mx-auto mb-2 ${formData.paymentMethod === 'CASH' ? 'text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]' : 'text-[#e0d0ff]/50'
                    }`} />
                  <p className={`text-xs font-bold ${formData.paymentMethod === 'CASH' ? 'text-[#00f7ff]' : 'text-[#e0d0ff]/50'
                    }`}>
                    {t('customer.cash')}
                  </p>
                </button>
              </div>
            </div>

            {/* Proof Upload */}
            {formData.paymentMethod !== 'CASH' && (
              <div>
                <label className="block text-sm font-bold text-[#00f7ff] mb-3 uppercase tracking-wider">
                  {t('customer.paymentProof')} <span className="text-red-400">*</span>
                </label>
                <div className="border-2 border-dashed border-[#bc13fe]/40 rounded-xl p-6 text-center hover:border-[#00f7ff]/50 transition-colors bg-slate-900/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="proof-upload"
                  />
                  <label htmlFor="proof-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto mb-3 text-[#bc13fe]" />
                    <p className="text-sm text-[#00f7ff] font-bold">
                      {formData.proofFile ? formData.proofFile.name : t('customer.uploadProof')}
                    </p>
                    <p className="text-xs text-[#e0d0ff]/50 mt-2">
                      {t('customer.fileFormat')}
                    </p>
                  </label>
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-sm font-bold text-[#00f7ff] mb-2 uppercase tracking-wider">
                {t('customer.note')} ({t('common.optional')})
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-900/80 border-2 border-[#bc13fe]/40 rounded-xl text-white placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-2 focus:ring-[#00f7ff]/30 focus:shadow-[0_0_15px_rgba(0,247,255,0.2)] transition-all min-h-[100px]"
                placeholder={t('customer.notePlaceholder')}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600/50 text-white font-medium rounded-xl hover:bg-slate-700 transition-all"
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
              <CyberButton
                type="submit"
                disabled={submitting}
                className="flex-1"
                variant="cyan"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.sending')}
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    {t('customer.sendRequest')}
                  </>
                )}
              </CyberButton>
            </div>
          </form>
        </CyberCard>
        </div>

        {/* Info panel â€” 1/3 on desktop, full-width below form on mobile */}
        <div className="lg:col-span-1">
          <div className="bg-[#00f7ff]/10 border-2 border-[#00f7ff]/30 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#00f7ff] mb-3">â„¹ï¸ {t('customer.importantInfo')}:</h3>
            <ul className="text-xs text-[#e0d0ff]/70 space-y-2">
              <li className="flex gap-2"><span className="text-[#00f7ff] shrink-0">â€¢</span>{t('customer.infoProcessTime')}</li>
              <li className="flex gap-2"><span className="text-[#00f7ff] shrink-0">â€¢</span>{t('customer.infoProofClear')}</li>
              <li className="flex gap-2"><span className="text-[#00f7ff] shrink-0">â€¢</span>{t('customer.infoBalanceAuto')}</li>
              <li className="flex gap-2"><span className="text-[#00f7ff] shrink-0">â€¢</span>{t('customer.infoContactAdmin')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


