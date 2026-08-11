'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface PathNode {
  type: string;
  id: string;
  name: string;
  order: number;
  coordinates: { lat: string; lng: string } | null;
  distance?: number;
}

interface PathSummary {
  totalNodes: number;
  totalDistance: number;
  estimatedLoss: number;
  status: string;
  redundancy: string;
}

interface TraceResultDisplayProps {
  path: PathNode[];
  summary: PathSummary;
  onNodeClick?: (nodeId: string) => void;
}

export function TraceResultDisplay({ path, summary, onNodeClick }: TraceResultDisplayProps) {
  const { t } = useTranslation();

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'OLT': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-800';
      case 'JOINT_CLOSURE': return 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'ODC': return 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 border-cyan-300 dark:border-cyan-800';
      case 'ODP': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600';
    }
  };

  const getNodeTypeLabel = (type: string) => {
    switch (type) {
      case 'OLT': return 'OLT';
      case 'JOINT_CLOSURE': return 'JC';
      case 'ODC': return 'ODC';
      case 'ODP': return 'ODP';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'text-green-600';
      case 'inactive': return 'text-gray-500';
      case 'damaged': return 'text-red-600';
      case 'maintenance': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return t('network.tracing.active');
      case 'inactive': return t('network.tracing.inactive');
      case 'damaged': return t('network.tracing.damaged');
      case 'maintenance': return t('network.tracing.maintenance');
      default: return status;
    }
  };

  const getRedundancyLabel = (redundancy: string) => {
    switch (redundancy.toLowerCase()) {
      case 'none': return t('network.tracing.none');
      case 'available': return t('network.tracing.available');
      default: return redundancy;
    }
  };

  const getQualityInfo = (loss: number) => {
    if (loss > -20) return { color: 'text-green-600', label: t('network.tracing.excellent') };
    if (loss > -25) return { color: 'text-blue-600', label: t('network.tracing.good') };
    if (loss > -30) return { color: 'text-yellow-600', label: t('network.tracing.fair') };
    return { color: 'text-red-600', label: t('network.tracing.poor') };
  };

  const quality = getQualityInfo(summary.estimatedLoss);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('network.tracing.pathFound')}
          </h3>
          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
            ✓ {t('network.tracing.pathDetails')}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">{t('network.tracing.totalNodes')}</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{summary.totalNodes}</div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">{summary.totalNodes - 1} {t('network.tracing.hops')}</div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">{t('network.tracing.totalDistance')}</div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{summary.totalDistance}m</div>
          <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">{(summary.totalDistance / 1000).toFixed(2)} km</div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">{t('network.tracing.estimatedLoss')}</div>
          <div className={`text-2xl font-bold ${quality.color}`}>{summary.estimatedLoss} dBm</div>
          <div className={`text-xs ${quality.color} mt-1`}>{quality.label}</div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400 mb-1">{t('network.tracing.pathStatus')}</div>
          <div className={`text-2xl font-bold ${getStatusColor(summary.status)}`}>
            {getStatusLabel(summary.status)}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
            {getRedundancyLabel(summary.redundancy)}
          </div>
        </div>
      </div>

      {/* Path Visualization */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-3">
          {t('network.tracing.pathDetails')}
        </h4>
        
        <div className="space-y-2">
          {path.map((node, index) => (
            <div key={node.id}>
              {/* Node Card */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  onNodeClick ? 'cursor-pointer hover:shadow-md' : ''
                } ${getNodeTypeColor(node.type)}`}
                onClick={() => onNodeClick?.(node.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full flex items-center justify-center font-bold text-sm">
                    {node.order}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{node.name}</span>
                      <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                        {getNodeTypeLabel(node.type)}
                      </span>
                    </div>
                    {node.coordinates && (
                      <div className="text-xs opacity-75 mt-0.5">
                        📍 {parseFloat(node.coordinates.lat).toFixed(6)}, {parseFloat(node.coordinates.lng).toFixed(6)}
                      </div>
                    )}
                  </div>
                </div>
                
                {node.distance !== undefined && node.distance > 0 && (
                  <div className="text-right">
                    <div className="text-sm font-medium">{node.distance}m</div>
                    <div className="text-xs opacity-75">{t('network.tracing.nodeDistance')}</div>
                  </div>
                )}
              </div>

              {/* Connection Arrow */}
              {index < path.length - 1 && (
                <div className="flex items-center justify-center py-1">
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a1 1 0 01-1-1V6.414l-2.293 2.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 6.414V17a1 1 0 01-1 1z" clipRule="evenodd" transform="rotate(180 10 10)" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('network.tracing.routeQuality')}:</span>
            <span className={`ml-2 font-semibold ${quality.color}`}>{quality.label}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">{t('network.tracing.redundancy')}:</span>
            <span className="ml-2 font-semibold text-gray-900 dark:text-gray-200">
              {getRedundancyLabel(summary.redundancy)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TraceResultDisplay;
