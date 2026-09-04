'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { Shield, Search, RefreshCw, Loader2, Wifi, WifiOff, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatCurrency } from '@/lib/utils';
import { apiAdmin } from '@/lib/api/client';

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  status: string;
}

interface IsolatedUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  status: string;
  profileName: string;
  profilePrice: number;
  totalUnpaid: number;
  unpaidInvoicesCount: number;
  isOnline: boolean;
  ipAddress: string | null;
  areaName: string | null;
  unpaidInvoices: UnpaidInvoice[];
}

interface Stats {
  totalIsolated: number;
  totalOnline: number;
  totalOffline: number;
  totalUnpaidAmount: number;
}

export default function TechnicianIsolatedPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [users, setUsers] = useState<IsolatedUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);


  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiAdmin<{ success: boolean; data?: IsolatedUser[]; stats?: Stats | null }>('/api/technician/isolated');
      if (data.success) {
        setUsers(data.data || []);
        setStats(data.stats || null);
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search);
    const matchFilter = filter === 'all' || (filter === 'online' ? u.isOnline : !u.isOnline);
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500/10 dark:bg-orange-500/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('techPortal.isolatedUsers')}</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} {t('techPortal.customers')}</p>
          </div>
        </div>
        <button onClick={fetchData} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-muted border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-violet-500/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.totalIsolated}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div className="bg-card border border-slate-200 dark:border-green-500/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{stats.totalOnline}</p>
            <p className="text-[10px] text-muted-foreground">Online</p>
          </div>
          <div className="bg-card border border-slate-200 dark:border-red-500/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{stats.totalOffline}</p>
            <p className="text-[10px] text-muted-foreground">Offline</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/30 transition" />
        </div>
        <div className="flex gap-1">
          {(['all', 'online', 'offline'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-xs font-bold rounded-xl transition ${filter === f ? 'bg-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]' : 'bg-slate-100 dark:bg-muted border border-border text-muted-foreground hover:bg-slate-200 dark:hover:bg-violet-500/10'}`}>
              {f === 'all' ? t('techPortal.all') : f === 'online' ? 'Online' : 'Offline'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground/70">
          <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-auto bg-card border border-border rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Username</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">{t('techPortal.name')}</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Profile</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Area</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">{t('techPortal.unpaid')}</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)} className="border-b border-slate-100 dark:border-violet-500/10 hover:bg-slate-50 dark:hover:bg-violet-500/5 transition cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.profileName}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.areaName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${u.isOnline ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                        {u.isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {u.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-red-600 dark:text-red-400 font-bold text-xs">{formatCurrency(u.totalUnpaid)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground/80">{u.ipAddress || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((u) => (
              <div key={u.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="p-4 space-y-2" onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{u.username}</p>
                      <p className="text-xs text-muted-foreground">{u.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${u.isOnline ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                        {u.isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      </span>
                      {expandedUser === u.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{u.profileName} {u.areaName ? `• ${u.areaName}` : ''}</span>
                    <span className="font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      {formatCurrency(u.totalUnpaid)}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedUser === u.id && u.unpaidInvoices.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-violet-500/10 bg-input/50 p-3 space-y-2">
                    <p className="text-xs font-bold text-foreground/80">{t('techPortal.unpaidInvoices')} ({u.unpaidInvoices.length})</p>
                    {u.unpaidInvoices.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground/60">{inv.invoiceNumber}</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(inv.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
