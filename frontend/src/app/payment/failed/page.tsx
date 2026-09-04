'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { XCircle, RefreshCw, Home, Loader2, AlertTriangle, MessageCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

function PaymentFailedContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const orderId = searchParams.get('order_id');
  const reason = searchParams.get('reason');
  const [loading, setLoading] = useState(true);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [companyPhone, setCompanyPhone] = useState('6281234567890');

  useEffect(() => {
    if (token || orderId) fetchInvoiceInfo(); else setLoading(false);
    fetch('/api/company/info').then(res => res.json()).then(data => { const c = data.data || data; if (c.phone) { let phone = c.phone.replace(/^0/, '62'); if (!phone.startsWith('62')) phone = '62' + phone; setCompanyPhone(phone); } }).catch((e: unknown) => { console.warn('Failed to fetch company info:', e); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orderId]);

  const fetchInvoiceInfo = async () => {
    try {
      const endpoint = token
        ? `/api/invoices/check?token=${encodeURIComponent(token)}`
        : `/api/payment/check-order?orderId=${encodeURIComponent(orderId || '')}`;

      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok && data.invoice) setInvoiceNumber(data.invoice.invoiceNumber);
    } catch (e: unknown) { console.error('Failed to fetch invoice info:', e); } finally { setLoading(false); }
  };

  if (loading) return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl animate-pulse"></div>
      </div>
      <div className="text-center relative z-10">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#ff6b8a] drop-shadow-[0_0_20px_rgba(255,68,102,0.6)] mb-3" />
        <p className="text-xs text-muted-foreground/70">{t('payment.loadingInfo')}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted relative py-6 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-md mx-auto space-y-4 relative z-10">
        <div className="text-center">
          <div className="inline-block relative mb-4">
            <div className="absolute inset-0 bg-red-500/30 rounded-full animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(255,68,102,0.5)]">
              <XCircle className="w-10 h-10 text-white " />
            </div>
          </div>
          <h1 className="text-xl font-bold text-[#ff6b8a] mb-1">{t('payment.paymentFailed')}</h1>
          <p className="text-xs text-muted-foreground/70">{t('payment.transactionNotCompleted')}</p>
        </div>

        <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-red-500/50 overflow-hidden shadow-[0_0_40px_rgba(255,68,102,0.2)]">
          <div className="p-5 space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 bg-pink-500/20 rounded-full flex items-center justify-center border-2 border-pink-500/30">
                <AlertTriangle className="w-7 h-7 text-pink-500 drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
              </div>
            </div>

            {invoiceNumber && (
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground/60 mb-0.5">Invoice</p>
                <p className="text-sm font-bold text-white">#{invoiceNumber}</p>
              </div>
            )}

            {reason && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-xs font-medium text-[#ff6b8a] text-center">{decodeURIComponent(reason)}</p>
              </div>
            )}

            <div className="bg-card/50 rounded-xl p-4">
              <p className="text-xs font-bold text-muted-foreground mb-2">{t('payment.possibleCauses')}</p>
              <ul className="text-[10px] text-muted-foreground/70 space-y-1.5 list-disc list-inside">
                <li>{t('payment.cause1')}</li>
                <li>{t('payment.cause2')}</li>
                <li>{t('payment.cause3')}</li>
                <li>{t('payment.cause4')}</li>
                <li>{t('payment.cause5')}</li>
              </ul>
            </div>

            <div className="text-center">
              <p className="text-[10px] text-muted-foreground/60">{t('payment.noCharge')}</p>
              <p className="text-[10px] text-muted-foreground/60">{t('payment.tryAgainOrContact')}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => router.push('/')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium bg-card text-white rounded-xl border-2 border-violet-500/30 hover:border-red-500">
            <Home className="w-4 h-4 text-[#ff6b8a]" />{t('common.back')}
          </button>
          {token && (
            <button onClick={() => router.push(`/pay/${token}`)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-white bg-gradient-to-r from-red-500 to-pink-500 rounded-xl shadow-[0_0_20px_rgba(255,68,102,0.3)]">
              <RefreshCw className="w-4 h-4" />{t('payment.tryAgain')}
            </button>
          )}
        </div>

        <div className="text-center space-y-2">
          <p className="text-[10px] text-muted-foreground/60">{t('payment.needHelp')}</p>
          <a href={`https://wa.me/${companyPhone}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-green-500 hover:text-brand-500 font-medium transition-colors">
            <MessageCircle className="w-4 h-4" />
            {t('payment.contactCS')}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-muted flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#ff6b8a] drop-shadow-[0_0_20px_rgba(255,68,102,0.6)]" />
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  );
}
