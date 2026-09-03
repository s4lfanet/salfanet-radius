'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, Loader2, TrendingUp, Calendar } from 'lucide-react';
import { apiAdmin } from '@/lib/api';

interface MonthlyData {
  month: string;
  total_count: number;
  total_amount: number;
  cash_amount: number;
  transfer_amount: number;
}

interface CollectionData {
  total_count: number;
  total_amount: number;
  monthly: MonthlyData[];
  recent: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    paymentMethod: string | null;
    paidAt: string | null;
    customerName: string | null;
    customerUsername: string | null;
    customerId: string;
    phone: string;
    profileName: string;
    areaName: string;
    address: string;
  }>;
}

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtMonth = (m: string) => {
  if (!m || m === 'unknown') return '—';
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(mo) - 1]} ${y}`;
};
const fmtTime = (d: string | null) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function CollectorMyCollectionsPage() {
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiAdmin<CollectionData>('/api/collector/my-collections?months=6');
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pmBadge = (m: string | null) => {
    if (!m || m === 'cash') return <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Tunai</span>;
    if (m === 'transfer' || m === 'online') return <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Transfer</span>;
    if (m === 'discount') return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Diskon</span>;
    return <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{m}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="card p-8 text-center text-muted-foreground">Gagal memuat data.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Riwayat Koleksi Saya
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Rekap penagihan Anda dalam 6 bulan terakhir.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-l-4 border-emerald-500">
          <div className="text-xs text-muted-foreground mb-1">Total Transaksi</div>
          <div className="text-2xl font-bold text-emerald-600">{data.total_count}</div>
        </div>
        <div className="card p-4 border-l-4 border-blue-500">
          <div className="text-xs text-muted-foreground mb-1">Total Nominal</div>
          <div className="text-lg font-bold text-blue-600">{fmtRp(data.total_amount)}</div>
        </div>
        <div className="card p-4 border-l-4 border-cyan-500">
          <div className="text-xs text-muted-foreground mb-1">Tunai</div>
          <div className="text-lg font-bold text-cyan-600">{fmtRp(data.monthly.reduce((s, m) => s + m.cash_amount, 0))}</div>
        </div>
        <div className="card p-4 border-l-4 border-purple-500">
          <div className="text-xs text-muted-foreground mb-1">Transfer</div>
          <div className="text-lg font-bold text-purple-600">{fmtRp(data.monthly.reduce((s, m) => s + m.transfer_amount, 0))}</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Ringkasan Bulanan
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-semibold text-muted-foreground">Bulan</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Tagihan</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Total</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Tunai</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Belum ada data.</td></tr>
                ) : data.monthly.map(m => (
                  <tr key={m.month} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium text-foreground">{fmtMonth(m.month)}</td>
                    <td className="p-3 text-right text-muted-foreground">{m.total_count}</td>
                    <td className="p-3 text-right font-semibold text-foreground">{fmtRp(m.total_amount)}</td>
                    <td className="p-3 text-right text-cyan-600">{fmtRp(m.cash_amount)}</td>
                    <td className="p-3 text-right text-purple-600">{fmtRp(m.transfer_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Collections */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Koleksi Terbaru
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-semibold text-muted-foreground">Pelanggan</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Kontak</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Alamat</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Paket</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Area</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Invoice</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Jumlah</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Metode</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Belum ada koleksi.</td></tr>
                ) : data.recent.map(inv => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium text-foreground">{inv.customerName || inv.customerUsername}</div>
                      <div className="text-xs text-muted-foreground font-mono">{inv.customerId || inv.customerUsername}</div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{inv.phone || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate" title={inv.address}>{inv.address || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{inv.profileName || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{inv.areaName || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{inv.invoiceNumber}</td>
                    <td className="p-3 text-right font-semibold text-foreground">{fmtRp(inv.amount)}</td>
                    <td className="p-3 text-center">{pmBadge(inv.paymentMethod)}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{fmtTime(inv.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
