'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { Wallet, Users, UserX, FileText, TrendingUp, DollarSign, Banknote, Smartphone } from 'lucide-react';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

export default function CollectorDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await apiAdmin<{ summary: any }>('/api/collector/dashboard');
      setData(res.summary);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData() }, [loadData]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Memuat...</div>;
  }

  const s = data || {};
  const cards = [
    { label: 'Setoran Hari Ini', value: fmtRp(s.today_amount), icon: <DollarSign className="w-5 h-5" />, color: 'emerald', count: s.today_count },
    { label: 'Total Bulan Ini', value: fmtRp(s.total_amount), icon: <Wallet className="w-5 h-5" />, color: 'blue', count: s.invoice_count },
    { label: 'Tunai', value: fmtRp(s.cash_amount), icon: <Banknote className="w-5 h-5" />, color: 'cyan' },
    { label: 'Transfer', value: fmtRp(s.transfer_amount), icon: <Smartphone className="w-5 h-5" />, color: 'purple' },
    { label: 'Diskon', value: fmtRp(s.discount_amount), icon: <TrendingUp className="w-5 h-5" />, color: 'amber' },
    { label: 'Pelanggan Isolir', value: s.isolir_count || 0, icon: <UserX className="w-5 h-5" />, color: 'red', raw: true },
    { label: 'Tagihan Belum Bayar', value: s.unpaid_count || 0, icon: <FileText className="w-5 h-5" />, color: 'orange', raw: true },
    { label: 'Periode', value: s.period, icon: <Users className="w-5 h-5" />, color: 'slate', raw: true },
  ];

  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500 to-teal-500',
    blue: 'from-blue-500 to-cyan-500',
    cyan: 'from-cyan-500 to-blue-500',
    purple: 'from-purple-500 to-pink-500',
    amber: 'from-amber-500 to-orange-500',
    red: 'from-red-500 to-rose-500',
    orange: 'from-orange-500 to-amber-500',
    slate: 'from-slate-500 to-gray-500',
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Dashboard Kolektor</h2>
        <p className="text-sm text-muted-foreground mt-1">Ringkasan aktivitas penagihan dan setoran</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorMap[card.color]} flex items-center justify-center text-white`}>
                {card.icon}
              </div>
              {card.count !== undefined && (
                <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">{card.count} transaksi</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
            <div className={`font-bold ${card.raw ? 'text-2xl' : 'text-lg'} text-foreground`}>{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
