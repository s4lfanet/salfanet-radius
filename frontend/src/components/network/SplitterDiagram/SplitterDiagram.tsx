'use client';

import React from 'react';
import { DiagramProps, Port, DEFAULT_COLORS, PORT_STATUS_LABELS } from './types';

/**
 * Base SplitterDiagram Component
 * Provides common SVG diagram functionality for ODC/ODP/JC visualizations
 */
export function SplitterDiagram({
  node,
  width = 600,
  height = 400,
  interactive = true,
  showLabels = true,
  onPortClick,
  onPortHover,
  selectedPorts = [],
}: DiagramProps) {
  const [hoveredPort, setHoveredPort] = React.useState<Port | null>(null);

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
      return '#8b5cf6'; // violet when selected
    }
    return DEFAULT_COLORS[port.status.toLowerCase() as keyof typeof DEFAULT_COLORS] || DEFAULT_COLORS.available;
  };

  const getPortStroke = (port: Port): string => {
    if (hoveredPort?.id === port.id) {
      return '#1f2937'; // dark stroke on hover
    }
    return '#9ca3af'; // gray-400
  };

  // Calculate positions for input/output ports
  const inputPortY = 60;
  const outputStartY = 140;
  const portSpacing = Math.min(40, (width - 100) / Math.max(node.outputPorts, 8));
  const portRadius = 8;

  return (
    <div className="splitter-diagram-container border rounded-lg p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{node.code}</h3>
            <p className="text-sm text-gray-600">{node.name}</p>
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
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="border border-gray-200 rounded bg-gray-50"
      >
        {/* Background grid pattern */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Upstream connection indicator */}
        {node.upstreamNode && (
          <g>
            <line
              x1={width / 2}
              y1={10}
              x2={width / 2}
              y2={inputPortY - 10}
              stroke={DEFAULT_COLORS.upstream}
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <text
              x={width / 2 + 10}
              y={30}
              fontSize="11"
              fill={DEFAULT_COLORS.text}
              className="font-medium"
            >
              ← From {node.upstreamNode.type}: {node.upstreamNode.code}
            </text>
          </g>
        )}

        {/* Input Port(s) */}
        {node.ports.filter((p) => p.number <= node.inputPorts).map((port, idx) => {
          const x = width / 2 + (idx - (node.inputPorts - 1) / 2) * 40;
          return (
            <g key={port.id}>
              <circle
                cx={x}
                cy={inputPortY}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={getPortStroke(port)}
                strokeWidth="2"
                className={interactive ? 'cursor-pointer transition-all hover:r-10' : ''}
                onClick={() => handlePortClick(port)}
                onMouseEnter={() => handlePortMouseEnter(port)}
                onMouseLeave={handlePortMouseLeave}
              />
              {showLabels && (
                <text
                  x={x}
                  y={inputPortY - 15}
                  fontSize="10"
                  textAnchor="middle"
                  fill={DEFAULT_COLORS.text}
                >
                  IN-{port.number}
                </text>
              )}
            </g>
          );
        })}

        {/* Splitter box */}
        <rect
          x={width / 2 - 40}
          y={inputPortY + 20}
          width="80"
          height="50"
          fill="#f3f4f6"
          stroke="#6b7280"
          strokeWidth="2"
          rx="4"
        />
        <text
          x={width / 2}
          y={inputPortY + 45}
          fontSize="12"
          textAnchor="middle"
          fill={DEFAULT_COLORS.text}
          fontWeight="600"
        >
          {node.splittingRatio}
        </text>
        <text
          x={width / 2}
          y={inputPortY + 60}
          fontSize="10"
          textAnchor="middle"
          fill="#6b7280"
        >
          Splitter
        </text>

        {/* Connection lines from splitter to output ports */}
        {node.ports.filter((p) => p.number > node.inputPorts).map((port, idx) => {
          const x = 50 + idx * portSpacing;
          const y = outputStartY;
          return (
            <line
              key={`line-${port.id}`}
              x1={width / 2}
              y1={inputPortY + 70}
              x2={x}
              y2={y - 10}
              stroke={getPortColor(port)}
              strokeWidth="1.5"
              opacity="0.6"
            />
          );
        })}

        {/* Output Ports */}
        {node.ports.filter((p) => p.number > node.inputPorts).map((port, idx) => {
          const x = 50 + idx * portSpacing;
          const y = outputStartY;
          return (
            <g key={port.id}>
              <circle
                cx={x}
                cy={y}
                r={portRadius}
                fill={getPortColor(port)}
                stroke={getPortStroke(port)}
                strokeWidth="2"
                className={interactive ? 'cursor-pointer transition-all hover:r-10' : ''}
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
                  >
                    {port.number}
                  </text>
                  {port.assignedTo && (
                    <text
                      x={x}
                      y={y + 30}
                      fontSize="8"
                      textAnchor="middle"
                      fill="#6b7280"
                      className="max-w-[40px] truncate"
                    >
                      {port.assignedTo.substring(0, 6)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${width - 150}, ${height - 80})`}>
          <rect x="0" y="0" width="140" height="75" fill="white" stroke="#d1d5db" rx="4" />
          <text x="8" y="15" fontSize="10" fontWeight="600" fill={DEFAULT_COLORS.text}>
            Status Legend
          </text>
          {Object.entries(PORT_STATUS_LABELS).slice(0, 4).map(([status, label], idx) => (
            <g key={status} transform={`translate(8, ${25 + idx * 14})`}>
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

      {/* Tooltip */}
      {hoveredPort && (
        <div className="mt-3 p-3 bg-gray-100 rounded-md border border-gray-300">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="font-medium text-gray-700">Port:</span>
              <span className="ml-2 text-gray-900">{hoveredPort.number}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Status:</span>
              <span className="ml-2 text-gray-900">
                {PORT_STATUS_LABELS[hoveredPort.status]}
              </span>
            </div>
            {hoveredPort.assignedTo && (
              <div className="col-span-2">
                <span className="font-medium text-gray-700">Assigned:</span>
                <span className="ml-2 text-gray-900">{hoveredPort.assignedTo}</span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div className="col-span-2">
                <span className="font-medium text-gray-700">Signal:</span>
                <span className="ml-2 text-gray-900">{hoveredPort.signalStrength} dBm</span>
              </div>
            )}
            {hoveredPort.notes && (
              <div className="col-span-2">
                <span className="font-medium text-gray-700">Notes:</span>
                <p className="mt-1 text-gray-600 text-xs">{hoveredPort.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Port Statistics */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
        {Object.entries(
          node.ports.reduce((acc, port) => {
            acc[port.status] = (acc[port.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).map(([status, count]) => (
          <div key={status} className="p-2 bg-gray-50 rounded border border-gray-200">
            <div className="font-semibold text-gray-900">{count}</div>
            <div className="text-gray-600">{PORT_STATUS_LABELS[status as keyof typeof PORT_STATUS_LABELS]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SplitterDiagram;
