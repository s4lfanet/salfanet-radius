'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '@/hooks/useTranslation';

// Import icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
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
  metadata?: any;
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
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
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

export default function UnifiedNetworkMap({
  filters, onEntityClick, onMapClick, addMode, pendingPin, onPinMoved, refreshSignal,
  connectMode, connectSource, onConnectNodeClick, connections, showConnections,
}: UnifiedNetworkMapProps) {
  const { t } = useTranslation();
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the pending pin is mid-drag (suppresses re-play of drop animation)
  const [pinDragging, setPinDragging] = useState(false);

  // Default center — will be overridden by map settings from API
  const [mapCenter, setMapCenter] = useState<[number, number]>([-8.6705, 115.2126]);
  const [mapZoom, setMapZoom] = useState(13);

  // Fetch map settings (center + zoom) from admin settings
  useEffect(() => {
    fetch('/api/settings/map')
      .then(r => r.ok ? r.json() : null)
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

  // Memoised pending pin icon — only rebuilds when nodeType changes or drag state changes
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
        const [nodesResponse, customersResponse] = await Promise.all([
          fetch('/api/network/nodes?limit=1000'),
          fetch('/api/customers/with-location?limit=1000'),
        ]);

        if (!nodesResponse.ok || !customersResponse.ok) {
          throw new Error('Failed to fetch entities');
        }

        const nodesData = await nodesResponse.json();
        const customersData = await customersResponse.json();

        // Combine infrastructure + customers
        const allEntities: MapEntity[] = [
          // Infrastructure nodes
          ...(nodesData.data || []).map((n: any) => ({
            id: n.id,
            type: n.type,
            code: n.code,
            name: n.name,
            latitude: parseFloat(n.latitude),
            longitude: parseFloat(n.longitude),
            status: n.status,
            address: n.address,
            metadata: n.metadata,
          })),
          // Customers
          ...(customersData.data || []).map((c: any) => ({
            id: c.id,
            type: 'CUSTOMER',
            code: c.username,
            username: c.username,
            name: c.name,
            latitude: parseFloat(c.latitude),
            longitude: parseFloat(c.longitude),
            status: c.status,
            address: c.address,
            pppoe_profiles: c.pppoe_profiles,
            speed: c.speed,
            odpId: c.odpId,
            odpName: c.odpName,
          })),
        ];

        setEntities(allEntities);
      } catch (err: any) {
        console.error('Error loading entities:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAllEntities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

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
  const renderEntityPopup = (entity: MapEntity) => {
    if (entity.type === 'CUSTOMER') {
      return (
        <div className="p-2 min-w-[200px]">
          <h3 className="font-bold text-lg mb-1">👤 {entity.name}</h3>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Username:</span> {entity.username}</div>
            <div><span className="font-semibold">Status:</span> 
              <span className={`ml-1 px-2 py-0.5 rounded text-xs ${
                entity.status === 'active' ? 'bg-green-100 text-green-800' :
                entity.status === 'isolated' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {entity.status.toUpperCase()}
              </span>
            </div>
            {entity.package && <div><span className="font-semibold">Package:</span> {entity.package}</div>}
            {entity.speed && <div><span className="font-semibold">Speed:</span> {entity.speed}</div>}
            {entity.odpName && <div><span className="font-semibold">ODP:</span> {entity.odpName}</div>}
            {entity.address && <div><span className="font-semibold">Address:</span> {entity.address}</div>}
          </div>
          <button
            onClick={() => onEntityClick?.(entity)}
            className="mt-2 w-full bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
          >
            View Details
          </button>
        </div>
      );
    } else {
      // Infrastructure node
      const typeLabel = entity.type === 'JOINT_CLOSURE' ? 'Joint Closure' : 
                        entity.type === 'OTB' ? 'OTB (Distribution)' : 
                        entity.type;
      return (
        <div className="p-2 min-w-[200px]">
          <h3 className="font-bold text-lg mb-1">{typeLabel}</h3>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Code:</span> {entity.code}</div>
            <div><span className="font-semibold">Name:</span> {entity.name}</div>
            <div><span className="font-semibold">Status:</span> 
              <span className={`ml-1 px-2 py-0.5 rounded text-xs ${
                entity.status === 'active' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {entity.status.toUpperCase()}
              </span>
            </div>
            {entity.address && <div><span className="font-semibold">Location:</span> {entity.address}</div>}
            <div className="text-xs text-gray-500">
              {entity.latitude.toFixed(6)}, {entity.longitude.toFixed(6)}
            </div>
          </div>
          <button
            onClick={() => onEntityClick?.(entity)}
            className="mt-2 w-full bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600"
          >
            View Diagram
          </button>
        </div>
      );
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
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
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      className="w-full h-full"
      style={{ background: '#1f2937' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {addMode && onMapClick && <MapClickHandler onMapClick={onMapClick} />}

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

      {/* Google Earth-style drop pin for pending node placement — draggable, outside cluster */}
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
        iconCreateFunction={(cluster: any) => {
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
            eventHandlers={connectMode ? {
              click: (e) => {
                L.DomEvent.stopPropagation(e.originalEvent);
                onConnectNodeClick?.(entity);
              },
            } : undefined}
          >
            {!connectMode && (
              <Popup>
                {renderEntityPopup(entity)}
              </Popup>
            )}
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
