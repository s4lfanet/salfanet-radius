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
import { 
  FIBER_COLORS, 
  getFiberColor, 
  getFullCoreIdentifier,
  getSplitterLoss,
  getFBTUnevenLossBoth,
} from '@/lib/network/fiber-core-types';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

type ODPHierarchyLevel = 'PARENT' | 'SUB_PARENT' | 'CHILD' | 'STANDALONE';
type SplitterType = 'PLC' | 'FBT' | 'NONE';
type FBTRatio = 'EVEN' | '70_30' | '80_20' | '60_40';

interface ODPHierarchyInfo {
  level: ODPHierarchyLevel;
  parentODP?: {
    id: string;
    code: string;
    name: string;
  };
  childODPs?: Array<{
    id: string;
    code: string;
    name: string;
    customerCount: number;
    status: string;
  }>;
  splitterConfig?: {
    type: SplitterType;
    ratio: string;
    fbtRatio?: FBTRatio;
  };
}

interface ODPDiagramV2Props extends Omit<DiagramProps, 'node'> {
  node: DiagramProps['node'] & {
    hierarchyLevel?: ODPHierarchyLevel;
    hierarchy?: ODPHierarchyInfo;
    incomingCore?: {
      id: string;
      tubeNumber: number;
      coreNumber: number;
      colorHex: string;
    };
    customers?: Array<{
      id: string;
      name: string;
      address?: string;
      portNumber: number;
      signalStrength?: number;
      status: string;
    }>;
  };
  showHierarchy?: boolean;
  showCustomerList?: boolean;
  selectedCustomer?: string;
  onCustomerClick?: (customerId: string) => void;
  onChildODPClick?: (odpId: string) => void;
  highlightPath?: string[];
}

/**
 * ODPDiagramV2 Component
 * Enhanced ODP visualization with hierarchy support (Parent/Sub-Parent/Child)
 * Supports PLC and FBT splitter types with visual indication
 */
