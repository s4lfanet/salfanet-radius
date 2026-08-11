'use client';

import { useState, useCallback, useEffect, use, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  Copy,
  CheckSquare,
  Square,
  Code2,
  Zap,
  ChevronRight,
  ChevronDown,
  X,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface FlatParameter {
  path: string;
  value: string | number | boolean | null;
  type: string | null;
  writable: boolean;
  object: boolean;
  timestamp: number | null;
}

interface ModalState {
  open: boolean;
  title: string;
  script: string;
  target: 'vp' | 'provision' | null;
  saving: boolean;
  name: string;
}

const TYPES = ['xsd:string', 'xsd:boolean', 'xsd:int', 'xsd:unsignedInt', 'xsd:dateTime'];

/** Generate a GenieACS provision script from selected parameters */
function buildProvisionScript(params: FlatParameter[]): string {
  const lines: string[] = [
    '// Auto-generated provision script',
    '// Generated from device parameter snapshot',
    '',
  ];
  for (const p of params) {
    if (p.object) continue;
    const val = typeof p.value === 'string' ? JSON.stringify(p.value) : String(p.value ?? 'null');
    const type = p.type ? `, ${JSON.stringify(p.type)}` : '';
    if (p.writable) {
      lines.push(`declare("${p.path}", {value: [${val}${type}]});`);
    } else {
      lines.push(`// read-only: declare("${p.path}", {value: 1});`);
    }
  }
  return lines.join('\n');
}

/** Generate a Virtual Parameter script for a single parameter path */
function buildVpScript(params: FlatParameter[]): string {
  if (params.length === 1) {
    const p = params[0];
    return `// Virtual parameter: ${p.path}
// Auto-generated

if (args[0].name === "${p.path}") {
  return args[0].value;
}
`;
  }
  const lines = [
    '// Virtual parameter — returns value of the matched parameter',
    `// Covers: ${params.slice(0, 3).map((p) => p.path).join(', ')}${params.length > 3 ? '...' : ''}`,
    '',
    'switch (args[0].name) {',
  ];
  for (const p of params) {
    lines.push(`  case "${p.path}":`);
    lines.push(`    return args[0].value;`);
  }
  lines.push('  default:');
  lines.push('    return undefined;');
  lines.push('}');
  return lines.join('\n');
}

export default function DeviceParametersPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);
  const { addToast } = useToast();
  const encodedId = encodeURIComponent(deviceId);

  const [parameters, setParameters] = useState<FlatParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [writableOnly, setWritableOnly] = useState(false);
  const [hideObjects, setHideObjects] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({
    open: false, title: '', script: '', target: null, saving: false, name: '',
  });
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/genieacs/devices/${encodedId}/all-parameters`, window.location.origin);
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setParameters(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [encodedId]);

  useEffect(() => { load(); }, [load]);

  // Client-side filter
  const filtered = useMemo(() => {
    let result = parameters;
    if (search) result = result.filter((p) => p.path.toLowerCase().includes(search.toLowerCase()));
    if (writableOnly) result = result.filter((p) => p.writable);
    if (hideObjects) result = result.filter((p) => !p.object);
    return result;
  }, [parameters, search, writableOnly, hideObjects]);

  // Group by top-level prefix (e.g. "InternetGatewayDevice", "Device")
  const groups = useMemo(() => {
    const map = new Map<string, FlatParameter[]>();
    for (const p of filtered) {
      const top = p.path.split('.')[0];
      if (!map.has(top)) map.set(top, []);
      map.get(top)!.push(p);
    }
    return map;
  }, [filtered]);

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.path)));
    }
  }

  function toggleSelectGroup(group: string) {
    const groupPaths = (groups.get(group) ?? []).map((p) => p.path);
    const allSelected = groupPaths.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) groupPaths.forEach((p) => next.delete(p));
      else groupPaths.forEach((p) => next.add(p));
      return next;
    });
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  }

  function openProvisionModal() {
    const sel = filtered.filter((p) => selected.has(p.path));
    if (sel.length === 0) { addToast({ type: 'warning', title: 'No selection', description: 'Select at least one parameter', duration: 2000 }); return; }
    setModal({ open: true, title: 'Generate Provision Script', script: buildProvisionScript(sel), target: 'provision', saving: false, name: `provision-${deviceId.slice(0, 8)}` });
  }

  function openVpModal() {
    const sel = filtered.filter((p) => selected.has(p.path));
    if (sel.length === 0) { addToast({ type: 'warning', title: 'No selection', description: 'Select at least one parameter', duration: 2000 }); return; }
    if (sel.length > 1 && !sel.every((p) => !p.object)) {
      const leafSel = sel.filter((p) => !p.object);
      setModal({ open: true, title: 'Generate Virtual Parameter Script', script: buildVpScript(leafSel), target: 'vp', saving: false, name: `vp-${deviceId.slice(0, 8)}` });
    } else {
      setModal({ open: true, title: 'Generate Virtual Parameter Script', script: buildVpScript(sel.filter((p) => !p.object)), target: 'vp', saving: false, name: `vp-${deviceId.slice(0, 8)}` });
    }
  }

  async function saveModal() {
    if (!modal.name.trim()) {
      addToast({ type: 'error', title: 'Name required', description: 'Enter a name for the script', duration: 2000 });
      return;
    }
    setModal((m) => ({ ...m, saving: true }));
    try {
      const endpoint = modal.target === 'vp' ? '/api/genieacs/virtual-parameters' : '/api/genieacs/provisions';
      const body = { _id: modal.name.trim(), script: modal.script };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      addToast({ type: 'success', title: 'Saved', description: `${modal.target === 'vp' ? 'Virtual parameter' : 'Provision'} "${modal.name}" saved`, duration: 3000 });
      setModal((m) => ({ ...m, open: false }));
    } catch (e) {
      addToast({ type: 'error', title: 'Error', description: (e as Error).message });
    } finally {
      setModal((m) => ({ ...m, saving: false }));
    }
  }

  async function copyScript() {
    await navigator.clipboard.writeText(modal.script);
    addToast({ type: 'success', title: 'Copied', description: 'Script copied to clipboard', duration: 1500 });
  }

  const totalParams = parameters.filter((p) => !p.object).length;
  const selectedParams = filtered.filter((p) => selected.has(p.path));

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/admin/genieacs/devices" className="hover:text-gray-700 dark:hover:text-gray-200">Devices</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/admin/genieacs/devices/${encodeURIComponent(deviceId)}`} className="hover:text-gray-700 dark:hover:text-gray-200 font-mono text-xs">{deviceId.slice(0, 30)}{deviceId.length > 30 ? '…' : ''}</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-gray-900 dark:text-white">Parameters</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">Parameter Browser</h1>
          {!loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalParams} parameters cached · {filtered.length} shown · {selected.size} selected
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={openVpModal}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-40"
          >
            <Zap className="h-4 w-4" />
            Generate VP
          </button>
          <button
            onClick={openProvisionModal}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Code2 className="h-4 w-4" />
            Generate Provision
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameter path…"
            className="block w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input type="checkbox" checked={writableOnly} onChange={(e) => setWritableOnly(e.target.checked)} className="rounded" />
          Writable only
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input type="checkbox" checked={hideObjects} onChange={(e) => setHideObjects(e.target.checked)} className="rounded" />
          Hide objects
        </label>
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          {selected.size === filtered.length && filtered.length > 0 ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Loading all parameters from GenieACS cache…</p>
        </div>
      )}

      {/* Parameter table grouped by top-level object */}
      {!loading && !error && (
        <div className="flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Filter className="h-8 w-8 mb-2" />
              <p>No parameters match the current filter.</p>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Path</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-48">Value</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-32">Type</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-20">RW</th>
                  <th className="w-8 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from(groups.entries()).map(([group, groupParams]) => {
                  const isOpen = expandedGroups.has(group) || !!search;
                  const groupSelected = groupParams.filter((p) => selected.has(p.path)).length;
                  return (
                    <GroupRows
                      key={group}
                      group={group}
                      params={groupParams}
                      isOpen={isOpen || !!search}
                      onToggle={() => toggleGroup(group)}
                      selected={selected}
                      onToggleParam={toggleSelect}
                      onToggleGroup={() => toggleSelectGroup(group)}
                      groupSelected={groupSelected}
                      copiedPath={copiedPath}
                      onCopy={copyPath}
                      hasSearch={!!search}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Script Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{modal.title}</h2>
              <button onClick={() => setModal((m) => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {modal.target === 'vp' ? 'Virtual Parameter Name' : 'Provision Name'} (ID)
                </label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal((m) => ({ ...m, name: e.target.value }))}
                  className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white font-mono"
                  placeholder={modal.target === 'vp' ? 'my-virtual-param' : 'my-provision'}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Script</label>
                  <button onClick={copyScript} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <textarea
                  rows={14}
                  value={modal.script}
                  onChange={(e) => setModal((m) => ({ ...m, script: e.target.value }))}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono dark:border-gray-600 dark:bg-gray-800 dark:text-white resize-none"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {modal.target === 'vp'
                  ? 'This will create a Virtual Parameter in GenieACS NBI (/virtual-parameters). Edit the script above if needed.'
                  : 'This will create a Provision script in GenieACS NBI (/provisions). Edit the script above if needed, then assign it to a Preset.'}
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveModal}
                disabled={modal.saving}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {modal.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save to GenieACS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────── Sub-components ──────────── */

interface GroupRowsProps {
  group: string;
  params: FlatParameter[];
  isOpen: boolean;
  onToggle: () => void;
  selected: Set<string>;
  onToggleParam: (path: string) => void;
  onToggleGroup: () => void;
  groupSelected: number;
  copiedPath: string | null;
  onCopy: (path: string) => Promise<void>;
  hasSearch: boolean;
}

function GroupRows({
  group, params, isOpen, onToggle, selected, onToggleParam, onToggleGroup,
  groupSelected, copiedPath, onCopy, hasSearch,
}: GroupRowsProps) {
  const allSelected = groupSelected === params.length;
  const someSelected = groupSelected > 0 && !allSelected;

  return (
    <>
      {/* Group header row */}
      <tr
        className="cursor-pointer bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800"
        onClick={onToggle}
      >
        <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); onToggleGroup(); }}>
          <button className="text-gray-400 hover:text-blue-600">
            {allSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : someSelected ? <CheckSquare className="h-4 w-4 text-blue-400" /> : <Square className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200" colSpan={3}>
          <span className="flex items-center gap-1">
            {isOpen && !hasSearch ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
            {group}
            <span className="ml-2 text-gray-400 font-normal">({params.length})</span>
          </span>
        </td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2" />
      </tr>
      {/* Parameter rows */}
      {(isOpen || hasSearch) && params.map((param) => (
        <ParameterRow
          key={param.path}
          param={param}
          isSelected={selected.has(param.path)}
          onToggle={() => onToggleParam(param.path)}
          isCopied={copiedPath === param.path}
          onCopy={onCopy}
        />
      ))}
    </>
  );
}

interface ParameterRowProps {
  param: FlatParameter;
  isSelected: boolean;
  onToggle: () => void;
  isCopied: boolean;
  onCopy: (path: string) => Promise<void>;
}

function ParameterRow({ param, isSelected, onToggle, isCopied, onCopy }: ParameterRowProps) {
  const depth = param.path.split('.').length - 1;
  const shortPath = param.path.split('.').slice(1).join('.');

  const displayValue = () => {
    if (param.object) return <span className="text-gray-400 italic text-xs">[object]</span>;
    if (param.value === null || param.value === undefined) return <span className="text-gray-400">—</span>;
    const str = String(param.value);
    if (str.length > 60) return <span className="font-mono text-xs" title={str}>{str.slice(0, 60)}…</span>;
    return <span className="font-mono text-xs">{str}</span>;
  };

  return (
    <tr
      className={`group transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'} ${param.object ? 'opacity-70' : ''}`}
      onClick={onToggle}
    >
      <td className="px-3 py-1.5">
        <button className="text-gray-400 group-hover:text-blue-600" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {isSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
        </button>
      </td>
      <td className="px-3 py-1.5">
        <span
          className="font-mono text-xs text-gray-700 dark:text-gray-300"
          style={{ paddingLeft: `${Math.min(depth - 1, 6) * 12}px` }}
          title={param.path}
        >
          {shortPath || param.path}
        </span>
      </td>
      <td className="px-3 py-1.5 max-w-xs overflow-hidden">
        {displayValue()}
      </td>
      <td className="px-3 py-1.5">
        {param.type && (
          <span className="inline-flex rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs font-mono text-gray-600 dark:text-gray-400">
            {param.type.replace('xsd:', '')}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        {param.object ? (
          <span className="text-gray-300">—</span>
        ) : param.writable ? (
          <span className="text-green-500 text-xs font-medium">RW</span>
        ) : (
          <span className="text-gray-400 text-xs">RO</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onCopy(param.path); }}
          title="Copy path"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {isCopied ? <CheckSquare className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </td>
    </tr>
  );
}
