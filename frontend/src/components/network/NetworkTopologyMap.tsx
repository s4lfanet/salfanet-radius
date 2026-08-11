'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';
import { MapContainer, TileLayer, Marker, Popup, Polyline, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Import diagram components
import { OLTDiagram, JointClosureDiagram, OTBDiagram, ODCDiagram, ODPDiagram } from '@/components/network/SplitterDiagram';
import type { SplitterNode } from '@/components/network/SplitterDiagram/types';

// Fix Leaflet default icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

interface NetworkNode {
  id: string;
  type: 'OLT' | 'OTB' | 'JC' | 'JOINT_CLOSURE' | 'ODC' | 'ODP';
  code: string;
  name: string;
  latitude: string;
  longitude: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  upstreamId?: string;
  data?: any; // Additional node data
}

interface FiberPath {
  id: string;
  from: NetworkNode;
  to: NetworkNode;
  pathNodes: Array<[number, number]>;
  status: 'ACTIVE' | 'INACTIVE' | 'DAMAGED';
  length?: number;
}

// Custom marker icons
const createIcon = (color: string, label: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative">
        <div style="
          background: ${color};
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 10px;
          color: white;
        ">${label}</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const markerIcons = {
  OLT: createIcon('#8b5cf6', 'OLT'),
  OTB: createIcon('#3B82F6', 'OTB'), // Blue diamond
  JC: createIcon('#a855f7', 'JC'),
  JOINT_CLOSURE: createIcon('#a855f7', 'JC'), // Database uses JOINT_CLOSURE
  ODC: createIcon('#06b6d4', 'ODC'),
  ODP: createIcon('#10b981', 'ODP'),
};

// Helper function to get icon with fallback
const getMarkerIcon = (nodeType: string) => {
  // Map JOINT_CLOSURE to JC for display
  if (nodeType === 'JOINT_CLOSURE') {
    return markerIcons['JC'];
  }
  return markerIcons[nodeType as keyof typeof markerIcons] || markerIcons['ODP']; // Fallback to ODP
};

interface NetworkTopologyMapProps {
  nodes?: NetworkNode[];
  paths?: FiberPath[];
  center?: [number, number];
  zoom?: number;
  showDiagram?: boolean;
  onNodeClick?: (node: NetworkNode) => void;
}

export function NetworkTopologyMap({
  nodes = [],
  paths = [],
  center = [-8.670458, 115.212629], // Denpasar, Bali default
  zoom = 13,
  showDiagram = true,
  onNodeClick,
}: NetworkTopologyMapProps) {
  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const handleNodeClick = (node: NetworkNode) => {
    setSelectedNode(node);
    onNodeClick?.(node);
  };

  // Filter nodes
  const filteredNodes = nodes.filter((node) => {
    // Handle JOINT_CLOSURE as JC for filtering
    const nodeType = node.type === 'JOINT_CLOSURE' ? 'JC' : node.type;
    const matchesType = filterType === 'ALL' || nodeType === filterType;
    const matchesSearch =
      searchQuery === '' ||
      node.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.address?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Path colors
  const getPathColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#10b981'; // green
      case 'DAMAGED':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  return (
    <div className="flex h-full">
      {/* Map Container */}
      <div className="flex-1 relative">
        {/* Search and Filters */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex gap-2">
          <input
            type="text"
            placeholder={t('network.map.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 rounded-lg shadow-lg border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 bg-gray-800 rounded-lg shadow-lg border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">{t('network.map.showAll')}</option>
            <option value="OLT">OLT</option>
            <option value="OTB">OTB</option>
            <option value="JC">JC</option>
            <option value="ODC">ODC</option>
            <option value="ODP">ODP</option>
          </select>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-gray-800 rounded-lg shadow-lg p-4 min-w-[200px] border border-gray-700">
          <h3 className="text-sm font-semibold mb-3 text-white">{t('network.map.legend')}</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-600"></div>
              <span className="text-gray-300">OLT</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-600"></div>
              <span className="text-gray-300">OTB (Distribution)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-500"></div>
              <span className="text-gray-300">Joint Closure (JC)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-cyan-600"></div>
              <span className="text-gray-300">ODC</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-emerald-600"></div>
              <span className="text-gray-300">ODP</span>
            </div>
            <div className="h-px bg-gray-600 my-2"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-green-500"></div>
              <span className="text-gray-300">{t('common.active')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-red-500"></div>
              <span className="text-gray-300">{t('common.damaged')}</span>
            </div>
          </div>
        </div>

        {/* Leaflet Map */}
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {/* Fiber Paths */}
          {paths.map((path) => (
            <Polyline
              key={path.id}
              positions={path.pathNodes}
              color={getPathColor(path.status)}
              weight={3}
              opacity={0.7}
              dashArray={path.status === 'DAMAGED' ? '10, 10' : undefined}
            />
          ))}

          {/* Network Nodes */}
          {filteredNodes.map((node) => (
            <Marker
              key={node.id}
              position={[parseFloat(node.latitude), parseFloat(node.longitude)]}
              icon={getMarkerIcon(node.type)}
              eventHandlers={{
                click: () => handleNodeClick(node),
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px] bg-gray-800 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white">
                      {node.type === 'JOINT_CLOSURE' ? 'JC' : node.type}
                    </span>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        node.status === 'ACTIVE'
                          ? 'bg-green-600 text-white'
                          : node.status === 'MAINTENANCE'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-600 text-white'
                      }`}
                    >
                      {t(`common.${node.status.toLowerCase()}`)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white mb-1">{node.code}</h3>
                  <p className="text-sm text-gray-300 mb-2">{node.name}</p>
                  {node.address && (
                    <p className="text-xs text-gray-400 mb-3">📍 {node.address}</p>
                  )}
                  <button
                    onClick={() => handleNodeClick(node)}
                    className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    {t('network.diagram.title')}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Sidebar - Splitter Diagram */}
      {showDiagram && selectedNode && (
        <div className="w-[700px] bg-gray-800 border-l border-gray-700 overflow-y-auto">
          <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold text-white">
              {t('network.diagram.title')} - {selectedNode.code}
            </h2>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="p-4">
            {/* Display appropriate diagram based on node type */}
            {selectedNode.type === 'OLT' && selectedNode.data && (
              <OLTDiagram
                node={selectedNode.data as SplitterNode}
                width={700}
                height={600}
                interactive={true}
                showLabels={true}
              />
            )}
            {selectedNode.type === 'JC' && selectedNode.data && (
              <JointClosureDiagram
                node={selectedNode.data as SplitterNode}
                width={650}
                height={500}
                interactive={true}
                showLabels={true}
              />
            )}
            {selectedNode.type === 'OTB' && selectedNode.data && (
              <OTBDiagram
                node={selectedNode.data as SplitterNode}
                width={650}
                height={500}
                interactive={true}
                showLabels={true}
              />
            )}
            {selectedNode.type === 'ODC' && selectedNode.data && (
              <ODCDiagram
                node={selectedNode.data as SplitterNode}
                width={650}
                height={450}
                interactive={true}
                showLabels={true}
              />
            )}
            {selectedNode.type === 'ODP' && selectedNode.data && (
              <ODPDiagram
                node={selectedNode.data as SplitterNode}
                width={600}
                height={420}
                interactive={true}
                showLabels={true}
              />
            )}
            {!selectedNode.data && (
              <div className="text-center py-12 text-gray-400">
                <p>{t('network.messages.noData')}</p>
                <p className="text-sm mt-2">Diagram data untuk {selectedNode.code} belum tersedia</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkTopologyMap;
