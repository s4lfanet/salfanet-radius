'use client';

import { useState, useEffect, useCallback } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import {
  Plus, Trash2, Link2, Cable, X, Zap, Settings, Circle,
  AlertTriangle, Check, RefreshCcw
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
  deviceType: string;
  deviceId: string;
  trayNumber: number;
  spliceType: 'FUSION' | 'MECHANICAL';
  insertionLoss: number | null;
  reflectance: number | null;
  spliceDate: string | null;
  splicedBy: string | null;
  status: string;
  notes: string | null;
  incomingCore?: CoreInfo;
  outgoingCore?: CoreInfo;
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

interface Props {
  deviceType: 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP';
  deviceId: string;
  deviceName: string;
  spliceTrayCount?: number;
  className?: string;
}

const SPLICE_TYPES = [
  { value: 'FUSION', label: 'Fusion', icon: Zap, color: 'blue' },
  { value: 'MECHANICAL', label: 'Mechanical', icon: Settings, color: 'orange' },
] as const;

export default function SplicePointsSection({ 
  deviceType, 
  deviceId, 
  deviceName,
  spliceTrayCount = 1,
  className = ''
}: Props) {
  const [loading, setLoading] = useState(true);
  const [splicePoints, setSplicePoints] = useState<SplicePoint[]>([]);
  const [cables, setCables] = useState<FiberCable[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    trayNumber: '1',
    coreAId: '',
    coreBId: '',
    spliceType: 'FUSION' as 'FUSION' | 'MECHANICAL',
    insertionLoss: '',
    reflectance: '',
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
      const params = new URLSearchParams({
        deviceType,
        deviceId,
      });
      const res = await fetch(`/api/network/splices?${params}`);
      const data = await res.json();
      setSplicePoints(data.splices || []);
    } catch (error) {
      console.error('Failed to load splice points:', error);
    } finally {
      setLoading(false);
    }
  }, [deviceType, deviceId]);

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
    if (deviceId) {
      loadSplicePoints();
      loadCables();
    }
  }, [deviceId, loadSplicePoints, loadCables]);

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
      trayNumber: '1',
      coreAId: '',
      coreBId: '',
      spliceType: 'FUSION',
      insertionLoss: '',
      reflectance: '',
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
      showError('Pilih kedua core yang akan di-splice');
      return;
    }

    if (formData.coreAId === formData.coreBId) {
      showError('Tidak bisa splice core yang sama');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        deviceType,
        deviceId,
        trayNumber: parseInt(formData.trayNumber),
        incomingCoreId: formData.coreAId,
        outgoingCoreId: formData.coreBId,
        spliceType: formData.spliceType,
        insertionLoss: formData.insertionLoss ? parseFloat(formData.insertionLoss) : null,
        reflectance: formData.reflectance ? parseFloat(formData.reflectance) : null,
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
        throw new Error(data.error || 'Gagal membuat splice');
      }

      showSuccess('Splice berhasil dibuat');
      setIsCreateDialogOpen(false);
      resetForm();
      loadSplicePoints();
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || 'Gagal membuat splice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSplice = async (splice: SplicePoint) => {
    const confirmed = await showConfirm(
      'Hapus Splice',
      'Yakin hapus splice ini? Core akan dikembalikan ke status available.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/network/splices/${splice.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal menghapus');
      }
      showSuccess('Splice berhasil dihapus');
      loadSplicePoints();
    } catch (error: unknown) {
      const err = error as Error;
      showError(err.message || 'Gagal menghapus splice');
    }
  };

  const getSpliceTypeStyle = (type: string) => {
    switch (type) {
      case 'FUSION':
        return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400';
      case 'MECHANICAL':
        return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getLossQuality = (loss: number | null) => {
    if (loss == null) return { label: '-', color: 'text-gray-400' };
    if (loss <= 0.05) return { label: 'Excellent', color: 'text-green-600' };
    if (loss <= 0.1) return { label: 'Good', color: 'text-blue-600' };
    if (loss <= 0.2) return { label: 'Fair', color: 'text-yellow-600' };
    return { label: 'Poor', color: 'text-red-600' };
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'REPAIRED':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'DAMAGED':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800';
    }
  };

  // Group splices by tray
  const splicesByTray = splicePoints.reduce((acc, splice) => {
    const tray = splice.trayNumber || 1;
    if (!acc[tray]) acc[tray] = [];
    acc[tray].push(splice);
    return acc;
  }, {} as Record<number, SplicePoint[]>);

  // Calculate stats
  const stats = {
    total: splicePoints.length,
    avgLoss: splicePoints.filter(s => s.insertionLoss != null).length > 0
      ? (splicePoints.filter(s => s.insertionLoss != null)
          .reduce((sum, s) => sum + (s.insertionLoss || 0), 0) / 
          splicePoints.filter(s => s.insertionLoss != null).length).toFixed(3)
      : '-',
    damaged: splicePoints.filter(s => s.status === 'DAMAGED').length,
  };

  if (!deviceId) {
    return null;
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-blue-500" />
          <div>
            <h3 className="text-sm font-semibold">Splice Points</h3>
            <p className="text-[10px] text-gray-500">Cross connect di {deviceName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSplicePoints}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Tambah Splice
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-800 flex items-center gap-4 text-[10px]">
        <span className="text-gray-500">Total: <b className="text-gray-700 dark:text-gray-300">{stats.total}</b></span>
        <span className="text-gray-500">Avg Loss: <b className={stats.avgLoss !== '-' ? 'text-blue-600' : 'text-gray-400'}>{stats.avgLoss} dB</b></span>
        {stats.damaged > 0 && (
          <span className="text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {stats.damaged} rusak
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : splicePoints.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Belum ada splice point</p>
            <p className="text-[10px]">Klik "Tambah Splice" untuk membuat cross connect</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Splice List by Tray */}
            {Array.from({ length: spliceTrayCount }, (_, i) => i + 1).map(trayNum => {
              const traySplices = splicesByTray[trayNum] || [];
              return (
                <div key={trayNum} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
                    <span className="text-xs font-medium">Tray {trayNum}</span>
                    <span className="text-[10px] text-gray-500">{traySplices.length} splice</span>
                  </div>
                  {traySplices.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[10px] text-gray-400">
                      Tidak ada splice di tray ini
                    </div>
                  ) : (
                    <div className="divide-y dark:divide-gray-700">
                      {traySplices.map(splice => {
                        const lossQuality = getLossQuality(splice.insertionLoss);
                        return (
                          <div key={splice.id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <div className="flex items-center gap-3">
                              {/* Type Badge */}
                              <span className={`px-1.5 py-0.5 text-[9px] rounded border ${getSpliceTypeStyle(splice.spliceType)}`}>
                                {splice.spliceType}
                              </span>
                              
                              {/* Connection Info */}
                              <div className="flex items-center gap-2 text-[10px]">
                                {/* Incoming */}
                                <div className="flex items-center gap-1">
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full border"
                                    style={{ backgroundColor: splice.incomingCore?.colorHex || '#888' }}
                                  />
                                  <span className="font-mono">
                                    {splice.incomingCore?.tube?.cable?.code || '?'} T{splice.incomingCore?.tube?.tubeNumber}-C{splice.incomingCore?.coreNumber}
                                  </span>
                                </div>
                                
                                <Link2 className="h-3 w-3 text-gray-400" />
                                
                                {/* Outgoing */}
                                <div className="flex items-center gap-1">
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full border"
                                    style={{ backgroundColor: splice.outgoingCore?.colorHex || '#888' }}
                                  />
                                  <span className="font-mono">
                                    {splice.outgoingCore?.tube?.cable?.code || '?'} T{splice.outgoingCore?.tube?.tubeNumber}-C{splice.outgoingCore?.coreNumber}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Loss */}
                              <div className="text-right">
                                <span className={`text-[10px] font-medium ${lossQuality.color}`}>
                                  {splice.insertionLoss != null ? `${splice.insertionLoss.toFixed(3)} dB` : '-'}
                                </span>
                                <span className={`text-[9px] ml-1 ${lossQuality.color}`}>
                                  ({lossQuality.label})
                                </span>
                              </div>

                              {/* Status */}
                              <span className={`px-1.5 py-0.5 text-[9px] rounded ${getStatusStyle(splice.status)}`}>
                                {splice.status}
                              </span>

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteSplice(splice)}
                                className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Splice Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-blue-500" />
                  Tambah Splice Point
                </h2>
                <p className="text-[10px] text-gray-500">Cross connect di {deviceName}</p>
              </div>
              <button
                onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSplice} className="p-4 space-y-4">
              {/* Tray & Type Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1">Splice Tray</label>
                  <select
                    value={formData.trayNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, trayNumber: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800"
                  >
                    {Array.from({ length: spliceTrayCount }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>Tray {num}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">Tipe Splice</label>
                  <div className="flex gap-2">
                    {SPLICE_TYPES.map(type => {
                      const isActive = formData.spliceType === type.value;
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, spliceType: type.value }))}
                          className={`flex-1 p-2 rounded-lg border-2 transition-all text-center ${
                            isActive 
                              ? `border-${type.color}-500 bg-${type.color}-50 dark:bg-${type.color}-900/20`
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <Icon className={`h-4 w-4 mx-auto mb-0.5 ${isActive ? `text-${type.color}-600` : 'text-gray-400'}`} />
                          <span className="text-[10px] font-medium">{type.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Core Selection */}
              <div className="grid grid-cols-2 gap-4">
                {/* Incoming Core */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                  <h4 className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">Incoming Core</h4>
                  <div>
                    <label className="block text-[9px] font-medium mb-1">Kabel</label>
                    <select
                      value={selectedCableA}
                      onChange={(e) => {
                        setSelectedCableA(e.target.value);
                        setFormData(prev => ({ ...prev, coreAId: '' }));
                      }}
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                    >
                      <option value="">Pilih Kabel</option>
                      {cables.map(cable => (
                        <option key={cable.id} value={cable.id}>{cable.code}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-medium mb-1">Core</label>
                    <select
                      value={formData.coreAId}
                      onChange={(e) => setFormData(prev => ({ ...prev, coreAId: e.target.value }))}
                      disabled={!selectedCableA}
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800 disabled:opacity-50"
                    >
                      <option value="">Pilih Core</option>
                      {coresForCableA.map(core => (
                        <option key={core.id} value={core.id}>
                          T{core.tube?.tubeNumber}-C{core.coreNumber} ({core.colorCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Outgoing Core */}
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-2">
                  <h4 className="text-[10px] font-semibold text-purple-700 dark:text-purple-400">Outgoing Core</h4>
                  <div>
                    <label className="block text-[9px] font-medium mb-1">Kabel</label>
                    <select
                      value={selectedCableB}
                      onChange={(e) => {
                        setSelectedCableB(e.target.value);
                        setFormData(prev => ({ ...prev, coreBId: '' }));
                      }}
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                    >
                      <option value="">Pilih Kabel</option>
                      {cables.map(cable => (
                        <option key={cable.id} value={cable.id}>{cable.code}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-medium mb-1">Core</label>
                    <select
                      value={formData.coreBId}
                      onChange={(e) => setFormData(prev => ({ ...prev, coreBId: e.target.value }))}
                      disabled={!selectedCableB}
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800 disabled:opacity-50"
                    >
                      <option value="">Pilih Core</option>
                      {coresForCableB.map(core => (
                        <option key={core.id} value={core.id}>
                          T{core.tube?.tubeNumber}-C{core.coreNumber} ({core.colorCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Attenuation */}
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h4 className="text-[10px] font-semibold text-green-700 dark:text-green-400 mb-2">Attenuation Measurement</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-medium mb-1">
                      Insertion Loss (dB) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={formData.insertionLoss}
                      onChange={(e) => setFormData(prev => ({ ...prev, insertionLoss: e.target.value }))}
                      placeholder="0.05"
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                    />
                    <p className="text-[8px] text-gray-400 mt-1">Target: ≤0.1 dB (Fusion), ≤0.3 dB (Mech)</p>
                  </div>
                  <div>
                    <label className="block text-[9px] font-medium mb-1">Reflectance (dB)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={formData.reflectance}
                      onChange={(e) => setFormData(prev => ({ ...prev, reflectance: e.target.value }))}
                      placeholder="-60"
                      className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                    />
                    <p className="text-[8px] text-gray-400 mt-1">Target: ≤-60 dB</p>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-[10px] font-medium mb-1">Catatan</label>
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
              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}
                  className="px-4 py-2 text-sm border dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.coreAId || !formData.coreBId}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Buat Splice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
