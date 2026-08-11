'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle, Wifi, CreditCard } from 'lucide-react';
import { showError } from '@/lib/sweetalert';
import { formatCurrency } from '@/lib/utils';

interface VoucherOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  status: string;
  quantity: number;
  profile: { name: string; speed: string; validityValue: number; validityUnit: string; };
  vouchers: Array<{ code: string; status: string; }>;
}

export default function EVoucherPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<VoucherOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadOrder(); }, [token]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/evoucher/order/${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load order'); return; }
      setOrder(data.order);
      setPaymentGateways(data.paymentGateways || []);
    } catch { setError('Failed to load order'); } finally { setLoading(false); }
  };

  const handlePayment = async (gateway: string) => {
    if (!order) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/payment/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber: order.orderNumber, orderId: order.id, amount: order.totalAmount, gateway, type: 'voucher' }) });
      const data = await res.json();
      if (!res.ok) { await showError(data.error || 'Gagal'); return; }
      
      // Check if qrString is available (for Duitku QRIS)
      if (data.qrString && gateway === 'duitku') {
        // If QR string available, redirect to payment page which will display QR
        if (data.paymentUrl) window.location.href = data.paymentUrl;
        else await showError('Payment URL tidak tersedia');
      } else if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        await showError('Payment URL tidak tersedia');
      }
    } catch { await showError('Gagal memproses pembayaran'); } finally { setProcessing(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600 mb-2" /><p className="text-xs text-gray-600 dark:text-gray-400">Loading...</p></div>
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 max-w-sm w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Order Tidak Ditemukan</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">{error || 'Link pembayaran tidak valid.'}</p>
      </div>
    </div>
  );

  if (order.status === 'PAID' && order.vouchers.length > 0) return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md mx-auto py-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
          <div className="text-center mb-5">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" /></div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Pembayaran Berhasil!</h1>
            <p className="text-xs text-gray-600 dark:text-gray-400">Voucher WiFi Anda sudah siap</p>
          </div>
          <div className="space-y-2 mb-4">
            {order.vouchers.map((voucher, idx) => (
              <div key={idx} className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Kode Voucher #{idx + 1}</p>
                <p className="text-xl font-bold font-mono text-teal-600 dark:text-teal-400 tracking-wider">{voucher.code}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4">
            <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">Cara Menggunakan:</p>
            <div className="space-y-1.5 text-[10px] text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" /><span>Hubungkan ke WiFi</span></div>
              <div className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" /><span>Buka browser dan masukkan kode voucher</span></div>
              <div className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" /><span>Klik login dan nikmati internet!</span></div>
            </div>
          </div>
          <button onClick={() => router.push('/evoucher')} className="w-full px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 rounded-lg">Beli Voucher Lagi</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-6 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-cyan-600 rounded-full mb-2"><Wifi className="w-4 h-4 text-white" /><span className="text-xs font-medium text-white">Pembayaran Voucher</span></div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Detail Pesanan</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span className="text-gray-500">Nomor Pesanan</span><span className="font-mono font-medium text-gray-900 dark:text-white">{order.orderNumber}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Paket</span><span className="font-medium text-gray-900 dark:text-white">{order.profile.name}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Jumlah</span><span className="font-medium text-gray-900 dark:text-white">{order.quantity}x</span></div>
            <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700"><span className="text-xs font-semibold text-gray-900 dark:text-white">Total Bayar</span><span className="text-lg font-bold text-teal-600 dark:text-teal-400">{formatCurrency(order.totalAmount)}</span></div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700"><h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-teal-600" />Metode Pembayaran</h2></div>
          <div className="p-4">
            {paymentGateways.length === 0 ? <div className="text-center py-6"><Wifi className="w-10 h-10 text-gray-400 mx-auto mb-2" /><p className="text-xs text-gray-500">Tidak tersedia</p></div> : (
              <div className="space-y-2">{paymentGateways.map((gateway) => (
                <button key={gateway.id} onClick={() => handlePayment(gateway.provider)} disabled={processing} className="w-full flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-teal-500 dark:hover:border-teal-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all disabled:opacity-50">
                  <div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg flex items-center justify-center"><CreditCard className="w-4 h-4 text-white" /></div><span className="text-xs font-semibold text-gray-900 dark:text-white">{gateway.name}</span></div>
                  {processing ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <span className="text-[10px] text-gray-500">Bayar →</span>}
                </button>
              ))}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
