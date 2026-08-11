'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Save, RefreshCw, Download, Upload } from 'lucide-react';

interface Provision {
  _id: string;
  script: string;
  description?: string | null;
}

const sampleScript = `// GenieACS provision script
log("Hello from " + declare("DeviceID.SerialNumber", {value: 1}).value[0]);
`;

export default function GenieACSProvisionsPage() {
  const [items, setItems] = useState<Provision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Provision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/genieacs/provisions', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setItems(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  const backup = () => window.open('/api/genieacs/backup?type=provisions', '_blank');

  const restore = async (file: File) => {
    setRestoring(true);
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const provisions = Array.isArray(data) ? data : (data.provisions ?? []);
      if (!Array.isArray(provisions) || provisions.length === 0) {
        setError('File tidak valid: tidak ada data provisions ditemukan');
        return;
      }
      const res = await fetch('/api/genieacs/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provisions }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Restore gagal');
      const r = json.results?.provisions;
      flash(`Restore selesai: ${r?.ok ?? 0} provision dipulihkan${r?.errors?.length ? `, ${r.errors.length} error` : ''}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing._id) {
      setError('_id is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isNew = !items.find((x) => x._id === editing._id);
      const url = isNew
        ? '/api/genieacs/provisions'
        : `/api/genieacs/provisions/${encodeURIComponent(editing._id)}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete provision "${id}"?`)) return;
    try {
      const res = await fetch(`/api/genieacs/provisions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
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
      <input ref={fileInputRef} type="file" accept=".json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">GenieACS Provisions</h1>
          <p className="text-sm text-slate-500">Skrip provisioning yang dipanggil oleh preset · {items.length} script</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading}
            className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={backup}
            className="px-3 py-2 text-sm border border-blue-400 text-blue-700 dark:text-blue-400 rounded-md flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20">
            <Download className="w-4 h-4" /> Backup
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={restoring}
            className="px-3 py-2 text-sm border border-orange-400 text-orange-700 dark:text-orange-400 rounded-md flex items-center gap-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-60">
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Restore
          </button>
          <button onClick={() => setEditing({ _id: '', script: sampleScript })}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Provision
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-sm">{error}</div>}
      {successMsg && <div className="p-3 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 text-sm">{successMsg}</div>}

      <div className="border rounded-md overflow-hidden dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Deskripsi</th>
              <th className="text-left px-3 py-2">Script (preview)</th>
              <th className="text-right px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-700">
            {loading ? (
              <tr><td colSpan={4} className="text-center py-8"><Loader2 className="w-5 h-5 inline animate-spin" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-500">Belum ada provision</td></tr>
            ) : items.map((p) => (
              <tr key={p._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 font-mono text-blue-700 dark:text-blue-400 font-medium">{p._id}</td>
                <td className="px-3 py-2 hidden md:table-cell text-xs text-slate-500">{p.description || <span className="italic">—</span>}</td>
                <td className="px-3 py-2 truncate max-w-[300px] font-mono text-xs text-slate-600 dark:text-slate-400">
                  {(p.script || '').split('\n').find(l => l.trim() && !l.startsWith('/'))?.slice(0, 80) || '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setEditing(p)}
                    className="px-2 py-1 text-xs border rounded hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-600">Edit</button>
                  <button onClick={() => remove(p._id)}
                    className="ml-2 p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold">{items.find(x => x._id === editing._id) ? `Edit: ${editing._id}` : 'Provision Baru'}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs text-slate-500">ID <span className="text-red-500">*</span></label>
                <input value={editing._id} onChange={(e) => setEditing({ ...editing, _id: e.target.value })}
                  disabled={!!items.find(x => x._id === editing._id)}
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-600 disabled:opacity-60"
                  placeholder="provision-id" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Deskripsi</label>
                <input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600"
                  placeholder="Deskripsi singkat" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Script <span className="text-red-500">*</span></label>
                <textarea value={editing.script} onChange={(e) => setEditing({ ...editing, script: e.target.value })}
                  rows={18} spellCheck={false}
                  className="w-full font-mono text-xs border rounded-md p-2 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-green-300 resize-none" />
              </div>
            </div>
            <div className="p-4 border-t dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setEditing(null)}
                className="px-3 py-2 text-sm border rounded-md hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={save} disabled={saving}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
