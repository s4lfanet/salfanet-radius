'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, RefreshCw, ExternalLink, Loader2, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Invoice { id: string; invoiceNumber: string; amount: number; status: string; paymentLink: string | null; }

function PaymentPendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const orderId = searchParams.get('order_id');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (token || orderId) fetchInvoiceStatus();
    else {
      setError('Token/order_id tidak ditemukan');
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orderId]);

  useEffect(() => {
    if (!autoRefresh || (!token && !orderId)) return;
    const interval = setInterval(() => fetchInvoiceStatus(true), 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, token, orderId]);

  const fetchInvoiceStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = token
        ? `/api/invoices/check?token=${encodeURIComponent(token)}`
        : `/api/payment/check-order?orderId=${encodeURIComponent(orderId || '')}`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (res.ok && data.invoice) {
        setInvoice(data.invoice);
        const normalized = (data.status || '').toLowerCase();

        if (data.invoice.status === 'PAID' || normalized === 'settlement') {
          if (token) router.push(`/payment/success?token=${encodeURIComponent(token)}`);
          else router.push(`/payment/success?order_id=${encodeURIComponent(orderId || '')}`);
          return;
        }

        if (data.invoice.status === 'CANCELLED' || ['cancel', 'deny', 'expire', 'failed'].includes(normalized)) {
          const qp = token
            ? `token=${encodeURIComponent(token)}`
            : `order_id=${encodeURIComponent(orderId || '')}`;
          router.push(`/payment/failed?${qp}&reason=${encodeURIComponent(normalized || 'cancel')}`);
          return;
        }
      } else {
        setError(data.error || 'Invoice tidak ditemukan');
      }
    } catch { if (!silent) setError('Gagal mengecek status'); } finally { setLoading(false); setChecking(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      <div className="text-center relative z-10">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] mb-3" />
        <p className="text-xs text-[#e0d0ff]/70">Mengecek status...</p>
      </div>
    </div>
  );

  if (error || !invoice) return (
    <div className="min-h-screen bg-[#1a0f35] relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ff4466]/20 rounded-full blur-3xl"></div>
      </div>
      <div className="relative z-10 max-w-sm w-full bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#ff4466]/50 p-6 text-center shadow-[0_0_40px_rgba(255,68,102,0.2)]">
        <div className="w-12 h-12 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-[#ff4466]/50">
          <span className="text-xl">❌</span>
        </div>
        <h1 className="text-base font-bold text-white mb-1">Oops!</h1>
        <p className="text-xs text-[#e0d0ff]/70 mb-4">{error}</p>
        <button onClick={() => router.push('/')} className="px-6 py-2.5 text-xs font-bold bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white rounded-xl">Kembali</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a0f35] relative py-6 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/15 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>

      <div className="max-w-md mx-auto space-y-4 relative z-10">
        <div className="text-center">
          <div className="inline-block relative mb-4">
            <div className="absolute inset-0 bg-[#ff44cc]/30 rounded-full animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-[#ff44cc] to-[#bc13fe] rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(255,68,204,0.5)]">
              <Clock className="w-10 h-10 text-white animate-bounce drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-[#ff44cc] mb-1">Menunggu Pembayaran</h1>
          <p className="text-xs text-[#e0d0ff]/70">Pembayaran sedang diproses</p>
        </div>

        <div className="bg-[#1a0f35]/80 backdrop-blur-xl rounded-2xl border-2 border-[#ff44cc]/50 overflow-hidden shadow-[0_0_40px_rgba(255,68,204,0.2)]">
          <div className="bg-gradient-to-r from-[#ff44cc] to-[#bc13fe] px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/80">Invoice</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold text-white">PENDING</span>
            </div>
            <p className="text-sm font-bold text-white">#{invoice.invoiceNumber}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="text-center py-5 bg-gradient-to-br from-[#ff44cc]/10 to-[#bc13fe]/10 rounded-xl border border-[#ff44cc]/20">
              <p className="text-[10px] text-[#e0d0ff]/60 mb-1">Total Pembayaran</p>
              <p className="text-3xl font-bold text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.5)]">{formatCurrency(invoice.amount)}</p>
            </div>

            <div className="bg-[#ff44cc]/10 border border-[#ff44cc]/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-[#ff44cc] mt-0.5 flex-shrink-0" />
                <div className="text-xs text-[#e0d0ff]/80 space-y-1.5">
                  <p className="font-bold text-[#ff44cc]">Langkah Selanjutnya:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>Selesaikan pembayaran</li>
                    <li>Jangan tutup halaman ini</li>
                    <li>Status akan otomatis terupdate</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[10px] text-[#e0d0ff]/60">
              <div className="w-2 h-2 bg-[#00ff88] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,255,136,0.5)]"></div>
              <span>Auto-refresh setiap 5 detik</span>
            </div>

            {invoice.paymentLink && (
              <a href={invoice.paymentLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] rounded-xl shadow-[0_0_25px_rgba(188,19,254,0.4)] hover:shadow-[0_0_35px_rgba(188,19,254,0.6)] transition-all">
                <ExternalLink className="w-4 h-4" />Buka Halaman Pembayaran
              </a>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={() => { setChecking(true); fetchInvoiceStatus(); }} disabled={checking} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium bg-[#0a0520] text-white rounded-xl border-2 border-[#bc13fe]/30 hover:border-[#00f7ff] disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 text-[#00f7ff] ${checking ? 'animate-spin' : ''}`} />{checking ? 'Mengecek...' : 'Cek Status'}
          </button>
          <button
            onClick={() => {
              if (token) router.push(`/pay/${token}`);
              else router.push('/customer');
            }}
            className="w-full px-4 py-3 text-xs font-medium text-[#e0d0ff]/70 hover:text-white"
          >
            Kembali ke Invoice
          </button>
        </div>

        <p className="text-center text-[10px] text-[#e0d0ff]/50">Halaman akan otomatis redirect setelah pembayaran berhasil</p>
      </div>
    </div>
  );
}

export default function PaymentPendingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1a0f35] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
      </div>
    }>
      <PaymentPendingContent />
    </Suspense>
  );
}
