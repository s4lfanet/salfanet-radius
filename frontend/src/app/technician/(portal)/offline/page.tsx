'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { WifiOff, Search, RefreshCw, Loader2, Clock, User as UserIcon } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';

interface OfflineUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  status: string;
  expiredAt: string | null;
  profile: { id: string; name: string; groupName: string };
  router?: { id: string; name: string } | null;
  area?: { id: string; name: string } | null;
}

export default function TechnicianOfflinePage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [users, setUsers] = useState<OfflineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/technician/offline');
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      addToast({ type: 'error', title: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

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
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('techPortal.offlineUsers')}</h1>
            <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{filtered.length} pelanggan offline</p>
          </div>
        </div>
        <button onClick={loadData} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-[#e0d0ff] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('techPortal.search')} className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-[#e0d0ff]/50">
          <WifiOff className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-auto bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#bc13fe]/20 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Username</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.name')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.phone')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Profile</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Router</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Area</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 dark:border-[#bc13fe]/10 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.username}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{u.phone}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{u.profile?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{u.router?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{u.area?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-lg ${u.status === 'isolated' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'}`}>{u.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((u) => (
              <div key={u.id} className="bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{u.username}</p>
                    <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{u.name}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-bold rounded-lg ${u.status === 'isolated' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>Offline</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.phone')}: </span>
                    <span className="text-slate-700 dark:text-[#e0d0ff]/80">{u.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">Profile: </span>
                    <span className="text-slate-700 dark:text-[#e0d0ff]/80">{u.profile?.name || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#bc13fe]/10 text-xs">
                  <span className="text-slate-500 dark:text-[#e0d0ff]/60">{u.router?.name || '-'} {u.area ? `• ${u.area.name}` : ''}</span>
                  <span className={`px-2 py-0.5 rounded-lg font-medium ${u.status === 'isolated' ? 'bg-orange-500/10 text-orange-500' : 'text-slate-500 dark:text-[#e0d0ff]/60'}`}>{u.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
