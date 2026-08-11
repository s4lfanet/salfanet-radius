'use client';

import React from 'react';
import { 
  DiagramProps, 
  Port, 
  DEFAULT_COLORS, 
  PORT_STATUS_LABELS, 
  TubeVisualization,
  CoreVisualization,
} from './types';
import { FIBER_COLORS, getFiberColor, getFullCoreIdentifier } from '@/lib/network/fiber-core-types';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

type ClosureType = 'INLINE' | 'BRANCHING' | 'DOME' | 'HORIZONTAL';

interface CableBranch {
  id: string;
  cableCode: string;
  cableName?: string;
  direction: 'UPSTREAM' | 'DOWNSTREAM';
  tubeCount: number;
  coresPerTube: number;
  tubes?: TubeVisualization[];
}

interface SpliceConnection {
  id: string;
  fromTube: number;
  fromCore: number;
  fromCable: string;
  toTube: number;
  toCore: number;
  toCable: string;
  spliceType: 'FUSION' | 'MECHANICAL';
  insertionLoss?: number;
  status: 'ACTIVE' | 'DAMAGED' | 'PENDING';
}

interface JointClosureDiagramV2Props extends Omit<DiagramProps, 'node'> {
  node: DiagramProps['node'] & {
    closureType?: ClosureType;
    spliceTrayCount?: number;
    cables?: CableBranch[];
    splices?: SpliceConnection[];
  };
  showSpliceDetail?: boolean;
  selectedCable?: string;
  selectedSplice?: string;
  onCableClick?: (cable: CableBranch) => void;
  onSpliceClick?: (splice: SpliceConnection) => void;
  highlightPath?: string[];
}

/**
 * JointClosureDiagramV2 Component
 * Enhanced Joint Closure visualization with branching cables and splice management
 * Based on VETRO FiberMap-inspired design
 */
