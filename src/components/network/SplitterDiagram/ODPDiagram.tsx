'use client';

import React from 'react';
import { DiagramProps, Port, DEFAULT_COLORS, PORT_STATUS_LABELS, FIBER_COLORS } from './types';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * ODPDiagram Component
 * Optical Distribution Point - typically 1:8 splitter  
 * Final distribution point before customer premises
 */
export function ODPDiagram({
  node,
  width = 600,
  height = 420,
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
    // Use fiber color coding for customer ports
    if (port.number > node.inputPorts) {
      const colorIndex = (port.number - node.inputPorts - 1) % FIBER_COLORS.length;
      return FIBER_COLORS[colorIndex];
    }
    return DEFAULT_COLORS[port.status.toLowerCase() as keyof typeof DEFAULT_COLORS] || DEFAULT_COLORS.available;
  };

  // Handle missing ports data from database
  if (!node.ports || !Array.isArray(node.ports) || node.ports.length === 0) {
    return (
      <div className="odp-diagram-container border rounded-lg p-4 bg-white shadow-sm">
        <div className="text-center py-8">
          <p className="text-gray-500">{t('network.diagram.noPortData')}</p>
          <p className="text-xs text-gray-400 mt-2">{t('network.diagram.configurePortsFirst')}</p>
        </div>
      </div>
    );
  }

  const inputPorts = node.ports.filter((p) => p.number <= node.inputPorts);
  const customerPorts = node.ports.filter((p) => p.number > node.inputPorts);
  
  const centerX = width / 2;
  const boxY = 120;
  const boxWidth = 100;
  const boxHeight = 70;
  const portRadius = 9;

  // Arrange customer ports in a circular pattern
  const radius = 140;
  const startAngle = Math.PI / 2; // Start from bottom
  const angleStep = (Math.PI * 1.5) / (customerPorts.length - 1);

  return (
    <div className="odp-diagram-container border rounded-lg p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{node.code}</h3>
              <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-800 rounded-full font-medium">
                ODP
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
            <p className="text-xs text-gray-500 mt-1">{t('network.common.ratio')}: {node.splittingRatio}</p>
            <p className="text-xs text-gray-500">
              {customerPorts.filter(p => p.status === 'ASSIGNED').length} {t('network.odp.customersActive')}
            </p>
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-gray-200 rounded bg-gradient-to-b from-emerald-50 to-white"
      >
        <defs>
          {/* Gradient for ODP box */}
          <linearGradient id="odpGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.3" />
          </linearGradient>

          {/* Glow effect for active customer ports */}
          <filter id="customerGlow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Upstream connection indicator */}
        {node.upstreamNode && (
          <g>
            <line
              x1={centerX}
              y1={15}
              x2={centerX}
              y2={boxY - 35}
              stroke={DEFAULT_COLORS.upstream}
              strokeWidth="2.5"
              strokeDasharray="4 4"
            />
            <text
              x={centerX + 12}
              y={35}
              fontSize="11"
              fill={DEFAULT_COLORS.upstream}
              fontWeight="600"
            >
              FROM ODC: {node.upstreamNode.code}
            </text>
          </g>
        )}

        {/* Input Port */}
        {inputPorts.map((port) => {
          const x = centerX;
          const y = boxY - 30;
          return (
            <g key={port.id}>
              {/* Connection line to box */}
              <line
                x1={x}
                y1={y + portRadius}
                x2={centerX}
                y2={boxY}
                stroke={getPortColor(port)}
                strokeWidth="3.5"
              />
              
              {/* Input port */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#059669'}
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
                  IN
                </text>
              )}
            </g>
          );
        })}

        {/* ODP Box */}
        <g>
          <rect
            x={centerX - boxWidth / 2}
            y={boxY}
            width={boxWidth}
            height={boxHeight}
            fill="url(#odpGradient)"
            stroke="#059669"
            strokeWidth="3"
            rx="8"
          />
          
          {/* ODP Icon */}
          <text
            x={centerX}
            y={boxY + 28}
            fontSize="14"
            textAnchor="middle"
            fill="#047857"
            fontWeight="700"
          >
            ODP
          </text>
          <text
            x={centerX}
            y={boxY + 45}
            fontSize="11"
            textAnchor="middle"
            fill="#059669"
            fontWeight="600"
          >
            {node.splittingRatio}
          </text>
          <text
            x={centerX}
            y={boxY + 58}
            fontSize="8"
            textAnchor="middle"
            fill="#10b981"
          >
            {node.code}
          </text>
        </g>

        {/* Customer Ports in radial layout */}
        {customerPorts.map((port, idx) => {
          const angle = startAngle + idx * angleStep;
          const x = centerX + Math.cos(angle) * radius;
          const y = boxY + boxHeight / 2 + Math.sin(angle) * radius;
          
          return (
            <g key={port.id}>
              {/* Connection line from ODP to customer */}
              <line
                x1={centerX}
                y1={boxY + boxHeight / 2}
                x2={x}
                y2={y}
                stroke={getPortColor(port)}
                strokeWidth="2.5"
                opacity="0.7"
                filter={port.status === 'ASSIGNED' ? 'url(#customerGlow)' : undefined}
              />
              
              {/* Customer port */}
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={hoveredPort?.id === port.id ? '#1f2937' : '#94a3b8'}
                strokeWidth="2.5"
                className={interactive ? 'cursor-pointer transition-all hover:scale-125' : ''}
                onClick={() => handlePortClick(port)}
                onMouseEnter={() => handlePortMouseEnter(port)}
                onMouseLeave={handlePortMouseLeave}
                filter={port.status === 'ASSIGNED' ? 'url(#customerGlow)' : undefined}
              />
              
              {showLabels && (
                <>
                  {/* Port number */}
                  <text
                    x={x}
                    y={y - portRadius - 8}
                    fontSize="9"
                    textAnchor="middle"
                    fill={DEFAULT_COLORS.text}
                    fontWeight="600"
                  >
                    P{port.number}
                  </text>
                  
                  {/* Customer name (if assigned) */}
                  {port.assignedTo && (
                    <text
                      x={x}
                      y={y + portRadius + 15}
                      fontSize="8"
                      textAnchor="middle"
                      fill="#047857"
                      fontWeight="500"
                    >
                      {port.assignedTo.substring(0, 10)}
                    </text>
                  )}
                  
                  {/* Status icon */}
                  {port.status === 'ASSIGNED' && (
                    <text x={x + portRadius - 2} y={y - portRadius + 4} fontSize="10">
                      ✓
                    </text>
                  )}
                  {port.status === 'DAMAGED' && (
                    <text x={x + portRadius - 2} y={y - portRadius + 4} fontSize="10">
                      ⚠
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Customer homes indicator */}
        <text
          x={centerX}
          y={height - 15}
          fontSize="11"
          textAnchor="middle"
          fill="#059669"
          fontWeight="600"
        >
          ↓ TO CUSTOMER PREMISES
        </text>

        {/* Color legend for fiber colors */}
        <g transform={`translate(10, 10)`}>
          <rect x="0" y="0" width="120" height="65" fill="white" stroke="#d1d5db" rx="4" opacity="0.95" />
          <text x="8" y="15" fontSize="10" fontWeight="600" fill={DEFAULT_COLORS.text}>
            Fiber Colors
          </text>
          {FIBER_COLORS.slice(0, 4).map((color, idx) => (
            <g key={idx} transform={`translate(8, ${25 + idx * 11})`}>
              <circle cx="5" cy="0" r="4" fill={color} stroke="#64748b" strokeWidth="0.5" />
              <text x="14" y="4" fontSize="8" fill={DEFAULT_COLORS.text}>
                Fiber {idx + 1}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Hover Tooltip */}
      {hoveredPort && (
        <div className="mt-3 p-3 bg-emerald-50 rounded-md border border-emerald-200">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">{t('network.common.port')}:</span>
              <span className="ml-2 text-gray-900">
                {hoveredPort.number <= node.inputPorts ? 'INPUT' : `${hoveredPort.number}`}
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
                <span className="font-medium text-gray-700">{t('network.odp.customer')}:</span>
                <span className="ml-2 text-gray-900">{hoveredPort.assignedTo}</span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div>
                <span className="font-medium text-gray-700">{t('network.common.signal')}:</span>
                <span className={`ml-2 font-semibold ${
                  hoveredPort.signalStrength > -25 ? 'text-green-600' :
                  hoveredPort.signalStrength > -30 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {hoveredPort.signalStrength} dBm
                </span>
              </div>
            )}
            {hoveredPort.notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-600 mt-1 italic">{hoveredPort.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Statistics */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('network.odp.customerPortStatus')}</h4>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {Object.entries(
            customerPorts.reduce((acc, port) => {
              acc[port.status] = (acc[port.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).map(([status, count]) => (
            <div key={status} className="p-2 bg-emerald-50 rounded border border-emerald-200">
              <div className="font-semibold text-gray-900">{count}</div>
              <div className="text-gray-600 truncate">
                {PORT_STATUS_LABELS[status as keyof typeof PORT_STATUS_LABELS]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Customers List */}
      {customerPorts.filter(p => p.assignedTo).length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('network.odp.activeCustomers')}</h4>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {customerPorts.filter(p => p.assignedTo).slice(0, 8).map((port) => (
              <div
                key={port.id}
                className="flex items-center justify-between text-xs p-1.5 bg-emerald-50 rounded border border-emerald-100"
              >
                <span className="text-gray-700">{t('network.common.port')} {port.number}</span>
                <span className="text-gray-900 font-medium">{port.assignedTo}</span>
                {port.signalStrength && (
                  <span className={`text-xs ${
                    port.signalStrength > -25 ? 'text-green-600' :
                    port.signalStrength > -30 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {port.signalStrength}dBm
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ODPDiagram;
