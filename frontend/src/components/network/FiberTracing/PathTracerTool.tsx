'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface NetworkNode {
  id: string;
  type: 'OLT' | 'JOINT_CLOSURE' | 'ODC' | 'ODP';
  name: string;
  code: string;
}

interface PathTracerToolProps {
  nodes: NetworkNode[];
  onTrace: (fromId: string, toId: string) => void;
  isLoading?: boolean;
  onClear?: () => void;
}

export function PathTracerTool({ nodes, onTrace, isLoading = false, onClear }: PathTracerToolProps) {
  const { t } = useTranslation();
  const [sourceId, setSourceId] = React.useState<string>('');
  const [destinationId, setDestinationId] = React.useState<string>('');

  const handleTrace = () => {
    if (sourceId && destinationId && sourceId !== destinationId) {
      onTrace(sourceId, destinationId);
    }
  };

  const handleClear = () => {
    setSourceId('');
    setDestinationId('');
    onClear?.();
  };

  const canTrace = sourceId && destinationId && sourceId !== destinationId && !isLoading;

  // Group nodes by type
  const nodesByType = nodes.reduce((acc, node) => {
    if (!acc[node.type]) acc[node.type] = [];
    acc[node.type].push(node);
    return acc;
  }, {} as Record<string, NetworkNode[]>);

  const getNodeTypeLabel = (type: string) => {
    switch (type) {
      case 'OLT': return 'OLT';
      case 'JOINT_CLOSURE': return t('network.jointClosure.title');
      case 'ODC': return t('network.odc.title');
      case 'ODP': return t('network.odp.title');
      default: return type;
    }
  };

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'OLT': return 'text-purple-700';
      case 'JOINT_CLOSURE': return 'text-purple-600';
      case 'ODC': return 'text-cyan-700';
      case 'ODP': return 'text-emerald-700';
      default: return 'text-gray-700';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('network.tracing.title')}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          {t('network.tracing.description')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Source Node Selector */}
        <div>
          <label htmlFor="source" className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
            {t('network.tracing.sourceNode')}
          </label>
          <select
            id="source"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value="">{t('network.tracing.selectSource')}</option>
            {Object.entries(nodesByType).map(([type, typeNodes]) => (
              <optgroup key={type} label={getNodeTypeLabel(type)}>
                {typeNodes.map((node) => (
                  <option 
                    key={node.id} 
                    value={node.id}
                    disabled={node.id === destinationId}
                  >
                    {node.code} - {node.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {sourceId && (
            <div className="mt-2">
              {nodes.find(n => n.id === sourceId) && (
                <span className={`text-xs font-medium ${getNodeTypeColor(nodes.find(n => n.id === sourceId)!.type)}`}>
                  {getNodeTypeLabel(nodes.find(n => n.id === sourceId)!.type)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Destination Node Selector */}
        <div>
          <label htmlFor="destination" className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
            {t('network.tracing.destinationNode')}
          </label>
          <select
            id="destination"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value="">{t('network.tracing.selectDestination')}</option>
            {Object.entries(nodesByType).map(([type, typeNodes]) => (
              <optgroup key={type} label={getNodeTypeLabel(type)}>
                {typeNodes.map((node) => (
                  <option 
                    key={node.id} 
                    value={node.id}
                    disabled={node.id === sourceId}
                  >
                    {node.code} - {node.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {destinationId && (
            <div className="mt-2">
              {nodes.find(n => n.id === destinationId) && (
                <span className={`text-xs font-medium ${getNodeTypeColor(nodes.find(n => n.id === destinationId)!.type)}`}>
                  {getNodeTypeLabel(nodes.find(n => n.id === destinationId)!.type)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleTrace}
          disabled={!canTrace}
          className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
            canTrace
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('network.tracing.tracing')}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {t('network.tracing.traceButton')}
            </span>
          )}
        </button>
        
        <button
          onClick={handleClear}
          disabled={isLoading || (!sourceId && !destinationId)}
          className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-300 bg-white dark:bg-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('network.tracing.clearButton')}
        </button>
      </div>

      {/* Info Alert */}
      {sourceId === destinationId && sourceId && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ {t('network.common.status')}: {t('network.tracing.sourceNode')} dan {t('network.tracing.destinationNode')} tidak boleh sama
          </p>
        </div>
      )}
    </div>
  );
}

export default PathTracerTool;
