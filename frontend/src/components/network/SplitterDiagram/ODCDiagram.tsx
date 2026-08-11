'use client';

import React from 'react';
import { DiagramProps, Port, DEFAULT_COLORS, PORT_STATUS_LABELS, FIBER_COLORS } from './types';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * ODCDiagram Component  
 * Optical Distribution Cabinet - typically 1:8 or 1:16 splitter
 * Connects to multiple ODPs downstream
 */
export function ODCDiagram({
  node,
  width = 650,
  height = 450,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
}: DiagramProps) {
  const [hoveredPort, setHoveredPort] = React.useState<Port | null>(null);
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
    // Use fiber color coding for assigned ports
    if (port.status === 'ASSIGNED' && port.number > node.inputPorts) {
      const colorIndex = (port.number - node.inputPorts - 1) % FIBER_COLORS.length;
      return FIBER_COLORS[colorIndex];
    }
    return DEFAULT_COLORS[port.status.toLowerCase() as keyof typeof DEFAULT_COLORS] || DEFAULT_COLORS.available;
  };

  // Handle missing ports data from database
  if (!node.ports || !Array.isArray(node.ports) || node.ports.length === 0) {
    return (
      <div className="odc-diagram-container border rounded-lg p-4 bg-white shadow-sm">
        <div className="text-center py-8">
          <p className="text-gray-500">{t('network.diagram.noPortData')}</p>
          <p className="text-xs text-gray-400 mt-2">{t('network.diagram.configurePortsFirst')}</p>
        </div>
      </div>
    );
  }

  const inputPorts = node.ports.filter((p) => p.number <= node.inputPorts);
  const outputPorts = node.ports.filter((p) => p.number > node.inputPorts);
  
  const centerX = width / 2;
  const centerY = height / 2;
  const cabinetWidth = 140;
  const cabinetHeight = 100;
  const portRadius = 8;

  // Calculate output port grid
  const portsPerRow = Math.min(8, outputPorts.length);
  const numRows = Math.ceil(outputPorts.length / portsPerRow);

  return (
    <div className="odc-diagram-container border rounded-lg p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{node.code}</h3>
              <span className="text-xs px-2 py-1 bg-cyan-100 text-cyan-800 rounded-full font-medium">
                ODC
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{node.name}</p>
            {node.address && (
              <p className="text-xs text-gray-500 mt-1">📍 {node.address}</p>
            )}
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              node.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
              node.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {node.status}
            </span>
            <p className="text-xs text-gray-500 mt-1">Ratio: {node.splittingRatio}</p>
            <p className="text-xs text-gray-500">
              {outputPorts.filter(p => p.status === 'ASSIGNED').length} / {outputPorts.length} Used
            </p>
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-gray-200 rounded bg-gradient-to-br from-cyan-50 to-white"
      >
        <defs>
          {/* Gradient for cabinet */}
          <linearGradient id="odcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.25" />
          </linearGradient>

          {/* Shadow filter */}
          <filter id="shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Upstream connection indicator */}
        {node.upstreamNode && (
          <g>
            <line
              x1={centerX}
              y1={20}
              x2={centerX}
              y2={centerY - cabinetHeight / 2 - 50}
              stroke={DEFAULT_COLORS.upstream}
              strokeWidth="2.5"
              strokeDasharray="5 5"
              markerEnd="url(#arrowhead)"
            />
            <text
              x={centerX + 15}
              y={40}
              fontSize="11"
              fill={DEFAULT_COLORS.upstream}
              fontWeight="600"
            >
              FROM {node.upstreamNode.type}: {node.upstreamNode.code}
            </text>
          </g>
        )}

        {/* Input Port */}
        {inputPorts.map((port, idx) => {
          const x = centerX;
          const y = centerY - cabinetHeight / 2 - 40;
          return (
            <g key={port.id}>
              {/* Connection line to cabinet */}
              <line
                x1={x}
                y1={y + portRadius}
                x2={centerX}
                y2={centerY - cabinetHeight / 2}
                stroke={getPortColor(port)}
                strokeWidth="3"
              />
              
              {/* Input port */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#0891b2'}
                strokeWidth="2.5"
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
                  fontWeight="600"
                >
                  INPUT
                </text>
              )}
            </g>
          );
        })}

        {/* ODC Cabinet */}
        <g filter="url(#shadow)">
          <rect
            x={centerX - cabinetWidth / 2}
            y={centerY - cabinetHeight / 2}
            width={cabinetWidth}
            height={cabinetHeight}
            fill="url(#odcGradient)"
            stroke="#0891b2"
            strokeWidth="3"
            rx="6"
          />
          
          {/* Cabinet details */}
          <line
            x1={centerX - cabinetWidth / 2 + 10}
            y1={centerY}
            x2={centerX + cabinetWidth / 2 - 10}
            y2={centerY}
            stroke="#0891b2"
            strokeWidth="1.5"
            opacity="0.5"
          />
          
          {/* Cabinet label */}
          <text
            x={centerX}
            y={centerY - 15}
            fontSize="13"
            textAnchor="middle"
            fill="#0e7490"
            fontWeight="700"
          >
            ODC
          </text>
          <text
            x={centerX}
            y={centerY + 5}
            fontSize="12"
            textAnchor="middle"
            fill="#0891b2"
            fontWeight="600"
          >
            {node.splittingRatio}
          </text>
          <text
            x={centerX}
            y={centerY + 20}
            fontSize="9"
            textAnchor="middle"
            fill="#06b6d4"
          >
            {node.code}
          </text>
        </g>

        {/* Output Ports Grid */}
        {outputPorts.map((port, idx) => {
          const row = Math.floor(idx / portsPerRow);
          const col = idx % portsPerRow;
          
          const spacing = Math.min(45, (width - 80) / portsPerRow);
          const x = centerX - ((portsPerRow - 1) * spacing) / 2 + col * spacing;
          const y = centerY + cabinetHeight / 2 + 50 + row * 60;
          
          return (
            <g key={port.id}>
              {/* Connection line from cabinet */}
              <line
                x1={centerX}
                y1={centerY + cabinetHeight / 2}
                x2={x}
                y2={y - portRadius}
                stroke={getPortColor(port)}
                strokeWidth="2"
                opacity="0.7"
              />
              
              {/* Output port */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#94a3b8'}
                strokeWidth="2"
                className={interactive ? 'cursor-pointer transition-all hover:scale-110' : ''}
                onClick={() => handlePortClick(port)}
                onMouseEnter={() => handlePortMouseEnter(port)}
                onMouseLeave={handlePortMouseLeave}
              />
              
              {showLabels && (
                <>
                  <text
                    x={x}
                    y={y + 20}
                    fontSize="9"
                    textAnchor="middle"
                    fill={DEFAULT_COLORS.text}
                    fontWeight="500"
                  >
                    {port.number}
                  </text>
                  {port.assignedTo && (
                    <text
                      x={x}
                      y={y + 30}
                      fontSize="7"
                      textAnchor="middle"
                      fill="#64748b"
                    >
                      {port.assignedTo.substring(0, 8)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Downstream indicator */}
        <text
          x={centerX}
          y={height - 15}
          fontSize="11"
          textAnchor="middle"
          fill={DEFAULT_COLORS.downstream}
          fontWeight="600"
        >
          ↓ TO ODP / Customer Premises
        </text>

        {/* Legend */}
        <g transform={`translate(10, ${height - 90})`}>
          <rect x="0" y="0" width="140" height="85" fill="white" stroke="#d1d5db" rx="4" opacity="0.95" />
          <text x="8" y="15" fontSize="10" fontWeight="600" fill={DEFAULT_COLORS.text}>
            Port Status
          </text>
          {Object.entries(PORT_STATUS_LABELS).slice(0, 5).map(([status, label], idx) => (
            <g key={status} transform={`translate(8, ${25 + idx * 13})`}>
              <circle
                cx="5"
                cy="0"
                r="4"
                fill={DEFAULT_COLORS[status.toLowerCase() as keyof typeof DEFAULT_COLORS]}
              />
              <text x="14" y="4" fontSize="9" fill={DEFAULT_COLORS.text}>
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Hover Tooltip */}
      {hoveredPort && (
        <div className="mt-3 p-3 bg-cyan-50 rounded-md border border-cyan-200">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">{t('network.common.port')}:</span>
              <span className="ml-2 text-gray-900">
                {hoveredPort.number <= node.inputPorts ? 'INPUT' : `OUT-${hoveredPort.number}`}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('network.common.status')}:</span>
              <span className="ml-2 text-gray-900">
                {PORT_STATUS_LABELS[hoveredPort.status]}
              </span>
            </div>
            {hoveredPort.assignedTo && (
              <div className="col-span-2">
                <span className="font-medium text-gray-700">{t('network.common.assignedTo')}:</span>
                <span className="ml-2 text-gray-900">{hoveredPort.assignedTo}</span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div>
                <span className="font-medium text-gray-700">{t('network.common.signal')}:</span>
                <span className="ml-2 text-gray-900">{hoveredPort.signalStrength} dBm</span>
              </div>
            )}
            {hoveredPort.notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-600 mt-1">{hoveredPort.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Port Utilization */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('network.odc.portUtilization')}</h4>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {Object.entries(
            outputPorts.reduce((acc, port) => {
              acc[port.status] = (acc[port.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).map(([status, count]) => (
            <div key={status} className="p-2 bg-cyan-50 rounded border border-cyan-200">
              <div className="font-semibold text-gray-900">{count}</div>
              <div className="text-gray-600 truncate">
                {PORT_STATUS_LABELS[status as keyof typeof PORT_STATUS_LABELS]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ODCDiagram;
