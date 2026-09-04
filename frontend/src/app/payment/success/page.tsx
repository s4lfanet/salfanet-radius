'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Download, ArrowRight, Loader2, Calendar, User, CreditCard, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

interface Invoice { id: string; invoiceNumber: string; amount: number; status: string; paidAt: string | null; dueDate: string; customerName: string | null; customerPhone: string | null; customerUsername: string | null; user: { name: string; phone: string; username: string; expiredAt: string | null; } | null; }
interface AgentDeposit { id: string; amount: number; status: string; paidAt: string | null; agentName: string; newBalance: number; }

function PaymentSuccessContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const orderId = searchParams.get('order_id');
  const transactionStatus = (searchParams.get('transaction_status') || '').toLowerCase();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [deposit, setDeposit] = useState<AgentDeposit | null>(null);
  const [isAgentDeposit, setIsAgentDeposit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId && ['cancel', 'deny', 'expire', 'failed', 'failure'].includes(transactionStatus)) {
      router.replace(`/payment/failed?order_id=${encodeURIComponent(orderId)}&reason=${encodeURIComponent(transactionStatus)}`);
      return;
    }

    if (orderId && ['pending'].includes(transactionStatus)) {
      router.replace(`/payment/pending?order_id=${encodeURIComponent(orderId)}`);
      return;
    }

    if (orderId) {
      checkOrderId();
    } else if (token) {
      if (token.startsWith('DEP-')) {
        setIsAgentDeposit(true);
        fetchDepositStatus();
      } else {
        fetchInvoiceStatus();
      }
    } else {
      setError('Token tidak ditemukan');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orderId, transactionStatus]);

  const checkOrderId = async () => {
    const maxRetries = 5;
    try {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const res = await fetch(`/api/payment/check-order?orderId=${encodeURIComponent(orderId || '')}`);
          const data = await res.json();

          if (res.ok && data.type === 'agent_deposit' && data.deposit) {
            setIsAgentDeposit(true);
            setDeposit(data.deposit);
            return;
          }

          if (res.ok && data.invoice) {
            const normalizedStatus = (data.status || '').toLowerCase();

            if (normalizedStatus === 'settlement' || data.invoice.status === 'PAID') {
              setIsAgentDeposit(false);
              setInvoice(data.invoice);
              return;
            }

            // If still PENDING but transaction_status is settlement, webhook may not have processed yet — retry
            if ((normalizedStatus === 'pending' || data.invoice.status === 'PENDING') && transactionStatus === 'settlement' && i < maxRetries - 1) {
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }

            if (normalizedStatus === 'pending' || data.invoice.status === 'PENDING') {
              const nextToken = data.invoice.paymentToken ? `token=${encodeURIComponent(data.invoice.paymentToken)}&` : '';
              router.replace(`/payment/pending?${nextToken}order_id=${encodeURIComponent(orderId || '')}`);
              return;
            }

            router.replace(`/payment/failed?order_id=${encodeURIComponent(orderId || '')}&reason=${encodeURIComponent(normalizedStatus || 'cancel')}`);
            return;
          }

          // Order not found — retry if we have retries left
          if (i < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          setError(t('payment.paymentNotFound'));
        } catch {
          if (i < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          setError(t('payment.checkStatusFailed'));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDepositStatus = async () => {
    try {
      const res = await fetch(`/api/agent/deposit/check?token=${token}`);
      const data = await res.json();
      if (res.ok && data.deposit) setDeposit(data.deposit); else setError(data.error || t('payment.depositNotFound'));
    } catch { setError(t('payment.checkStatusFailed')); } finally { setLoading(false); }
  };

  const fetchInvoiceStatus = async () => {
    const maxRetries = 5;
    try {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const res = await fetch(`/api/invoices/check?token=${token}`);
          const data = await res.json();
          if (res.ok && data.invoice) {
            // If invoice is still PENDING and transaction_status is settlement,
            // webhook may not have been processed yet — retry
            if (data.invoice.status === 'PENDING' && transactionStatus === 'settlement' && i < maxRetries - 1) {
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            setInvoice(data.invoice);
            return;
          }
          if (i < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          setError(data.error || t('payment.invoiceNotFound'));
        } catch {
          if (i < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          setError(t('payment.checkStatusFailed'));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      <div className="text-center relative z-10">
        <Loader2 className="w-10 h-10 animate-spin text-green-500 mx-auto mb-3 drop-shadow-[0_0_20px_rgba(0,255,136,0.6)]" />
        <p className="text-xs text-muted-foreground/70">{t('payment.checkingStatus')}</p>
      </div>
    </div>
  );

  if (error || (!invoice && !deposit)) return (
    <div className="min-h-dvh bg-muted relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 max-w-sm w-full bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-red-500/50 p-6 text-center shadow-[0_0_40px_rgba(255,68,102,0.2)]">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-red-500/50">
          <span className="text-xl">❌</span>
        </div>
        <h1 className="text-base font-bold text-white mb-1">Oops!</h1>
        <p className="text-xs text-muted-foreground/70 mb-4">{error || t('payment.dataNotFound')}</p>
        <button onClick={() => router.push('/')} className="px-6 py-2.5 text-xs font-bold bg-gradient-to-r from-violet-500 to-brand-500 text-white rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)]">{t('common.back')}</button>
      </div>
    </div>
  );

  // Agent Deposit Success View
  if (isAgentDeposit && deposit) {
    const isPaid = deposit.status === 'PAID';
    return (
      <div className="min-h-dvh bg-muted relative py-6 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-md mx-auto space-y-4 relative z-10">
          <div className="text-center">
            <div className="inline-block relative mb-4">
              <div className="absolute inset-0 bg-green-500/30 rounded-full animate-ping"></div>
              <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-brand-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(0,255,136,0.5)]">
                <CheckCircle2 className="w-10 h-10 text-white " />
              </div>
            </div>
            <h1 className="text-xl font-bold text-green-500 mb-1">{t('payment.depositSuccess')}</h1>
            <p className="text-xs text-muted-foreground/70">{isPaid ? t('payment.balanceAdded') : t('payment.processing')}</p>
          </div>

          <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-green-500/50 overflow-hidden shadow-[0_0_40px_rgba(0,255,136,0.2)]">
            <div className="bg-gradient-to-r from-green-500 to-brand-500 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/80">{t('payment.agentDepositBalance')}</span>
                {isPaid && <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold text-white">{t('payment.depositSuccessStatus')}</span>}
              </div>
              <p className="text-sm font-bold text-white">{deposit.agentName}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-center py-5 bg-gradient-to-br from-green-500/10 to-brand-500/10 rounded-xl border border-green-500/20">
                <p className="text-[10px] text-muted-foreground/60 mb-1">{t('payment.depositAmount')}</p>
                <p className="text-3xl font-bold text-green-500 drop-shadow-[0_0_15px_rgba(0,255,136,0.5)]">{formatCurrency(deposit.amount)}</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                  <User className="w-4 h-4 text-violet-500 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">{t('payment.agent')}</p>
                    <p className="text-xs font-bold text-white">{deposit.agentName}</p>
                  </div>
                </div>
                {deposit.paidAt && (
                  <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                    <CreditCard className="w-4 h-4 text-brand-500 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground/60">{t('payment.paymentDate')}</p>
                      <p className="text-xs font-bold text-white">{formatWIB(deposit.paidAt)}</p>
                    </div>
                  </div>
                )}
                {isPaid && (
                  <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                    <Wallet className="w-4 h-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground/60">{t('payment.currentBalanceNow')}</p>
                      <p className="text-xs font-bold text-green-500">{formatCurrency(deposit.newBalance)}</p>
                    </div>
                  </div>
                )}
              </div>
              {isPaid && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                  <p className="text-xs text-green-500 text-center font-medium">✅ {t('payment.balanceAddedToAccount')}</p>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => router.push('/agent/dashboard')} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-violet-500 to-brand-500 rounded-xl shadow-[0_0_25px_rgba(139,92,246,0.4)]">
            {t('payment.toDashboard')}<ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-[10px] text-muted-foreground/50">{t('payment.thankYouDeposit')}</p>
        </div>
      </div>
    );
  }

  // Invoice Success View
  const isPaid = invoice?.status === 'PAID';
  const customerName = invoice?.user?.name || invoice?.customerName || 'Customer';
  const customerPhone = invoice?.user?.phone || invoice?.customerPhone || '-';
  const expiryDate = invoice?.user?.expiredAt;

  return (
    <div className="min-h-dvh bg-muted relative py-6 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-brand-500/15 rounded-full blur-3xl"></div>
      </div>
      <div className="max-w-md mx-auto space-y-4 relative z-10">
        <div className="text-center">
          <div className="inline-block relative mb-4">
            <div className="absolute inset-0 bg-green-500/30 rounded-full animate-ping"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-brand-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(0,255,136,0.5)]">
              <CheckCircle2 className="w-10 h-10 text-white " />
            </div>
          </div>
          <h1 className="text-xl font-bold text-green-500 mb-1">{t('payment.paymentSuccess')}</h1>
          <p className="text-xs text-muted-foreground/70">{isPaid ? t('payment.invoicePaid') : t('payment.processing')}</p>
        </div>

        <div className="bg-muted/80 backdrop-blur-xl rounded-2xl border-2 border-green-500/50 overflow-hidden shadow-[0_0_40px_rgba(0,255,136,0.2)]">
          <div className="bg-gradient-to-r from-green-500 to-brand-500 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/80">{t('common.invoice')}</span>
              {isPaid && <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold text-white">{t('customer.paid').toUpperCase()}</span>}
            </div>
            <p className="text-sm font-bold text-white">#{invoice?.invoiceNumber}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="text-center py-5 bg-gradient-to-br from-green-500/10 to-brand-500/10 rounded-xl border border-green-500/20">
              <p className="text-[10px] text-muted-foreground/60 mb-1">{t('payment.totalPayment')}</p>
              <p className="text-3xl font-bold text-green-500 drop-shadow-[0_0_15px_rgba(0,255,136,0.5)]">{formatCurrency(invoice?.amount || 0)}</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                <User className="w-4 h-4 text-violet-500 mt-0.5" />
                <div>
                  <p className="text-[10px] text-muted-foreground/60">{t('payment.customer')}</p>
                  <p className="text-xs font-bold text-white">{customerName}</p>
                  <p className="text-[10px] text-muted-foreground/60">{customerPhone}</p>
                </div>
              </div>
              {invoice?.paidAt && (
                <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                  <CreditCard className="w-4 h-4 text-brand-500 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">{t('payment.paymentDate')}</p>
                    <p className="text-xs font-bold text-white">{formatWIB(invoice.paidAt)}</p>
                  </div>
                </div>
              )}
              {expiryDate && (
                <div className="flex items-start gap-3 p-3 bg-card/50 rounded-xl">
                  <Calendar className="w-4 h-4 text-pink-500 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-muted-foreground/60">{t('payment.activeUntil')}</p>
                    <p className="text-xs font-bold text-green-500">{formatWIB(expiryDate, 'd MMMM yyyy')}</p>
                  </div>
                </div>
              )}
            </div>
            {isPaid && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                <p className="text-xs text-green-500 text-center font-medium">✅ {t('payment.serviceActivated')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => router.push(`/pay/${token}`)} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium bg-card text-white rounded-xl border-2 border-violet-500/30 hover:border-green-500">
            <Download className="w-4 h-4 text-brand-500" />{t('payment.viewInvoice')}
          </button>
          <button onClick={() => router.push('/')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-white bg-gradient-to-r from-green-500 to-brand-500 rounded-xl shadow-[0_0_20px_rgba(0,255,136,0.3)]">
            {t('common.done')}<ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/50">{t('payment.thankYouPayment')}</p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-muted flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-green-500 drop-shadow-[0_0_20px_rgba(0,255,136,0.6)]" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
