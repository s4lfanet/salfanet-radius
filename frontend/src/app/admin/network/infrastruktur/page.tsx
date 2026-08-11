'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, MapPin, ExternalLink, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabType = 'OTB' | 'JC' | 'ODC' | 'ODP';

interface OTB {
  id: string; name: string; code: string; status: string;
  latitude: number; longitude: number; address?: string;
  portCount: number; usedPorts: number; oltId?: string;
  network_olts?: { id: string; name: string; ipAddress: string };
}
interface JC {
  id: string; name: string; code: string; status: string;
  latitude: number; longitude: number; address?: string;
  type: string; closureType: string; fiberCount: number;
}
interface ODC {
  id: string; name: string; status: string;
  latitude: number; longitude: number;
  portCount: number; ponPort: number;
  network_olts?: { id: string; name: string; ipAddress: string };
  _count?: { network_odps: number };
}
interface ODP {
  id: string; name: string; status: string;
  latitude: number; longitude: number;
  portCount: number; splitterRatio?: string;
  network_olts?: { id: string; name: string };
  network_odcs?: { id: string; name: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: TabType; label: string; color: string }[] = [
  { id: 'OTB', label: 'OTB', color: 'blue' },
  { id: 'JC', label: 'Joint Closure', color: 'violet' },
  { id: 'ODC', label: 'ODC', color: 'cyan' },
  { id: 'ODP', label: 'ODP', color: 'emerald' },
];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  damaged: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  isolated: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  INACTIVE: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  DAMAGED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const TAB_COLOR: Record<TabType, string> = {
  OTB: 'border-blue-500 text-blue-600 dark:text-blue-400',
  JC: 'border-violet-500 text-violet-600 dark:text-violet-400',
  ODC: 'border-cyan-500 text-cyan-600 dark:text-cyan-400',
  ODP: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
};
const TAB_INACTIVE = 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.inactive}`}>
      {status}
    </span>
  );
}

function CoordCell({ lat, lng }: { lat: number; lng: number }) {
  return (
    <span className="font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
      {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
    </span>
  );
}

// ─── OTB Table ────────────────────────────────────────────────────────────────

function OTBTable({ search }: { search: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<OTB[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/network/otbs?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      const d = await res.json();
      setItems(d.otbs || []);
      setTotal(d.pagination?.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r: OTB) => {
    if (!window.confirm(t('infrastruktur.deleteConfirmOTB', { name: r.name }))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/network/otbs/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== r.id));
        setTotal(prev => prev - 1);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(t('infrastruktur.deleteFailed', { error: d.error || res.statusText }));
      }
    } catch {
      alert(t('infrastruktur.deleteFailedOTB'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <TableSkeleton cols={8} />;

  return (
    <TableWrapper total={total} page={page} limit={20} onPage={setPage}>
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <Th>{t('infrastruktur.colNameCode')}</Th><Th>{t('common.status')}</Th><Th>{t('infrastruktur.colPort')}</Th><Th>OLT</Th><Th>{t('common.address')}</Th><Th>{t('common.coordinates')}</Th><Th></Th><Th></Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.length === 0 ? <EmptyRow cols={8} /> : items.map(r => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
            <td className="px-4 py-3">
              <p className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{r.code}</p>
            </td>
            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {r.usedPorts}/{r.portCount}
            </td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              {r.network_olts?.name ?? <span className="text-gray-400">—</span>}
            </td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[180px] truncate">
              {r.address || <span className="text-gray-400">—</span>}
            </td>
            <td className="px-4 py-3"><CoordCell lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3">
              <MapPinLink lat={r.latitude} lng={r.longitude} />
            </td>
            <td className="px-4 py-3">
              <DeleteButton onClick={() => handleDelete(r)} loading={deletingId === r.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

// ─── JC Table ─────────────────────────────────────────────────────────────────

function JCTable({ search }: { search: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<JC[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/network/joint-closures?search=${encodeURIComponent(search)}`);
      const d = await res.json();
      setItems(d.data || []);
      setTotal(d.count || 0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r: JC) => {
    if (!window.confirm(t('infrastruktur.deleteConfirmJC', { name: r.name }))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/network/joint-closures/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== r.id));
        setTotal(prev => prev - 1);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(t('infrastruktur.deleteFailed', { error: d.error || res.statusText }));
      }
    } catch {
      alert(t('infrastruktur.deleteFailedJC'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <TableSkeleton cols={8} />;

  return (
    <TableWrapper total={total} page={1} limit={total || 1} onPage={() => {}}>
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <Th>{t('infrastruktur.colNameCode')}</Th><Th>{t('common.status')}</Th><Th>{t('common.type')}</Th><Th>{t('infrastruktur.colClosureType')}</Th><Th>{t('infrastruktur.colFiberCount')}</Th><Th>{t('common.coordinates')}</Th><Th></Th><Th></Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.length === 0 ? <EmptyRow cols={8} /> : items.map(r => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
            <td className="px-4 py-3">
              <p className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{r.code}</p>
            </td>
            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.type?.replace(/_/g, ' ') ?? '—'}</td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.closureType ?? '—'}</td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.fiberCount ?? '—'}</td>
            <td className="px-4 py-3"><CoordCell lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3"><MapPinLink lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3">
              <DeleteButton onClick={() => handleDelete(r)} loading={deletingId === r.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

// ─── ODC Table ────────────────────────────────────────────────────────────────

function ODCTable({ search }: { search: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ODC[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/network/odcs');
      const d = await res.json();
      const all: ODC[] = d.odcs || [];
      const filtered = search
        ? all.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
        : all;
      setItems(filtered);
      setTotal(filtered.length);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r: ODC) => {
    if (!window.confirm(t('infrastruktur.deleteConfirmODC', { name: r.name }))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/network/odcs/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== r.id));
        setTotal(prev => prev - 1);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(t('infrastruktur.deleteFailed', { error: d.error || res.statusText }));
      }
    } catch {
      alert(t('infrastruktur.deleteFailedODC'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <TableSkeleton cols={9} />;

  return (
    <TableWrapper total={total} page={1} limit={total || 1} onPage={() => {}}>
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <Th>{t('common.name')}</Th><Th>{t('common.status')}</Th><Th>OLT</Th><Th>{t('infrastruktur.colPonPort')}</Th><Th>{t('infrastruktur.colPort')}</Th><Th>{t('infrastruktur.colConnectedOdps')}</Th><Th>{t('common.coordinates')}</Th><Th></Th><Th></Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.length === 0 ? <EmptyRow cols={9} /> : items.map(r => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
            <td className="px-4 py-3">
              <p className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</p>
            </td>
            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              {r.network_olts?.name ?? <span className="text-gray-400">—</span>}
            </td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.ponPort}</td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.portCount}</td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r._count?.network_odps ?? 0}</td>
            <td className="px-4 py-3"><CoordCell lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3"><MapPinLink lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3">
              <DeleteButton onClick={() => handleDelete(r)} loading={deletingId === r.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

// ─── ODP Table ────────────────────────────────────────────────────────────────

function ODPTable({ search }: { search: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ODP[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/network/odps?limit=500');
      const d = await res.json();
      const all: ODP[] = d.odps || d.data || [];
      const filtered = search
        ? all.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
        : all;
      setItems(filtered);
      setTotal(filtered.length);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r: ODP) => {
    if (!window.confirm(t('infrastruktur.deleteConfirmODP', { name: r.name }))) return;
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/network/odps/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== r.id));
        setTotal(prev => prev - 1);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(t('infrastruktur.deleteFailed', { error: d.error || res.statusText }));
      }
    } catch {
      alert(t('infrastruktur.deleteFailedODP'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <TableSkeleton cols={9} />;

  return (
    <TableWrapper total={total} page={1} limit={total || 1} onPage={() => {}}>
      <thead>
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <Th>{t('common.name')}</Th><Th>{t('common.status')}</Th><Th>OLT</Th><Th>ODC</Th><Th>{t('infrastruktur.colPort')}</Th><Th>{t('infrastruktur.colSplitter')}</Th><Th>{t('common.coordinates')}</Th><Th></Th><Th></Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.length === 0 ? <EmptyRow cols={9} /> : items.map(r => (
          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
            <td className="px-4 py-3">
              <p className="font-medium text-sm text-gray-900 dark:text-white">{r.name}</p>
            </td>
            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              {r.network_olts?.name ?? <span className="text-gray-400">—</span>}
            </td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              {r.network_odcs?.name ?? <span className="text-gray-400">—</span>}
            </td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.portCount}</td>
            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.splitterRatio ?? '—'}</td>
            <td className="px-4 py-3"><CoordCell lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3"><MapPinLink lat={r.latitude} lng={r.longitude} /></td>
            <td className="px-4 py-3">
              <DeleteButton onClick={() => handleDelete(r)} loading={deletingId === r.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrapper>
  );
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function DeleteButton({ onClick, loading, label = 'Delete' }: { onClick: () => void; loading: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:hover:text-red-400 inline-flex transition-colors disabled:opacity-40"
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
        : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  const { t } = useTranslation();
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
        {t('common.noData')}
      </td>
    </tr>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

function TableWrapper({
  children, total, page, limit, onPage,
}: {
  children: React.ReactNode; total: number; page: number; limit: number; onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  const totalPages = Math.ceil(total / limit);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('infrastruktur.totalItems', { count: total })}
          </span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)}
              className="px-3 py-1 rounded text-xs border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
              ‹ {t('common.prev')}
            </button>
            <span className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
              {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}
              className="px-3 py-1 rounded text-xs border border-gray-200 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
              {t('common.next')} ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPinLink({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useTranslation();
  return (
    <a
      href={`/admin/network/unified-map?lat=${Number(lat).toFixed(6)}&lng=${Number(lng).toFixed(6)}&zoom=17`}
      title={t('infrastruktur.viewOnMap')}
      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 inline-flex transition-colors"
    >
      <MapPin className="w-3.5 h-3.5" />
    </a>
  );
}

const ADD_TYPE_MAP: Record<TabType, string> = {
  OTB: 'OTB',
  JC: 'JOINT_CLOSURE',
  ODC: 'ODC',
  ODP: 'ODP',
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InfrastrukturPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('OTB');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleAddOnMap = () => {
    router.push(`/admin/network/unified-map?addMode=true&nodeType=${ADD_TYPE_MAP[activeTab]}`);
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('infrastruktur.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('infrastruktur.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddOnMap}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('infrastruktur.addToMap', { type: activeTab === 'JC' ? 'Joint Closure' : activeTab })}
          </button>
          <a
            href="/admin/network/unified-map"
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('common.openMap')}
          </a>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        {/* Tabs + search bar */}
        <div className="flex items-center justify-between gap-4 px-4 border-b border-gray-200 dark:border-gray-700 flex-wrap">
          {/* Tabs */}
          <nav className="flex gap-0 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchInput(''); }}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? TAB_COLOR[tab.id] : TAB_INACTIVE}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Search */}
          <div className="relative py-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('infrastruktur.searchPlaceholder', { type: activeTab === 'JC' ? 'Joint Closure' : activeTab })}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none w-56 transition-colors"
            />
          </div>
        </div>

        {/* Table content */}
        <div>
          {activeTab === 'OTB' && <OTBTable search={search} />}
          {activeTab === 'JC' && <JCTable search={search} />}
          {activeTab === 'ODC' && <ODCTable search={search} />}
          {activeTab === 'ODP' && <ODPTable search={search} />}
        </div>
      </div>
    </div>
  );
}
