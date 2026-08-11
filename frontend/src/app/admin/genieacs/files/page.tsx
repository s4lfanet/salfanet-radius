'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';

interface FileItem {
  _id: string;
  metadata?: {
    fileType?: string;
    oui?: string;
    productClass?: string;
    version?: string;
  };
  contentType?: string;
  length?: number;
  uploadDate?: string;
}

const fileTypes = [
  '1 Firmware Upgrade Image',
  '2 Web Content',
  '3 Vendor Configuration File',
  '4 Tone File',
  '5 Ringer File',
];

export default function GenieACSFilesPage() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState(fileTypes[0]);
  const [oui, setOui] = useState('');
  const [productClass, setProductClass] = useState('');
  const [version, setVersion] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/genieacs/files', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setItems(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async () => {
    if (!file || !fileName) {
      setError('File and fileName are required');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileName', fileName);
      if (fileType) fd.append('fileType', fileType);
      if (oui) fd.append('oui', oui);
      if (productClass) fd.append('productClass', productClass);
      if (version) fd.append('version', version);
      const res = await fetch('/api/genieacs/files', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Upload failed');
      setFile(null);
      setFileName('');
      setOui('');
      setProductClass('');
      setVersion('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (name: string) => {
    if (!confirm(`Delete file "${name}"?`)) return;
    try {
      const res = await fetch('/api/genieacs/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: name }),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">GenieACS Files</h1>
          <p className="text-sm text-slate-500">Firmware / Vendor Config / Web Content</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 text-sm border rounded-md flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
      )}

      <div className="border rounded-md p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Upload className="w-4 h-4" /> Upload file
        </h2>
        <div className="grid md:grid-cols-2 gap-2">
          <input
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !fileName) setFileName(f.name);
            }}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="fileName"
            className="border rounded px-3 py-2 text-sm font-mono"
          />
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            {fileTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={oui}
            onChange={(e) => setOui(e.target.value)}
            placeholder="OUI (optional)"
            className="border rounded px-3 py-2 text-sm font-mono"
          />
          <input
            value={productClass}
            onChange={(e) => setProductClass(e.target.value)}
            placeholder="ProductClass (optional)"
            className="border rounded px-3 py-2 text-sm font-mono"
          />
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="Version (optional)"
            className="border rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={upload}
            disabled={uploading || !file || !fileName}
            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">OUI</th>
              <th className="text-left px-3 py-2">Product Class</th>
              <th className="text-left px-3 py-2">Version</th>
              <th className="text-left px-3 py-2">Size</th>
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
                  No files
                </td>
              </tr>
            ) : (
              items.map((f) => (
                <tr key={f._id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{f._id}</td>
                  <td className="px-3 py-2 text-xs">{f.metadata?.fileType ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{f.metadata?.oui ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{f.metadata?.productClass ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{f.metadata?.version ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">
                    {typeof f.length === 'number' ? `${(f.length / 1024).toFixed(1)} KB` : '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(f._id)}
                      className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50"
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
    </div>
  );
}
