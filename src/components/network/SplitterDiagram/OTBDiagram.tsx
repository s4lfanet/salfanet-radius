'use client';

import React from 'react';
import { DiagramProps, Port, DEFAULT_COLORS, PORT_STATUS_LABELS, FIBER_COLORS } from './types';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * OTBDiagram Component  
 * Optical Terminal Box - Distribution point between OLT and ODC
 * Capacity: 12/24/48/96/144/288/576 ports
 * Feeder: SM-96C from OLT
 * Splitter: 1:8 or 1:16 to ODCs
 */
export function OTBDiagram({
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
    switch (port.status) {
      case 'AVAILABLE':
        return DEFAULT_COLORS.available;
      case 'ASSIGNED':
        return DEFAULT_COLORS.assigned;
      case 'RESERVED':
        return DEFAULT_COLORS.reserved;
      case 'DAMAGED':
        return DEFAULT_COLORS.damaged;
      case 'MAINTENANCE':
        return DEFAULT_COLORS.maintenance;
      default:
        return DEFAULT_COLORS.available;
    }
  };

  const getStrokeWidth = (port: Port): number => {
    if (selectedPorts.includes(port.id)) return 3;
    if (hoveredPort?.id === port.id) return 2.5;
    return 1.5;
  };

  // Get all ports
  const inputPorts = node.ports.filter((p) => p.number <= node.inputPorts);
  const outputPorts = node.ports.filter((p) => p.number > node.inputPorts);

  // Calculate layout
  const padding = 40;
  const centerX = width / 2;
  const headerHeight = 60;
  const footerHeight = 100;

  // Input port (from OLT feeder cable)
  const inputX = padding + 50;
  const inputY = headerHeight + 80;

  // Splitter box position
  const splitterWidth = 120;
  const splitterHeight = 80;
  const splitterX = centerX - splitterWidth / 2;
  const splitterY = inputY + 60;

  // Output ports layout (to ODCs)
  const outputStartY = splitterY + splitterHeight + 60;
  const outputSpacing = 50;
  const portsPerRow = Math.min(12, Math.ceil(outputPorts.length / 4)); // Max 12 ports per row
  const rows = Math.ceil(outputPorts.length / portsPerRow);
  const totalPortsWidth = (portsPerRow - 1) * outputSpacing;
  const outputStartX = centerX - totalPortsWidth / 2;

  return (
    <div className="otb-diagram">
      {/* Info Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.otb.name')}</p>
            <p className="font-semibold text-gray-900 dark:text-white">{node.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.otb.code')}</p>
            <p className="font-mono text-gray-900 dark:text-white">{node.code}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.otb.feederCable')}</p>
            <p className="text-white">{node.metadata?.feederCable || 'SM-96C'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('network.otb.splitterRatio')}</p>
            <p className="text-white">{node.metadata?.splitterRatio || '1:16'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('network.otb.capacity')}</p>
            <p className="text-white">
              {node.inputPorts} {t('network.otb.input')} / {outputPorts.length} {t('network.otb.output')}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('network.otb.utilization')}</p>
            <p className="text-white">
              {outputPorts.filter((p) => p.status === 'ASSIGNED').length} / {outputPorts.length} (
              {((outputPorts.filter((p) => p.status === 'ASSIGNED').length / outputPorts.length) * 100).toFixed(
                1
              )}
              %)
            </p>
          </div>
        </div>
      </div>

      {/* SVG Diagram */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Title */}
        <text
          x={centerX}
          y={30}
          textAnchor="middle"
          className="text-lg font-bold fill-white"
        >
          {t('network.otb.diagram')} - {node.code}
        </text>

        {/* OLT Input Section */}
        <g>
          <rect
            x={padding}
            y={inputY - 20}
            width={120}
            height={60}
            rx="8"
            className="fill-purple-700 stroke-purple-500"
            strokeWidth="2"
          />
          <text
            x={padding + 60}
            y={inputY}
            textAnchor="middle"
            className="text-sm font-semibold fill-white"
          >
            OLT
          </text>
          <text
            x={padding + 60}
            y={inputY + 18}
            textAnchor="middle"
            className="text-xs fill-gray-300"
          >
            Feeder Cable
          </text>

          {/* Feeder cable line to splitter */}
          <line
            x1={padding + 120}
            y1={inputY + 10}
            x2={splitterX}
            y2={splitterY + splitterHeight / 2}
            className="stroke-green-500"
            strokeWidth="3"
            markerEnd="url(#arrowhead)"
          />
          <text
            x={(padding + 120 + splitterX) / 2}
            y={inputY + 30}
            textAnchor="middle"
            className="text-xs fill-gray-400"
          >
            SM-96C (96 cores)
          </text>
        </g>

        {/* Splitter Box */}
        <g>
          <rect
            x={splitterX}
            y={splitterY}
            width={splitterWidth}
            height={splitterHeight}
            rx="8"
            className="fill-blue-700 stroke-blue-500"
            strokeWidth="2"
          />
          <text
            x={splitterX + splitterWidth / 2}
            y={splitterY + 28}
            textAnchor="middle"
            className="text-sm font-semibold fill-white"
          >
            {t('network.otb.splitter')}
          </text>
          <text
            x={splitterX + splitterWidth / 2}
            y={splitterY + 48}
            textAnchor="middle"
            className="text-lg font-bold fill-white"
          >
            {node.metadata?.splitterRatio || '1:16'}
          </text>
          <text
            x={splitterX + splitterWidth / 2}
            y={splitterY + 65}
            textAnchor="middle"
            className="text-xs fill-gray-300"
          >
            {outputPorts.length} {t('network.otb.outputs')}
          </text>
        </g>

        {/* Output Ports to ODCs */}
        <g>
          {outputPorts.map((port, index) => {
            const row = Math.floor(index / portsPerRow);
            const col = index % portsPerRow;
            const portX = outputStartX + col * outputSpacing;
            const portY = outputStartY + row * 60;

            // Connection line from splitter
            const isAssigned = port.status === 'ASSIGNED';

            return (
              <g key={port.id}>
                {/* Connection line */}
                <line
                  x1={splitterX + splitterWidth / 2}
                  y1={splitterY + splitterHeight}
                  x2={portX}
                  y2={portY}
                  className={isAssigned ? 'stroke-green-500' : 'stroke-gray-600'}
                  strokeWidth={isAssigned ? '2' : '1'}
                  strokeDasharray={isAssigned ? '0' : '4,4'}
                  opacity={0.6}
                />

                {/* Output port */}
                <circle
                  cx={portX}
                  cy={portY}
                  r={12}
                  fill={getPortColor(port)}
                  stroke={hoveredPort?.id === port.id ? '#fff' : '#374151'}
                  strokeWidth={getStrokeWidth(port)}
                  className={interactive ? 'cursor-pointer' : ''}
                  onClick={() => handlePortClick(port)}
                  onMouseEnter={() => handlePortMouseEnter(port)}
                  onMouseLeave={handlePortMouseLeave}
                  filter={hoveredPort?.id === port.id ? 'url(#glow)' : ''}
                />

                {/* Port number */}
                {showLabels && (
                  <text
                    x={portX}
                    y={portY + 26}
                    textAnchor="middle"
                    className="text-xs fill-gray-300 pointer-events-none"
                  >
                    {port.number - node.inputPorts}
                  </text>
                )}

                {/* ODC label for assigned ports */}
                {isAssigned && port.metadata?.downstreamNode && (
                  <text
                    x={portX}
                    y={portY + 40}
                    textAnchor="middle"
                    className="text-xs fill-cyan-400 font-semibold pointer-events-none"
                  >
                    {port.metadata.downstreamNode}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Legend */}
        <g transform={`translate(${padding}, ${height - footerHeight + 20})`}>
          <text x={0} y={0} className="text-xs font-semibold fill-white">
            {t('network.diagram.legend')}:
          </text>
          {Object.entries(PORT_STATUS_LABELS).map(([status, label], index) => {
            const x = (index % 3) * 200;
            const y = Math.floor(index / 3) * 20 + 20;
            return (
              <g key={status} transform={`translate(${x}, ${y})`}>
                <circle
                  cx={0}
                  cy={-3}
                  r={6}
                  fill={getPortColor({ status: status as any } as Port)}
                />
                <text x={12} y={0} className="text-xs fill-gray-300">
                  {t(`network.diagram.status.${status.toLowerCase()}`)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hovered Port Info */}
      {hoveredPort && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            {t('network.otb.port')} {hoveredPort.number - node.inputPorts}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-600 dark:text-gray-400">{t('common.status')}:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {t(`network.diagram.status.${hoveredPort.status.toLowerCase()}`)}
              </span>
            </div>
            {hoveredPort.metadata?.downstreamNode && (
              <div>
                <span className="text-gray-600 dark:text-gray-400">{t('network.otb.connectedTo')}:</span>
                <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-semibold">
                  {hoveredPort.metadata.downstreamNode}
                </span>
              </div>
            )}
            {hoveredPort.metadata?.cableType && (
              <div>
                <span className="text-gray-400">{t('network.otb.cableType')}:</span>
                <span className="ml-2 text-white">{hoveredPort.metadata.cableType}</span>
              </div>
            )}
            {hoveredPort.installedAt && (
              <div>
                <span className="text-gray-400">{t('network.diagram.installedAt')}:</span>
                <span className="ml-2 text-white">
                  {new Date(hoveredPort.installedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          {hoveredPort.notes && (
            <p className="mt-2 text-xs text-gray-400 italic">{hoveredPort.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default OTBDiagram;
