'use client';

import { useState, useEffect, useCallback } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  RefreshCcw, Plus, Trash2, Eye, Link2, Cable, X,
  Zap, Activity, AlertTriangle, Settings, Circle
} from 'lucide-react';

// Fiber color coding (TIA-598-D standard)
const FIBER_COLORS: Record<string, string> = {
  Blue: '#0047AB',
  Orange: '#FF8C00',
  Green: '#228B22',
  Brown: '#8B4513',
  Slate: '#708090',
  White: '#F5F5F5',
  Red: '#DC143C',
  Black: '#1A1A1A',
  Yellow: '#FFD700',
  Violet: '#8A2BE2',
  Rose: '#FF007F',
  Aqua: '#00CED1',
};

interface SplicePoint {
  id: string;
  spliceType: 'FUSION' | 'MECHANICAL' | 'PIGTAIL';
  locationDescription?: string;
  insertionLoss?: number;
  splicedAt?: string;
  splicedBy?: string;
  notes?: string;
  isActive: boolean;
  incomingCore?: CoreInfo;
  outgoingCore?: CoreInfo;
  createdAt: string;
}

interface CoreInfo {
  id: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  tube?: {
    tubeNumber: number;
    colorCode: string;
    cable?: {
      code: string;
      name: string;
    };
  };
}

interface FiberCable {
  id: string;
  code: string;
  name: string;
  tubeCount: number;
  totalCores: number;
}

interface FiberCore {
  id: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: string;
  tube?: {
    tubeNumber: number;
    colorCode: string;
  };
}

const SPLICE_TYPES = [
  { value: 'FUSION', label: 'Fusion', icon: Zap, color: 'blue' },
  { value: 'MECHANICAL', label: 'Mechanical', icon: Settings, color: 'orange' },
  { value: 'PIGTAIL', label: 'Pigtail', icon: Link2, color: 'purple' },
] as const;

