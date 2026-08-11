'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, Cable, Eye, RefreshCcw, X,
  ChevronDown, ChevronRight, Activity, Layers, Circle,
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

interface FiberTube {
  id: string;
  tubeNumber: number;
  colorCode: string;
  cores: FiberCore[];
}

interface FiberCore {
  id: string;
  coreNumber: number;
  colorCode: string;
  colorHex: string;
  status: string;
  assignedToType?: string;
  assignedToId?: string;
}

interface FiberCable {
  id: string;
  code: string;
  name: string;
  cableType: string;
  tubeCount: number;
  coresPerTube: number;
  totalCores: number;
  outerDiameter?: number;
  isActive: boolean;
  tubes: FiberTube[];
  createdAt: string;
  updatedAt: string;
}

const CABLE_PRESETS = [
  { label: '12 Core (1x12)', tubeCount: 1, coresPerTube: 12 },
  { label: '24 Core (2x12)', tubeCount: 2, coresPerTube: 12 },
  { label: '48 Core (4x12)', tubeCount: 4, coresPerTube: 12 },
  { label: '96 Core (8x12)', tubeCount: 8, coresPerTube: 12 },
  { label: '144 Core (12x12)', tubeCount: 12, coresPerTube: 12 },
];

const CABLE_TYPES = ['GPON', 'ADSS', 'OPGW', 'Figure_8', 'Aerial', 'Underground', 'Indoor'];

