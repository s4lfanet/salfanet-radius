'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { X, SlidersHorizontal, ChevronDown, Loader2, Eye, EyeOff, Navigation, Move } from 'lucide-react';
import { cn } from '@/lib/utils';
import FilterPanel from '@/components/network/FilterPanel';
import NetworkNodePanel, { type MapEntity } from '@/components/network/NetworkNodePanel';
import type { ConnectionLine, BasemapKey } from '@/components/network/UnifiedNetworkMap';
import { apiAdmin } from '@/lib/api';

// Dynamic imports (client-side only) - prevents Lucide icon hydration mismatch
const UnifiedNetworkMap = dynamic(
  () => import('@/components/network/UnifiedNetworkMap'),
  { ssr: false }
);
const AddNodePanel = dynamic(
  () => import('@/components/network/AddNodePanel'),
  { ssr: false, loading: () => null }
);
import type { AddNodeType } from '@/components/network/AddNodePanel';

export default function UnifiedMapPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    types: ['ROUTER', 'OLT', 'OTB', 'JOINT_CLOSURE', 'ODC', 'ODP', 'CUSTOMER'],
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

  // ── Connection lines state ─────────────────────────────────────────────
  const [connections, setConnections] = useState<ConnectionLine[]>([]);
  const [showConnections, setShowConnections] = useState(true);

  // ── Basemap + move-marker mode (rendered in the shared top toolbar) ────
  const [mapLayer, setMapLayer] = useState<BasemapKey>('street');
  const [moveMode, setMoveMode] = useState(false);

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
      const [nodesData, customersData] = await Promise.all([
        apiAdmin<{ data: Array<Record<string, unknown>> }>('/api/network/nodes?limit=2000'),
        apiAdmin<{ data: Array<Record<string, unknown>> }>('/api/customers/with-location?limit=2000'),
      ]);
      setEntities([
        ...(nodesData.data || []).map((n) => ({
          id: String(n.id), type: String(n.type) as MapEntity['type'], code: String(n.code ?? ''), name: String(n.name ?? ''),
          latitude: parseFloat(String(n.latitude ?? 0)), longitude: parseFloat(String(n.longitude ?? 0)),
          status: String(n.status ?? ''), address: n.address ? String(n.address) : null,
          metadata: { ...((n.metadata ?? {}) as Record<string, unknown>), upstreamId: n.upstreamId ?? null },
        })),
        ...(customersData.data || []).map((c) => ({
          id: String(c.id), type: 'CUSTOMER' as const, code: String(c.username ?? ''), name: String(c.name ?? ''),
          latitude: parseFloat(String(c.latitude)), longitude: parseFloat(String(c.longitude)),
          status: String(c.status),
          username: c.username ? String(c.username) : undefined,
          package: (c.package_name ?? c.pppoe_profiles) ? String(c.package_name ?? c.pppoe_profiles) : undefined,
          speed: c.speed ? String(c.speed) : undefined,
          odpName: c.odpName ? String(c.odpName) : undefined,
          address: c.address ? String(c.address) : null,
          metadata: c,
        })),
      ]);
    } catch (e: unknown) { console.error('Error loading entities:', e); }
  }, []);

  useEffect(() => { loadEntities(); }, [loadEntities, refreshKey]);

  // ── Load connections ───────────────────────────────────────────────────
  const loadConnections = useCallback(async () => {
    try {
      const data = await apiAdmin<{ connections: ConnectionLine[] }>('/api/network/connections');
      setConnections(data.connections || []);
    } catch (e: unknown) { console.error('Error loading connections:', e); }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections, refreshKey]);

  // ── Statistics ─────────────────────────────────────────────────────────
  const statistics = useMemo(() => {
    const s = { router: 0, olt: 0, otb: 0, jc: 0, odc: 0, odp: 0, customers: 0, active: 0, issues: 0 };
    entities.forEach(e => {
      if (e.type === 'ROUTER') s.router++;
      else if (e.type === 'OLT') s.olt++;
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
    if (addMode) return;
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

  const handleNodeCreated = (_newEntity: Record<string, unknown>) => {
    setAddCoords(null);
    setInitialNodeType(null);
    setPendingNodeType(null);
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[44px] lg:left-64 flex flex-col bg-card z-10">
      {/* Page Header */}
      <div className="bg-card border-b border-border px-4 py-3 shrink-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">{t('network.unifiedMap.title')}</h1>
          <p className="hidden sm:block text-muted-foreground mt-0.5 text-sm">{t('network.unifiedMap.subtitle')}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* Mobile backdrop - tap to close panel */}
        {showPanel && (
          <div
            className="lg:hidden absolute inset-0 bg-black/40 z-[540]"
            onClick={() => setShowPanel(false)}
          />
        )}

        {/* Filter Sidebar - desktop always visible, mobile slide-in drawer */}
        <div className={cn(
          'bg-gray-50 dark:bg-gray-900 border-r border-border overflow-y-auto p-4',
          'lg:w-72 lg:shrink-0 lg:relative lg:z-auto lg:translate-x-0',
          'absolute inset-y-0 left-0 w-72 z-[550] transition-transform duration-300',
          showPanel ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
        )}>
          <div className="flex items-center justify-between lg:hidden mb-3 pb-3 border-b border-border">
            <span className="font-semibold text-foreground text-sm">
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
            connections={connections}
            showConnections={showConnections}
            flyToLocation={userLocation}
            userLocation={userLocation}
            mapLayer={mapLayer}
            moveMode={moveMode}
            onMoveModeChange={setMoveMode}
          />

          {/* Mobile: Filter panel toggle */}
          <div className="lg:hidden absolute top-2 left-2 z-[600]">
            <button
              onClick={() => setShowPanel(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shadow-lg text-xs font-medium border transition-colors',
                showPanel
                  ? 'bg-blue-600 text-white border-blue-700'
                  : 'bg-card text-muted-foreground border-border',
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filter
            </button>
          </div>

          {/* ── Top-right toolbar ───────────────────────────────────────── */}
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[600] flex items-center gap-2">
            {/* Basemap selector */}
            <select
              value={mapLayer}
              onChange={(e) => setMapLayer(e.target.value as BasemapKey)}
              title="Ganti tampilan peta"
              aria-label="Ganti tampilan peta"
              className="px-2.5 py-2 rounded-lg text-sm font-medium shadow-lg border bg-card text-muted-foreground border-gray-200 dark:border-gray-600"
            >
              <option value="street">Street</option>
              <option value="satellite">Satellite</option>
              <option value="topo">Topo</option>
              <option value="dark">Dark</option>
            </select>
            {/* My Location */}
            <button
              onClick={detectUserLocation}
              disabled={locatingUser}
              title="My Location"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium shadow-lg transition border bg-card text-muted-foreground border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
            >
              {locatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            </button>
            {/* Show/Hide connections toggle */}
            <button
              onClick={() => setShowConnections(v => !v)}
              title={showConnections ? 'Sembunyikan garis koneksi' : 'Tampilkan garis koneksi'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium shadow-lg transition border',
                showConnections
                  ? 'bg-card text-muted-foreground border-gray-200 dark:border-gray-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-muted-foreground/70 border-gray-300 dark:border-gray-600',
              )}
            >
              {showConnections ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* Move-marker mode: drag infrastructure markers to fix positions */}
            <button
              onClick={() => setMoveMode(v => {
                const next = !v;
                if (next) {
                  setAddMode(false);
                  setAddCoords(null);
                }
                return next;
              })}
              title="Mode geser: seret marker perangkat untuk koreksi titik"
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition border',
                moveMode
                  ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-700 ring-2 ring-white ring-offset-1 ring-offset-sky-500'
                  : 'bg-card text-muted-foreground border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700',
              )}
            >
              <Move className="w-4 h-4" />
              <span className="hidden sm:inline">{moveMode ? 'Selesai' : 'Geser'}</span>
            </button>

            {/* Add mode is entered from Infrastruktur (OTB placement) — allow cancel */}
            {addMode && (
              <button
                onClick={() => { setAddMode(false); setAddCoords(null); setInitialNodeType(null); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition bg-orange-500 hover:bg-orange-600 text-white"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Batal</span>
              </button>
            )}
          </div>

          {/* Add mode hint */}
          {addMode && (
            <div className="absolute inset-0 z-[500] cursor-crosshair pointer-events-none">
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-sm px-4 py-2 rounded-full shadow-lg font-medium whitespace-nowrap truncate overflow-hidden">
                Klik lokasi di peta untuk menempatkan node baru
              </div>
            </div>
          )}

          {/* Legend - collapsible on mobile, always expanded on desktop */}
          <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-lg text-xs z-[500] min-w-[180px]">
            <button
              onClick={() => setShowLegend(v => !v)}
              className="flex items-center justify-between w-full px-3 py-2 gap-2"
            >
              <span className="text-foreground font-bold">{t('network.unifiedMap.legend')}</span>
              <ChevronDown className={cn(
                'w-3.5 h-3.5 text-gray-400 transition-transform lg:hidden',
                showLegend ? 'rotate-180' : ''
              )} />
            </button>
            <div className={cn(
              'overflow-hidden transition duration-200',
              showLegend ? 'max-h-60' : 'max-h-0 lg:max-h-60',
            )}>
              <div className="px-3 pb-2.5 space-y-1 border-t border-gray-200/60 dark:border-gray-700/60 pt-1.5">
                {[
                  ['⬟', 'text-primary', 'OLT - Optical Line Terminal'],
                  ['◆', 'text-primary', 'JC - Joint Closure'],
                  ['◇', 'text-blue-500', 'OTB - Optical Terminal Box'],
                  ['■', 'text-cyan-500', 'ODC - Optical Distribution Cabinet'],
                  ['▲', 'text-green-500', 'ODP - Optical Distribution Point'],
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
                  <span className="text-muted-foreground/70 font-semibold text-[10px] uppercase tracking-wider">Koneksi</span>
                  {[
                    ['#6366f1', 'OLT → OTB/ODC/ODP'],
                    ['#3b82f6', 'OTB → ODC'],
                    ['#a855f7', 'OTB → JC (Feeder)'],
                    ['#8b5cf6', 'JC → JC (Branch)'],
                    ['#06b6d4', 'JC/ODC → ODP'],
                    ['#22c55e', 'ODC → ODP'],
                    ['#84cc16', 'ODP → ODP'],
                  ].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded" style={{ backgroundColor: color as string }} />
                      <span className="text-gray-500 dark:text-gray-300">{label}</span>
                    </div>
                  ))}
                  {connections.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">{connections.length} koneksi (putus-putus = otomatis dari data)</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Node Detail / Edit Panel */}
        {selectedEntity && !addCoords && (
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
            initialNodeType={(initialNodeType as AddNodeType | null) ?? undefined}
            onTypeChange={(type) => setPendingNodeType(type)}
          />
        )}
      </div>
    </div>
  );
}


