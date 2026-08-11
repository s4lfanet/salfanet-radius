'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ParamEntry {
  path: string;
  value: string;
  type: string;
}

interface FormState {
  channel: string;
  precondition: string;
  weight: number;
  setParameters: ParamEntry[];
  additionalScript: string;
}

const DEFAULT_FORM: FormState = {
  channel: 'default',
  precondition: 'true',
  weight: 0,
  setParameters: [],
  additionalScript: '',
};

const PARAM_TYPES = ['xsd:string', 'xsd:boolean', 'xsd:int', 'xsd:unsignedInt', 'xsd:dateTime'];

export default function AutoProvisionPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentScript, setCurrentScript] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/genieacs/auto-provision');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      const { provision } = json.data ?? {};
      if (provision?.script) setCurrentScript(provision.script);
      else setCurrentScript(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addParam = () => {
    setForm((f) => ({
      ...f,
      setParameters: [...f.setParameters, { path: '', value: '', type: 'xsd:string' }],
    }));
  };

  const removeParam = (i: number) => {
    setForm((f) => ({
      ...f,
      setParameters: f.setParameters.filter((_, idx) => idx !== i),
    }));
  };

  const updateParam = (i: number, field: keyof ParamEntry, value: string) => {
    setForm((f) => {
      const updated = [...f.setParameters];
      updated[i] = { ...updated[i], [field]: value };
      return { ...f, setParameters: updated };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        ...form,
        setParameters: form.setParameters.filter((p) => p.path.trim()),
      };
      const res = await fetch('/api/genieacs/auto-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setSuccess('Auto-provision applied successfully.');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove auto-provision preset and provision script from GenieACS?')) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/genieacs/auto-provision', { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      setSuccess('Auto-provision removed.');
      setCurrentScript(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            Auto-Provision
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure a preset + provision script that runs on every device inform.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Current script preview */}
      {currentScript && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Current provision script (read-only preview)
          </p>
          <pre className="overflow-auto text-xs text-gray-700 dark:text-gray-300 max-h-48">
            {currentScript}
          </pre>
        </div>
      )}

      {/* Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 space-y-5">
        {/* Channel + precondition */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Channel
            </label>
            <input
              type="text"
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              placeholder="default"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Precondition (JavaScript expression)
            </label>
            <input
              type="text"
              value={form.precondition}
              onChange={(e) => setForm((f) => ({ ...f, precondition: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              placeholder="true"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Weight
          </label>
          <input
            type="number"
            value={form.weight}
            onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
            className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Parameters */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Parameters to set
            </label>
            <button
              type="button"
              onClick={addParam}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add parameter
            </button>
          </div>
          {form.setParameters.length === 0 && (
            <p className="text-sm text-gray-400 italic">No parameters configured.</p>
          )}
          <div className="space-y-2">
            {form.setParameters.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={p.path}
                  onChange={(e) => updateParam(i, 'path', e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="Device.ManagementServer.PeriodicInformInterval"
                />
                <input
                  type="text"
                  value={p.value}
                  onChange={(e) => updateParam(i, 'value', e.target.value)}
                  className="w-36 rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  placeholder="value"
                />
                <select
                  value={p.type}
                  onChange={(e) => updateParam(i, 'type', e.target.value)}
                  className="w-36 rounded-md border-gray-300 shadow-sm text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeParam(i)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Additional script */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Additional provision script (optional)
          </label>
          <textarea
            rows={6}
            value={form.additionalScript}
            onChange={(e) => setForm((f) => ({ ...f, additionalScript: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="// Extra JavaScript to append to the provision script"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Applying…' : 'Apply'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
