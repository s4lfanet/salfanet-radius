'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, RefreshCw, Save, Trash2, Plus } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient, buildQueryKey } from '@/lib/api/hooks';
import { showConfirm } from '@/lib/sweetalert';

interface ConfigItem {
  _id: string;
  value: string | number | boolean;
}

export default function GenieACSConfigPage() {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newId, setNewId] = useState('');
  const [newValue, setNewValue] = useState('');
  const queryClient = useQueryClient();

  const { data: queryData, isLoading: loading, refetch } = useApiQuery<{ success: boolean; data?: ConfigItem[]; error?: string }>('/api/genieacs/config', { staleTime: 60000 });
  const items: ConfigItem[] = queryData?.data || [];

  const invalidateConfig = () => queryClient.invalidateQueries({ queryKey: buildQueryKey('/api/genieacs/config') });

  // Sync draft from server data whenever the query refetches
  const serverDraft = useMemo(() => {
    const map: Record<string, string> = {};
    for (const it of items) map[it._id] = String(it.value ?? '');
    return map;
  }, [items]);
  useEffect(() => { setDraft(serverDraft); }, [serverDraft]);

  const saveOne = async (id: string, value: string) => {
    setError(null);
    try {
      const json = await apiAdmin<{ success: boolean; error?: string }>('/api/genieacs/config', {
        method: 'PUT',
        body: JSON.stringify({ id, value }),
      });
      if (!json.success) throw new Error(json.error || 'Save failed');
      invalidateConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!(await showConfirm(`Delete config "${id}"?`))) return;
    try {
      const json = await apiAdmin<{ success: boolean; error?: string }>('/api/genieacs/config', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
      if (!json.success) throw new Error(json.error || 'Delete failed');
      invalidateConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">GenieACS Config</h1>
          <p className="text-sm text-slate-500">Konfigurasi runtime GenieACS NBI</p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
      )}

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left px-3 py-2">Key</th>
              <th className="text-left px-3 py-2">Value</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="text-center py-6">
                  <Loader2 className="w-5 h-5 inline animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-6 text-slate-500">
                  No config keys
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c._id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{c._id}</td>
                  <td className="px-3 py-2">
                    <input
                      value={draft[c._id] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [c._id]: e.target.value })}
                      className="w-full border rounded px-2 py-1 text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => saveOne(c._id, draft[c._id] ?? '')}
                      className="px-2 py-1 text-xs border rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Save className="w-3 h-3 inline" />
                    </button>
                    <button
                      onClick={() => remove(c._id)}
                      className="ml-2 px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border rounded-md p-4 space-y-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add new config
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="key (e.g. cwmp.realm)"
            className="flex-1 min-w-[200px] border rounded px-3 py-2 text-sm font-mono"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="flex-1 min-w-[200px] border rounded px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={async () => {
              if (!newId) return;
              await saveOne(newId, newValue);
              setNewId('');
              setNewValue('');
            }}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
