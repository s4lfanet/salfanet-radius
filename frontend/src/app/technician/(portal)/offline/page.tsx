'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { WifiOff, Search, RefreshCw, Loader2, User as UserIcon } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api';
import { Pagination } from '@/components/Pagination';

interface OfflineUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  status: string;
  expiredAt: string | null;
  profile: { id: string; name: string; groupName: string } | null;
  router?: { id: string; name: string } | null;
  area?: { id: string; name: string } | null;
  source?: 'database' | 'mikrotik';
  disabled?: boolean;
}

interface PaginationData { total: number; page: number; limit: number; totalPages: number; }

export default function TechnicianOfflinePage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [users, setUsers] = useState<OfflineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 50, totalPages: 1 });

  const loadData = async (page: number = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', page.toString());
      params.set('limit', '50');
      const data = await apiAdmin<{ users: OfflineUser[]; total: number; pagination?: PaginationData }>(`/api/technician/offline?${params}`);
      setUsers(data.users || []);
      if (data.pagination) setPagination(data.pagination);
    } catch {
      addToast({ type: 'error', title: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(1); }, []);

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.phone.includes(search)
  );

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
            <p className="text-xs text-muted-foreground">{pagination.total} pelanggan offline</p>
          </div>
        </div>
        <button onClick={() => loadData(pagination.page)} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-border rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : filtered.length === 0 ? (
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Router</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Area</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 dark:border-[#bc13fe]/10 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3 font-medium text-foreground">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.phone || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.profile?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.router?.name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground/80">{u.area?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${u.status === 'isolated' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : u.disabled ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'}`}>{u.disabled ? 'disabled' : u.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${u.source === 'mikrotik' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'bg-slate-500/10 text-slate-500'}`}>{u.source || 'database'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((u) => (
              <div key={u.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{u.username}</p>
                    <p className="text-xs text-muted-foreground">{u.name || '-'}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-bold rounded-lg ${u.disabled ? 'bg-red-500/10 text-red-600 dark:text-red-400' : u.status === 'isolated' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>{u.disabled ? 'Disabled' : 'Offline'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground/70">{t('techPortal.phone')}: </span>
                    <span className="text-foreground/80">{u.phone}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/70">Profile: </span>
                    <span className="text-foreground/80">{u.profile?.name || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#bc13fe]/10 text-xs">
                  <span className="text-muted-foreground">{u.router?.name || '-'} {u.area ? `• ${u.area.name}` : ''}</span>
                  <span className={`px-2 py-0.5 rounded-lg font-medium ${u.status === 'isolated' ? 'bg-orange-500/10 text-orange-500' : u.disabled ? 'bg-red-500/10 text-red-500' : 'text-muted-foreground'}`}>{u.disabled ? 'disabled' : u.status}</span>
                </div>
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
    </div>
  );
}