export function ODPDiagramV2({
  node,
  width = 850,
  height = 650,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
  showHierarchy = true,
  showCustomerList = true,
  selectedCustomer,
  onCustomerClick,
  onChildODPClick,
  highlightPath = [],
}: ODPDiagramV2Props) {
  const [hoveredPort, setHoveredPort] = React.useState<Port | null>(null);
  const [hoveredChild, setHoveredChild] = React.useState<string | null>(null);
  const { t } = useTranslation();

  const hierarchy = node.hierarchy;
  const hierarchyLevel = node.hierarchyLevel || hierarchy?.level || 'STANDALONE';
  const customers = node.customers || [];
  const childODPs = hierarchy?.childODPs || [];
  const splitterConfig = hierarchy?.splitterConfig;

  const getHierarchyColor = (level: ODPHierarchyLevel): string => {
    switch (level) {
      case 'PARENT': return '#8b5cf6'; // Purple
      case 'SUB_PARENT': return '#3b82f6'; // Blue
      case 'CHILD': return '#10b981'; // Green
      case 'STANDALONE': return '#6b7280'; // Gray
      default: return '#6b7280';
    }
  };

  const getHierarchyLabel = (level: ODPHierarchyLevel): string => {
    switch (level) {
      case 'PARENT': return 'Parent ODP';
      case 'SUB_PARENT': return 'Sub-Parent ODP';
      case 'CHILD': return 'Child ODP';
      case 'STANDALONE': return 'Standalone ODP';
      default: return 'ODP';
    }
  };

  const getSplitterLossDisplay = (): string => {
    if (!splitterConfig || splitterConfig.type === 'NONE') return '-';
    
    if (splitterConfig.type === 'PLC') {
      const ratio = splitterConfig.ratio;
      const loss = getSplitterLoss(ratio);
      return `${loss.toFixed(1)} dB (PLC)`;
    }
    
    if (splitterConfig.type === 'FBT' && splitterConfig.fbtRatio) {
      const loss = getFBTUnevenLossBoth(splitterConfig.fbtRatio);
      return `${loss.high.toFixed(1)}/${loss.low.toFixed(1)} dB (FBT)`;
    }
    
    return '-';
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

  const handlePortClick = (port: Port) => {
    if (interactive && onPortClick) {
      onPortClick(port);
    }
  };

  const inputPorts = node.ports.filter((p) => p.number <= node.inputPorts);
  const outputPorts = node.ports.filter((p) => p.number > node.inputPorts);
  
  // Statistics
  const assignedPorts = outputPorts.filter(p => p.status === 'ASSIGNED').length;
  const availablePorts = outputPorts.filter(p => p.status === 'AVAILABLE').length;
  const utilizationPercent = Math.round((assignedPorts / outputPorts.length) * 100);

  return (
    <div className="odp-diagram-v2">
      {/* Info Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{node.code}</h3>
              <span 
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{ 
                  backgroundColor: `${getHierarchyColor(hierarchyLevel)}20`,
                  color: getHierarchyColor(hierarchyLevel)
                }}
              >
                {getHierarchyLabel(hierarchyLevel)}
              </span>
              {splitterConfig && splitterConfig.type !== 'NONE' && (
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  splitterConfig.type === 'PLC' 
                    ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                )}>
                  {splitterConfig.type} {splitterConfig.ratio}
                </span>
              )}
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
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('network.odp.splitterRatio')}</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {splitterConfig?.ratio || node.splittingRatio}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Splitter Loss</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {getSplitterLossDisplay()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('network.odp.portsUsed')}</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {assignedPorts} / {outputPorts.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('network.odp.utilization')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    'h-full rounded-full transition-all',
                    utilizationPercent >= 90 ? 'bg-red-500' :
                    utilizationPercent >= 70 ? 'bg-amber-500' : 'bg-green-500'
                  )}
                  style={{ width: `${utilizationPercent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {utilizationPercent}%
              </span>
            </div>
          </div>
          {node.incomingCore && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Incoming Core</p>
              <p className="font-medium text-gray-900 dark:text-white">
                <span 
                  className="inline-block w-3 h-3 rounded-sm mr-1"
                  style={{ backgroundColor: node.incomingCore.colorHex }}
                />
                T{node.incomingCore.tubeNumber}-C{node.incomingCore.coreNumber}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Hierarchy View */}
      {showHierarchy && (hierarchyLevel === 'PARENT' || hierarchyLevel === 'SUB_PARENT') && childODPs.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Child ODPs ({childODPs.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {childODPs.map((child) => (
              <div
                key={child.id}
                className={cn(
                  'p-3 rounded-lg border-2 cursor-pointer transition-all',
                  hoveredChild === child.id
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                )}
                onClick={() => onChildODPClick?.(child.id)}
                onMouseEnter={() => setHoveredChild(child.id)}
                onMouseLeave={() => setHoveredChild(null)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                    {child.code}
                  </span>
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    child.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'
                  )} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {child.name}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                  {child.customerCount} customers
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parent ODP Info */}
      {showHierarchy && hierarchy?.parentODP && (
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Parent ODP
          </h4>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${getHierarchyColor('PARENT')}20` }}
            >
              <span style={{ color: getHierarchyColor('PARENT') }}>⬆</span>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {hierarchy.parentODP.code}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {hierarchy.parentODP.name}
              </p>
            </div>
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
          <marker id="arrowhead-odp" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill={getHierarchyColor(hierarchyLevel)} />
          </marker>
          <filter id="glow-odp">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="odpGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={getHierarchyColor(hierarchyLevel)} stopOpacity="0.1" />
            <stop offset="100%" stopColor={getHierarchyColor(hierarchyLevel)} stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Title */}
        <text x={width / 2} y={30} textAnchor="middle" className="text-lg font-bold fill-gray-800 dark:fill-white">
          ODP Diagram - {node.code}
        </text>
        <text x={width / 2} y={50} textAnchor="middle" className="text-sm fill-gray-500 dark:fill-gray-400">
          {getHierarchyLabel(hierarchyLevel)} • {splitterConfig?.type || 'PLC'} {splitterConfig?.ratio || node.splittingRatio}
        </text>

        {/* Upstream Connection */}
        <g transform="translate(40, 80)">
          {hierarchy?.parentODP ? (
            <>
              <rect 
                width={120} 
                height={60} 
                rx="8" 
                fill={`${getHierarchyColor('PARENT')}20`}
                stroke={getHierarchyColor('PARENT')}
                strokeWidth="2"
              />
              <text x={60} y={25} textAnchor="middle" className="text-xs font-semibold" fill={getHierarchyColor('PARENT')}>
                Parent ODP
              </text>
              <text x={60} y={42} textAnchor="middle" className="text-sm font-medium fill-gray-700 dark:fill-gray-300">
                {hierarchy.parentODP.code}
              </text>
            </>
          ) : (
            <>
              <rect 
                width={120} 
                height={60} 
                rx="8" 
                className="fill-purple-100 dark:fill-purple-900/30 stroke-purple-500"
                strokeWidth="2"
              />
              <text x={60} y={25} textAnchor="middle" className="text-xs font-semibold fill-purple-600 dark:fill-purple-400">
                OTB / OLT
              </text>
              <text x={60} y={42} textAnchor="middle" className="text-sm font-medium fill-gray-700 dark:fill-gray-300">
                {node.upstreamNode?.code || 'Upstream'}
              </text>
            </>
          )}
        </g>

        {/* Fiber Connection Line */}
        <line 
          x1={160} 
          y1={110} 
          x2={280} 
          y2={110} 
          stroke={getHierarchyColor(hierarchyLevel)}
          strokeWidth="4"
          markerEnd="url(#arrowhead-odp)"
        />
        {node.incomingCore && (
          <text x={220} y={100} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">
            T{node.incomingCore.tubeNumber}-C{node.incomingCore.coreNumber}
          </text>
        )}

        {/* ODP Box */}
        <g transform="translate(280, 70)">
          <rect 
            width={180} 
            height={100} 
            rx="10" 
            fill="url(#odpGradient)"
            stroke={getHierarchyColor(hierarchyLevel)}
            strokeWidth="3"
          />
          
          {/* Splitter Icon */}
          {splitterConfig?.type === 'PLC' && (
            <g transform="translate(70, 20)">
              <rect width={40} height={20} rx="3" className="fill-cyan-200 dark:fill-cyan-900/50 stroke-cyan-500" />
              <text x={20} y={14} textAnchor="middle" className="text-xs font-bold fill-cyan-700 dark:fill-cyan-300">
                PLC
              </text>
            </g>
          )}
          {splitterConfig?.type === 'FBT' && (
            <g transform="translate(70, 20)">
              <rect width={40} height={20} rx="3" className="fill-amber-200 dark:fill-amber-900/50 stroke-amber-500" />
              <text x={20} y={14} textAnchor="middle" className="text-xs font-bold fill-amber-700 dark:fill-amber-300">
                FBT
              </text>
            </g>
          )}
          
          <text x={90} y={58} textAnchor="middle" className="text-base font-bold" fill={getHierarchyColor(hierarchyLevel)}>
            {node.code}
          </text>
          <text x={90} y={78} textAnchor="middle" className="text-sm fill-gray-600 dark:fill-gray-400">
            {splitterConfig?.ratio || node.splittingRatio}
          </text>
          <text x={90} y={92} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-500">
            {assignedPorts}/{outputPorts.length} ports
          </text>
        </g>

        {/* Output Ports Grid */}
        <g transform={`translate(${width / 2 - 180}, 200)`}>
          <text x={180} y={-10} textAnchor="middle" className="text-sm font-semibold fill-gray-700 dark:fill-gray-300">
            Output Ports ({assignedPorts}/{outputPorts.length} used)
          </text>
          
          {outputPorts.slice(0, 32).map((port, index) => {
            const cols = 8;
            const row = Math.floor(index / cols);
            const col = index % cols;
            const x = col * 45;
            const y = row * 55;
            const isAssigned = port.status === 'ASSIGNED';
            const isHighlighted = highlightPath.includes(port.id);
            const customer = customers.find(c => c.portNumber === port.number - node.inputPorts);
            
            return (
              <g key={port.id} transform={`translate(${x}, ${y})`}>
                {/* Port circle */}
                <circle
                  cx={18}
                  cy={18}
                  r={13}
                  fill={getPortColor(port)}
                  stroke={isHighlighted ? '#fbbf24' : hoveredPort?.id === port.id ? '#fff' : '#374151'}
                  strokeWidth={isHighlighted ? 3 : hoveredPort?.id === port.id ? 2.5 : 1.5}
                  className={cn(interactive && 'cursor-pointer')}
                  filter={isHighlighted ? 'url(#glow-odp)' : undefined}
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
                  <text 
                    x={18} 
                    y={22} 
                    textAnchor="middle" 
                    className="text-xs fill-white font-medium pointer-events-none"
                  >
                    {port.number - node.inputPorts}
                  </text>
                )}
                
                {/* Customer name label */}
                {isAssigned && customer && (
                  <text 
                    x={18} 
                    y={40} 
                    textAnchor="middle" 
                    className="text-xs fill-cyan-600 dark:fill-cyan-400 pointer-events-none"
                    style={{ fontSize: '8px' }}
                  >
                    {customer.name.slice(0, 6)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Child ODP connections (for Parent/Sub-Parent) */}
        {(hierarchyLevel === 'PARENT' || hierarchyLevel === 'SUB_PARENT') && childODPs.length > 0 && (
          <g transform={`translate(${width - 200}, 80)`}>
            <text x={80} y={-5} textAnchor="middle" className="text-sm font-semibold fill-gray-700 dark:fill-gray-300">
              Child ODPs
            </text>
            {childODPs.slice(0, 4).map((child, index) => {
              const y = index * 60;
              return (
                <g key={child.id} transform={`translate(0, ${y})`}>
                  <rect
                    width={160}
                    height={50}
                    rx="6"
                    fill={`${getHierarchyColor('CHILD')}20`}
                    stroke={getHierarchyColor('CHILD')}
                    strokeWidth={hoveredChild === child.id ? 2 : 1}
                    className="cursor-pointer"
                    onClick={() => onChildODPClick?.(child.id)}
                    onMouseEnter={() => setHoveredChild(child.id)}
                    onMouseLeave={() => setHoveredChild(null)}
                  />
                  <text x={80} y={22} textAnchor="middle" className="text-sm font-medium fill-green-700 dark:fill-green-300 pointer-events-none">
                    {child.code}
                  </text>
                  <text x={80} y={38} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 pointer-events-none">
                    {child.customerCount} customers
                  </text>
                  
                  {/* Connection line from ODP */}
                  <line
                    x1={0}
                    y1={25}
                    x2={-100}
                    y2={25 + (index - childODPs.length / 2) * 10}
                    className="stroke-green-400"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* Legend */}
        <g transform={`translate(40, ${height - 70})`}>
          <text x={0} y={0} className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Legend:</text>
          {Object.entries(PORT_STATUS_LABELS).map(([status, label], index) => {
            const x = (index % 3) * 130;
            const y = Math.floor(index / 3) * 20 + 20;
            return (
              <g key={status} transform={`translate(${x}, ${y})`}>
                <circle cx={6} cy={-3} r={6} fill={getPortColor({ status: status as any } as Port)} />
                <text x={18} y={0} className="text-xs fill-gray-600 dark:fill-gray-400">{label}</text>
              </g>
            );
          })}
        </g>

        {/* Splitter Type Legend */}
        <g transform={`translate(${width - 200}, ${height - 50})`}>
          <g transform="translate(0, 0)">
            <rect width={30} height={14} rx="2" className="fill-cyan-200 stroke-cyan-500" />
            <text x={36} y={11} className="text-xs fill-gray-600 dark:fill-gray-400">PLC (Even Split)</text>
          </g>
          <g transform="translate(0, 20)">
            <rect width={30} height={14} rx="2" className="fill-amber-200 stroke-amber-500" />
            <text x={36} y={11} className="text-xs fill-gray-600 dark:fill-gray-400">FBT (Uneven Split)</text>
          </g>
        </g>
      </svg>

      {/* Customer List */}
      {showCustomerList && customers.length > 0 && (
        <div className="mt-4 bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Connected Customers ({customers.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Port</th>
                  <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Customer</th>
                  <th className="px-2 py-1 text-left text-gray-600 dark:text-gray-400">Address</th>
                  <th className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">Signal</th>
                  <th className="px-2 py-1 text-center text-gray-600 dark:text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.slice(0, 16).map((customer) => (
                  <tr
                    key={customer.id}
                    className={cn(
                      'border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800',
                      selectedCustomer === customer.id && 'bg-purple-50 dark:bg-purple-900/20'
                    )}
                    onClick={() => onCustomerClick?.(customer.id)}
                  >
                    <td className="px-2 py-1.5 font-mono">P{customer.portNumber}</td>
                    <td className="px-2 py-1.5 font-medium text-gray-900 dark:text-white">
                      {customer.name}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {customer.address || '-'}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {customer.signalStrength ? (
                        <span className={cn(
                          'font-mono',
                          customer.signalStrength > -20 ? 'text-green-600' :
                          customer.signalStrength > -25 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {customer.signalStrength} dBm
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={cn(
                        'inline-block w-2 h-2 rounded-full',
                        customer.status === 'ACTIVE' ? 'bg-green-500' :
                        customer.status === 'SUSPENDED' ? 'bg-amber-500' : 'bg-gray-400'
                      )} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.length > 16 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Showing 16 of {customers.length} customers
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hovered Port Info */}
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
            {hoveredPort.metadata?.customerName && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Customer:</span>
                <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-medium">
                  {hoveredPort.metadata.customerName}
                </span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Signal:</span>
                <span className={cn(
                  'ml-2 font-mono',
                  hoveredPort.signalStrength > -20 ? 'text-green-600' :
                  hoveredPort.signalStrength > -25 ? 'text-amber-600' : 'text-red-600'
                )}>
                  {hoveredPort.signalStrength} dBm
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ODPDiagramV2;
