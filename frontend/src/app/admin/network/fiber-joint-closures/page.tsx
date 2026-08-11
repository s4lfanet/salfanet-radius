'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, RefreshCcw, X, MapPin, Cable,
  Activity, Circle, Link2, Box,
} from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface JointClosure {
  id: string;
  name: string;
  code: string;
  type: string;
  latitude: number;
  longitude: number;
  address?: string;
  cableType: string;
  fiberCount: number;
  hasSplitter: boolean;
  splitterRatio?: string;
  status: string;
  closureType: string;
  spliceTrayCount: number;
  totalSpliceCapacity: number;
  followRoad: boolean;
  createdAt: string;
}

const JC_TYPES = ['CORE', 'DISTRIBUTION', 'FEEDER'];
const CABLE_TYPES = ['GPON', 'ADSS', 'OPGW', 'Figure_8', 'Aerial', 'Underground', 'Indoor'];
const CLOSURE_TYPES = ['BRANCHING', 'STRAIGHT', 'LOOP'];
const STATUS_OPTIONS = ['active', 'inactive', 'maintenance', 'damaged'];

export default function FiberJointClosuresPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [jointClosures, setJointClosures] = useState<JointClosure[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJC, setEditingJC] = useState<JointClosure | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'DISTRIBUTION',
    latitude: '',
    longitude: '',
    address: '',
    cableType: 'GPON',
    fiberCount: '24',
    hasSplitter: false,
    splitterRatio: '',
    status: 'active',
    closureType: 'BRANCHING',
    spliceTrayCount: '4',
    totalSpliceCapacity: '96',
    followRoad: true,
  });

  useEffect(() => {
    loadJointClosures();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadJointClosures = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterStatus) params.append('status', filterStatus);
      if (searchTerm) params.append('search', searchTerm);
      const res = await fetch(`/api/network/joint-closures?${params}`);
      const data = await res.json();
      setJointClosures(data.data || []);
    } catch {
      showError(t('common.loadError') || 'Failed to load Joint Closures');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      type: 'DISTRIBUTION',
      latitude: '',
      longitude: '',
      address: '',
      cableType: 'GPON',
      fiberCount: '24',
      hasSplitter: false,
      splitterRatio: '',
      status: 'active',
      closureType: 'BRANCHING',
      spliceTrayCount: '4',
      totalSpliceCapacity: '96',
      followRoad: true,
    });
    setEditingJC(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (jc: JointClosure) => {
    setEditingJC(jc);
    setFormData({
      name: jc.name,
      code: jc.code,
      type: jc.type,
      latitude: String(jc.latitude),
      longitude: String(jc.longitude),
      address: jc.address || '',
      cableType: jc.cableType,
      fiberCount: String(jc.fiberCount),
      hasSplitter: jc.hasSplitter,
      splitterRatio: jc.splitterRatio || '',
      status: jc.status,
      closureType: jc.closureType,
      spliceTrayCount: String(jc.spliceTrayCount),
      totalSpliceCapacity: String(jc.totalSpliceCapacity),
      followRoad: jc.followRoad,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingJC ? 'PUT' : 'POST';
      const url = editingJC
        ? `/api/network/joint-closures/${editingJC.id}`
        : '/api/network/joint-closures';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          fiberCount: parseInt(formData.fiberCount),
          spliceTrayCount: parseInt(formData.spliceTrayCount),
          totalSpliceCapacity: parseInt(formData.totalSpliceCapacity),
          connections: [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      showSuccess(
        editingJC ? t('common.updated') || 'Updated successfully' : t('common.created') || 'Created successfully'
      );
      setIsDialogOpen(false);
      resetForm();
      loadJointClosures();
    } catch (error: unknown) {
      showError((error as Error).message || 'Failed to save Joint Closure');
    }
  };

  const handleDelete = async (jc: JointClosure) => {
    const confirmed = await showConfirm(
      t('network.jointClosure.deleteConfirm')?.replace('{name}', jc.name) ||
        `Delete "${jc.name}"?`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/network/joint-closures/${jc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      showSuccess('Deleted successfully');
      loadJointClosures();
    } catch (error: unknown) {
      showError((error as Error).message || 'Failed to delete');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
      case 'maintenance': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'damaged': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'CORE': return t('network.jointClosure.core') || 'Core';
      case 'DISTRIBUTION': return t('network.jointClosure.distribution') || 'Distribution';
      case 'FEEDER': return t('network.jointClosure.feeder') || 'Feeder';
      default: return type;
    }
  };

  const filteredJCs = jointClosures.filter(jc => {
    if (searchTerm && !jc.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !jc.code.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterType && jc.type !== filterType) return false;
    if (filterStatus && jc.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="h-6 w-6 text-purple-500" />
            {t('network.jointClosure.title') || 'Joint Closure Management'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {t('network.jointClosure.subtitle') || 'Manage Joint Closures (JC)'}
          </p>
        </div>
        <button
          onClick={openCreateDialog}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('network.jointClosure.add') || 'Add Joint Closure'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={t('common.search') || 'Search...'}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">{t('common.all') || 'All Types'}</option>
          {JC_TYPES.map(type => (
            <option key={type} value={type}>{getTypeLabel(type)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">{t('common.allStatus') || 'All Status'}</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={loadJointClosures}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('common.total') || 'Total', value: jointClosures.length, color: 'text-purple-600' },
          { label: t('network.tracing.active') || 'Active', value: jointClosures.filter(j => j.status === 'active').length, color: 'text-green-600' },
          { label: t('network.tracing.maintenance') || 'Maintenance', value: jointClosures.filter(j => j.status === 'maintenance').length, color: 'text-yellow-600' },
          { label: t('network.tracing.damaged') || 'Damaged', value: jointClosures.filter(j => j.status === 'damaged').length, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCcw className="h-8 w-8 animate-spin text-purple-500 mx-auto mb-2" />
            <p className="text-gray-500">{t('common.loading') || 'Loading...'}</p>
          </div>
        ) : filteredJCs.length === 0 ? (
          <div className="text-center py-12">
            <Link2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {jointClosures.length === 0
                ? t('network.diagram.noJointClosures') || 'No Joint Closures yet'
                : t('common.noResults') || 'No results'}
            </p>
            {jointClosures.length === 0 && (
              <button
                onClick={openCreateDialog}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                {t('network.jointClosure.add') || 'Add Joint Closure'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('network.jointClosure.code') || 'Code'} / {t('network.jointClosure.name') || 'Name'}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    {t('network.jointClosure.type') || 'Type'}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    {t('network.jointClosure.fiberCount') || 'Fibers'}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.status') || 'Status'}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    {t('network.jointClosure.location') || 'Location'}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredJCs.map(jc => (
                  <tr key={jc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{jc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{jc.code}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{getTypeLabel(jc.type)}</span>
                      <p className="text-xs text-gray-400">{jc.cableType}</p>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <Cable className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{jc.fiberCount}</span>
                      </div>
                      <p className="text-xs text-gray-400">{jc.spliceTrayCount} trays</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(jc.status)}`}>
                        <Circle className="h-2 w-2 fill-current" />
                        {jc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {jc.address ? (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 max-w-[200px]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{jc.address}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">
                          {jc.latitude.toFixed(6)}, {jc.longitude.toFixed(6)}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditDialog(jc)}
                          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition-colors"
                          title={t('network.jointClosure.edit') || 'Edit'}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(jc)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                          title={t('common.delete') || 'Delete'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {isDialogOpen && (
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); resetForm(); }}>
          <ModalHeader>
            <ModalTitle>
              {editingJC
                ? t('network.jointClosure.edit') || 'Edit Joint Closure'
                : t('network.jointClosure.add') || 'Add Joint Closure'}
            </ModalTitle>
            <ModalDescription>
              {t('network.jointClosure.subtitle') || 'Manage Joint Closures (JC)'}
            </ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ModalLabel>{t('network.jointClosure.name') || 'JC Name'} *</ModalLabel>
                  <ModalInput
                    id="jc-name"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. JC-001 Jl. Merdeka"
                    required
                  />
                </div>
                <div>
                  <ModalLabel>{t('network.jointClosure.code') || 'JC Code'} *</ModalLabel>
                  <ModalInput
                    id="jc-code"
                    value={formData.code}
                    onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. JC-001"
                    required
                    disabled={!!editingJC}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ModalLabel>{t('network.jointClosure.type') || 'JC Type'} *</ModalLabel>
                  <ModalSelect
                    id="jc-type"
                    value={formData.type}
                    onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    required
                  >
                    {JC_TYPES.map(t => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel>Closure Type</ModalLabel>
                  <ModalSelect
                    id="jc-closure-type"
                    value={formData.closureType}
                    onChange={e => setFormData(prev => ({ ...prev, closureType: e.target.value }))}
                  >
                    {CLOSURE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                  </ModalSelect>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ModalLabel>{t('network.jointClosure.cableType') || 'Cable Type'} *</ModalLabel>
                  <ModalSelect
                    id="jc-cable-type"
                    value={formData.cableType}
                    onChange={e => setFormData(prev => ({ ...prev, cableType: e.target.value }))}
                    required
                  >
                    {CABLE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel>{t('network.jointClosure.fiberCount') || 'Fiber Count'} *</ModalLabel>
                  <ModalInput
                    id="jc-fiber-count"
                    type="number"
                    min="1"
                    value={formData.fiberCount}
                    onChange={e => setFormData(prev => ({ ...prev, fiberCount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ModalLabel>Splice Tray Count</ModalLabel>
                  <ModalInput
                    id="jc-splice-trays"
                    type="number"
                    min="1"
                    value={formData.spliceTrayCount}
                    onChange={e => setFormData(prev => ({ ...prev, spliceTrayCount: e.target.value }))}
                  />
                </div>
                <div>
                  <ModalLabel>Total Splice Capacity</ModalLabel>
                  <ModalInput
                    id="jc-splice-capacity"
                    type="number"
                    min="1"
                    value={formData.totalSpliceCapacity}
                    onChange={e => setFormData(prev => ({ ...prev, totalSpliceCapacity: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <ModalLabel>{t('common.status') || 'Status'}</ModalLabel>
                <ModalSelect
                  id="jc-status"
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </ModalSelect>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="jc-has-splitter"
                  type="checkbox"
                  checked={formData.hasSplitter}
                  onChange={e => setFormData(prev => ({ ...prev, hasSplitter: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <ModalLabel className="mb-0 cursor-pointer">
                  {t('network.jointClosure.splitterRatio') || 'Has Splitter'}
                </ModalLabel>
              </div>

              {formData.hasSplitter && (
                <div>
                  <ModalLabel>{t('network.jointClosure.splitterRatio') || 'Splitter Ratio'}</ModalLabel>
                  <ModalInput
                    id="jc-splitter-ratio"
                    value={formData.splitterRatio}
                    onChange={e => setFormData(prev => ({ ...prev, splitterRatio: e.target.value }))}
                    placeholder="e.g. 1:8, 1:16"
                  />
                </div>
              )}

              <div>
                <ModalLabel>{t('network.jointClosure.location') || 'Location'} *</ModalLabel>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <ModalLabel className="text-xs">{t('network.jointClosure.latitude') || 'Latitude'}</ModalLabel>
                    <ModalInput
                      id="jc-lat"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={e => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                      placeholder="-6.2000"
                      required
                    />
                  </div>
                  <div>
                    <ModalLabel className="text-xs">{t('network.jointClosure.longitude') || 'Longitude'}</ModalLabel>
                    <ModalInput
                      id="jc-lon"
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={e => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                      placeholder="106.8000"
                      required
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="mt-2 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
                >
                  <MapPin className="h-4 w-4" />
                  {t('common.pickOnMap') || 'Pick on Map'}
                </button>
              </div>

              <div>
                <ModalLabel>{t('common.address') || 'Address'}</ModalLabel>
                <ModalInput
                  id="jc-address"
                  value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Street address or location description"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="jc-follow-road"
                  type="checkbox"
                  checked={formData.followRoad}
                  onChange={e => setFormData(prev => ({ ...prev, followRoad: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <ModalLabel className="mb-0 cursor-pointer">
                  {t('network.jointClosure.followRoad') || 'Follow Road'}
                </ModalLabel>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton
                type="button"
                variant="secondary"
                onClick={() => { setIsDialogOpen(false); resetForm(); }}
              >
                {t('common.cancel') || 'Cancel'}
              </ModalButton>
              <ModalButton type="submit" variant="primary">
                {editingJC ? t('common.save') || 'Save' : t('network.jointClosure.add') || 'Add'}
              </ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      )}

      {/* Map Picker */}
      {showMapPicker && (
        <MapPicker
          isOpen={showMapPicker}
          initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
          initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
          onSelect={(lat: number, lng: number) => {
            setFormData(prev => ({ ...prev, latitude: String(lat), longitude: String(lng) }));
            setShowMapPicker(false);
          }}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
