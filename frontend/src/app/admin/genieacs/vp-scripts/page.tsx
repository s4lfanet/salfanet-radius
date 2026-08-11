'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Loader2, Plus, Trash2, RefreshCw, Save, X, Zap,
  CheckCircle2, AlertCircle, Clock, RotateCcw, ExternalLink,
  Download, Upload,
} from 'lucide-react';

interface VpScript {
  _id: string;
  script: string;
  description?: string | null;
  syncedAt?: string | null;
  syncError?: string | null;
}

const SAMPLE_SCRIPT = `// Virtual Parameter script
// args[0] is the current value declared from GenieACS
// Return the computed value for this virtual parameter

// Example: expose firmware version as a VP
const fw = declare("Device.DeviceInfo.SoftwareVersion", { value: 1 });
return fw.value[0];
`;

function SyncBadge({ syncedAt, syncError }: { syncedAt?: string | null; syncError?: string | null }) {
  if (syncError) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertCircle className="w-3 h-3" />
        Error
      </span>
    );
  }
  if (syncedAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="w-3 h-3" />
        Synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

export default function VpScriptsPage() {
  const [items, setItems] = useState<VpScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [editing, setEditing] = useState<VpScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/genieacs/virtual-parameters', { cache: 'no-store' });
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
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const save = async () => {
    if (!editing) return;
    const name = editing._id.trim();
    if (!name) { setError('ID script tidak boleh kosong'); return; }
    if (!editing.script.trim()) { setError('Script tidak boleh kosong'); return; }

    setSaving(true);
    setError(null);
    try {
      const isNew = !items.find((x) => x._id === editing._id);
      const url = isNew
        ? '/api/genieacs/virtual-parameters'
        : `/api/genieacs/virtual-parameters/${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: name, script: editing.script, description: editing.description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal menyimpan');
      if (json.data?.syncError) {
        flash(`Tersimpan di Prisma, tapi sync GenieACS gagal: ${json.data.syncError}`);
      } else {
        flash(`VP "${name}" berhasil disimpan dan disinkronkan ke GenieACS`);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Hapus VP script "${id}"? Ini juga akan menghapusnya dari GenieACS.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/genieacs/virtual-parameters/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal menghapus');
      flash(`VP "${id}" berhasil dihapus`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const syncOne = async (id: string) => {
    setSyncing(id);
    setError(null);
    try {
      const item = items.find((x) => x._id === id);
      if (!item) return;
      const res = await fetch(`/api/genieacs/virtual-parameters/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: item.script, description: item.description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal sync');
      if (json.data?.syncError) {
        setError(`Sync gagal untuk "${id}": ${json.data.syncError}`);
      } else {
        flash(`VP "${id}" berhasil disinkronkan`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    setError(null);
    try {
      const res = await fetch('/api/genieacs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: ['virtualParameters'] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync gagal');
      const r = json.data?.virtualParameters;
      flash(`Sync selesai: ${r?.success ?? 0} berhasil, ${r?.failed ?? 0} gagal`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingAll(false);
    }
  };

  const backup = () => {
    window.open('/api/genieacs/backup?type=vp', '_blank');
  };

  const restore = async (file: File) => {
    setRestoring(true);
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const vpScripts = Array.isArray(data) ? data : (data.vpScripts ?? []);
      if (!Array.isArray(vpScripts) || vpScripts.length === 0) {
        setError('File tidak valid: tidak ada data vpScripts ditemukan');
        return;
      }
      const res = await fetch('/api/genieacs/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpScripts }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Restore gagal');
      const r = json.results?.vpScripts;
      flash(`Restore selesai: ${r?.ok ?? 0} VP berhasil dipulihkan${r?.errors?.length ? `, ${r.errors.length} error` : ''}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <input ref={fileInputRef} type="file" accept=".json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); }} />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            VP Scripts (GenieACS)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kelola Virtual Parameter scripts — disimpan di Prisma, otomatis sync ke GenieACS NBI
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={syncAll}
            disabled={syncingAll || loading}
            className="px-3 py-2 text-sm border border-green-500 text-green-700 dark:text-green-400 rounded-md flex items-center gap-2 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-60"
          >
            <RotateCcw className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`} />
            Sync All ke GenieACS
          </button>
          <button
            onClick={backup}
            className="px-3 py-2 text-sm border border-blue-400 text-blue-700 dark:text-blue-400 rounded-md flex items-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Download className="w-4 h-4" />
            Backup
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="px-3 py-2 text-sm border border-orange-400 text-orange-700 dark:text-orange-400 rounded-md flex items-center gap-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-60"
          >
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Restore
          </button>
          <button
            onClick={() => setEditing({ _id: '', script: SAMPLE_SCRIPT, description: '' })}
            className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New VP Script
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-3 text-sm text-blue-800 dark:text-blue-300">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Generate VP otomatis dari parameter device:</strong> Buka halaman detail device → klik <strong>Parameters</strong> → centang parameter yang diinginkan → klik tombol <strong>"Generate VP"</strong>. Script akan otomatis tersimpan ke sini dan sync ke GenieACS.
            <br />
            <Link href="/admin/genieacs/devices" className="underline mt-1 inline-block">
              Buka daftar device →
            </Link>
          </div>
        </div>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Nama VP</th>
              <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Deskripsi</th>
              <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Preview Script</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-right px-4 py-2.5 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <Loader2 className="w-5 h-5 inline animate-spin text-slate-400" />
                  <span className="ml-2 text-slate-500">Memuat VP scripts...</span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-slate-500">
                  <Zap className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p>Belum ada VP script</p>
                  <p className="text-xs mt-1">Buat baru atau generate otomatis dari parameter device</p>
                </td>
              </tr>
            ) : (
              items.map((vp) => (
                <tr key={vp._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-purple-700 dark:text-purple-400">
                      {vp._id}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400 text-xs">
                    {vp.description || <span className="italic">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <code className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                      {(vp.script || '').split('\n').find((l) => l.trim() && !l.startsWith('/'))?.slice(0, 70) || '—'}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <SyncBadge syncedAt={vp.syncedAt} syncError={vp.syncError} />
                      {vp.syncError && (
                        <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[160px]" title={vp.syncError}>
                          {vp.syncError.slice(0, 40)}…
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(!vp.syncedAt || vp.syncError) && (
                        <button
                          onClick={() => syncOne(vp._id)}
                          disabled={syncing === vp._id}
                          title="Sync ke GenieACS"
                          className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${syncing === vp._id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing({ ...vp })}
                        className="px-2.5 py-1 text-xs border rounded hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(vp._id)}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sync status summary */}
      {!loading && items.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Total: {items.length} VP script ·{' '}
          <span className="text-green-600 dark:text-green-400">
            {items.filter((x) => x.syncedAt && !x.syncError).length} synced
          </span>{' '}·{' '}
          <span className="text-red-600 dark:text-red-400">
            {items.filter((x) => x.syncError).length} error
          </span>{' '}·{' '}
          <span className="text-yellow-600 dark:text-yellow-400">
            {items.filter((x) => !x.syncedAt && !x.syncError).length} pending
          </span>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {items.find((x) => x._id === editing._id) ? `Edit VP: ${editing._id}` : 'Buat VP Script Baru'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Script JavaScript yang dijalankan oleh GenieACS untuk menghitung nilai virtual parameter
                </p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  ID / Nama VP <span className="text-red-500">*</span>
                </label>
                <input
                  value={editing._id}
                  onChange={(e) => setEditing({ ...editing, _id: e.target.value })}
                  disabled={!!items.find((x) => x._id === editing._id)}
                  className="w-full border rounded-md px-3 py-2 text-sm font-mono dark:bg-slate-800 dark:border-slate-600 dark:text-white disabled:opacity-60"
                  placeholder="contoh: uptime atau WifiSSID"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Nama ini akan menjadi ID VP di GenieACS. Tidak bisa diubah setelah disimpan.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Deskripsi (opsional)
                </label>
                <input
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  placeholder="Penjelasan singkat fungsi VP ini"
                />
              </div>

              {/* Script */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Script JavaScript <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={editing.script}
                  onChange={(e) => setEditing({ ...editing, script: e.target.value })}
                  rows={18}
                  spellCheck={false}
                  className="w-full font-mono text-xs border rounded-md p-3 bg-slate-50 dark:bg-slate-800/80 dark:border-slate-600 dark:text-green-300 resize-none"
                  placeholder={SAMPLE_SCRIPT}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Gunakan <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">declare(path, options)</code> untuk mengakses parameter device.
                  Script di-execute oleh GenieACS saat device inform.
                </p>
              </div>

              {/* Error in modal */}
              {error && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs">
                  {error}
                </div>
              )}
            </div>

            <div className="p-4 border-t dark:border-slate-700 flex justify-between items-center">
              <a
                href="https://docs.genieacs.com/en/latest/script-guide.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                GenieACS Script Guide
              </a>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="px-3 py-2 text-sm border rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-600"
                >
                  Batal
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Simpan & Sync ke GenieACS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
