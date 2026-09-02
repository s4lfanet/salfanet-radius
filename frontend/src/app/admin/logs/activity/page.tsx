'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import { formatWIB } from '@/lib/timezone';
import { Activity, Search, RefreshCw } from 'lucide-react';
import { Pagination } from '@/components/Pagination';
import { useApiQuery } from '@/lib/api/hooks';

interface ActivityLogEntry {
  id: string;
  username: string;
  userRole: string | null;
  action: string;
  description: string;
  module: string;
  status: string;
  ipAddress: string | null;
  createdAt: string;
}

const MODULES = [
  { value: 'all', label: 'Semua Modul' },
  { value: 'pppoe', label: 'PPPoE' },
  { value: 'hotspot', label: 'Hotspot' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Pembayaran' },
  { value: 'agent', label: 'Agen' },
  { value: 'session', label: 'Sesi' },
  { value: 'transaction', label: 'Transaksi' },
  { value: 'system', label: 'Sistem' },
  { value: 'auth', label: 'Autentikasi' },
  { value: 'network', label: 'Jaringan' },
  { value: 'user', label: 'Pengguna' },
];

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

const PAGE_SIZE = 25;

export default function ActivityLogsPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [moduleFilter, setModuleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);

  const canView = !hasPermission || hasPermission('settings.view');

  // ─── React Query: Activity logs (pagination + filters) ───────────────────────
  const { data: rawData, isLoading: loading, refetch, error: queryError } = useApiQuery<{ success: boolean; activities: ActivityLogEntry[]; total: number; error?: string }>(
    '/api/admin/activity-logs',
    {
      params: { limit: PAGE_SIZE, offset, module: moduleFilter, search },
      enabled: canView,
      staleTime: 30000,
    }
  );
  const logs = rawData?.activities || [];
  const total = rawData?.total || 0;
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : (rawData && !rawData.success ? (rawData.error || 'Gagal memuat log aktivitas') : null);

  const handleSearch = () => {
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const handleModuleChange = (value: string) => {
    setOffset(0);
    setModuleFilter(value);
  };

  const handleRefresh = () => {
    refetch();
  };

  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  if (hasPermission && !hasPermission('settings.view')) {
    return (
      <div className="p-6">
        <div className="bg-card rounded-lg p-6 text-center text-muted-foreground">
          Anda tidak memiliki izin untuk mengakses halaman ini
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" />
          <h1 className="text-lg font-semibold text-foreground">
            {t('nav.activityLogs') || 'Log Aktivitas'}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={moduleFilter}
          onChange={(e) => handleModuleChange(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-card text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {MODULES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Cari username, aksi, deskripsi, IP..."
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
          {loading ? 'Memuat...' : `${total} total`}
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
                <th className="px-3 py-2 text-left font-medium">Pengguna</th>
                <th className="px-3 py-2 text-left font-medium">Modul</th>
                <th className="px-3 py-2 text-left font-medium">Aksi</th>
                <th className="px-3 py-2 text-left font-medium">Deskripsi</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    Memuat log aktivitas...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    Tidak ada log aktivitas
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatWIB(log.createdAt, 'dd MMM yyyy, HH:mm:ss')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-medium text-foreground">
                        {log.username}
                      </div>
                      {log.userRole && (
                        <div className="text-[10px] text-gray-400 uppercase">{log.userRole}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 uppercase">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-muted-foreground">
                      {log.action}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-md truncate">
                      {log.description}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          STATUS_STYLES[log.status] || STATUS_STYLES.success
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-500 font-mono">
                      {log.ipAddress || '-'}
                    </td>
                  </tr>
                ))
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