export default function SplicePointsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [splicePoints, setSplicePoints] = useState<SplicePoint[]>([]);
  const [cables, setCables] = useState<FiberCable[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  // Dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedSplice, setSelectedSplice] = useState<SplicePoint | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    coreAId: '',
    coreBId: '',
    spliceType: 'FUSION' as 'FUSION' | 'MECHANICAL' | 'PIGTAIL',
    locationDescription: '',
    insertionLoss: '',
    splicedBy: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Core selection helpers
  const [selectedCableA, setSelectedCableA] = useState('');
  const [selectedCableB, setSelectedCableB] = useState('');
  const [coresForCableA, setCoresForCableA] = useState<FiberCore[]>([]);
  const [coresForCableB, setCoresForCableB] = useState<FiberCore[]>([]);

  const loadSplicePoints = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.append('spliceType', filterType);

      const res = await fetch(`/api/network/splices?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load splice points');
      }

      setSplicePoints(data.splices || []);
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || t('splicePoint.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  const loadCables = useCallback(async () => {
    try {
      const res = await fetch('/api/network/cables');
      const data = await res.json();
      setCables(data.cables || []);
    } catch (error) {
      console.error('Failed to load cables:', error);
    }
  }, []);

  const loadCoresForCable = async (cableId: string, target: 'A' | 'B') => {
    try {
      const res = await fetch(`/api/network/cores?cableId=${cableId}&status=AVAILABLE`);
      const data = await res.json();

      if (target === 'A') {
        setCoresForCableA(data.cores || []);
      } else {
        setCoresForCableB(data.cores || []);
      }
    } catch (error) {
      console.error('Failed to load cores:', error);
    }
  };

  useEffect(() => {
    loadCables();
    loadSplicePoints();
  }, [loadCables, loadSplicePoints]);

  useEffect(() => {
    if (selectedCableA) loadCoresForCable(selectedCableA, 'A');
    else setCoresForCableA([]);
  }, [selectedCableA]);

  useEffect(() => {
    if (selectedCableB) loadCoresForCable(selectedCableB, 'B');
    else setCoresForCableB([]);
  }, [selectedCableB]);

  const resetForm = () => {
    setFormData({
      coreAId: '',
      coreBId: '',
      spliceType: 'FUSION',
      locationDescription: '',
      insertionLoss: '',
      splicedBy: '',
      notes: '',
    });
    setSelectedCableA('');
    setSelectedCableB('');
    setCoresForCableA([]);
    setCoresForCableB([]);
  };

  const handleCreateSplice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.coreAId || !formData.coreBId) {
      showError(t('splicePoint.bothCoresRequired'));
      return;
    }

    if (formData.coreAId === formData.coreBId) {
      showError(t('splicePoint.sameCoreError'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        incomingCoreId: formData.coreAId,
        outgoingCoreId: formData.coreBId,
        spliceType: formData.spliceType,
        locationDescription: formData.locationDescription || null,
        insertionLoss: formData.insertionLoss ? parseFloat(formData.insertionLoss) : null,
        splicedBy: formData.splicedBy || null,
        notes: formData.notes || null,
      };

      const res = await fetch('/api/network/splices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('splicePoint.createFailed'));
      }

      showSuccess(t('splicePoint.createdSuccess'));
      setIsCreateDialogOpen(false);
      resetForm();
      loadSplicePoints();
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || t('splicePoint.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSplice = async (splice: SplicePoint) => {
    const confirmed = await showConfirm(
      t('splicePoint.deleteTitle'),
      t('splicePoint.deleteConfirm')
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/network/splices/${splice.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('splicePoint.deleteFailed'));
      }
      showSuccess(t('splicePoint.deletedSuccess'));
      loadSplicePoints();
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || t('splicePoint.deleteFailed'));
    }
  };

  const viewDetails = (splice: SplicePoint) => {
    setSelectedSplice(splice);
    setIsDetailDialogOpen(true);
  };

  const filteredSplices = splicePoints.filter(splice => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchLocation = splice.locationDescription?.toLowerCase().includes(search);
      const matchCableA = splice.incomingCore?.tube?.cable?.code?.toLowerCase().includes(search);
      const matchCableB = splice.outgoingCore?.tube?.cable?.code?.toLowerCase().includes(search);
      if (!matchLocation && !matchCableA && !matchCableB) return false;
    }
    return true;
  });

  // Statistics
  const stats = {
    total: splicePoints.length,
    fusion: splicePoints.filter(s => s.spliceType === 'FUSION').length,
    mechanical: splicePoints.filter(s => s.spliceType === 'MECHANICAL').length,
    pigtail: splicePoints.filter(s => s.spliceType === 'PIGTAIL').length,
    avgLoss: splicePoints.filter(s => s.insertionLoss != null).length > 0
      ? (splicePoints.filter(s => s.insertionLoss != null)
          .reduce((sum, s) => sum + (s.insertionLoss || 0), 0) / 
          splicePoints.filter(s => s.insertionLoss != null).length).toFixed(3)
      : '0.000',
  };

  const getSpliceTypeStyle = (type: string) => {
    switch (type) {
      case 'FUSION':
        return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400';
      case 'MECHANICAL':
        return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400';
      case 'PIGTAIL':
        return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getLossQuality = (loss: number | undefined | null) => {
    if (loss == null) return { label: '-', color: 'text-gray-400' };
    if (loss <= 0.05) return { label: 'Excellent', color: 'text-green-600' };
    if (loss <= 0.1) return { label: 'Good', color: 'text-blue-600' };
    if (loss <= 0.2) return { label: 'Fair', color: 'text-yellow-600' };
    return { label: 'Poor', color: 'text-red-600' };
  };

  if (loading && splicePoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            {t('splicePoint.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('splicePoint.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadSplicePoints()}
            disabled={loading}
            className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <button
            onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            {t('splicePoint.createNew')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500">{t('splicePoint.totalSplice')}</span>
          </div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500">Fusion</span>
          </div>
          <p className="text-xl font-bold mt-1 text-blue-600">{stats.fusion}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-gray-500">Mechanical</span>
          </div>
          <p className="text-xl font-bold mt-1 text-orange-600">{stats.mechanical}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500">Pigtail</span>
          </div>
          <p className="text-xl font-bold mt-1 text-purple-600">{stats.pigtail}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500">{t('splicePoint.avgLoss')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-green-600">{stats.avgLoss} dB</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('splicePoint.searchPlaceholder')}
              className="w-full px-3 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            >
              <option value="">{t('splicePoint.allTypes')}</option>
              <option value="FUSION">Fusion</option>
              <option value="MECHANICAL">Mechanical</option>
              <option value="PIGTAIL">Pigtail</option>
            </select>
          </div>

          <span className="text-[10px] text-gray-500">
            {t('splicePoint.showing', { count: filteredSplices.length })}
          </span>
        </div>
      </div>

      {/* Splice Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSplices.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Link2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('splicePoint.noData')}</p>
            <p className="text-xs">{t('splicePoint.noDataHint')}</p>
          </div>
        ) : (
          filteredSplices.map((splice) => {
            const lossQuality = getLossQuality(splice.insertionLoss);
            return (
              <div
                key={splice.id}
                className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Card Header */}
                <div className="p-3 border-b dark:border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${getSpliceTypeStyle(splice.spliceType)}`}>
                      {splice.spliceType}
                    </span>
                    {splice.locationDescription && (
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[150px]">
                        {splice.locationDescription}
                      </span>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full ${
                    splice.isActive 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                  }`}>
                  {splice.isActive ? t('common.active') : t('fiberCable.inactive')}
                  </span>
                </div>

                {/* Connection Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border-b dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Cable className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">{t('splicePoint.connection')}</span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    {/* Incoming Core */}
                    <div className="flex-1 text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-[9px] text-gray-500 mb-1">Incoming</p>
                      {splice.incomingCore ? (
                        <>
                          <p className="text-[10px] font-semibold">{splice.incomingCore.tube?.cable?.code}</p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: splice.incomingCore.colorHex }}
                            />
                            <span className="text-[9px]">
                              T{splice.incomingCore.tube?.tubeNumber}-C{splice.incomingCore.coreNumber}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center">
                      <Link2 className="h-4 w-4 text-gray-400" />
                    </div>

                    {/* Outgoing Core */}
                    <div className="flex-1 text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-[9px] text-gray-500 mb-1">Outgoing</p>
                      {splice.outgoingCore ? (
                        <>
                          <p className="text-[10px] font-semibold">{splice.outgoingCore.tube?.cable?.code}</p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: splice.outgoingCore.colorHex }}
                            />
                            <span className="text-[9px]">
                              T{splice.outgoingCore.tube?.tubeNumber}-C{splice.outgoingCore.coreNumber}
                            </span>
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Loss Info */}
                <div className="px-3 py-2 border-b dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Insertion Loss:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">
                        {splice.insertionLoss != null ? `${splice.insertionLoss.toFixed(3)} dB` : '-'}
                      </span>
                      <span className={`text-[9px] ${lossQuality.color}`}>
                        {lossQuality.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta & Actions */}
                <div className="p-3 flex items-center justify-between">
                  <div className="text-[9px] text-gray-400">
                    {splice.splicedBy && <span>By: {splice.splicedBy}</span>}
                    {splice.splicedAt && (
                      <span className="ml-2">
                        {new Date(splice.splicedAt).toLocaleDateString('id-ID')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => viewDetails(splice)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                      title={t('splicePoint.detailTitle')}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteSplice(splice)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Loss Quality Guide */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
        <h3 className="text-[10px] font-semibold text-gray-500 mb-2">{t('splicePoint.qualityGuide')}</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-[10px] text-gray-500">≤0.05 dB = Excellent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-[10px] text-gray-500">≤0.10 dB = Good</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-[10px] text-gray-500">≤0.20 dB = Fair</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-[10px] text-gray-500">&gt;0.20 dB = Poor</span>
          </div>
        </div>
      </div>

      {/* Create Splice Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-blue-500" />
                  {t('splicePoint.createTitle')}
                </h2>
                <p className="text-[10px] text-gray-500">{t('splicePoint.createSubtitle')}</p>
              </div>
              <button
                onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSplice} className="p-4 space-y-4">
              {/* Splice Type Selection */}
              <div className="space-y-2">
                <label className="block text-[10px] font-medium">{t('splicePoint.spliceType')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {SPLICE_TYPES.map(type => {
                    const isActive = formData.spliceType === type.value;
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, spliceType: type.value }))}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          isActive 
                            ? `border-${type.color}-500 bg-${type.color}-50 dark:bg-${type.color}-900/20`
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <Icon className={`h-5 w-5 mx-auto mb-1 ${isActive ? `text-${type.color}-600` : 'text-gray-400'}`} />
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Core Selection */}
              <div className="grid grid-cols-2 gap-4">
                {/* Incoming Core */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-3">
                  <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Incoming Core
                  </h3>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('splicePoint.cableLabel')}</label>
                    <select
                      value={selectedCableA}
                      onChange={(e) => {
                        setSelectedCableA(e.target.value);
                        setFormData(prev => ({ ...prev, coreAId: '' }));
                      }}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    >
                      <option value="">{t('splicePoint.selectCable')}</option>
                      {cables.map(cable => (
                        <option key={cable.id} value={cable.id}>
                          {cable.code} - {cable.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('splicePoint.coreLabel')}</label>
                    <select
                      value={formData.coreAId}
                      onChange={(e) => setFormData(prev => ({ ...prev, coreAId: e.target.value }))}
                      disabled={!selectedCableA}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800 disabled:opacity-50"
                    >
                      <option value="">{t('splicePoint.selectCore')}</option>
                      {coresForCableA.map(core => (
                        <option key={core.id} value={core.id}>
                          T{core.tube?.tubeNumber}-C{core.coreNumber} ({core.colorCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Outgoing Core */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-3">
                  <h3 className="text-xs font-semibold text-purple-700 dark:text-purple-400">
                    Outgoing Core
                  </h3>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('splicePoint.cableLabel')}</label>
                    <select
                      value={selectedCableB}
                      onChange={(e) => {
                        setSelectedCableB(e.target.value);
                        setFormData(prev => ({ ...prev, coreBId: '' }));
                      }}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    >
                      <option value="">{t('splicePoint.selectCable')}</option>
                      {cables.map(cable => (
                        <option key={cable.id} value={cable.id}>
                          {cable.code} - {cable.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('splicePoint.coreLabel')}</label>
                    <select
                      value={formData.coreBId}
                      onChange={(e) => setFormData(prev => ({ ...prev, coreBId: e.target.value }))}
                      disabled={!selectedCableB}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800 disabled:opacity-50"
                    >
                      <option value="">{t('splicePoint.selectCore')}</option>
                      {coresForCableB.map(core => (
                        <option key={core.id} value={core.id}>
                          T{core.tube?.tubeNumber}-C{core.coreNumber} ({core.colorCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Splice Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('common.location')}</label>
                  <input
                    type="text"
                    value={formData.locationDescription}
                    onChange={(e) => setFormData(prev => ({ ...prev, locationDescription: e.target.value }))}
                    placeholder="Mis: Joint Closure JC-001"
                    className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">
                    Insertion Loss (dB)
                    <span className="ml-1 text-gray-400">*important</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.insertionLoss}
                    onChange={(e) => setFormData(prev => ({ ...prev, insertionLoss: e.target.value }))}
                    placeholder="0.05"
                    className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-medium mb-1">Spliced By</label>
                  <input
                    type="text"
                    value={formData.splicedBy}
                    onChange={(e) => setFormData(prev => ({ ...prev, splicedBy: e.target.value }))}
                    placeholder="Nama teknisi"
                    className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('common.notes')}</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Catatan tambahan..."
                    className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}
                  className="px-4 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.coreAId || !formData.coreBId}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? '...' : t('splicePoint.createBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {isDetailDialogOpen && selectedSplice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-500" />
                {t('splicePoint.detailTitle')}
              </h2>
              <button
                onClick={() => setIsDetailDialogOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Type & Status */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs rounded border ${getSpliceTypeStyle(selectedSplice.spliceType)}`}>
                  {selectedSplice.spliceType}
                </span>
                <span className={`px-2 py-1 text-xs rounded ${
                  selectedSplice.isActive 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30' 
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                }`}>
                  {selectedSplice.isActive ? t('common.active') : t('fiberCable.inactive')}
                </span>
              </div>

              {/* Connection Visual */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-1">Incoming</p>
                    <p className="text-sm font-semibold">{selectedSplice.incomingCore?.tube?.cable?.code || '-'}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: selectedSplice.incomingCore?.colorHex || '#888' }}
                      />
                      <span className="text-xs">
                        T{selectedSplice.incomingCore?.tube?.tubeNumber}-C{selectedSplice.incomingCore?.coreNumber}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400">{selectedSplice.incomingCore?.colorCode}</p>
                  </div>
                  
                  <div className="flex-1 px-4">
                    <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-600 relative">
                      <Link2 className="h-5 w-5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-50 dark:bg-gray-800 text-gray-400" />
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-1">Outgoing</p>
                    <p className="text-sm font-semibold">{selectedSplice.outgoingCore?.tube?.cable?.code || '-'}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: selectedSplice.outgoingCore?.colorHex || '#888' }}
                      />
                      <span className="text-xs">
                        T{selectedSplice.outgoingCore?.tube?.tubeNumber}-C{selectedSplice.outgoingCore?.coreNumber}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400">{selectedSplice.outgoingCore?.colorCode}</p>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                  <span className="text-xs text-gray-500">Insertion Loss</span>
                  <span className={`text-sm font-bold ${getLossQuality(selectedSplice.insertionLoss).color}`}>
                    {selectedSplice.insertionLoss != null ? `${selectedSplice.insertionLoss.toFixed(3)} dB` : '-'}
                    <span className="text-[10px] font-normal ml-1">
                      ({getLossQuality(selectedSplice.insertionLoss).label})
                    </span>
                  </span>
                </div>
                {selectedSplice.locationDescription && (
                  <div className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-xs text-gray-500">{t('common.location')}</span>
                    <span className="text-sm">{selectedSplice.locationDescription}</span>
                  </div>
                )}
                {selectedSplice.splicedBy && (
                  <div className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-xs text-gray-500">Spliced By</span>
                    <span className="text-sm">{selectedSplice.splicedBy}</span>
                  </div>
                )}
                {selectedSplice.splicedAt && (
                  <div className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                    <span className="text-xs text-gray-500">{t('common.date')}</span>
                    <span className="text-sm">
                      {new Date(selectedSplice.splicedAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                )}
                {selectedSplice.notes && (
                  <div className="py-2">
                    <span className="text-xs text-gray-500 block mb-1">{t('common.notes')}</span>
                    <p className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">{selectedSplice.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-3 border-t dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setIsDetailDialogOpen(false)}
                className="px-4 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
