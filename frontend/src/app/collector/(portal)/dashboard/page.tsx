'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { Wallet, UserX, FileText, TrendingUp, DollarSign, Banknote, Smartphone, ChevronLeft, ChevronRight, CheckCircle2, Receipt } from 'lucide-react';
import { ScopeFilter, scopeQuery, type ScopeValue } from '@/components/collector/ScopeFilter';

const fmtRp = (v: number) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shiftMonth = (period: string, delta: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

type Card = { label: string; value: string | number; icon: React.ReactNode; color: string; note?: string; raw?: boolean };

const colorMap: Record<string, string> = {
  emerald: 'from-emerald-500 to-teal-500',
  blue: 'from-blue-500 to-cyan-500',
  cyan: 'from-cyan-500 to-blue-500',
  purple: 'from-primary to-pink-500',
  amber: 'from-amber-500 to-orange-500',
  red: 'from-red-500 to-rose-500',
  orange: 'from-orange-500 to-amber-500',
  slate: 'from-slate-500 to-gray-500',
};

function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
            <div className={`w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br ${colorMap[card.color]} flex items-center justify-center text-white`}>
              {card.icon}
            </div>
            {card.note && <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full truncate">{card.note}</span>}
          </div>
          <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
          <div className={`font-bold ${card.raw ? 'text-2xl' : 'text-lg'} text-foreground break-words`}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function CollectorDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(thisMonth);
  const [scope, setScope] = useState<ScopeValue>({ areaId: '', routerId: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdmin<{ summary: any }>(`/api/collector/dashboard?period=${period}${scopeQuery(scope)}`);
      setData(res.summary);
    } catch {}
    finally { setLoading(false); }
  }, [period, scope]);

  useEffect(() => { loadData() }, [loadData]);

  const s = data || {};
  const month = monthLabel(period);
  const isCurrent = period === thisMonth();
  const tx = (n: number) => `${n || 0} transaksi`;
  const inv = (n: number) => `${n || 0} tagihan`;

  const collections: Card[] = [
    ...(isCurrent ? [{ label: 'Setoran Hari Ini', value: fmtRp(s.today_amount), icon: <DollarSign className="w-5 h-5" />, color: 'emerald', note: tx(s.today_count) }] : []),
    { label: `Total Setoran ${month}`, value: fmtRp(s.total_amount), icon: <Wallet className="w-5 h-5" />, color: 'blue', note: tx(s.invoice_count) },
    { label: 'Tunai', value: fmtRp(s.cash_amount), icon: <Banknote className="w-5 h-5" />, color: 'cyan' },
    { label: 'Transfer', value: fmtRp(s.transfer_amount), icon: <Smartphone className="w-5 h-5" />, color: 'purple' },
    { label: 'Diskon', value: fmtRp(s.discount_amount), icon: <TrendingUp className="w-5 h-5" />, color: 'amber' },
  ];

  const billing: Card[] = [
    { label: 'Total Tagihan', value: fmtRp(s.bill_amount), icon: <Receipt className="w-5 h-5" />, color: 'slate', note: inv(s.bill_count) },
    { label: 'Sudah Lunas', value: fmtRp(s.bill_paid_amount), icon: <CheckCircle2 className="w-5 h-5" />, color: 'emerald', note: inv(s.bill_paid_count) },
    { label: 'Belum Bayar', value: fmtRp(s.unpaid_amount), icon: <FileText className="w-5 h-5" />, color: 'orange', note: inv(s.unpaid_count) },
    { label: 'Pelanggan Isolir', value: s.isolir_count || 0, icon: <UserX className="w-5 h-5" />, color: 'red', note: 'saat ini', raw: true },
  ];

  const navBtn = 'h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent transition-colors';

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Dashboard Kolektor</h2>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan penagihan dan setoran per bulan</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => setPeriod((p) => shiftMonth(p, -1))} className={navBtn}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-[9.5rem] text-center text-sm font-semibold text-foreground capitalize">{month}</div>
          <button type="button" aria-label="Bulan berikutnya" onClick={() => setPeriod((p) => shiftMonth(p, 1))} className={navBtn}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrent && (
            <button type="button" onClick={() => setPeriod(thisMonth())} className="h-9 px-3 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              Bulan ini
            </button>
          )}
        </div>
      </div>

      <ScopeFilter value={scope} onChange={setScope} />

      <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <h3 className="text-sm font-semibold text-foreground mb-2 mt-2">Setoran Saya</h3>
        <CardGrid cards={collections} />

        <h3 className="text-sm font-semibold text-foreground mb-2 mt-6">Tagihan {month}</h3>
        <p className="text-xs text-muted-foreground -mt-1 mb-2">Tagihan pelanggan Anda yang jatuh tempo di bulan ini.</p>
        <CardGrid cards={billing} />
      </div>
    </div>
  );
}
