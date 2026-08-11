'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Plus, X, SlidersHorizontal, ChevronDown, Link2, Loader2, Trash2, Eye, EyeOff, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import FilterPanel from '@/components/network/FilterPanel';
import NetworkNodePanel, { type MapEntity } from '@/components/network/NetworkNodePanel';
import type { ConnectionLine } from '@/components/network/UnifiedNetworkMap';
import Swal from 'sweetalert2';

// Dynamic imports (client-side only) — prevents Lucide icon hydration mismatch
const UnifiedNetworkMap = dynamic(
  () => import('@/components/network/UnifiedNetworkMap'),
  { ssr: false }
);
const AddNodePanel = dynamic(
  () => import('@/components/network/AddNodePanel'),
  { ssr: false, loading: () => null }
);

// ─── Type labels ────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  OLT: 'OLT', OTB: 'OTB', JOINT_CLOSURE: 'JC', ODC: 'ODC', ODP: 'ODP', CUSTOMER: 'Pelanggan',
};
const TYPE_COLOR: Record<string, string> = {
  OLT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  OTB: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  JOINT_CLOSURE: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  ODC: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  ODP: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export default function UnifiedMapPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    types: ['OLT', 'OTB', 'JOINT_CLOSURE', 'ODC', 'ODP', 'CUSTOMER'],
    status: ['active', 'inactive', 'maintenance', 'damaged', 'isolated', 'offline'],
    search: '',
  });

  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<MapEntity | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addMode, setAddMode] = useState(() => searchParams.get('addMode') === 'true');
  const [addCoords, setAddCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [initialNodeType, setInitialNodeType] = useState<string | null>(() => searchParams.get('nodeType'));
  const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);

  // ── Connect mode state ─────────────────────────────────────────────────
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<MapEntity | null>(null);
  const [connectTarget, setConnectTarget] = useState<MapEntity | null>(null);
  const [connecting, setConnecting] = useState(false);

  // ── Connection lines state ─────────────────────────────────────────────
  const [connections, setConnections] = useState<ConnectionLine[]>([]);
  const [showConnections, setShowConnections] = useState(true);

  // Mobile UI state
  const [showPanel, setShowPanel] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // My Location state
  const [locatingUser, setLocatingUser] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const detectUserLocation = () => {
    if (!navigator.geolocation) return;
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const loc = { lat: coords.latitude, lng: coords.longitude };
        setUserLocation(loc);
        setLocatingUser(false);
      },
      () => { setLocatingUser(false); },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 },
    );
  };

  // ── Load entities ──────────────────────────────────────────────────────
  const loadEntities = useCallback(async () => {
    try {
      const [nodesRes, customersRes] = await Promise.all([
        fetch('/api/network/nodes?limit=2000'),
        fetch('/api/customers/with-location?limit=2000'),
      ]);
      if (nodesRes.ok && customersRes.ok) {
        const nodesData = await nodesRes.json();
        const customersData = await customersRes.json();
        setEntities([
          ...(nodesData.data || []).map((n: any) => ({
            id: n.id, type: n.type, code: n.code, name: n.name,
            latitude: parseFloat(n.latitude), longitude: parseFloat(n.longitude),
            status: n.status, metadata: n.metadata,
          })),
          ...(customersData.data || []).map((c: any) => ({
            id: c.id, type: 'CUSTOMER' as const, code: c.username, name: c.name,
            latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude),
            status: c.status, metadata: c,
          })),
        ]);
      }
    } catch (e) { console.error('Error loading entities:', e); }
  }, []);

  useEffect(() => { loadEntities(); }, [loadEntities, refreshKey]);

  // ── Load connections ───────────────────────────────────────────────────
  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/network/connections');
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch (e) { console.error('Error loading connections:', e); }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections, refreshKey]);

  // ── Statistics ─────────────────────────────────────────────────────────
  const statistics = useMemo(() => {
    const s = { olt: 0, otb: 0, jc: 0, odc: 0, odp: 0, customers: 0, active: 0, issues: 0 };
    entities.forEach(e => {
      if (e.type === 'OLT') s.olt++;
      else if (e.type === 'OTB') s.otb++;
      else if (e.type === 'JOINT_CLOSURE') s.jc++;
      else if (e.type === 'ODC') s.odc++;
      else if (e.type === 'ODP') s.odp++;
      else if (e.type === 'CUSTOMER') s.customers++;
      if (e.status === 'active') s.active++;
      else if (['inactive', 'maintenance', 'damaged', 'isolated', 'offline'].includes(e.status)) s.issues++;
    });
    return s;
  }, [entities]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleEntityClick = (entity: MapEntity) => {
    if (addMode || connectMode) return;
    setSelectedEntity(entity);
    setShowPanel(false);
  };

  const handleDeleted = (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    setSelectedEntity(null);
    setRefreshKey(k => k + 1);
  };

  const handleUpdated = (updated: MapEntity) => {
    setEntities(prev => prev.map(e => e.id === updated.id ? updated : e));
    setRefreshKey(k => k + 1);
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!addMode) return;
    setSelectedEntity(null);
    setAddCoords({ lat, lng });
    setAddMode(false);
  };

  const handleNodeCreated = (newEntity: any) => {
    setAddCoords(null);
    setInitialNodeType(null);
    setPendingNodeType(null);
    setRefreshKey(k => k + 1);
  };

  // ── Connect mode handlers ─────────────────────────────────────────────
  const enterConnectMode = () => {
    setConnectMode(true);
    setConnectSource(null);
    setConnectTarget(null);
    setAddMode(false);
    setAddCoords(null);
    setSelectedEntity(null);
  };

  const exitConnectMode = () => {
    setConnectMode(false);
    setConnectSource(null);
    setConnectTarget(null);
  };

  const handleConnectNodeClick = (entity: MapEntity) => {
    if (!connectMode) return;
    // Skip customers — can't connect them in infrastructure mode
    if (entity.type === 'CUSTOMER') return;

    if (!connectSource) {
      // First click → set source
      setConnectSource(entity);
    } else if (entity.id === connectSource.id) {
      // Clicked same node → deselect
      setConnectSource(null);
    } else {
      // Second click → set target → show confirmation
      setConnectTarget(entity);
    }
  };

  const executeConnection = async () => {
    if (!connectSource || !connectTarget) return;
    setConnecting(true);
    try {
      const res = await fetch('/api/network/auto-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: connectSource.id,
          sourceType: connectSource.type,
          targetId: connectTarget.id,
          targetType: connectTarget.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      Swal.fire({
        icon: 'success',
        title: 'Koneksi Berhasil!',
        html: `<div class="text-sm text-left">${data.summary}</div>`,
        timer: 3000,
        showConfirmButton: false,
      });

      // Reset and refresh
      setConnectSource(null);
      setConnectTarget(null);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Gagal Menghubungkan', text: err.message });
    } finally {
      setConnecting(false);
    }
  };

  const deleteConnection = async (fromId: string, toId: string) => {
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Koneksi?',
      text: 'Semua segment antara kedua device ini akan dihapus.',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Hapus',
      cancelButtonText: 'Batal',
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/network/connections?from=${fromId}&to=${toId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      Swal.fire({ icon: 'success', title: 'Koneksi dihapus', timer: 1500, showConfirmButton: false });
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[44px] lg:left-64 flex flex-col bg-white dark:bg-gray-900 z-10">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t('network.unifiedMap.title')}</h1>
          <p className="hidden sm:block text-gray-500 dark:text-gray-400 mt-0.5 text-sm">{t('network.unifiedMap.subtitle')}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* Mobile backdrop — tap to close panel */}
        {showPanel && (
          <div
            className="lg:hidden absolute inset-0 bg-black/40 z-[540]"
            onClick={() => setShowPanel(false)}
          />
        )}

        {/* Filter Sidebar — desktop always visible, mobile slide-in drawer */}
        <div className={cn(
          'bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4',
          'lg:w-72 lg:shrink-0 lg:relative lg:z-auto lg:translate-x-0',
          'absolute inset-y-0 left-0 w-72 z-[550] transition-transform duration-300',
          showPanel ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
        )}>
          <div className="flex items-center justify-between lg:hidden mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {t('network.unifiedMap.statisticsTitle')} & Filter
            </span>
            <button onClick={() => setShowPanel(false)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <FilterPanel filters={filters} onFilterChange={setFilters} statistics={statistics} />
        </div>

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <UnifiedNetworkMap
            filters={filters}
            onEntityClick={handleEntityClick}
            onMapClick={handleMapClick}
            addMode={addMode}
            pendingPin={addCoords ? { lat: addCoords.lat, lng: addCoords.lng, nodeType: pendingNodeType ?? undefined } : null}
            onPinMoved={(lat, lng) => setAddCoords({ lat, lng })}
            refreshSignal={refreshKey}
            connectMode={connectMode}
            connectSource={connectSource}
            onConnectNodeClick={handleConnectNodeClick}
            connections={connections}
            showConnections={showConnections}
            flyToLocation={userLocation}
            userLocation={userLocation}
          />

          {/* Mobile: Filter panel toggle */}
          <div className="lg:hidden absolute top-2 left-2 z-[600]">
            <button
              onClick={() => setShowPanel(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shadow-lg text-xs font-medium border transition-colors',
                showPanel
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filter
            </button>
          </div>

          {/* ── Top-right toolbar ───────────────────────────────────────── */}
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[600] flex items-center gap-2">
            {/* My Location */}
            <button
              onClick={detectUserLocation}
              disabled={locatingUser}
              title="My Location"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium shadow-lg transition-all border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
            >
              {locatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            </button>
            {/* Show/Hide connections toggle */}
            <button
              onClick={() => setShowConnections(v => !v)}
              title={showConnections ? 'Sembunyikan garis koneksi' : 'Tampilkan garis koneksi'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium shadow-lg transition-all border',
                showConnections
                  ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600',
              )}
            >
              {showConnections ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* Connect Mode Button */}
            <button
              onClick={() => connectMode ? exitConnectMode() : enterConnectMode()}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition-all',
                connectMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-white ring-offset-1 ring-offset-amber-500'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white',
              )}
            >
              {connectMode ? <X className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{connectMode ? 'Batal' : 'Hubungkan'}</span>
            </button>

            {/* Add Node Button */}
            <button
              onClick={() => {
                if (connectMode) exitConnectMode();
                setAddMode(v => !v);
                setAddCoords(null);
                setSelectedEntity(null);
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition-all',
                addMode
                  ? 'bg-orange-500 hover:bg-orange-600 text-white ring-2 ring-white ring-offset-1 ring-offset-orange-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white',
              )}
            >
              {addMode ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span className="hidden sm:inline">{addMode ? 'Batal' : 'Tambah Node'}</span>
            </button>
          </div>

          {/* Add mode hint */}
          {addMode && !connectMode && (
            <div className="absolute inset-0 z-[500] cursor-crosshair pointer-events-none">
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-sm px-4 py-2 rounded-full shadow-lg font-medium whitespace-nowrap">
                Klik lokasi di peta untuk menempatkan node baru
              </div>
            </div>
          )}

          {/* ── Connect mode hint ──────────────────────────────────────── */}
          {connectMode && !connectTarget && (
            <div className="absolute inset-0 z-[500] pointer-events-none">
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-sm px-4 py-2 rounded-full shadow-lg font-medium whitespace-nowrap">
                {!connectSource
                  ? '🔗 Klik node SUMBER (asal koneksi)'
                  : `🔗 ${TYPE_LABEL[connectSource.type] ?? connectSource.type}: ${connectSource.name} — Klik node TUJUAN`}
              </div>
            </div>
          )}

          {/* ── Connect confirmation drawer (bottom sheet) ────────────── */}
          {connectMode && connectTarget && connectSource && (
            <div className="absolute bottom-0 inset-x-0 z-[700] animate-in slide-in-from-bottom duration-300">
              <div className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6 max-w-lg mx-auto">
                <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />
                <h3 className="font-bold text-gray-900 dark:text-white text-center mb-4">Hubungkan Device?</h3>

                {/* Source → Target visual */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {/* Source */}
                  <div className="text-center">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-bold mb-1', TYPE_COLOR[connectSource.type] || 'bg-gray-100 text-gray-700')}>
                      {TYPE_LABEL[connectSource.type]}
                    </span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{connectSource.name}</p>
                    <p className="text-[10px] text-gray-400">{connectSource.code}</p>
                  </div>

                  {/* Arrow */}
                  <div className="flex flex-col items-center">
                    <div className="text-amber-500 text-xl">→</div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">draw line</span>
                  </div>

                  {/* Target */}
                  <div className="text-center">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-bold mb-1', TYPE_COLOR[connectTarget.type] || 'bg-gray-100 text-gray-700')}>
                      {TYPE_LABEL[connectTarget.type]}
                    </span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{connectTarget.name}</p>
                    <p className="text-[10px] text-gray-400">{connectTarget.code}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
                  {connectSource.type === 'OTB' && connectTarget.type === 'JOINT_CLOSURE' && (
                    <p>Semua tube dari kabel feeder OTB akan otomatis diteruskan ke JC ini (patch-through). Core assignment otomatis.</p>
                  )}
                  {connectSource.type === 'JOINT_CLOSURE' && connectTarget.type === 'JOINT_CLOSURE' && (
                    <p>Kabel distribusi baru akan otomatis dibuat. Default: 6T × 12C = 72 core.</p>
                  )}
                  {connectSource.type === 'JOINT_CLOSURE' && connectTarget.type === 'ODC' && (
                    <p>Kabel distribusi baru akan dibuat. Default: 4T × 12C = 48 core.</p>
                  )}
                  {connectSource.type === 'JOINT_CLOSURE' && connectTarget.type === 'ODP' && (
                    <p>Kabel drop baru akan dibuat. Default: 2T × 12C = 24 core.</p>
                  )}
                  {connectSource.type === 'ODC' && connectTarget.type === 'ODP' && (
                    <p>Kabel distribusi ODC → ODP. Default: 2T × 12C = 24 core.</p>
                  )}
                  {!(
                    (connectSource.type === 'OTB' && connectTarget.type === 'JOINT_CLOSURE') ||
                    (connectSource.type === 'JOINT_CLOSURE') ||
                    (connectSource.type === 'ODC' && connectTarget.type === 'ODP')
                  ) && (
                    <p>Koneksi {TYPE_LABEL[connectSource.type]} → {TYPE_LABEL[connectTarget.type]}. Kabel baru otomatis dibuat.</p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setConnectTarget(null)}
                    className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={executeConnection}
                    disabled={connecting}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {connecting ? 'Menghubungkan...' : 'Hubungkan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Legend — collapsible on mobile, always expanded on desktop */}
          <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-lg text-xs z-[500] min-w-[180px]">
            <button
              onClick={() => setShowLegend(v => !v)}
              className="flex items-center justify-between w-full px-3 py-2 gap-2"
            >
              <span className="text-gray-900 dark:text-white font-bold">{t('network.unifiedMap.legend')}</span>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-gray-400 transition-transform lg:hidden',
                showLegend ? 'rotate-180' : ''
              )} />
            </button>
            <div className={cn(
              'overflow-hidden transition-all duration-200',
              showLegend ? 'max-h-60' : 'max-h-0 lg:max-h-60',
            )}>
              <div className="px-3 pb-2.5 space-y-1 border-t border-gray-200/60 dark:border-gray-700/60 pt-1.5">
                {[
                  ['⬟', 'text-purple-500', 'OLT – Optical Line Terminal'],
                  ['◆', 'text-violet-500', 'JC – Joint Closure'],
                  ['◇', 'text-blue-500', 'OTB – Optical Terminal Box'],
                  ['■', 'text-cyan-500', 'ODC – Optical Distribution Cabinet'],
                  ['▲', 'text-green-500', 'ODP – Optical Distribution Point'],
                  ['●', 'text-green-500', 'Active Customer'],
                  ['●', 'text-red-500', 'Isolated Customer'],
                ].map(([icon, cls, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={cls}>{icon}</span>
                    <span className="text-gray-500 dark:text-gray-300">{label}</span>
                  </div>
                ))}
                {/* Connection line legend */}
                <div className="border-t border-gray-200/60 dark:border-gray-700/60 mt-1.5 pt-1.5">
                  <span className="text-gray-400 dark:text-gray-500 font-semibold text-[10px] uppercase tracking-wider">Koneksi</span>
                  {[
                    ['#a855f7', 'OTB → JC (Feeder)'],
                    ['#8b5cf6', 'JC → JC (Branch)'],
                    ['#06b6d4', 'JC/ODC → ODP'],
                    ['#22c55e', 'Distribusi'],
                  ].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded" style={{ backgroundColor: color as string }} />
                      <span className="text-gray-500 dark:text-gray-300">{label}</span>
                    </div>
                  ))}
                  {connections.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">{connections.length} koneksi aktif</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Node Detail / Edit Panel */}
        {selectedEntity && !addCoords && !connectMode && (
          <NetworkNodePanel
            entity={selectedEntity}
            onClose={() => setSelectedEntity(null)}
            onDeleted={handleDeleted}
            onUpdated={handleUpdated}
          />
        )}

        {/* Add Node Panel */}
        {addCoords && (
          <AddNodePanel
            lat={addCoords.lat}
            lng={addCoords.lng}
            onClose={() => { setAddCoords(null); setInitialNodeType(null); setPendingNodeType(null); }}
            onCreated={handleNodeCreated}
            initialNodeType={initialNodeType as any ?? undefined}
            onTypeChange={(type) => setPendingNodeType(type)}
          />
        )}
      </div>
    </div>
  );
}


