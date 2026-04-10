'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, Server, MapPin, Map, X, RefreshCcw,
  Activity, Box, HardDrive,
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

interface ODC {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  followRoad: boolean;
  oltId: string;
  ponPort: number;
  portCount: number;
  createdAt: string;
  olt: {
    id: string;
    name: string;
    ipAddress: string;
  };
  _count: {
    odps: number;
  };
}

interface OLT {
  id: string;
  name: string;
  ipAddress: string;
}

export default function ODCsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [odcs, setOdcs] = useState<ODC[]>([]);
  const [olts, setOlts] = useState<OLT[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOdc, setEditingOdc] = useState<ODC | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [filterOlt, setFilterOlt] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    oltId: '',
    ponPort: '',
    portCount: '8',
    status: 'active',
    followRoad: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [odcsRes, oltsRes] = await Promise.all([
        fetch('/api/network/odcs'),
        fetch('/api/network/olts'),
      ]);
      const [odcsData, oltsData] = await Promise.all([odcsRes.json(), oltsRes.json()]);
      setOdcs(odcsData.odcs || []);
      setOlts(oltsData.olts || []);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      latitude: '',
      longitude: '',
      oltId: '',
      ponPort: '',
      portCount: '8',
      status: 'active',
      followRoad: false,
    });
  };

  const handleEdit = (odc: ODC) => {
    setEditingOdc(odc);
    setFormData({
      name: odc.name,
      latitude: odc.latitude.toString(),
      longitude: odc.longitude.toString(),
      oltId: odc.oltId,
      ponPort: odc.ponPort.toString(),
      portCount: odc.portCount.toString(),
      status: odc.status,
      followRoad: odc.followRoad,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingOdc ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        ...(editingOdc && { id: editingOdc.id }),
      };

      const res = await fetch('/api/network/odcs', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        await showSuccess(editingOdc ? t('common.updated') : t('common.created'));
        setIsDialogOpen(false);
        setEditingOdc(null);
        resetForm();
        loadData();
      } else {
        await showError(result.error || t('common.failedSaveOdc'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      await showError(t('common.failedSaveOdc'));
    }
  };

  const handleDelete = async (odc: ODC) => {
    const confirmed = await showConfirm(
      'Delete ODC',
      `Are you sure you want to delete "${odc.name}"? This will also delete all associated ODPs.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/network/odcs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: odc.id }),
      });

      const result = await res.json();
      if (result.success) {
        await showSuccess(t('common.odcDeleted'));
        loadData();
      } else {
        await showError(result.error || t('common.failedDeleteOdc'));
      }
    } catch (error) {
      await showError(t('common.failedDeleteOdc'));
    }
  };

  const filteredOdcs = filterOlt
    ? odcs.filter(odc => odc.oltId === filterOlt)
    : odcs;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <RefreshCcw className="h-12 w-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      {/* Neon Cyberpunk Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-3">
              <HardDrive className="h-6 w-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
              ODC Management
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Manage Optical Distribution Cabinets (ODC) for FTTH network
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingOdc(null); setIsDialogOpen(true); }}
            className="inline-flex items-center px-4 py-2.5 text-sm font-bold bg-[#00f7ff] text-black rounded-lg hover:bg-[#00f7ff]/90 transition-all shadow-[0_0_20px_rgba(0,247,255,0.4)] uppercase tracking-wide"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add ODC
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Total ODCs</p>
                <p className="text-base font-bold text-orange-600">{odcs.length}</p>
              </div>
              <HardDrive className="h-5 w-5 text-orange-600" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Active</p>
                <p className="text-base font-bold text-success">
                  {odcs.filter(o => o.status === 'active').length}
                </p>
              </div>
              <Activity className="h-5 w-5 text-success" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Total ODPs</p>
                <p className="text-base font-bold text-primary">
                  {odcs.reduce((sum, o) => sum + (o._count?.odps || 0), 0)}
                </p>
              </div>
              <Box className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-medium text-muted-foreground">Filter by OLT:</label>
            <select
              value={filterOlt}
              onChange={(e) => setFilterOlt(e.target.value)}
              className="px-2 py-1 text-xs border border-border rounded bg-input"
            >
              <option value="">All OLTs</option>
              {olts.map(olt => (
                <option key={olt.id} value={olt.id}>{olt.name}</option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground">
              Showing {filteredOdcs.length} of {odcs.length} ODCs
            </span>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filteredOdcs.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-4 text-center text-muted-foreground text-xs">
              No ODCs found. Click &quot;Add ODC&quot; to create one.
            </div>
          ) : (
            filteredOdcs.map((odc) => (
              <div key={odc.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium">{odc.name}</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${odc.status === 'active'
                      ? 'bg-success/20 text-success dark:bg-green-900/30'
                      : 'bg-destructive/20 text-destructive dark:bg-red-900/30'
                    }`}
                  >
                    {odc.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground text-[10px]">OLT</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Server className="h-3 w-3 text-primary" />
                      <span className="text-xs">{odc.olt?.name}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">PON Port</span>
                    <p className="mt-0.5">
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                        PON {odc.ponPort}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Ports / ODPs</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 rounded">
                        {odc.portCount} ports
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                        {odc._count?.odps || 0} ODPs
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Location</span>
                    <a
                      href={`https://www.google.com/maps?q=${odc.latitude},${odc.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline text-[10px] mt-0.5"
                    >
                      <MapPin className="h-3 w-3" />
                      {odc.latitude.toFixed(6)}, {odc.longitude.toFixed(6)}
                    </a>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button
                    onClick={() => handleEdit(odc)}
                    className="p-2 text-muted-foreground hover:bg-muted rounded"
                    title="Edit ODC"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(odc)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded"
                    title="Hapus ODC"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium">ODC List</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Name</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">OLT</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">PON Port</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Location</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Ports/ODPs</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOdcs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      No ODCs found. Click "Add ODC" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredOdcs.map((odc) => (
                    <tr key={odc.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-orange-600" />
                          <span className="text-xs font-medium">{odc.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Server className="h-3 w-3 text-primary" />
                          <span className="text-xs">{odc.olt?.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell">
                        <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                          PON {odc.ponPort}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                        <a
                          href={`https://www.google.com/maps?q=${odc.latitude},${odc.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <MapPin className="h-3 w-3" />
                          {odc.latitude.toFixed(6)}, {odc.longitude.toFixed(6)}
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 rounded">
                            {odc.portCount} ports
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                            {odc._count?.odps || 0} ODPs
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${odc.status === 'active'
                              ? 'bg-success/20 text-success dark:bg-green-900/30'
                              : 'bg-destructive/20 text-destructive dark:bg-red-900/30'
                            }`}
                        >
                          {odc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleEdit(odc)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit ODC"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(odc)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Hapus ODC"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingOdc(null); resetForm(); }} size="lg">
          <ModalHeader>
            <ModalTitle>{editingOdc ? 'Edit ODC' : 'Add ODC'}</ModalTitle>
            <ModalDescription>{t('network.configureOdc')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('common.name')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="ODC-01" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel required>{t('network.oltSelectLabel')}</ModalLabel>
                  <ModalSelect value={formData.oltId} onChange={(e) => setFormData({ ...formData, oltId: e.target.value })} required>
                    <option value="" className="bg-[#0a0520]">Select OLT</option>
                    {olts.map(olt => (<option key={olt.id} value={olt.id} className="bg-[#0a0520]">{olt.name}</option>))}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel required>{t('network.ponPort')}</ModalLabel>
                  <ModalInput type="number" value={formData.ponPort} onChange={(e) => setFormData({ ...formData, ponPort: e.target.value })} required min={1} placeholder="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel>{t('network.portCount')}</ModalLabel>
                  <ModalInput type="number" value={formData.portCount} onChange={(e) => setFormData({ ...formData, portCount: e.target.value })} min={1} placeholder="8" />
                </div>
                <div>
                  <ModalLabel>Status</ModalLabel>
                  <ModalSelect value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="active" className="bg-[#0a0520]">Active</option>
                    <option value="inactive" className="bg-[#0a0520]">Inactive</option>
                    <option value="maintenance" className="bg-[#0a0520]">Maintenance</option>
                  </ModalSelect>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <ModalLabel required>GPS Location</ModalLabel>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-[#00f7ff] text-black font-bold rounded shadow-[0_0_10px_rgba(0,247,255,0.3)]">
                      <Map className="h-2.5 w-2.5 mr-1" /> Open Map
                    </button>
                    <button type="button" onClick={() => { if (!navigator.geolocation) { showError(t('common.gpsNotAvailableInBrowser')); return; } navigator.geolocation.getCurrentPosition((p) => { setFormData({ ...formData, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }); showSuccess(t('common.gpsSuccess')); }, (err) => { console.error('GPS Error:', err); if (err.code === 1) { showError(t('common.gpsPermissionDenied')); } else if (err.code === 2) { showError(t('common.gpsNotAvailable')); } else if (err.code === 3) { showError(t('common.gpsTimeout')); } else { showError(t('common.gpsFailedGet')); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-[#00ff88] text-black font-bold rounded shadow-[0_0_10px_rgba(0,255,136,0.3)]">
                      <MapPin className="h-2.5 w-2.5 mr-1" /> Auto GPS
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ModalInput type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} required placeholder="Latitude" />
                  <ModalInput type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} required placeholder="Longitude" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="followRoad" checked={formData.followRoad} onChange={(e) => setFormData({ ...formData, followRoad: e.target.checked })} className="w-3 h-3 rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]" />
                <label htmlFor="followRoad" className="text-xs text-foreground">Follow road path on map</label>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingOdc(null); resetForm(); }}>Cancel</ModalButton>
              <ModalButton type="submit" variant="primary">{editingOdc ? 'Update' : 'Create'}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Map Picker */}
        <MapPicker
          isOpen={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          onSelect={(lat, lng) => {
            setFormData({
              ...formData,
              latitude: lat.toFixed(6),
              longitude: lng.toFixed(6),
            });
          }}
          initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
          initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
        />
      </div>
    </div>
  );
}