export default function FiberCablesPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [cables, setCables] = useState<FiberCable[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<FiberCable | null>(null);
  const [selectedCable, setSelectedCable] = useState<FiberCable | null>(null);
  const [expandedTubes, setExpandedTubes] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    cableType: 'GPON',
    tubeCount: '12',
    coresPerTube: '12',
    outerDiameter: '',
  });

  useEffect(() => {
    loadCables();
  }, []);

  const loadCables = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/network/cables');
      const data = await res.json();
      setCables(data.cables || []);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      cableType: 'GPON',
      tubeCount: '12',
      coresPerTube: '12',
      outerDiameter: '',
    });
    setEditingCable(null);
  };

  const handlePresetChange = (preset: typeof CABLE_PRESETS[0]) => {
    setFormData(prev => ({
      ...prev,
      tubeCount: String(preset.tubeCount),
      coresPerTube: String(preset.coresPerTube),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingCable ? 'PUT' : 'POST';
      const url = editingCable 
        ? `/api/network/cables/${editingCable.id}` 
        : '/api/network/cables';

      const body = {
        code: formData.code,
        name: formData.name,
        cableType: formData.cableType,
        tubeCount: parseInt(formData.tubeCount),
        coresPerTube: parseInt(formData.coresPerTube),
        outerDiameter: formData.outerDiameter ? parseFloat(formData.outerDiameter) : null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('fiberCable.saveFailed'));

      await showSuccess(editingCable ? t('fiberCable.updatedSuccess') : t('fiberCable.createdSuccess'));
      setIsDialogOpen(false);
      resetForm();
      loadCables();
    } catch (error: any) {
      await showError(error.message || t('fiberCable.saveFailed'));
    }
  };

  const handleEdit = (cable: FiberCable) => {
    setEditingCable(cable);
    setFormData({
      code: cable.code,
      name: cable.name,
      cableType: cable.cableType,
      tubeCount: String(cable.tubeCount),
      coresPerTube: String(cable.coresPerTube),
      outerDiameter: cable.outerDiameter ? String(cable.outerDiameter) : '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (cable: FiberCable) => {
    const confirmed = await showConfirm(
      t('fiberCable.deleteTitle'),
      t('fiberCable.deleteConfirm', { code: cable.code })
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/network/cables/${cable.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('fiberCable.deleteFailed'));
      }
      await showSuccess(t('fiberCable.deletedSuccess'));
      loadCables();
    } catch (error: any) {
      await showError(error.message || t('fiberCable.deleteFailed'));
    }
  };

  const viewDetails = async (cable: FiberCable) => {
    try {
      const res = await fetch(`/api/network/cables/${cable.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedCable(data.cable);
      setExpandedTubes(new Set());
      setIsDetailDialogOpen(true);
    } catch (error: any) {
      await showError(error.message || t('fiberCable.loadFailed'));
    }
  };

  const toggleTube = (tubeId: string) => {
    setExpandedTubes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tubeId)) newSet.delete(tubeId);
      else newSet.add(tubeId);
      return newSet;
    });
  };

  const filteredCables = cables.filter(cable => {
    if (searchTerm && !cable.code.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !cable.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterType && cable.cableType !== filterType) return false;
    return true;
  });

  const stats = {
    total: cables.length,
    totalCores: cables.reduce((sum, c) => sum + c.totalCores, 0),
    active: cables.filter(c => c.isActive).length,
    types: [...new Set(cables.map(c => c.cableType))].length,
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'GPON': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'ADSS': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'OPGW': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Figure-8': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  if (loading) {
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
            <Cable className="h-5 w-5 text-blue-500" />
            {t('fiberCable.title')}
          </h1>
          <p className="text-xs text-gray-500">{t('fiberCable.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCables}
            className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
          >
            <RefreshCcw className="h-3 w-3" />
            {t('common.refresh')}
          </button>
          <button
            onClick={() => { resetForm(); setIsDialogOpen(true); }}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            {t('fiberCable.add')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500">{t('fiberCable.totalCables')}</span>
          </div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500">{t('fiberCable.totalCores')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-purple-600">{stats.totalCores}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500">{t('common.active')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-orange-500" />
            <span className="text-xs text-gray-500">{t('fiberCable.cableTypes')}</span>
          </div>
          <p className="text-xl font-bold mt-1 text-orange-600">{stats.types}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('fiberCable.searchPlaceholder')}
              className="w-full px-3 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-medium text-gray-500">{t('common.type')}:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
            >
              <option value="">{t('fiberCable.allTypes')}</option>
              {CABLE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <span className="text-[10px] text-gray-500">
            {t('fiberCable.showing', { count: filteredCables.length, total: cables.length })}
          </span>
        </div>
      </div>

      {/* Cable Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredCables.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Cable className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('fiberCable.noData')}</p>
            <p className="text-xs">{t('fiberCable.noDataHint')}</p>
          </div>
        ) : (
          filteredCables.map((cable) => (
            <div
              key={cable.id}
              className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Card Header */}
              <div className="p-3 border-b dark:border-gray-800 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${getTypeColor(cable.cableType)}`}>
                    <Cable className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{cable.code}</h3>
                    <p className="text-[10px] text-gray-500">{cable.name}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] rounded-full border ${
                  cable.isActive 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300'
                }`}>
                  {cable.isActive ? t('common.active') : t('fiberCable.inactive')}
                </span>
              </div>

              {/* Cable Info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border-b dark:border-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <Cable className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">{t('fiberCable.specification')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">{t('fiberCable.cableType')}:</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${getTypeColor(cable.cableType)}`}>
                      {cable.cableType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Tube:</span>
                    <span className="text-[10px] font-medium">{cable.tubeCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">{t('fiberCable.coresPerTube')}:</span>
                    <span className="text-[10px] font-medium">{cable.coresPerTube}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">{t('fiberCable.totalCores')}:</span>
                    <span className="text-[10px] font-bold text-purple-600">{cable.totalCores}</span>
                  </div>
                </div>
              </div>

              {/* Diameter */}
              {cable.outerDiameter && (
                <div className="px-3 py-2 border-b dark:border-gray-800 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">{t('fiberCable.diameter')}:</span>
                  <span className="text-[10px] font-medium">{cable.outerDiameter} mm</span>
                </div>
              )}

              {/* Actions */}
              <div className="p-3 flex items-center justify-end gap-1">
                <button
                  onClick={() => viewDetails(cable)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  title={t('fiberCable.viewDetail')}
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleEdit(cable)}
                  className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  title={t('common.edit')}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(cable)}
                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Cable className="h-4 w-4 text-blue-500" />
                  {editingCable ? t('fiberCable.editTitle') : t('fiberCable.addTitle')}
                </h2>
                <p className="text-[10px] text-gray-500">{t('fiberCable.subtitle')}</p>
              </div>
              <button
                onClick={() => { setIsDialogOpen(false); resetForm(); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Cable className="h-3.5 w-3.5" />
                  {t('fiberCable.basicInfo')}
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.cableCode')} *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      required
                      placeholder="FO-001"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.cableType')}</label>
                    <select
                      value={formData.cableType}
                      onChange={(e) => setFormData({ ...formData, cableType: e.target.value })}
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    >
                      {CABLE_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.cableName')} *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Kabel Backbone Utama"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    />
                  </div>
                </div>
              </div>

              {/* Cable Preset */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('fiberCable.presets')}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {CABLE_PRESETS.map(preset => {
                    const isActive = parseInt(formData.tubeCount) === preset.tubeCount && 
                                     parseInt(formData.coresPerTube) === preset.coresPerTube;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handlePresetChange(preset)}
                        className={`p-2 rounded-lg border-2 text-center transition-all ${
                          isActive 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-[10px] font-medium">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual Config */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg space-y-3">
                <h3 className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" />
                  {t('fiberCable.manualConfig')}
                </h3>
                
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.tubeCount')}</label>
                    <input
                      type="number"
                      value={formData.tubeCount}
                      onChange={(e) => setFormData({ ...formData, tubeCount: e.target.value })}
                      min="1"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.coresPerTube')}</label>
                    <input
                      type="number"
                      value={formData.coresPerTube}
                      onChange={(e) => setFormData({ ...formData, coresPerTube: e.target.value })}
                      min="1"
                      className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium mb-1">{t('fiberCable.totalCores')}</label>
                    <div className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg font-bold text-purple-600">
                      {parseInt(formData.tubeCount || '0') * parseInt(formData.coresPerTube || '0')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Diameter */}
              <div>
                <label className="block text-[10px] font-medium mb-1">{t('fiberCable.outerDiameter')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.outerDiameter}
                  onChange={(e) => setFormData({ ...formData, outerDiameter: e.target.value })}
                  placeholder="8.5"
                  className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setIsDialogOpen(false); resetForm(); }}
                  className="px-4 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  {editingCable ? t('common.update') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      {isDetailDialogOpen && selectedCable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Cable className="h-4 w-4 text-blue-500" />
                  {t('fiberCable.detailTitle', { code: selectedCable.code })}
                </h2>
                <p className="text-[10px] text-gray-500">{selectedCable.name}</p>
              </div>
              <button
                onClick={() => setIsDetailDialogOpen(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Cable Summary */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">{t('fiberCable.cableType')}</p>
                  <p className="text-sm font-bold text-blue-600">{selectedCable.cableType}</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">Tube</p>
                  <p className="text-sm font-bold text-purple-600">{selectedCable.tubeCount}</p>
                </div>
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">{t('fiberCable.coresPerTube')}</p>
                  <p className="text-sm font-bold text-orange-600">{selectedCable.coresPerTube}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">{t('fiberCable.totalCores')}</p>
                  <p className="text-sm font-bold text-green-600">{selectedCable.totalCores}</p>
                </div>
              </div>

              {/* Tubes List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('fiberCable.tubeList')}</h3>
                {selectedCable.tubes?.map((tube) => (
                  <div key={tube.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleTube(tube.id)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        {expandedTubes.has(tube.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <div 
                          className="w-4 h-4 rounded-full border"
                          style={{ backgroundColor: FIBER_COLORS[tube.colorCode] || '#888' }}
                        />
                        <span className="text-sm font-medium">{t('fiberCable.tubeN', { n: tube.tubeNumber })}</span>
                        <span className="text-[10px] text-gray-500">({tube.colorCode})</span>
                      </div>
                      <span className="text-[10px] text-gray-500">{tube.cores?.length || 0} {t('fiberCable.cores')}</span>
                    </button>
                    
                    {expandedTubes.has(tube.id) && tube.cores && (
                      <div className="px-3 pb-3 pt-1 border-t dark:border-gray-700">
                        <div className="flex flex-wrap gap-1">
                          {tube.cores.map((core) => (
                            <div
                              key={core.id}
                              className={`relative group px-2 py-1 rounded text-[9px] flex items-center gap-1 border ${
                                core.status === 'available' 
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200' 
                                  : core.status === 'used'
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200'
                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200'
                              }`}
                              title={`Core ${core.coreNumber} - ${core.colorCode} (${core.status})`}
                            >
                              <div 
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: core.colorHex }}
                              />
                              <span>{core.coreNumber}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
