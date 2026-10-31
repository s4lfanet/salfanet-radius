'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMapEvents, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '@/hooks/useTranslation';
import { apiAdmin } from '@/lib/api';

// Import icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default marker icons
// _getIconUrl is an internal Leaflet property not exposed in types
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

interface MapEntity {
  id: string;
  type: 'OLT' | 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP' | 'CUSTOMER';
  code?: string;
  username?: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  address?: string | null;
  metadata?: Record<string, unknown>;
  package?: string;
  speed?: string;
  odpId?: string | null;
  odpName?: string;
}

/** A connection line to render as a polyline on the map */
export interface ConnectionLine {
  id: string;
  from: { id: string; type: string; name: string; lat: number; lng: number };
  to: { id: string; type: string; name: string; lat: number; lng: number };
  cableName: string;
  segmentCount: number;
  tubeCount: number;
  coresPerTube: number;
  totalCores: number;
  lengthMeters: number;
  color: string;
}

interface UnifiedNetworkMapProps {
  filters: {
    types: string[];
    status: string[];
    search: string;
  };
  onEntityClick?: (entity: MapEntity) => void;
  onMapClick?: (lat: number, lng: number) => void;
  addMode?: boolean;
  /** Placement pin shown while user configures a new node. Updates live on drag. */
  pendingPin?: { lat: number; lng: number; nodeType?: string } | null;
  onPinMoved?: (lat: number, lng: number) => void;
  /** Increment to trigger a full entity re-fetch (e.g. after add/delete/update). */
  refreshSignal?: number;
  /** Connect mode: click source → click target to draw a connection */
  connectMode?: boolean;
  /** Source node selected in connect mode */
  connectSource?: MapEntity | null;
  /** Called when user clicks a node in connect mode */
  onConnectNodeClick?: (entity: MapEntity) => void;
  /** Connection lines to render as polylines */
  connections?: ConnectionLine[];
  /** Whether to show connection lines */
  showConnections?: boolean;
  /** When set, map flies to this location */
  flyToLocation?: { lat: number; lng: number } | null;
  /** If set, show a pulsing dot for the user's GPS location */
  userLocation?: { lat: number; lng: number } | null;
  /** Active basemap layer (controlled by the page toolbar) */
  mapLayer?: BasemapKey;
  /** Move mode: infrastructure markers become draggable */
  moveMode?: boolean;
  /** Called when a marker popup asks to enter move mode */
  onMoveModeChange?: (v: boolean) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Live ONT section for PPPoE customers — resolves the GenieACS device
    by PPPoE username. Mounts when the popup/panel renders it (lazy fetch).
    `panel` switches text colors to theme tokens for use inside the dark
    side panel (popup variant stays on fixed grays for the white card). */
export function GenieAcsInfo({ username, panel = false }: { username: string; panel?: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [dev, setDev] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    apiAdmin<{ success: boolean; device?: Record<string, unknown> | null }>(
      `/api/genieacs/device-by-username?username=${encodeURIComponent(username)}`
    )
      .then((d) => {
        if (!alive) return;
        if (d?.device) {
          setDev(d.device);
          setState('ready');
        } else {
          setState('none');
        }
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [username]);

  if (state === 'none' || state === 'error') return null;

  const labelCls = `w-24 shrink-0 font-medium ${panel ? 'text-muted-foreground' : 'text-gray-500'}`;
  const valueCls = panel ? 'text-foreground' : 'text-gray-800';

  const row = (label: string, value?: string | number | null) => {
    if (value === undefined || value === null || String(value).trim() === '' || String(value) === '-') return null;
    return (
      <div className="flex text-xs" key={label}>
        <span className={labelCls}>{label}</span>
        <span className={valueCls}>{value}</span>
      </div>
    );
  };

  return (
    <div className={`mt-2 pt-2 border-t ${panel ? 'border-border' : 'border-gray-100'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${panel ? 'text-muted-foreground' : 'text-gray-400'}`}>
        Perangkat ONT (GenieACS)
      </p>
      {state === 'loading' && (
        <div className="animate-pulse space-y-1">
          <div className={`h-2.5 rounded w-3/4 ${panel ? 'bg-muted' : 'bg-gray-200'}`} />
          <div className={`h-2.5 rounded w-1/2 ${panel ? 'bg-muted' : 'bg-gray-200'}`} />
        </div>
      )}
      {state === 'ready' && dev && (
        <div className="space-y-0.5">
          <div className="flex items-center text-xs">
            <span className={labelCls}>Status ONT</span>
            <span className={`inline-flex items-center gap-1 font-semibold ${dev.online ? 'text-green-700' : 'text-red-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dev.online ? 'bg-green-500' : 'bg-red-500'}`} />
              {dev.online ? 'Online' : 'Offline'}
            </span>
          </div>
          {row('ONT', [dev.manufacturer, dev.model].filter(Boolean).join(' '))}
          {row('Serial', String(dev.serialNumber ?? ''))}
          {row('PPPoE IP', String(dev.ipAddress ?? ''))}
          {dev.rxDbm !== null && dev.rxDbm !== undefined ? (
            <div className="flex text-xs">
              <span className={labelCls}>RX Power</span>
              <span className={`font-semibold ${
                Number(dev.rxDbm) >= -25 ? 'text-green-700' :
                Number(dev.rxDbm) >= -28 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {String(dev.rxPower)}
              </span>
            </div>
          ) : row('RX Power', String(dev.rxPower ?? ''))}
          {row('TX Power', dev.txPower ? `${dev.txPower} dBm` : null)}
          {row('Suhu', dev.temperature ? `${dev.temperature}°C` : null)}
          {row('Uptime', String(dev.uptime ?? ''))}
          {row('PON', String(dev.ponMode ?? ''))}
          {row('SSID', String(dev.ssid ?? ''))}
          {row('WiFi Client', dev.wifiClients !== null && dev.wifiClients !== undefined ? String(dev.wifiClients) : null)}
          {dev.lastInform ? row('Inform', new Date(String(dev.lastInform)).toLocaleString('id-ID')) : null}
        </div>
      )}
    </div>
  );
}

function FlyToController({ location }: { location: { lat: number; lng: number } | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], 16, { duration: 1.5 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  return null;
}

// ─── Node type accent colors (mirror AddNodePanel) ────────────────────────────
const PENDING_PIN_COLORS: Record<string, string> = {
  OLT: '#8b5cf6',           // purple
  OTB: '#3B82F6',           // blue
  JOINT_CLOSURE: '#a855f7', // violet
  ODC: '#06b6d4',           // cyan
  ODP: '#10b981',           // emerald
};
const PENDING_PIN_LABELS: Record<string, string> = {
  OLT: 'OLT', OTB: 'OTB', JOINT_CLOSURE: 'JC', ODC: 'ODC', ODP: 'ODP',
};

/**
 * Creates an animated "Google Earth-style" drop-pin icon for the pending placement marker.
 * @param nodeType  The selected node type (determines pin color). Defaults to orange (+).
 * @param isDragging  When true, skip the drop animation so it doesn't replay while dragging.
 */
function createPendingPinIcon(nodeType?: string, isDragging = false) {
  const color = nodeType ? (PENDING_PIN_COLORS[nodeType] ?? '#f97316') : '#f97316';
  const label = nodeType ? (PENDING_PIN_LABELS[nodeType] ?? '+') : '+';
  const dropAnim = isDragging ? '' : 'animation:pinDrop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;';
  return L.divIcon({
    html: `
      <div style="position:relative;width:44px;height:54px;cursor:grab;">
        <!-- pulsing ring -->
        <div style="
          position:absolute;bottom:0;left:50%;
          transform:translateX(-50%);
          width:24px;height:12px;border-radius:50%;
          background:${color};opacity:0.35;
          animation:pinPing 1.8s ease-out infinite;
        "></div>
        <!-- pin body (rotated diamond shape) -->
        <div style="
          position:absolute;bottom:6px;left:50%;
          transform:translateX(-50%);
          ${dropAnim}
        ">
          <div style="
            background:${color};
            width:36px;height:36px;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            border:3px solid white;
            box-shadow:0 4px 12px rgba(0,0,0,0.45);
            display:flex;align-items:center;justify-content:center;
          ">
            <span style="
              transform:rotate(45deg);
              color:white;font-size:10px;font-weight:700;
              font-family:monospace;line-height:1;
            ">${label}</span>
          </div>
        </div>
      </div>`,
    className: '',
    iconSize: [44, 54],
    iconAnchor: [22, 54],
    popupAnchor: [0, -58],
  });
}

/**
 * Create custom marker icons based on entity type and status
 */
const createCustomIcon = (type: string, status: string) => {
  let color = '#6366f1'; // Default indigo
  let iconSymbol = '●';

  switch (type) {
    case 'OLT':
      color = '#8b5cf6'; // Purple
      iconSymbol = '⬟';
      break;
    case 'OTB':
      color = '#3B82F6'; // Blue
      iconSymbol = '◇';
      break;
    case 'JOINT_CLOSURE':
      color = '#a855f7'; // Light purple
      iconSymbol = '◆';
      break;
    case 'ODC':
      color = '#06b6d4'; // Cyan
      iconSymbol = '■';
      break;
    case 'ODP':
      color = '#10b981'; // Green
      iconSymbol = '▲';
      break;
    case 'CUSTOMER':
      // Customer colors based on status
      if (status === 'active') color = '#22c55e'; // Green
      else if (status === 'isolated') color = '#ef4444'; // Red
      else color = '#6b7280'; // Gray (offline)
      iconSymbol = '👤';
      break;
  }

  // Dim color for inactive status (infrastructure)
  if (type !== 'CUSTOMER' && status !== 'active') {
    color = '#6b7280'; // Gray for inactive
  }

  const iconHtml = `
    <div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <span style="
        color: white;
        font-size: 16px;
        font-weight: bold;
        transform: rotate(45deg);
      ">${iconSymbol}</span>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

export type BasemapKey = 'street' | 'satellite' | 'topo' | 'dark';

const BASEMAPS: Record<BasemapKey, { url: string; attribution: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> World Imagery',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  dark: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
  },
};

export default function UnifiedNetworkMap({
  filters, onEntityClick, onMapClick, addMode, pendingPin, onPinMoved, refreshSignal,
  connectMode, connectSource, onConnectNodeClick, connections, showConnections,
  flyToLocation, userLocation,
  mapLayer = 'street', moveMode = false, onMoveModeChange,
}: UnifiedNetworkMapProps) {
  const { t: _t } = useTranslation();
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the pending pin is mid-drag (suppresses re-play of drop animation)
  const [pinDragging, setPinDragging] = useState(false);

  // Default center - will be overridden by map settings from API
  const [mapCenter, setMapCenter] = useState<[number, number]>([-8.6705, 115.2126]);
  const [mapZoom, setMapZoom] = useState(13);
  const [reloadTick, setReloadTick] = useState(0);

  // Fetch map settings (center + zoom) from admin settings
  useEffect(() => {
    apiAdmin<{ settings?: { defaultLat: number; defaultLon: number; defaultZoom: number } } | null>('/api/settings/map')
      .then(data => {
        if (data?.settings) {
          setMapCenter([data.settings.defaultLat, data.settings.defaultLon]);
          setMapZoom(data.settings.defaultZoom);
        }
      })
      .catch(() => {}); // silently fall back to defaults
  }, []);

  // Inject CSS keyframes for the drop-pin animation (once per page)
  useEffect(() => {
    if (document.getElementById('leaflet-pending-pin-anim')) return;
    const s = document.createElement('style');
    s.id = 'leaflet-pending-pin-anim';
    s.textContent = `
      @keyframes pinDrop {
        0%   { transform: translateY(-50px); opacity: 0; }
        65%  { transform: translateY(5px);   opacity: 1; }
        82%  { transform: translateY(-5px); }
        100% { transform: translateY(0px); }
      }
      @keyframes pinPing {
        0%   { transform: scale(0.6); opacity: 0.7; }
        100% { transform: scale(2.8); opacity: 0; }
      }
      .leaflet-marker-draggable { cursor: grab !important; }
      .leaflet-marker-draggable:active { cursor: grabbing !important; }
    `;
    document.head.appendChild(s);
  }, []);

  // Memoised pending pin icon - only rebuilds when nodeType changes or drag state changes
  const pendingPinIcon = useMemo(
    () => pendingPin ? createPendingPinIcon(pendingPin.nodeType, pinDragging) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingPin?.nodeType, pinDragging],
  );

  /**
   * Load all entities (infrastructure + customers)
   */
  useEffect(() => {
    const loadAllEntities = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch infrastructure nodes and customers in parallel
        const [nodesData, customersData] = await Promise.all([
          apiAdmin<{ data?: Record<string, unknown>[] }>('/api/network/nodes?limit=1000'),
          apiAdmin<{ data?: Record<string, unknown>[] }>('/api/customers/with-location?limit=1000'),
        ]);

        // Combine infrastructure + customers
        const allEntities: MapEntity[] = [
          // Infrastructure nodes
          ...(nodesData.data || []).map((n: Record<string, unknown>) => ({
            id: n.id as string,
            type: n.type as MapEntity['type'],
            code: n.code as string | undefined,
            name: n.name as string,
            latitude: parseFloat(n.latitude as string),
            longitude: parseFloat(n.longitude as string),
            status: n.status as string,
            address: n.address as string | null | undefined,
            metadata: n.metadata as Record<string, unknown> | undefined,
          })),
          // Customers
          ...(customersData.data || []).map((c: Record<string, unknown>) => ({
            id: c.id as string,
            type: 'CUSTOMER' as const,
            code: c.username as string | undefined,
            username: c.username as string | undefined,
            name: c.name as string,
            latitude: parseFloat(c.latitude as string),
            longitude: parseFloat(c.longitude as string),
            status: c.status as string,
            address: c.address as string | null | undefined,
            pppoe_profiles: c.pppoe_profiles as Record<string, unknown> | undefined,
            speed: c.speed as string | undefined,
            odpId: c.odpId as string | null | undefined,
            odpName: c.odpName as string | undefined,
          })),
        ];

        setEntities(allEntities);
      } catch (err: unknown) {
        console.error('Error loading entities:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadAllEntities();
  }, [refreshSignal, reloadTick]);

  /**
   * Filter entities based on active filters
   */
  const filteredEntities = useMemo(() => {
    return entities.filter(entity => {
      // Filter by type
      if (!filters.types.includes(entity.type)) return false;

      // Filter by status
      if (!filters.status.includes(entity.status)) return false;

      // Filter by search text
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const nameMatch = entity.name?.toLowerCase().includes(searchLower);
        const codeMatch = entity.code?.toLowerCase().includes(searchLower);
        const addressMatch = entity.address?.toLowerCase().includes(searchLower);
        
        if (!nameMatch && !codeMatch && !addressMatch) return false;
      }

      return true;
    });
  }, [entities, filters]);

  /**
   * Render entity popup content
   */
  /** Per-type REST path for correcting a misplaced device on the map. */
  const nodeTypePath = (t: MapEntity['type']): string | null => {
    switch (t) {
      case 'OLT': return 'olts';
      case 'ODC': return 'odcs';
      case 'ODP': return 'odps';
      case 'OTB': return 'otbs';
      case 'JOINT_CLOSURE': return 'joint-closures';
      default: return null; // customers keep their own location flow
    }
  };

  const handleMarkerMove = async (entity: MapEntity, lat: number, lng: number) => {
    const p = nodeTypePath(entity.type);
    if (!p) return;
    try {
      const res = await fetch(`/api/network/${p}/${entity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((data.error as string) || 'Gagal memindahkan titik');
      showSuccess(`${entity.name} dipindah`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Gagal memindahkan titik');
    } finally {
      setReloadTick((t) => t + 1);
    }
  };

  const handleDeleteNode = async (entity: MapEntity) => {
    const p = nodeTypePath(entity.type);
    if (!p) return;
    const ok = await showConfirm(`Hapus ${entity.name} dari jaringan?`, 'Hapus Titik', 'Hapus');
    if (!ok) return;
    try {
      const res = await fetch(`/api/network/${p}/${entity.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((data.error as string) || 'Gagal menghapus titik');
      showSuccess(`${entity.name} dihapus`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Gagal menghapus titik');
    } finally {
      setReloadTick((t) => t + 1);
    }
  };

  const entityById = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );

  const statusPill = (status: string) => {
    const s = (status || '').toLowerCase();
    const cls =
      s === 'active' || s === 'online' ? 'bg-green-100 text-green-800' :
      s === 'maintenance' ? 'bg-amber-100 text-amber-800' :
      s === 'isolated' || s === 'damaged' || s === 'offline' ? 'bg-red-100 text-red-800' :
      'bg-gray-100 text-gray-700';
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
        {(status || 'unknown').toUpperCase()}
      </span>
    );
  };

  const popupRow = (label: string, value?: string | number | null) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    return (
      <div className="flex text-sm" key={label}>
        <span className="w-24 shrink-0 text-gray-500 font-medium">{label}</span>
        <span className="text-gray-800">{value}</span>
      </div>
    );
  };

  const TYPE_GRADIENT: Record<string, string> = {
    OLT: 'from-violet-500 to-violet-600',
    OTB: 'from-blue-500 to-blue-600',
    JOINT_CLOSURE: 'from-purple-500 to-purple-600',
    ODC: 'from-cyan-500 to-cyan-600',
    ODP: 'from-emerald-500 to-emerald-600',
    CUSTOMER: 'from-sky-500 to-sky-600',
  };

  const renderEntityPopup = (entity: MapEntity) => {
    const meta = (entity.metadata ?? {}) as Record<string, unknown>;
    const upstream = meta.upstreamId ? entityById.get(String(meta.upstreamId)) : undefined;
    const typeLabel =
      entity.type === 'JOINT_CLOSURE' ? 'Joint Closure' :
      entity.type === 'OTB' ? 'OTB (Distribution)' :
      entity.type === 'CUSTOMER' ? 'Pelanggan' : entity.type;
    const gradient = TYPE_GRADIENT[entity.type] ?? 'from-slate-500 to-slate-600';
    const coords = `${entity.latitude.toFixed(5)}, ${entity.longitude.toFixed(5)}`;

    if (entity.type === 'CUSTOMER') {
      return (
        <div className="popup-card">
          <div className={`popup-header bg-gradient-to-r ${gradient}`}>
            <span className="font-bold text-base">{entity.name || entity.username || 'Pelanggan'}</span>
            <p className="text-white/80 text-sm mt-0.5">
              Pelanggan{entity.username ? ` · ${entity.username}` : ''}
            </p>
          </div>
          <div className="popup-content space-y-1">
            {popupRow('Username', entity.username)}
            <div className="flex items-center text-sm">
              <span className="w-24 shrink-0 text-gray-500 font-medium">Status</span>
              {statusPill(entity.status)}
            </div>
            {popupRow('Paket', entity.package)}
            {popupRow('Speed', entity.speed)}
            {popupRow('ODP', entity.odpName)}
            {popupRow('Alamat', entity.address)}
            {popupRow('Koordinat', coords)}
            {entity.username ? <GenieAcsInfo username={entity.username} /> : null}
            <button
              onClick={() => onEntityClick?.(entity)}
              className="mt-2 w-full rounded bg-sky-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-sky-700"
            >
              Lihat Detail
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="popup-card">
        <div className={`popup-header bg-gradient-to-r ${gradient}`}>
          <span className="font-bold text-base">{typeLabel}</span>
          <p className="text-white/80 text-sm mt-0.5 truncate">{entity.name}</p>
        </div>
        <div className="popup-content space-y-1">
          {entity.code && entity.code !== entity.name ? popupRow('Kode', entity.code) : null}
          <div className="flex items-center text-sm">
            <span className="w-24 shrink-0 text-gray-500 font-medium">Status</span>
            {statusPill(entity.status)}
          </div>
          {upstream ? popupRow('Upstream', `${upstream.name} (${upstream.type})`) : null}
          {entity.type === 'OLT' ? popupRow('IP', String(meta.ipAddress ?? '')) : null}
          {popupRow('Lokasi', entity.address)}
          {popupRow('Koordinat', coords)}
          <button
            onClick={() => onEntityClick?.(entity)}
            className="mt-2 w-full rounded bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700"
          >
            Lihat Detail
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-500 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-red-500 dark:text-red-400">
          <p className="text-lg font-bold mb-2">Error Loading Map</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      zoomControl={false}
      className="w-full h-full"
      style={{ background: '#1f2937' }}
    >
      {/* Bottom-right keeps it clear of the Filter button (top-left, mobile)
          and the top toolbar shared by all map actions. */}
      <ZoomControl position="bottomright" />
      <TileLayer
        key={mapLayer}
        attribution={BASEMAPS[mapLayer].attribution}
        url={BASEMAPS[mapLayer].url}
      />

      {addMode && onMapClick && <MapClickHandler onMapClick={onMapClick} />}
      <FlyToController location={flyToLocation} />

      {/* User GPS location marker */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={L.divIcon({
            html: `
              <div style="position:relative;width:24px;height:24px;">
                <div style="width:24px;height:24px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(59,130,246,0.5);position:absolute;"></div>
                <div style="width:40px;height:40px;background:rgba(59,130,246,0.2);border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);animation:pinPing 2s ease-out infinite;"></div>
              </div>`,
            className: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14],
          })}
          interactive={false}
        />
      )}

      {/* ── Connection polylines ────────────────────────────────────────── */}
      {showConnections && connections && connections.map(conn => (
        <Polyline
          key={conn.id}
          positions={[[conn.from.lat, conn.from.lng], [conn.to.lat, conn.to.lng]]}
          pathOptions={{
            color: conn.color,
            weight: Math.min(2 + conn.segmentCount * 0.3, 5),
            opacity: 0.75,
            dashArray: conn.segmentCount === 1 ? '6 4' : undefined,
          }}
        >
          <Popup>
            <div className="p-2 min-w-[180px] text-sm">
              <p className="font-bold text-gray-900 mb-1">{conn.cableName}</p>
              <p className="text-gray-600">{conn.from.name} → {conn.to.name}</p>
              <p className="text-gray-500">{conn.tubeCount}T × {conn.coresPerTube}C = {conn.totalCores} core</p>
              {conn.lengthMeters > 0 && <p className="text-gray-400">≈{conn.lengthMeters}m</p>}
              <p className="text-gray-400">{conn.segmentCount} segment(s)</p>
            </div>
          </Popup>
        </Polyline>
      ))}

      {/* ── Connect mode: highlight source node with pulsing ring ───── */}
      {connectMode && connectSource && (
        <Marker
          position={[connectSource.latitude, connectSource.longitude]}
          icon={L.divIcon({
            html: `<div style="
              width:48px;height:48px;border-radius:50%;
              border:3px solid #f59e0b;
              background:rgba(245,158,11,0.15);
              animation:pinPing 1.2s ease-out infinite;
              box-shadow:0 0 12px rgba(245,158,11,0.5);
            "></div>`,
            className: '',
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          })}
          interactive={false}
        />
      )}

      {/* Google Earth-style drop pin for pending node placement - draggable, outside cluster */}
      {pendingPin && pendingPinIcon && (
        <Marker
          position={[pendingPin.lat, pendingPin.lng]}
          icon={pendingPinIcon}
          draggable={true}
          eventHandlers={{
            dragstart: () => setPinDragging(true),
            dragend: (e) => {
              setPinDragging(false);
              const { lat, lng } = (e.target as L.Marker).getLatLng();
              onPinMoved?.(lat, lng);
            },
          }}
        />
      )}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
        iconCreateFunction={(cluster: { getChildCount(): number }) => {
          const count = cluster.getChildCount();
          let size = 'small';
          let colorClass = 'bg-blue-500';
          
          if (count > 100) {
            size = 'large';
            colorClass = 'bg-red-500';
          } else if (count > 50) {
            size = 'medium';
            colorClass = 'bg-orange-500';
          }
          
          return L.divIcon({
            html: `<div class="${colorClass} text-white rounded-full flex items-center justify-center font-bold border-2 border-white shadow-lg">${count}</div>`,
            className: `marker-cluster marker-cluster-${size}`,
            iconSize: L.point(40, 40),
          });
        }}
      >
        {filteredEntities.map(entity => (
          <Marker
            key={entity.id}
            position={[entity.latitude, entity.longitude]}
            icon={createCustomIcon(entity.type, entity.status)}
            draggable={moveMode && nodeTypePath(entity.type) !== null}
            eventHandlers={{
              ...(connectMode ? {
                click: (e) => {
                  L.DomEvent.stopPropagation(e.originalEvent);
                  onConnectNodeClick?.(entity);
                },
              } : {}),
              ...(moveMode && nodeTypePath(entity.type) !== null ? {
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const pos = m.getLatLng();
                  handleMarkerMove(entity, pos.lat, pos.lng);
                },
              } : {}),
            }}
          >
            {!connectMode && (
              <Popup>
                {renderEntityPopup(entity)}
                {nodeTypePath(entity.type) && (
                  <div className="mt-2 px-3 pb-3 flex flex-col gap-1">
                    {!moveMode && (
                      <button
                        type="button"
                        onClick={() => onMoveModeChange?.(true)}
                        className="rounded bg-blue-600 text-white text-xs font-semibold px-2 py-1.5 hover:bg-blue-700"
                      >
                        Geser Titik Ini
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(entity)}
                      className="rounded bg-red-600 text-white text-xs font-semibold px-2 py-1.5 hover:bg-red-700"
                    >
                      Hapus Titik Ini
                    </button>
                  </div>
                )}
              </Popup>
            )}
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
    </div>
  );
}
