'use client';

import React from 'react';
import { DiagramProps, Port, PortStatus, DEFAULT_COLORS, FiberConnection } from './types';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * JointClosureDiagram Component
 * Specialized diagram for Joint Closure (JC) with multiple upstream and downstream connections
 */
export function JointClosureDiagram({
  node,
  width = 700,
  height = 500,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
}: DiagramProps) {
  const [hoveredPort, setHoveredPort] = React.useState<Port | null>(null);
  const [hoveredConnection, setHoveredConnection] = React.useState<FiberConnection | null>(null);
  const { t } = useTranslation();

  const handlePortClick = (port: Port) => {
    if (interactive && onPortClick) {
      onPortClick(port);
    }
  };

  const handlePortMouseEnter = (port: Port) => {
    if (interactive) {
      setHoveredPort(port);
      onPortHover?.(port);
    }
  };

  const handlePortMouseLeave = () => {
    if (interactive) {
      setHoveredPort(null);
      onPortHover?.(null);
    }
  };

  const getPortColor = (port: Port): string => {
    if (selectedPorts.includes(port.id)) {
      return '#8b5cf6';
    }
    return DEFAULT_COLORS[port.status.toLowerCase() as keyof typeof DEFAULT_COLORS] || DEFAULT_COLORS.available;
  };

  // Generate ports from fiberCount if not provided
  let ports = node.ports;
  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    const fiberCount = node.fiberCount || 0;
    if (fiberCount === 0) {
      return (
        <div className="jc-diagram-container border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">{t('network.diagram.noPortData')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('network.diagram.configureFiberCountFirst')}</p>
          </div>
        </div>
      );
    }
    
    // Generate ports based on fiberCount
    ports = Array.from({ length: fiberCount }, (_, i) => ({
      id: `port-${i + 1}`,
      number: i + 1,
      status: 'AVAILABLE' as PortStatus,
    }));
  }

  // Joint Closure typically has 2-4 input ports and multiple output ports
  const inputPorts = node.inputPorts || 2;
  const upstreamPorts = ports.filter((p) => p.number <= inputPorts);
  const downstreamPorts = ports.filter((p) => p.number > inputPorts);
  
  const centerX = width / 2;
  const centerY = height / 2;
  const boxWidth = 120;
  const boxHeight = 80;
  const portRadius = 7;

  // Calculate port positions around the JC box
  const upstreamY = centerY - boxHeight / 2 - 40;
  const downstreamY = centerY + boxHeight / 2 + 40;

  return (
    <div className="jc-diagram-container border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{node.code}</h3>
              <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full font-medium">
                JOINT CLOSURE
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{node.name}</p>
            {node.address && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📍 {node.address}</p>
            )}
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              node.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
              node.status === 'MAINTENANCE' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
              'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
            }`}>
              {node.status}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Type: {node.type}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {upstreamPorts.length} IN / {downstreamPorts.length} OUT
            </p>
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-gray-200 dark:border-gray-600 rounded bg-gradient-to-b from-gray-50 to-white dark:from-gray-700 dark:to-gray-800"
      >
        <defs>
          {/* Gradient for JC box */}
          <linearGradient id="jcGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
          </linearGradient>
          
          {/* Glow effect for active connections */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Upstream connection indicator */}
        {node.upstreamNode && (
          <g>
            <text
              x={centerX}
              y={30}
              fontSize="12"
              textAnchor="middle"
              fill={DEFAULT_COLORS.upstream}
              fontWeight="600"
            >
              ↑ {t('network.common.from')} {node.upstreamNode.type}: {node.upstreamNode.code}
            </text>
          </g>
        )}

        {/* Upstream Ports */}
        {upstreamPorts.map((port, idx) => {
          const x = centerX + (idx - (upstreamPorts.length - 1) / 2) * 50;
          const y = upstreamY;
          return (
            <g key={port.id}>
              {/* Connection line to JC box */}
              <line
                x1={x}
                y1={y + portRadius}
                x2={centerX + (idx - (upstreamPorts.length - 1) / 2) * 30}
                y2={centerY - boxHeight / 2}
                stroke={getPortColor(port)}
                strokeWidth="2"
                opacity="0.7"
                filter={hoveredPort?.id === port.id ? 'url(#glow)' : undefined}
              />
              
              {/* Port circle */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#9ca3af'}
                strokeWidth="2"
                className={interactive ? 'cursor-pointer transition-all' : ''}
                onClick={() => handlePortClick(port)}
                onMouseEnter={() => handlePortMouseEnter(port)}
                onMouseLeave={handlePortMouseLeave}
              />
              
              {showLabels && (
                <text
                  x={x}
                  y={y - 15}
                  fontSize="10"
                  textAnchor="middle"
                  fill={DEFAULT_COLORS.text}
                  fontWeight="500"
                >
                  IN-{port.number}
                </text>
              )}
            </g>
          );
        })}

        {/* Joint Closure Box */}
        <g>
          <rect
            x={centerX - boxWidth / 2}
            y={centerY - boxHeight / 2}
            width={boxWidth}
            height={boxHeight}
            fill="url(#jcGradient)"
            stroke="#8b5cf6"
            strokeWidth="2.5"
            rx="8"
          />
          
          {/* JC Icon/Label */}
          <text
            x={centerX}
            y={centerY - 10}
            fontSize="14"
            textAnchor="middle"
            fill="#6b21a8"
            fontWeight="700"
          >
            JC
          </text>
          <text
            x={centerX}
            y={centerY + 8}
            fontSize="11"
            textAnchor="middle"
            fill="#7c3aed"
            fontWeight="600"
          >
            {node.code}
          </text>
          <text
            x={centerX}
            y={centerY + 22}
            fontSize="9"
            textAnchor="middle"
            fill="#9333ea"
          >
            {node.connections.length} Connections
          </text>
        </g>

        {/* Downstream Ports */}
        {downstreamPorts.map((port, idx) => {
          const totalPorts = downstreamPorts.length;
          const portsPerRow = Math.min(12, totalPorts);
          const row = Math.floor(idx / portsPerRow);
          const col = idx % portsPerRow;
          
          const x = centerX - ((portsPerRow - 1) * 35) / 2 + col * 35;
          const y = downstreamY + row * 40;
          
          return (
            <g key={port.id}>
              {/* Connection line from JC box */}
              <line
                x1={centerX}
                y1={centerY + boxHeight / 2}
                x2={x}
                y2={y - portRadius}
                stroke={getPortColor(port)}
                strokeWidth="1.5"
                opacity="0.6"
                filter={hoveredPort?.id === port.id ? 'url(#glow)' : undefined}
              />
              
              {/* Port circle */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#9ca3af'}
                strokeWidth="2"
                className={interactive ? 'cursor-pointer transition-all' : ''}
                onClick={() => handlePortClick(port)}
                onMouseEnter={() => handlePortMouseEnter(port)}
                onMouseLeave={handlePortMouseLeave}
              />
              
              {showLabels && (
                <text
                  x={x}
                  y={y + 20}
                  fontSize="9"
                  textAnchor="middle"
                  fill={DEFAULT_COLORS.text}
                >
                  {port.number}
                </text>
              )}
            </g>
          );
        })}

        {/* Downstream targets indicator */}
        <text
          x={centerX}
          y={height - 20}
          fontSize="12"
          textAnchor="middle"
          fill={DEFAULT_COLORS.downstream}
          fontWeight="600"
        >
          ↓ {t('network.common.to')} ODC / ODP {t('network.common.nodes')}
        </text>
      </svg>

      {/* Hover Tooltip */}
      {hoveredPort && (
        <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md border border-purple-200 dark:border-purple-700">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">{t('network.common.port')}:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {hoveredPort.number <= node.inputPorts ? 'IN' : 'OUT'}-{hoveredPort.number}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">{t('network.common.status')}:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{hoveredPort.status}</span>
            </div>
            {hoveredPort.assignedTo && (
              <div className="col-span-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">{t('network.common.connectedTo')}:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{hoveredPort.assignedTo}</span>
              </div>
            )}
            {hoveredPort.notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{hoveredPort.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Details */}
      {node.connections.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{t('network.common.fiberConnections')}</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {node.connections.slice(0, 5).map((conn, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {t('network.common.port')} {conn.from} → {conn.to}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {conn.type} {conn.length ? `(${conn.length}m)` : ''}
                </span>
              </div>
            ))}
            {node.connections.length > 5 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                +{node.connections.length - 5} {t('network.common.moreConnections')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JointClosureDiagram;
