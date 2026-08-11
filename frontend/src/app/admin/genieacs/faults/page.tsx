'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Fault {
  _id?: string;
  device?: string;
  channel?: string;
  code: string;
  message: string;
  timestamp?: string;
  retries?: number;
}

export default function GenieACSFaultsPage() {
  const [items, setItems] = useState<Fault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter
        ? `/api/genieacs/faults?device=${encodeURIComponent(filter)}`
        : '/api/genieacs/faults';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setItems(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm(`Delete fault "${id}"?`)) return;
    try {
      const res = await fetch('/api/genieacs/faults', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

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
            onClick={load}
            className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
      )}

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
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
                <td colSpan={7} className="text-center py-6">
                  <Loader2 className="w-5 h-5 inline animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6 text-slate-500">
                  No faults
                </td>
              </tr>
            ) : (
              items.map((f) => (
                <tr key={f._id ?? `${f.device}-${f.channel}`} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{f.device ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{f.channel ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{f.code}</td>
                  <td className="px-3 py-2 text-xs max-w-[420px] truncate" title={f.message}>
                    {f.message}
                  </td>
                  <td className="px-3 py-2 text-xs">{f.retries ?? 0}</td>
                  <td className="px-3 py-2 text-xs">{f.timestamp ?? '-'}</td>
                  <td className="px-3 py-2 text-right">
                    {f._id && (
                      <button
                        onClick={() => remove(f._id!)}
                        className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
