'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff, Search, RefreshCw, Loader2, Clock } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api';
import { formatWIB } from '@/lib/timezone';
import { Pagination } from '@/components/Pagination';
import CustomerDetailSheet, { type DetailCustomer } from '@/components/field/CustomerDetailSheet';
import { ConnectionBadge, UnreachableNotice } from '@/components/field/ConnectionBadge';

interface OfflineUser extends DetailCustomer {
  connection: 'offline' | 'unknown';
  lastOnlineAt: string | null;
  paymentStatus?: 'paid' | 'unpaid' | 'overdue';
  name: string;
  phone: string;
}

interface PaginationData { total: number; page: number; limit: number; totalPages: number; }
interface Summary { offline: number; unknown: number; unreachableRouters: Array<{ id: string; name: string }>; }

type StateFilter = 'all' | 'offline' | 'unknown';

const PAY_LABEL: Record<string, { text: string; cls: string }> = {
  overdue: { text: 'Menunggak', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  unpaid: { text: 'Belum bayar', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  paid: { text: 'Lunas', cls: 'bg-green-500/10 text-green-600 dark:text-green-400' },
};

export default function TechnicianOfflinePage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [users, setUsers] = useState<OfflineUser[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [detail, setDetail] = useState<OfflineUser | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const pageRef = useRef(1);

  const loadData = useCallback(async (page: number = 1, isPoll = false) => {
    try {
      if (!isPoll) setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (stateFilter !== 'all') params.set('state', stateFilter);
      params.set('page', page.toString());
      params.set('limit', '50');
      const data = await apiAdmin<{ users: OfflineUser[]; pagination?: PaginationData; summary?: Summary }>(`/api/technician/offline?${params}`);
      setUsers(data.users || []);
      if (data.summary) setSummary(data.summary);
      if (data.pagination) { setPagination(data.pagination); pageRef.current = data.pagination.page; }
    } catch {
      if (!isPoll) addToast({ type: 'error', title: 'Failed to load data' });
    } finally {
      if (!isPoll) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stateFilter]);

  // Search runs on the server (paging is in the database), so debounce it.
  useEffect(() => {
    const timer = setTimeout(() => loadData(1), 300);
    const interval = setInterval(() => loadData(pageRef.current, true), 30000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [loadData]);

  const lastSeen = (u: OfflineUser) => (u.lastOnlineAt ? formatWIB(u.lastOnlineAt, 'dd MMM yyyy HH:mm') : 'Belum pernah');

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-red-500/10 dark:bg-red-500/20 rounded-xl flex items-center justify-center">
            <WifiOff className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('techPortal.offlineUsers')}</h1>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.offline} offline` : '...'}
              {summary && summary.unknown > 0 ? ` · ${summary.unknown} tidak diketahui` : ''}
              {' · pelanggan aktif yang tidak sedang terhubung'}
            </p>
          </div>
        </div>
        <button onClick={() => loadData(pagination.page)} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-muted border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-primary/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <UnreachableNotice routers={summary?.unreachableRouters} />

      {/* Search + state filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/30 transition" />
        </div>
        <div className="flex gap-1">
          {(['all', 'offline', 'unknown'] as const).map((f) => (
            <button key={f} onClick={() => setStateFilter(f)} className={`px-3 py-2 text-xs font-bold rounded-xl transition ${stateFilter === f ? 'bg-primary text-primary-foreground' : 'bg-slate-100 dark:bg-muted border border-border text-muted-foreground hover:bg-slate-200 dark:hover:bg-primary/10'}`}>
              {f === 'all' ? t('techPortal.all') : f === 'offline' ? 'Offline' : 'Tidak diketahui'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground/70">
          <WifiOff className="w-10 h-10 mx-auto mb-2 opacity-30" />
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">{t('techPortal.phone')}</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Profile</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Router / Area</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Terakhir online</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Tagihan</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => setDetail(u)} className="border-b border-slate-100 dark:border-border hover:bg-slate-50 dark:hover:bg-primary/10 transition cursor-pointer">
                    <td className="px-4 py-3 font-medium text-foreground">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.phone || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.profile?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.router?.name || '-'}{u.area ? ` • ${u.area.name}` : ''}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground/80">{lastSeen(u)}</td>
                    <td className="px-4 py-3">
                      {u.paymentStatus && <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${PAY_LABEL[u.paymentStatus].cls}`}>{PAY_LABEL[u.paymentStatus].text}</span>}
                    </td>
                    <td className="px-4 py-3"><ConnectionBadge state={u.connection} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {users.map((u) => (
              <div key={u.id} onClick={() => setDetail(u)} className="bg-card border border-border rounded-2xl p-4 space-y-2 cursor-pointer">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{u.name || u.username}</p>
                    <p className="text-xs text-muted-foreground">{u.username}</p>
                  </div>
                  <ConnectionBadge state={u.connection} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground/70">{t('techPortal.phone')}: </span>
                    <span className="text-foreground/80">{u.phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70">Profile: </span>
                    <span className="text-foreground/80">{u.profile?.name || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-border text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{lastSeen(u)}</span>
                  {u.paymentStatus && <span className={`px-2 py-0.5 rounded-lg font-bold ${PAY_LABEL[u.paymentStatus].cls}`}>{PAY_LABEL[u.paymentStatus].text}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">{u.router?.name || '-'}{u.area ? ` • ${u.area.name}` : ''}</p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(p) => loadData(p)}
          />
        </>
      )}

      {detail && (
        <CustomerDetailSheet customer={detail} onClose={() => setDetail(null)}>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Koneksi</span>
              <ConnectionBadge state={detail.connection} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Terakhir online</dt><dd className="text-right text-foreground">{lastSeen(detail)}</dd>
              <dt className="text-muted-foreground">Router</dt><dd className="text-right text-foreground">{detail.router?.name || '-'}</dd>
            </dl>
            {detail.connection === 'unknown' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Router pelanggan ini tidak dapat dihubungi, jadi status online-nya tidak bisa dipastikan.</p>
            )}
          </div>
        </CustomerDetailSheet>
      )}
    </div>
  );
}
