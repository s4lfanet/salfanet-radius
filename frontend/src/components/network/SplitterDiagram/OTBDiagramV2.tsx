'use client';

import React from 'react';
import { 
  DiagramProps, 
  Port, 
  DEFAULT_COLORS, 
  PORT_STATUS_LABELS, 
  FIBER_COLORS as UI_FIBER_COLORS,
  TubeVisualization,
  CoreVisualization,
} from './types';
import { FIBER_COLORS, getFiberColor, getFullCoreIdentifier } from '@/lib/network/fiber-core-types';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface OTBDiagramV2Props extends Omit<DiagramProps, 'node'> {
  node: DiagramProps['node'] & {
    incomingCable?: {
      id: string;
      code: string;
      name: string;
      cableType?: string;
      tubeCount?: number;
      coresPerTube?: number;
      tubes?: TubeVisualization[];
    };
    spliceTrayCount?: number;
    hasSplitter?: boolean;
  };
  showTubeDetail?: boolean;
  selectedTube?: number;
  selectedCore?: string;
  onTubeClick?: (tubeNumber: number) => void;
  onCoreClick?: (core: CoreVisualization, tube: TubeVisualization) => void;
  highlightPath?: string[]; // Array of core IDs to highlight for tracing
}

/**
 * OTBDiagramV2 Component
 * Enhanced OTB visualization with tube-core hierarchy
 * Based on VETRO FiberMap-inspired design
 */
