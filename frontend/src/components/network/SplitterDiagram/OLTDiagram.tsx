'use client';

import React from 'react';
import { DiagramProps, Port, DEFAULT_COLORS, PORT_STATUS_LABELS, FIBER_COLORS } from './types';
import { useTranslation } from '@/hooks/useTranslation';

/**
 * OLTDiagram Component  
 * Optical Line Terminal - Central office equipment
 * Contains PON ports connecting to OTBs/JCs/ODCs
 * Typically has multiple PON cards with 8-16 ports each
 */
export function OLTDiagram({
  node,
  width = 800,
  height = 600,
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

  // Get all PON ports
  const ponPorts = node.ports.filter((p) => p.number > node.inputPorts);
  
  // Calculate PON cards layout (assume 16 ports per card)
  const portsPerCard = 16;
  const totalCards = Math.ceil(ponPorts.length / portsPerCard);
  
  // Layout constants
  const padding = 40;
  const centerX = width / 2;
  const headerHeight = 80;
  const cardWidth = 180;
  const cardHeight = 400;
  const cardSpacing = 30;
  const portSpacing = 22;

  return (
    <div className="olt-diagram">
      {/* Info Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.name')}</p>
            <p className="font-semibold text-gray-900 dark:text-white">{node.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.code')}</p>
            <p className="font-mono text-gray-900 dark:text-white">{node.code}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.vendor')}</p>
            <p className="text-gray-900 dark:text-white">{node.metadata?.vendor || 'Huawei'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.model')}</p>
            <p className="text-gray-900 dark:text-white">{node.metadata?.model || 'MA5800-X15'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.ponPorts')}</p>
            <p className="text-gray-900 dark:text-white">{ponPorts.length} ports</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('network.olt.utilization')}</p>
            <p className="text-gray-900 dark:text-white">
              {ponPorts.filter((p) => p.status === 'ASSIGNED').length} / {ponPorts.length} (
              {((ponPorts.filter((p) => p.status === 'ASSIGNED').length / ponPorts.length) * 100).toFixed(1)}
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
            id="arrowhead-olt"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
          </marker>
          <filter id="glow-olt">
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
          y={35}
          textAnchor="middle"
          className="text-xl font-bold fill-white"
        >
          {t('network.olt.diagram')} - {node.code}
        </text>
        
        <text
          x={centerX}
          y={55}
          textAnchor="middle"
          className="text-sm fill-gray-400"
        >
          Central Office - Optical Line Terminal
        </text>

        {/* OLT Chassis */}
        <g>
          <rect
            x={centerX - (totalCards * cardWidth + (totalCards - 1) * cardSpacing) / 2 - 30}
            y={headerHeight - 10}
            width={totalCards * cardWidth + (totalCards - 1) * cardSpacing + 60}
            height={cardHeight + 80}
            rx="12"
            className="fill-gray-800 stroke-purple-500"
            strokeWidth="3"
          />
          
          {/* Chassis Label */}
          <text
            x={centerX}
            y={headerHeight + 20}
            textAnchor="middle"
            className="text-sm font-semibold fill-purple-300"
          >
            OLT Chassis - {totalCards} PON Card{totalCards > 1 ? 's' : ''}
          </text>
        </g>

        {/* PON Cards */}
        {Array.from({ length: totalCards }).map((_, cardIndex) => {
          const cardX = centerX - (totalCards * cardWidth + (totalCards - 1) * cardSpacing) / 2 + cardIndex * (cardWidth + cardSpacing);
          const cardY = headerHeight + 50;
          const cardPorts = ponPorts.slice(cardIndex * portsPerCard, (cardIndex + 1) * portsPerCard);

          return (
            <g key={cardIndex}>
              {/* Card Background */}
              <rect
                x={cardX}
                y={cardY}
                width={cardWidth}
                height={cardHeight}
                rx="8"
                className="fill-gray-700 stroke-gray-600"
                strokeWidth="2"
              />
              
              {/* Card Header */}
              <rect
                x={cardX}
                y={cardY}
                width={cardWidth}
                height={40}
                rx="8"
                className="fill-purple-600"
              />
              <text
                x={cardX + cardWidth / 2}
                y={cardY + 25}
                textAnchor="middle"
                className="text-sm font-bold fill-white"
              >
                PON Card {cardIndex + 1}
              </text>

              {/* PON Ports */}
              {cardPorts.map((port, portIndex) => {
                const portX = cardX + cardWidth / 2 - 60;
                const portY = cardY + 60 + portIndex * portSpacing;
                const isAssigned = port.status === 'ASSIGNED';

                return (
                  <g key={port.id}>
                    {/* Port Rectangle */}
                    <rect
                      x={portX}
                      y={portY - 8}
                      width={120}
                      height={16}
                      rx="4"
                      fill={getPortColor(port)}
                      stroke={hoveredPort?.id === port.id ? '#fff' : '#374151'}
                      strokeWidth={getStrokeWidth(port)}
                      className={interactive ? 'cursor-pointer' : ''}
                      onClick={() => handlePortClick(port)}
                      onMouseEnter={() => handlePortMouseEnter(port)}
                      onMouseLeave={handlePortMouseLeave}
                      filter={hoveredPort?.id === port.id ? 'url(#glow-olt)' : ''}
                    />

                    {/* Port Label */}
                    {showLabels && (
                      <text
                        x={portX + 10}
                        y={portY + 4}
                        className="text-xs fill-white font-mono pointer-events-none"
                      >
                        {cardIndex}/{port.number - node.inputPorts}
                      </text>
                    )}

                    {/* Connection indicator */}
                    {isAssigned && (
                      <>
                        <line
                          x1={portX + 120}
                          y1={portY}
                          x2={portX + 145}
                          y2={portY}
                          className="stroke-green-500"
                          strokeWidth="2"
                          markerEnd="url(#arrowhead-olt)"
                        />
                        {port.metadata?.downstreamNode && (
                          <text
                            x={portX + 155}
                            y={portY + 4}
                            className="text-xs fill-cyan-400 pointer-events-none"
                          >
                            → {port.metadata.downstreamNode}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${padding}, ${height - 80})`}>
          <text x={0} y={0} className="text-xs font-semibold fill-white">
            {t('network.diagram.legend')}:
          </text>
          {Object.entries(PORT_STATUS_LABELS).map(([status, label], index) => {
            const x = (index % 3) * 200;
            const y = Math.floor(index / 3) * 20 + 20;
            return (
              <g key={status} transform={`translate(${x}, ${y})`}>
                <rect
                  x={0}
                  y={-10}
                  width={30}
                  height={12}
                  rx="2"
                  fill={getPortColor({ status: status as any } as Port)}
                />
                <text x={35} y={0} className="text-xs fill-gray-300">
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
            {t('network.olt.ponPort')} {hoveredPort.number - node.inputPorts}
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
                <span className="text-gray-600 dark:text-gray-400">{t('network.olt.connectedTo')}:</span>
                <span className="ml-2 text-cyan-600 dark:text-cyan-400 font-semibold">
                  {hoveredPort.metadata.downstreamNode}
                </span>
              </div>
            )}
            {hoveredPort.signalStrength && (
              <div>
                <span className="text-gray-600 dark:text-gray-400">{t('network.olt.signalStrength')}:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{hoveredPort.signalStrength} dBm</span>
              </div>
            )}
            {hoveredPort.assignedTo && (
              <div>
                <span className="text-gray-600 dark:text-gray-400">{t('network.diagram.assignedTo')}:</span>
                <span className="ml-2 text-gray-900 dark:text-white">{hoveredPort.assignedTo}</span>
              </div>
            )}
          </div>
          {hoveredPort.notes && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 italic">{hoveredPort.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default OLTDiagram;
