'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface AffectedNode {
  id: string;
  type: string;
  name: string;
  code: string;
  customersCount?: number;
}

interface ImpactAnalysisPanelProps {
  affectedNodes: AffectedNode[];
  totalCustomers: number;
  estimatedDowntime: number; // in minutes
  estimatedRevenueLoss: number;
  alternatives?: {
    id: string;
    path: string[];
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    distance: number;
    loss: number;
  }[];
  onActivateAlternative?: (alternativeId: string) => void;
}

export function ImpactAnalysisPanel({
  affectedNodes,
  totalCustomers,
  estimatedDowntime,
  estimatedRevenueLoss,
  alternatives = [],
  onActivateAlternative
}: ImpactAnalysisPanelProps) {
  const { t } = useTranslation();

  const downtimeDisplay = estimatedDowntime >= 60
    ? `${(estimatedDowntime / 60).toFixed(1)} ${t('network.tracing.hours')}`
    : `${estimatedDowntime} ${t('network.tracing.minutes')}`;

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'OLT': return 'bg-purple-600';
      case 'JOINT_CLOSURE': return 'bg-purple-500';
      case 'ODC': return 'bg-cyan-600';
      case 'ODP': return 'bg-emerald-600';
      default: return 'bg-gray-600';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300 dark:border-green-800';
      case 'good': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800';
      case 'fair': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800';
      case 'poor': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600';
    }
  };

  const getQualityLabel = (quality: string) => {
    return t(`network.tracing.${quality}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {t('network.tracing.impactAnalysis')}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Analisis dampak jika jalur ini terputus
        </p>
      </div>

      {/* Impact Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400 mb-1">{t('network.tracing.affectedNodes')}</div>
          <div className="text-3xl font-bold text-red-900 dark:text-red-200">{affectedNodes.length}</div>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">Network nodes</div>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">{t('network.tracing.affectedCustomers')}</div>
          <div className="text-3xl font-bold text-orange-900 dark:text-orange-200">{totalCustomers}</div>
          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">{t('network.odp.customer')}</div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="text-sm text-yellow-600 dark:text-yellow-400 mb-1">{t('network.tracing.estimatedDowntime')}</div>
          <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">{downtimeDisplay}</div>
          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Estimated</div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-sm text-red-600 dark:text-red-400 mb-1">{t('network.tracing.revenueImpact')}</div>
          <div className="text-lg font-bold text-red-900 dark:text-red-200">
            {formatCurrency(estimatedRevenueLoss)}
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 mt-1">Per hour</div>
        </div>
      </div>

      {/* Affected Nodes List */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-3">
          {t('network.tracing.affectedNodes')} ({affectedNodes.length})
        </h4>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {affectedNodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${getNodeTypeColor(node.type)}`} />
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-200">{node.code}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{node.name}</div>
                </div>
              </div>
              {node.customersCount !== undefined && node.customersCount > 0 && (
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-200">{node.customersCount}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{t('network.odp.customer')}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Alternative Routes */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-300 mb-3">
          {t('network.tracing.alternativeRoutes')} ({alternatives.length})
        </h4>
        
        {alternatives.length === 0 ? (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-center">
            <svg className="w-12 h-12 text-yellow-400 dark:text-yellow-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              {t('network.tracing.noAlternatives')}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Tidak ada jalur backup yang tersedia
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alternatives.map((alt, index) => (
              <div
                key={alt.id}
                className={`p-4 rounded-lg border-2 ${getQualityColor(alt.quality)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold text-sm">
                      {t('network.tracing.alternativeRoutes')} #{index + 1}
                    </span>
                    <span className="ml-2 px-2 py-0.5 bg-white rounded text-xs font-medium">
                      {getQualityLabel(alt.quality)}
                    </span>
                  </div>
                  <button
                    onClick={() => onActivateAlternative?.(alt.id)}
                    className="px-3 py-1 bg-white border border-current rounded text-xs font-medium hover:bg-opacity-20 transition-colors"
                  >
                    {t('network.tracing.activateRoute')}
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-3 text-xs mt-3">
                  <div>
                    <span className="opacity-75">{t('network.tracing.hops')}:</span>
                    <span className="ml-1 font-semibold">{alt.path.length}</span>
                  </div>
                  <div>
                    <span className="opacity-75">{t('network.tracing.totalDistance')}:</span>
                    <span className="ml-1 font-semibold">{alt.distance}m</span>
                  </div>
                  <div>
                    <span className="opacity-75">Loss:</span>
                    <span className="ml-1 font-semibold">{alt.loss} dBm</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Warning */}
      <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">Critical Path Warning</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              Jalur ini melayani {totalCustomers} pelanggan. Kerusakan dapat menyebabkan downtime signifikan dan kerugian revenue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImpactAnalysisPanel;