export function OTBDiagramV2({
  node,
  width = 800,
  height = 600,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
  showTubeDetail = true,
  selectedTube,
  selectedCore,
  onTubeClick,
  onCoreClick,
  highlightPath = [],
}: OTBDiagramV2Props) {
  const [hoveredPort, setHoveredPort] = React.useState<Port | null>(null);
  const [hoveredTube, setHoveredTube] = React.useState<TubeVisualization | null>(null);
  const [hoveredCore, setHoveredCore] = React.useState<CoreVisualization | null>(null);
  const { t } = useTranslation();

  const handlePortClick = (port: Port) => {
    if (interactive && onPortClick) {
      onPortClick(port);
    }
  };

  const handleTubeClick = (tube: TubeVisualization) => {
    if (interactive && onTubeClick) {
      onTubeClick(tube.tubeNumber);
    }
  };

  const handleCoreClick = (core: CoreVisualization, tube: TubeVisualization) => {
    if (interactive && onCoreClick) {
      onCoreClick(core, tube);
    }
  };

  const getPortColor = (port: Port): string => {
    if (selectedPorts.includes(port.id)) {
      return '#8b5cf6';
    }
    if (port.number > node.inputPorts) {
      const colorIndex = (port.number - node.inputPorts - 1) % UI_FIBER_COLORS.length;
      return UI_FIBER_COLORS[colorIndex];
    }
    switch (port.status) {
      case 'AVAILABLE': return DEFAULT_COLORS.available;
      case 'ASSIGNED': return DEFAULT_COLORS.assigned;
      case 'RESERVED': return DEFAULT_COLORS.reserved;
      case 'DAMAGED': return DEFAULT_COLORS.damaged;
      case 'MAINTENANCE': return DEFAULT_COLORS.maintenance;
      default: return DEFAULT_COLORS.available;
    }
  };

  const getCoreStatusColor = (status: string): string => {
    switch (status) {
      case 'AVAILABLE': return '#10b981';
      case 'ASSIGNED': return '#3b82f6';
      case 'RESERVED': return '#f59e0b';
      case 'DAMAGED': return '#ef4444';
      case 'DARK': return '#6b7280';
      default: return '#10b981';
    }
  };

  const inputPorts = node.ports.filter((p) => p.number <= node.inputPorts);
  const outputPorts = node.ports.filter((p) => p.number > node.inputPorts);
  const incomingCable = node.incomingCable;
  const tubes = incomingCable?.tubes || [];

  // Calculate statistics
  const totalCores = tubes.reduce((sum, t) => sum + t.totalCores, 0);
  const usedCores = tubes.reduce((sum, t) => sum + t.usedCores, 0);
  const utilizationPercent = totalCores > 0 ? Math.round((usedCores / totalCores) * 100) : 0;

  return (
    <div className="otb-diagram-v2">
      {/* Info Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{node.code}</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full">
                OTB
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{node.name}</p>
            {node.address && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">📍 {node.address}</p>
            )}
          </div>
          <div className="text-right">
            <span className={cn(
              'inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium',
              node.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
              node.status === 'MAINTENANCE' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
              'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
            )}>
              {node.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Kabel Feeder</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {incomingCable?.code || node.metadata?.feederCable || '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Tipe Koneksi</p>
            <p className="font-medium text-gray-900 dark:text-white">
              Patch-through (Lurus)
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Tubes / Cores</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {tubes.length} / {totalCores || ((incomingCable as any)?.tubeCount ?? 0) * ((incomingCable as any)?.coresPerTube ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Utilisasi</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {usedCores} / {totalCores || ((incomingCable as any)?.tubeCount ?? 0) * ((incomingCable as any)?.coresPerTube ?? 0)} ({utilizationPercent}%)
            </p>
          </div>
        </div>
      </div>

      {/* Tube-Core Grid Visualization */}
      {showTubeDetail && tubes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Feeder Cable: {incomingCable?.code}
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({incomingCable?.cableType || 'SM-G.652'})
            </span>
          </h4>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {tubes.map((tube) => (
              <div
                key={tube.id}
                className={cn(
                  'p-2 rounded-lg border-2 cursor-pointer transition-all',
                  selectedTube === tube.tubeNumber 
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                    : 'hover:border-gray-300 dark:hover:border-gray-600'
                )}
                style={selectedTube !== tube.tubeNumber ? {
                  borderColor: tube.colorHex || undefined,
                  backgroundColor: tube.colorHex ? `${tube.colorHex}10` : undefined,
                } : undefined}
                onClick={() => handleTubeClick(tube)}
                onMouseEnter={() => setHoveredTube(tube)}
                onMouseLeave={() => setHoveredTube(null)}
              >
                {/* Tube Header */}
                <div className="flex items-center gap-1 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-400"
                    style={{ backgroundColor: tube.colorHex }}
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    T{tube.tubeNumber}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                    {tube.usedCores}/{tube.totalCores}
                  </span>
                </div>

                {/* Core Grid */}
                <div className="grid grid-cols-4 gap-0.5">
                  {tube.cores.map((core) => (
                    <div
                      key={core.id}
                      className={cn(
                        'w-3 h-3 rounded-sm cursor-pointer transition-all',
                        highlightPath.includes(core.id) && 'ring-2 ring-yellow-400 animate-pulse',
                        selectedCore === core.id && 'ring-2 ring-purple-500'
                      )}
                      style={{ 
                        backgroundColor: getCoreStatusColor(core.status),
                        border: `1px solid ${core.colorHex}`,
                      }}
                      title={`Core ${core.coreNumber}: ${core.status}${core.assignedTo ? ` → ${core.assignedTo}` : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCoreClick(core, tube);
                      }}
                      onMouseEnter={() => setHoveredCore(core)}
                      onMouseLeave={() => setHoveredCore(null)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Hovered Tube/Core Info */}
          {(hoveredTube || hoveredCore) && (
            <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs">
              {hoveredCore && (
                <div className="flex items-center gap-4">
                  <span className="font-medium">
                    {getFullCoreIdentifier(hoveredTube?.tubeNumber || 1, hoveredCore.coreNumber)}
                  </span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded',
                    hoveredCore.status === 'AVAILABLE' && 'bg-green-100 text-green-800',
                    hoveredCore.status === 'ASSIGNED' && 'bg-blue-100 text-blue-800',
                    hoveredCore.status === 'RESERVED' && 'bg-amber-100 text-amber-800',
                    hoveredCore.status === 'DAMAGED' && 'bg-red-100 text-red-800',
                    hoveredCore.status === 'DARK' && 'bg-gray-100 text-gray-800',
                  )}>
                    {hoveredCore.status}
                  </span>
                  {hoveredCore.assignedTo && (
                    <span className="text-gray-600 dark:text-gray-400">
                      → {hoveredCore.assignedTo}
                    </span>
                  )}
                </div>
              )}
              {!hoveredCore && hoveredTube && (
                <div className="flex items-center gap-4">
                  <span className="font-medium">Tube {hoveredTube.tubeNumber}</span>
                  <span style={{ color: hoveredTube.colorHex }}>{hoveredTube.colorCode}</span>
                  <span className="text-gray-500">
                    {hoveredTube.usedCores} used / {hoveredTube.totalCores - hoveredTube.usedCores} available
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <defs>
          <marker id="arrowhead-v2" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
          </marker>
          <filter id="glow-v2">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="otbGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Title */}
        <text x={width / 2} y={30} textAnchor="middle" className="text-lg font-bold fill-gray-800 dark:fill-white">
          OTB Diagram - {node.code}
        </text>

        {/* OLT Input Section — supports multiple OLTs */}
        {(() => {
          // Determine OLT sources: from feeder cable assignments or single upstream
          const feederAssignments: any[] = node.metadata?.feederCableAssignments ?? [];
          const outputSegs: any[] = node.metadata?.outputSegments ?? [];
          const cableCoreCount = totalCores || ((incomingCable as any)?.tubeCount ?? 0) * ((incomingCable as any)?.coresPerTube ?? 0);
          const jcCount = outputSegs.length;

          return (
            <>
              {/* OLT Box */}
              <g transform="translate(40, 55)">
                <rect width={140} height={80} rx="8" className="fill-purple-100 dark:fill-purple-900/30 stroke-purple-500" strokeWidth="2" />
                <text x={70} y={22} textAnchor="middle" className="text-sm font-semibold fill-purple-700 dark:fill-purple-300">
                  OLT
                </text>
                <text x={70} y={40} textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">
                  {node.upstreamNode?.code || 'Multi-OLT'}
                </text>
                <text x={70} y={56} textAnchor="middle" className="text-[10px] fill-gray-500 dark:fill-gray-400">
                  Patchcord (1 core)
                </text>
                <text x={70} y={70} textAnchor="middle" className="text-[10px] fill-gray-500 dark:fill-gray-400">
                  per port → kabel feeder
                </text>
              </g>

              {/* Feeder Cable Line */}
              <line x1={180} y1={95} x2={290} y2={95} className="stroke-green-500" strokeWidth="4" />
              <text x={235} y={84} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">
                {incomingCable?.code || '-'}
              </text>
              <text x={235} y={112} textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">
                {cableCoreCount ? `${cableCoreCount} cores` : ''}
              </text>

              {/* OTB Box — patch-through (no splitter) */}
              <g transform={`translate(290, 50)`}>
                <rect width={210} height={100} rx="8" fill="url(#otbGradient)" className="stroke-blue-500" strokeWidth="2.5" />
                <text x={105} y={25} textAnchor="middle" className="text-base font-bold fill-blue-700 dark:fill-blue-300">
                  OTB
                </text>
                <text x={105} y={45} textAnchor="middle" className="text-sm fill-blue-600 dark:fill-blue-400">
                  {node.code}
                </text>
                <text x={105} y={65} textAnchor="middle" className="text-[10px] fill-gray-500 dark:fill-gray-400">
                  Patch-through (Lurus)
                </text>
                <text x={105} y={80} textAnchor="middle" className="text-[10px] fill-gray-400 dark:fill-gray-500">
                  {node.spliceTrayCount || 1} tray · {tubes.length} tubes · {cableCoreCount} cores
                </text>
              </g>

              {/* Output lines to JCs */}
              {jcCount > 0 && (
                <g transform={`translate(500, 50)`}>
                  {outputSegs.slice(0, 6).map((seg: any, i: number) => {
                    const yOff = i * 22;
                    return (
                      <g key={seg.id || i}>
                        <line x1={0} y1={50} x2={40} y2={20 + yOff} stroke="#f59e0b" strokeWidth="2" />
                        <text x={45} y={24 + yOff} className="text-[10px] fill-amber-600 dark:fill-amber-400">
                          T{seg.fromPort} → {seg.toDevice?.name || seg.toDevice?.code || 'JC'}
                        </text>
                      </g>
                    );
                  })}
                  {jcCount > 6 && (
                    <text x={45} y={24 + 6 * 22} className="text-[10px] fill-gray-400">+{jcCount - 6} more...</text>
                  )}
                </g>
              )}
            </>
          );
        })()}

        {/* Output Ports Section */}
        <g transform={`translate(${width / 2 - 200}, 200)`}>
          <text x={200} y={-10} textAnchor="middle" className="text-sm font-semibold fill-gray-700 dark:fill-gray-300">
            Output Ports ({outputPorts.filter(p => p.status === 'ASSIGNED').length}/{outputPorts.length} used)
          </text>
          
          {/* Port Grid */}
          {outputPorts.slice(0, 24).map((port, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            const x = col * 50;
            const y = row * 60;
            const isAssigned = port.status === 'ASSIGNED';
            const isHighlighted = highlightPath.includes(port.id);
            
            return (
              <g key={port.id} transform={`translate(${x}, ${y})`}>
                {/* Connection line from OTB */}
                <line
                  x1={200}
                  y1={-40}
                  x2={20}
                  y2={0}
                  className={isAssigned ? 'stroke-green-500' : 'stroke-gray-300 dark:stroke-gray-600'}
                  strokeWidth={isAssigned ? 2 : 1}
                  strokeDasharray={isAssigned ? '0' : '4,4'}
                  opacity={0.5}
                />
                
                {/* Port circle */}
                <circle
                  cx={20}
                  cy={20}
                  r={14}
                  fill={getPortColor(port)}
                  stroke={isHighlighted ? '#fbbf24' : hoveredPort?.id === port.id ? '#fff' : '#374151'}
                  strokeWidth={isHighlighted ? 3 : hoveredPort?.id === port.id ? 2.5 : 1.5}
                  className={cn(interactive && 'cursor-pointer')}
                  filter={isHighlighted ? 'url(#glow-v2)' : undefined}
                  onClick={() => handlePortClick(port)}
                  onMouseEnter={() => {
                    setHoveredPort(port);
                    onPortHover?.(port);
                  }}
                  onMouseLeave={() => {
                    setHoveredPort(null);
                    onPortHover?.(null);
                  }}
                />
                
                {/* Port number */}
                {showLabels && (
                  <text x={20} y={45} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 pointer-events-none">
                    P{port.number - node.inputPorts}
                  </text>
                )}
                
                {/* Assigned label */}
                {isAssigned && port.metadata?.downstreamNode && (
                  <text x={20} y={58} textAnchor="middle" className="text-xs fill-cyan-600 dark:fill-cyan-400 font-medium pointer-events-none">
                    {port.metadata.downstreamNode}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Legend */}
        <g transform={`translate(40, ${height - 80})`}>
          <text x={0} y={0} className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Legend:</text>
          {Object.entries(PORT_STATUS_LABELS).map(([status, label], index) => {
            const x = (index % 3) * 150;
            const y = Math.floor(index / 3) * 20 + 20;
            return (
              <g key={status} transform={`translate(${x}, ${y})`}>
                <circle cx={6} cy={-3} r={6} fill={getPortColor({ status: status as any } as Port)} />
                <text x={18} y={0} className="text-xs fill-gray-600 dark:fill-gray-400">{label}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hovered Port Info Panel */}
      {hoveredPort && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Port {hoveredPort.number - node.inputPorts}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Status:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{PORT_STATUS_LABELS[hoveredPort.status]}</span>
            </div>
            {hoveredPort.tubeNumber && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Tube/Core:</span>
                <span className="ml-2 text-gray-900 dark:text-white">
                  T{hoveredPort.tubeNumber}-C{hoveredPort.coreNumber}
                </span>
              </div>
            )}
            {hoveredPort.metadata?.downstreamNode && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Connected To:</span>
                <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-medium">
                  {hoveredPort.metadata.downstreamNode}
                </span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Signal:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{hoveredPort.signalStrength} dBm</span>
              </div>
            )}
          </div>
          {hoveredPort.notes && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{hoveredPort.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default OTBDiagramV2;