export function JointClosureDiagramV2({
  node,
  width = 900,
  height = 700,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
  showSpliceDetail = true,
  selectedCable,
  selectedSplice,
  onCableClick,
  onSpliceClick,
  highlightPath = [],
}: JointClosureDiagramV2Props) {
  const [hoveredCable, setHoveredCable] = React.useState<CableBranch | null>(null);
  const [hoveredSplice, setHoveredSplice] = React.useState<SpliceConnection | null>(null);
  const [expandedTrays, setExpandedTrays] = React.useState<number[]>([1]);
  const { t } = useTranslation();

  const cables = node.cables || [];
  const splices = node.splices || [];
  const upstreamCables = cables.filter(c => c.direction === 'UPSTREAM');
  const downstreamCables = cables.filter(c => c.direction === 'DOWNSTREAM');
  const closureType = node.closureType || 'BRANCHING';

  const getClosureTypeIcon = (type: ClosureType): string => {
    switch (type) {
      case 'INLINE': return '━━━';
      case 'BRANCHING': return '╋';
      case 'DOME': return '⬭';
      case 'HORIZONTAL': return '▬';
      default: return '○';
    }
  };

  const getClosureTypeLabel = (type: ClosureType): string => {
    switch (type) {
      case 'INLINE': return 'Inline Closure';
      case 'BRANCHING': return 'Branching Closure';
      case 'DOME': return 'Dome Closure';
      case 'HORIZONTAL': return 'Horizontal Closure';
      default: return 'Joint Closure';
    }
  };

  const getSpliceStatusColor = (status: string): string => {
    switch (status) {
      case 'ACTIVE': return '#10b981';
      case 'DAMAGED': return '#ef4444';
      case 'PENDING': return '#f59e0b';
      default: return '#6b7280';
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

  // Calculate totals
  const totalSplices = splices.length;
  const activeSplices = splices.filter(s => s.status === 'ACTIVE').length;
  const totalCables = cables.length;
  const totalUpstreamCores = upstreamCables.reduce((sum, c) => sum + c.tubeCount * c.coresPerTube, 0);
  const totalDownstreamCores = downstreamCables.reduce((sum, c) => sum + c.tubeCount * c.coresPerTube, 0);

  return (
    <div className="joint-closure-diagram-v2">
      {/* Info Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{node.code}</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-full">
                {getClosureTypeLabel(closureType)}
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cables</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {upstreamCables.length} ↓ / {downstreamCables.length} ↑
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Upstream Cores</p>
            <p className="font-medium text-gray-900 dark:text-white">{totalUpstreamCores}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Downstream Cores</p>
            <p className="font-medium text-gray-900 dark:text-white">{totalDownstreamCores}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Splices</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {activeSplices} / {totalSplices}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Trays</p>
            <p className="font-medium text-gray-900 dark:text-white">{node.spliceTrayCount || 1}</p>
          </div>
        </div>
      </div>

      {/* Cable Grid with Tubes/Cores */}
      {showSpliceDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Upstream Cables */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="text-blue-500">↓</span> Upstream Cables (Input)
            </h4>
            {upstreamCables.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No upstream cables configured</p>
            ) : (
              <div className="space-y-3">
                {upstreamCables.map((cable) => (
                  <div
                    key={cable.id}
                    className={cn(
                      'p-3 rounded-lg border-2 cursor-pointer transition-all',
                      selectedCable === cable.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                    onClick={() => onCableClick?.(cable)}
                    onMouseEnter={() => setHoveredCable(cable)}
                    onMouseLeave={() => setHoveredCable(null)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {cable.cableCode}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {cable.tubeCount}T × {cable.coresPerTube}C = {cable.tubeCount * cable.coresPerTube} cores
                      </span>
                    </div>
                    {cable.tubes && (
                      <div className="flex flex-wrap gap-1">
                        {cable.tubes.map((tube) => (
                          <div
                            key={tube.id}
                            className="w-4 h-4 rounded-sm border border-gray-300"
                            style={{ backgroundColor: tube.colorHex }}
                            title={`Tube ${tube.tubeNumber}: ${tube.colorCode}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Downstream Cables */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="text-green-500">↑</span> Downstream Cables (Output)
            </h4>
            {downstreamCables.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No downstream cables configured</p>
            ) : (
              <div className="space-y-3">
                {downstreamCables.map((cable) => (
                  <div
                    key={cable.id}
                    className={cn(
                      'p-3 rounded-lg border-2 cursor-pointer transition-all',
                      selectedCable === cable.id
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                    onClick={() => onCableClick?.(cable)}
                    onMouseEnter={() => setHoveredCable(cable)}
                    onMouseLeave={() => setHoveredCable(null)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {cable.cableCode}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {cable.tubeCount}T × {cable.coresPerTube}C = {cable.tubeCount * cable.coresPerTube} cores
                      </span>
                    </div>
                    {cable.tubes && (
                      <div className="flex flex-wrap gap-1">
                        {cable.tubes.map((tube) => (
                          <div
                            key={tube.id}
                            className="w-4 h-4 rounded-sm border border-gray-300"
                            style={{ backgroundColor: tube.colorHex }}
                            title={`Tube ${tube.tubeNumber}: ${tube.colorCode}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Splice Tray Visualization */}
      {showSpliceDetail && splices.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Splice Connections ({activeSplices} active)
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">From</th>
                  <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">To</th>
                  <th className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">Type</th>
                  <th className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">Loss (dB)</th>
                  <th className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {splices.slice(0, 20).map((splice) => (
                  <tr
                    key={splice.id}
                    className={cn(
                      'border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800',
                      selectedSplice === splice.id && 'bg-purple-50 dark:bg-purple-900/20',
                      highlightPath.includes(splice.id) && 'bg-yellow-50 dark:bg-yellow-900/20'
                    )}
                    onClick={() => onSpliceClick?.(splice)}
                    onMouseEnter={() => setHoveredSplice(splice)}
                    onMouseLeave={() => setHoveredSplice(null)}
                  >
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-blue-600 dark:text-blue-400">
                        {splice.fromCable} T{splice.fromTube}-C{splice.fromCore}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-green-600 dark:text-green-400">
                        {splice.toCable} T{splice.toTube}-C{splice.toCore}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs',
                        splice.spliceType === 'FUSION'
                          ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      )}>
                        {splice.spliceType}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-700 dark:text-gray-300">
                      {splice.insertionLoss?.toFixed(2) || '0.05'}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: getSpliceStatusColor(splice.status) }}
                        title={splice.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {splices.length > 20 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Showing 20 of {splices.length} splices
              </p>
            )}
          </div>
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
          <marker id="arrowhead-jc" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
          </marker>
          <filter id="glow-jc">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="jcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Title */}
        <text x={width / 2} y={30} textAnchor="middle" className="text-lg font-bold fill-gray-800 dark:fill-white">
          Joint Closure - {node.code}
        </text>
        <text x={width / 2} y={50} textAnchor="middle" className="text-sm fill-gray-500 dark:fill-gray-400">
          {getClosureTypeLabel(closureType)}
        </text>

        {/* Upstream Cables (Left Side) */}
        <g transform="translate(40, 100)">
          <text x={0} y={-10} className="text-sm font-semibold fill-blue-600 dark:fill-blue-400">
            Upstream (Input)
          </text>
          {upstreamCables.map((cable, index) => {
            const y = index * 80;
            const isHighlighted = selectedCable === cable.id;
            return (
              <g key={cable.id} transform={`translate(0, ${y})`}>
                <rect
                  width={150}
                  height={60}
                  rx="6"
                  className={cn(
                    'transition-all cursor-pointer',
                    isHighlighted
                      ? 'fill-blue-100 dark:fill-blue-900/30 stroke-blue-500'
                      : 'fill-blue-50 dark:fill-blue-900/20 stroke-blue-300 dark:stroke-blue-700'
                  )}
                  strokeWidth={isHighlighted ? 2 : 1}
                  onClick={() => onCableClick?.(cable)}
                />
                <text x={75} y={20} textAnchor="middle" className="text-sm font-medium fill-blue-700 dark:fill-blue-300">
                  {cable.cableCode}
                </text>
                <text x={75} y={38} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">
                  {cable.tubeCount}T × {cable.coresPerTube}C
                </text>
                <text x={75} y={52} textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">
                  {cable.tubeCount * cable.coresPerTube} cores
                </text>
                
                {/* Cable line to closure */}
                <line
                  x1={150}
                  y1={30}
                  x2={width / 2 - 150}
                  y2={height / 2 - 50 + (index - upstreamCables.length / 2) * 20}
                  className="stroke-blue-400"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>

        {/* Downstream Cables (Right Side) */}
        <g transform={`translate(${width - 190}, 100)`}>
          <text x={150} y={-10} textAnchor="end" className="text-sm font-semibold fill-green-600 dark:fill-green-400">
            Downstream (Output)
          </text>
          {downstreamCables.map((cable, index) => {
            const y = index * 80;
            const isHighlighted = selectedCable === cable.id;
            return (
              <g key={cable.id} transform={`translate(0, ${y})`}>
                <rect
                  width={150}
                  height={60}
                  rx="6"
                  className={cn(
                    'transition-all cursor-pointer',
                    isHighlighted
                      ? 'fill-green-100 dark:fill-green-900/30 stroke-green-500'
                      : 'fill-green-50 dark:fill-green-900/20 stroke-green-300 dark:stroke-green-700'
                  )}
                  strokeWidth={isHighlighted ? 2 : 1}
                  onClick={() => onCableClick?.(cable)}
                />
                <text x={75} y={20} textAnchor="middle" className="text-sm font-medium fill-green-700 dark:fill-green-300">
                  {cable.cableCode}
                </text>
                <text x={75} y={38} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">
                  {cable.tubeCount}T × {cable.coresPerTube}C
                </text>
                <text x={75} y={52} textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">
                  {cable.tubeCount * cable.coresPerTube} cores
                </text>
                
                {/* Cable line from closure */}
                <line
                  x1={0}
                  y1={30}
                  x2={-(width / 2 - 340)}
                  y2={height / 2 - 50 - 100 + (index - downstreamCables.length / 2) * 20}
                  className="stroke-green-400"
                  strokeWidth={3}
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead-jc)"
                />
              </g>
            );
          })}
        </g>

        {/* Joint Closure Box (Center) */}
        <g transform={`translate(${width / 2 - 100}, ${height / 2 - 100})`}>
          <rect
            width={200}
            height={200}
            rx="12"
            fill="url(#jcGradient)"
            className="stroke-orange-500"
            strokeWidth="3"
          />
          
          {/* Closure Icon */}
          <text x={100} y={60} textAnchor="middle" className="text-4xl fill-orange-600 dark:fill-orange-400">
            {getClosureTypeIcon(closureType)}
          </text>
          
          <text x={100} y={100} textAnchor="middle" className="text-base font-bold fill-orange-700 dark:fill-orange-300">
            {node.code}
          </text>
          
          <text x={100} y={125} textAnchor="middle" className="text-sm fill-gray-600 dark:fill-gray-400">
            {node.spliceTrayCount || 1} Splice Tray{(node.spliceTrayCount || 1) > 1 ? 's' : ''}
          </text>
          
          <text x={100} y={150} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-500">
            {activeSplices} / {totalSplices} splices active
          </text>
          
          {/* Utilization bar */}
          <g transform="translate(30, 165)">
            <rect width={140} height={8} rx="4" className="fill-gray-200 dark:fill-gray-700" />
            <rect
              width={totalSplices > 0 ? (activeSplices / totalSplices) * 140 : 0}
              height={8}
              rx="4"
              className="fill-green-500"
            />
          </g>
        </g>

        {/* Legend */}
        <g transform={`translate(40, ${height - 50})`}>
          <text x={0} y={0} className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Legend:</text>
          <g transform="translate(60, -5)">
            <rect width={12} height={12} rx="2" className="fill-blue-100 stroke-blue-400" />
            <text x={18} y={10} className="text-xs fill-gray-600 dark:fill-gray-400">Upstream</text>
          </g>
          <g transform="translate(150, -5)">
            <rect width={12} height={12} rx="2" className="fill-green-100 stroke-green-400" />
            <text x={18} y={10} className="text-xs fill-gray-600 dark:fill-gray-400">Downstream</text>
          </g>
          <g transform="translate(260, -5)">
            <circle cx={6} cy={6} r={4} className="fill-green-500" />
            <text x={18} y={10} className="text-xs fill-gray-600 dark:fill-gray-400">Active Splice</text>
          </g>
          <g transform="translate(370, -5)">
            <circle cx={6} cy={6} r={4} className="fill-red-500" />
            <text x={18} y={10} className="text-xs fill-gray-600 dark:fill-gray-400">Damaged</text>
          </g>
        </g>
      </svg>

      {/* Hovered Cable Info */}
      {hoveredCable && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Cable: {hoveredCable.cableCode}
          </h4>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Direction:</span>
              <span className={cn(
                'ml-2 font-medium',
                hoveredCable.direction === 'UPSTREAM' ? 'text-blue-600' : 'text-green-600'
              )}>
                {hoveredCable.direction}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Configuration:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {hoveredCable.tubeCount} tubes × {hoveredCable.coresPerTube} cores
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Total Cores:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {hoveredCable.tubeCount * hoveredCable.coresPerTube}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hovered Splice Info */}
      {hoveredSplice && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Splice Connection
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400">From:</span>
              <span className="ml-2 font-mono text-blue-600">
                {hoveredSplice.fromCable} T{hoveredSplice.fromTube}-C{hoveredSplice.fromCore}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">To:</span>
              <span className="ml-2 font-mono text-green-600">
                {hoveredSplice.toCable} T{hoveredSplice.toTube}-C{hoveredSplice.toCore}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Type:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{hoveredSplice.spliceType}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Insertion Loss:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {hoveredSplice.insertionLoss?.toFixed(3) || '0.05'} dB
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default JointClosureDiagramV2;
