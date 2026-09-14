'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import {
  ShieldCheck, ShieldX, Search, RefreshCw, Loader2, Activity,
} from 'lucide-react';
import { Pagination } from '@/components/Pagination';
import { useApiQuery } from '@/lib/api/hooks';

interface AuthLogEntry {
  id: number;
  username: string;
  reply: string;
  authdate: string;
  nasipaddress: string | null;
  nasportid: string | null;
}

interface AuthLogResponse {
  success: boolean;
  entries: AuthLogEntry[];
  total: number;
  stats: {
    acceptToday: number;
    rejectToday: number;
    totalAll: number;
  };
}

const PAGE_SIZE = 25;

export default function RadiusAuthLogPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [replyFilter, setReplyFilter] = useState('all');
  const [offset, setOffset] = useState(0);

  const { data, isLoading: loading, refetch, error: queryError } = useApiQuery<AuthLogResponse>(
    '/api/freeradius/auth-log',
    {
      params: { limit: PAGE_SIZE, offset, search, reply: replyFilter },
      staleTime: 30000,
    }
  );

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const stats = data?.stats || { acceptToday: 0, rejectToday: 0, totalAll: 0 };
  const error = queryError
    ? (queryError instanceof Error ? queryError.message : String(queryError))
    : (data && !data.success ? 'Gagal memuat log autentikasi RADIUS' : null);

  const handleSearch = () => {
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const handleReplyChange = (value: string) => {
    setOffset(0);
    setReplyFilter(value);
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-500" />
          <h1 className="text-lg font-semibold text-foreground">
            {t('dashboard.radiusAuthLog') || 'Log Autentikasi RADIUS'}
          </h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-muted-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border border-gray-200 dark:border-white/10 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Accept Hari Ini</span>
          </div>
          <p className="text-lg font-bold text-green-500 dark:text-green-400">{stats.acceptToday.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-lg border border-gray-200 dark:border-white/10 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldX className="w-4 h-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Reject Hari Ini</span>
          </div>
          <p className="text-lg font-bold text-red-500 dark:text-red-400">{stats.rejectToday.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-lg border border-gray-200 dark:border-white/10 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-brand-500" />
            <span className="text-xs text-muted-foreground">Total Semua</span>
          </div>
          <p className="text-lg font-bold text-foreground">{stats.totalAll.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={replyFilter}
          onChange={(e) => handleReplyChange(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-card text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="all">Semua</option>
          <option value="accept">Access-Accept</option>
          <option value="reject">Access-Reject</option>
        </select>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Cari username..."
              className="pl-7 pr-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-card text-muted-foreground placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 w-64"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand-500 hover:bg-brand-600 text-white transition-colors"
          >
            Cari
          </button>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {loading ? 'Memuat...' : `${total.toLocaleString()} total`}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md p-3 text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-white/5 text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Waktu</th>
                <th className="px-3 py-2 text-left font-medium">Username</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">NAS IP</th>
                <th className="px-3 py-2 text-left font-medium">Port</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                    Tidak ada log autentikasi
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isAccepted = entry.reply === 'Access-Accept';
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatWIB(entry.authdate, 'dd MMM yyyy, HH:mm:ss')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-foreground">
                        {entry.username}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isAccepted
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        }`}>
                          {isAccepted ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                          {entry.reply}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono">
                        {entry.nasipaddress || '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono">
                        {entry.nasportid || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/5">
          <Pagination
            page={Math.floor(offset / PAGE_SIZE) + 1}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            total={total}
            limit={PAGE_SIZE}
            onPageChange={(p) => setOffset((p - 1) * PAGE_SIZE)}
            disabled={loading}
            alwaysVisible
          />
        </div>
      </div>
    </div>
  );
}
