'use client';

import { useState, useEffect, useCallback } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  RefreshCcw, Circle, Check, X, AlertTriangle, 
  Bookmark, Cable, Filter, Eye, Tag, Layers, Activity
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

interface FiberCore {
  id: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'DAMAGED';
  assignedToType?: string;
  assignedToId?: string;
  notes?: string;
  tube?: {
    id: string;
    tubeNumber: number;
    colorCode: string;
    cable?: {
      id: string;
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

const STATUSES = ['AVAILABLE', 'ASSIGNED', 'RESERVED', 'DAMAGED'] as const;

export default function FiberCoresPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [cores, setCores] = useState<FiberCore[]>([]);
  const [cables, setCables] = useState<FiberCable[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });

  // Filters
  const [filterCable, setFilterCable] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Selection
  const [selectedCores, setSelectedCores] = useState<Set<string>>(new Set());

  // Dialogs
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'assign' | 'release' | 'reserve' | 'mark_damaged'>('assign');
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Assignment form
  const [assignToType, setAssignToType] = useState('ODP');
  const [assignToId, setAssignToId] = useState('');

  const loadCores = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      if (filterCable) params.append('cableId', filterCable);
      if (filterStatus) params.append('status', filterStatus);

      const res = await fetch(`/api/network/cores?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load cores');
      }
      setCores(data.cores || []);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }));
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || t('fiberCore.noData'));
    } finally {
      setLoading(false);
    }
  }, [filterCable, filterStatus, pagination.page, pagination.limit]);

  const loadCables = useCallback(async () => {
    try {
      const res = await fetch('/api/network/cables');
      const data = await res.json();
      setCables(data.cables || []);
    } catch (error) {
      console.error('Failed to load cables:', error);
    }
  }, []);

  useEffect(() => {
    loadCables();
  }, [loadCables]);

  useEffect(() => {
    loadCores();
  }, [loadCores]);

  const handleSelectAll = () => {
    if (selectedCores.size === filteredCores.length) {
      setSelectedCores(new Set());
    } else {
      setSelectedCores(new Set(filteredCores.map(c => c.id)));
    }
  };

  const handleSelectCore = (coreId: string) => {
    const newSet = new Set(selectedCores);
    if (newSet.has(coreId)) {
      newSet.delete(coreId);
    } else {
      newSet.add(coreId);
    }
    setSelectedCores(newSet);
  };

  const openActionDialog = (action: typeof actionType) => {
    if (selectedCores.size === 0) {
      showError(t('fiberCore.selectAtLeastOne'));
      return;
    }
    setActionType(action);
    setActionReason('');
    setAssignToType('ODP');
    setAssignToId('');
    setIsActionDialogOpen(true);
  };

  const handleBulkAction = async () => {
    if (selectedCores.size === 0) return;

    setSubmitting(true);
    try {
      const coreIds = Array.from(selectedCores);

      let body: Record<string, unknown> = {
        action: actionType,
        coreIds,
      };

      if (actionType === 'assign' && coreIds.length === 1) {
        body = {
          action: 'assign',
          coreId: coreIds[0],
          assignedToType: assignToType,
          assignedToId: assignToId,
          notes: actionReason,
        };
      } else if (actionType !== 'assign') {
        body.reason = actionReason;
      }

      const res = await fetch('/api/network/cores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('common.failed'));
      }

      showSuccess(data.message || t('common.success'));
      setIsActionDialogOpen(false);
      setSelectedCores(new Set());
      loadCores();
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || t('common.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400';
      case 'ASSIGNED':
        return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400';
      case 'RESERVED':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'DAMAGED':
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <Check className="h-3 w-3" />;
      case 'ASSIGNED':
        return <Tag className="h-3 w-3" />;
      case 'RESERVED':
        return <Bookmark className="h-3 w-3" />;
      case 'DAMAGED':
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Circle className="h-3 w-3" />;
    }
  };

  const filteredCores = cores.filter(core => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      core.tube?.cable?.code?.toLowerCase().includes(search) ||
      core.tube?.cable?.name?.toLowerCase().includes(search) ||
      `T${core.tube?.tubeNumber}-C${core.coreNumber}`.toLowerCase().includes(search)
    );
  });

  // Calculate statistics
  const stats = {
    total: cores.length,
    available: cores.filter(c => c.status === 'AVAILABLE').length,
    assigned: cores.filter(c => c.status === 'ASSIGNED').length,
    reserved: cores.filter(c => c.status === 'RESERVED').length,
    damaged: cores.filter(c => c.status === 'DAMAGED').length,
  };

  // Group cores by cable and tube
  const groupedCores = filteredCores.reduce((acc, core) => {
    const cableCode = core.tube?.cable?.code || 'Unknown';
    const tubeNum = core.tube?.tubeNumber || 0;
    const key = `${cableCode}-T${tubeNum}`;
    if (!acc[key]) {
      acc[key] = {
        cableCode,
        cableName: core.tube?.cable?.name || '',
        tubeNumber: tubeNum,
        tubeColor: core.tube?.colorCode || '',
        cores: [],
      };
    }
    acc[key].cores.push(core);
    return acc;
  }, {} as Record<string, { cableCode: string; cableName: string; tubeNumber: number; tubeColor: string; cores: FiberCore[] }>);

  if (loading && cores.length === 0) {
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
            <Circle className="h-5 w-5 text-purple-500" />
            {t('fiberCore.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('fiberCore.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadCores()}
            disabled={loading}
            className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500">{t('fiberCore.totalCores')}</span>
          </div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500">{t('fiberCore.available')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-green-600">{stats.available}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500">{t('fiberCore.used')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-blue-600">{stats.assigned}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-gray-500">Reserved</span>
          </div>
          <p className="text-xl font-bold mt-1 text-yellow-600">{stats.reserved}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-gray-500">{t('fiberCore.damaged')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-red-600">{stats.damaged}</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kabel/core..."
              className="w-full px-3 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            />
          </div>

          {/* Cable Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-gray-400" />
            <select
              value={filterCable}
              onChange={(e) => {
                setFilterCable(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            >
              <option value="">{t('fiberCore.allCables')}</option>
              {cables.map(cable => (
                <option key={cable.id} value={cable.id}>{cable.code} - {cable.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            >
              <option value="">{t('fiberCore.allStatus')}</option>
              <option value="AVAILABLE">{t('fiberCore.available')}</option>
              <option value="ASSIGNED">{t('fiberCore.used')}</option>
              <option value="RESERVED">Reserved</option>
              <option value="DAMAGED">{t('fiberCore.damaged')}</option>
            </select>
          </div>

          <span className="text-[10px] text-gray-500">
            Menampilkan {filteredCores.length} core
          </span>
        </div>

        {/* Bulk Actions */}
        {selectedCores.size > 0 && (
          <div className="mt-3 pt-3 border-t dark:border-gray-700 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-500">
              {selectedCores.size} {t('common.selected').toLowerCase()}:
            </span>
            <button
              onClick={() => openActionDialog('assign')}
              disabled={selectedCores.size !== 1}
              className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              Assign
            </button>
            <button
              onClick={() => openActionDialog('release')}
              className="px-2 py-1 text-[10px] bg-gray-600 hover:bg-gray-700 text-white rounded"
            >
              Release
            </button>
            <button
              onClick={() => openActionDialog('reserve')}
              className="px-2 py-1 text-[10px] bg-yellow-600 hover:bg-yellow-700 text-white rounded"
            >
              Reserve
            </button>
            <button
              onClick={() => openActionDialog('mark_damaged')}
              className="px-2 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded"
            >
              {t('fiberCore.markDamaged')}
            </button>
            <button
              onClick={() => setSelectedCores(new Set())}
              className="px-2 py-1 text-[10px] border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>

      {/* Core Cards - Grouped by Cable/Tube */}
      <div className="space-y-4">
        {Object.keys(groupedCores).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Circle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('fiberCore.noData')}</p>
            <p className="text-xs">{t('fiberCore.noDataHint')}</p>
          </div>
        ) : (
          Object.entries(groupedCores).map(([key, group]) => (
            <div key={key} className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 overflow-hidden">
              {/* Group Header */}
              <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border-b dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Cable className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-semibold">{group.cableCode}</span>
                  </div>
                  <span className="text-xs text-gray-500">{group.cableName}</span>
                  <div className="flex items-center gap-2 ml-4">
                    <div 
                      className="w-3 h-3 rounded-full border"
                      style={{ backgroundColor: FIBER_COLORS[group.tubeColor] || '#888' }}
                    />
                    <span className="text-xs font-medium">Tube {group.tubeNumber}</span>
                    <span className="text-[10px] text-gray-500">({group.tubeColor})</span>
                  </div>
                </div>
                <span className="text-[10px] text-gray-500">{group.cores.length} cores</span>
              </div>

              {/* Cores Grid */}
              <div className="p-4">
                <div className="flex items-center gap-1 mb-2">
                  <button
                    onClick={() => {
                      const allSelected = group.cores.every(c => selectedCores.has(c.id));
                      const newSet = new Set(selectedCores);
                      group.cores.forEach(c => {
                        if (allSelected) newSet.delete(c.id);
                        else newSet.add(c.id);
                      });
                      setSelectedCores(newSet);
                    }}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    {group.cores.every(c => selectedCores.has(c.id)) ? t('fiberCore.deselectGroup') : t('fiberCore.selectGroup')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.cores.map(core => (
                    <button
                      key={core.id}
                      onClick={() => handleSelectCore(core.id)}
                      className={`relative px-2 py-1.5 rounded border flex items-center gap-1.5 transition-all ${
                        selectedCores.has(core.id)
                          ? 'ring-2 ring-blue-500 ring-offset-1'
                          : ''
                      } ${getStatusStyle(core.status)}`}
                    >
                      <div 
                        className="w-2.5 h-2.5 rounded-full border"
                        style={{ backgroundColor: core.colorHex }}
                      />
                      <span className="text-[10px] font-medium">C{core.coreNumber}</span>
                      {getStatusIcon(core.status)}
                      {selectedCores.has(core.id) && (
                        <Check className="h-3 w-3 text-blue-600 absolute -top-1 -right-1 bg-white rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
            className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.prev')}
          </button>
          <span className="text-xs text-gray-500">
            Halaman {pagination.page} dari {pagination.totalPages}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page === pagination.totalPages}
            className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
        <h3 className="text-[10px] font-semibold text-gray-500 mb-2">{t('fiberCore.statusLegend')}</h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded text-[9px] bg-green-100 text-green-700 border border-green-300 flex items-center gap-1">
              <Check className="h-2.5 w-2.5" /> AVAILABLE
            </div>
            <span className="text-[10px] text-gray-500">{t('fiberCore.readyToUse')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded text-[9px] bg-blue-100 text-blue-700 border border-blue-300 flex items-center gap-1">
              <Tag className="h-2.5 w-2.5" /> ASSIGNED
            </div>
            <span className="text-[10px] text-gray-500">{t('fiberCore.alreadyAssigned')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded text-[9px] bg-yellow-100 text-yellow-700 border border-yellow-300 flex items-center gap-1">
              <Bookmark className="h-2.5 w-2.5" /> RESERVED
            </div>
            <span className="text-[10px] text-gray-500">{t('fiberCore.reservedCore')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded text-[9px] bg-red-100 text-red-700 border border-red-300 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> DAMAGED
            </div>
            <span className="text-[10px] text-gray-500">{t('fiberCore.damagedCore')}</span>
          </div>
        </div>
      </div>

      {/* Action Dialog */}
      {isActionDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                {actionType === 'assign' && <Tag className="h-4 w-4 text-blue-500" />}
                {actionType === 'release' && <X className="h-4 w-4 text-gray-500" />}
                {actionType === 'reserve' && <Bookmark className="h-4 w-4 text-yellow-500" />}
                {actionType === 'mark_damaged' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                {actionType === 'assign' && 'Assign Core'}
                {actionType === 'release' && 'Release Core'}
                {actionType === 'reserve' && 'Reserve Core'}
                {actionType === 'mark_damaged' && t('fiberCore.markDamaged')}
              </h2>
              <button
                onClick={() => setIsActionDialogOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">
                {selectedCores.size} core {t('common.selected').toLowerCase()}
              </p>

              {actionType === 'assign' && (
                <>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCore.targetType')}</label>
                    <select
                      value={assignToType}
                      onChange={(e) => setAssignToType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    >
                      <option value="ODP">ODP</option>
                      <option value="ODC">ODC</option>
                      <option value="OTB">OTB</option>
                      <option value="Customer">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCore.targetId')}</label>
                    <input
                      type="text"
                      value={assignToId}
                      onChange={(e) => setAssignToId(e.target.value)}
                      placeholder="Masukkan ID..."
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[10px] font-medium mb-1">
                  {actionType === 'assign' ? t('common.notes') + ' (opsional)' : t('common.notes')}
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={2}
                  placeholder={actionType === 'mark_damaged' ? 'Jelaskan kerusakan...' : 'Catatan...'}
                  className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t dark:border-gray-800 flex justify-end gap-2">
              <button
                onClick={() => setIsActionDialogOpen(false)}
                className="px-4 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleBulkAction}
                disabled={submitting}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${
                  actionType === 'mark_damaged' 
                    ? 'bg-red-600 hover:bg-red-700'
                    : actionType === 'reserve'
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting ? '...' : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
