'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import { showConfirm } from '@/lib/sweetalert';

interface Fault {
  _id?: string;
  device?: string;
  channel?: string;
  code: string;
  message: string;
  timestamp?: string;
  retries?: number;
}

interface FaultsListResponse {
  success: boolean;
  error?: string;
  data?: Fault[];
}

interface FaultDeleteResponse {
  success: boolean;
  error?: string;
}

interface BulkDeleteResponse {
  success: boolean;
  error?: string;
  data?: { success: number; failed: number; errors: { id: string; error: string }[] };
}

export default function GenieACSFaultsPage() {
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const queryClient = useQueryClient();

  const { data: queryData, isLoading: loading, refetch } = useApiQuery<FaultsListResponse>(
    '/api/genieacs/faults',
    { params: filter ? { device: filter } : undefined, staleTime: 60000 },
  );
  const items: Fault[] = queryData?.data || [];

  const invalidateFaults = () => queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/genieacs/faults') });

  const remove = async (id: string) => {
    if (!(await showConfirm(`Delete fault "${id}"?`))) return;
    try {
      const json = await apiAdmin<FaultDeleteResponse>('/api/genieacs/faults', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
      if (!json.success) throw new Error(json.error || 'Delete failed');
      invalidateFaults();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((f) => f._id).filter(Boolean) as string[]);
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!(await showConfirm(`Delete ${selected.size} selected fault(s)?`))) return;
    setBulkBusy(true);
    try {
      const json = await apiAdmin<BulkDeleteResponse>('/api/genieacs/faults/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!json.success) throw new Error(json.error || 'Bulk delete failed');
      setSelected(new Set());
      invalidateFaults();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const allSelected = useMemo(() => items.length > 0 && selected.size === items.length, [items, selected]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" /> GenieACS Faults
          </h1>
          <p className="text-sm text-slate-500">Daftar fault provisioning per device</p>
        </div>
        <div className="flex gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by device id"
            className="px-3 py-2 text-sm border rounded-md"
          />
          <button
            onClick={() => refetch()}
            className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {selected.size > 0 && (
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete {selected.size} selected
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
      )}

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="text-left px-3 py-2">Device</th>
              <th className="text-left px-3 py-2">Channel</th>
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Message</th>
              <th className="text-left px-3 py-2">Retries</th>
              <th className="text-left px-3 py-2">Timestamp</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-6">
                  <Loader2 className="w-5 h-5 inline animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-slate-500">
                  No faults
                </td>
              </tr>
            ) : (
              items.map((f) => {
                const id = f._id ?? '';
                const checked = id ? selected.has(id) : false;
                return (
                  <tr key={id || `${f.device}-${f.channel}`} className="border-t">
                    <td className="px-3 py-2">
                      {id && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(id)}
                          aria-label={`Select ${id}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{f.device ?? '-'}</td>
                    <td className="px-3 py-2 text-xs">{f.channel ?? '-'}</td>
                    <td className="px-3 py-2 text-xs">{f.code}</td>
                    <td className="px-3 py-2 text-xs max-w-[420px] truncate" title={f.message}>
                      {f.message}
                    </td>
                    <td className="px-3 py-2 text-xs">{f.retries ?? 0}</td>
                    <td className="px-3 py-2 text-xs">{f.timestamp ?? '-'}</td>
                    <td className="px-3 py-2 text-right">
                      {id && (
                        <button
                          onClick={() => remove(id)}
                          className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
