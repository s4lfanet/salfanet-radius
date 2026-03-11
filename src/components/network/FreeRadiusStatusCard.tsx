'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Radio } from 'lucide-react';

interface RadiusStatus {
  status: 'running' | 'stopped';
  uptime: string;
}

interface Props {
  className?: string;
}

export default function FreeRadiusStatusCard({ className = '' }: Props) {
  const [data, setData] = useState<RadiusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/system/radius');
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isRunning = data?.status === 'running';

  return (
    <div
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-teal-600 dark:text-teal-400">
            <Radio size={14} />
          </span>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            FreeRADIUS
          </span>
        </div>
        <button
          onClick={() => fetchStatus(true)}
          disabled={refreshing || loading}
          title="Refresh status"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={`text-gray-400 ${refreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      ) : !data ? (
        <p className="text-xs text-gray-400">Tidak dapat mengambil status</p>
      ) : (
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span
            className={`inline-flex w-2 h-2 rounded-full flex-shrink-0 ${
              isRunning ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold leading-tight ${
                isRunning
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {isRunning ? 'Running' : 'Stopped'}
            </p>
            {isRunning && data.uptime && data.uptime !== 'N/A' && (
              <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
                Uptime: {data.uptime}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
