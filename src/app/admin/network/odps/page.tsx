'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, Server, MapPin, Map, X, RefreshCcw,
  Activity, Box, Users, HardDrive, Link as LinkIcon,
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

interface ODP {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  followRoad: boolean;
  odcId: string | null;
  oltId: string;
  ponPort: number;
  portCount: number;
  parentOdpId: string | null;
  createdAt: string;
  olt: {
    name: string;
    ipAddress: string;
  };
  odc: {
    name: string;
  } | null;
  parentOdp: {
    name: string;
  } | null;
  _count: {
    childOdps: number;
  };
}

interface OLT {
  id: string;
  name: string;
  ipAddress: string;
}

interface ODC {
  id: string;
  name: string;
  oltId: string;
}

export default function ODPsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [odps, setOdps] = useState<ODP[]>([]);
  const [olts, setOlts] = useState<OLT[]>([]);
  const [odcs, setOdcs] = useState<ODC[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOdp, setEditingOdp] = useState<ODP | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [filterOlt, setFilterOlt] = useState('');
  const [filterOdc, setFilterOdc] = useState('');
  const [connectionType, setConnectionType] = useState<'odc' | 'odp'>('odc');

  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    oltId: '',
    ponPort: '',
    portCount: '8',
    odcId: '',
    parentOdpId: '',
    status: 'active',
    followRoad: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [odpsRes, oltsRes, odcsRes] = await Promise.all([
        fetch('/api/network/odps'),
        fetch('/api/network/olts'),
        fetch('/api/network/odcs'),
      ]);
      const [odpsData, oltsData, odcsData] = await Promise.all([
        odpsRes.json(),
        oltsRes.json(),
        odcsRes.json(),
      ]);
      setOdps(odpsData.odps || []);
      setOlts(oltsData.olts || []);
      setOdcs(odcsData.odcs || []);
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
      odcId: '',
      parentOdpId: '',
      status: 'active',
      followRoad: false,
    });
    setConnectionType('odc');
  };

  const handleEdit = (odp: ODP) => {
    setEditingOdp(odp);
    setFormData({
      name: odp.name,
      latitude: odp.latitude.toString(),
      longitude: odp.longitude.toString(),
      oltId: odp.oltId,
      ponPort: odp.ponPort.toString(),
      portCount: odp.portCount.toString(),
      odcId: odp.odcId || '',
      parentOdpId: odp.parentOdpId || '',
      status: odp.status,
      followRoad: odp.followRoad,
    });
    setConnectionType(odp.parentOdpId ? 'odp' : 'odc');
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingOdp ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        odcId: connectionType === 'odc' ? formData.odcId : null,
        parentOdpId: connectionType === 'odp' ? formData.parentOdpId : null,
        ...(editingOdp && { id: editingOdp.id }),
      };

      const res = await fetch('/api/network/odps', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        await showSuccess(editingOdp ? 'ODP updated!' : 'ODP created!');
        setIsDialogOpen(false);
        setEditingOdp(null);
        resetForm();
        loadData();
      } else {
        await showError(result.error || t('common.failedSaveOdp'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      await showError(t('common.failedSaveOdp'));
    }
  };

  const handleDelete = async (odp: ODP) => {
    const confirmed = await showConfirm(
      'Delete ODP',
      `Are you sure you want to delete "${odp.name}"? This will also delete all child ODPs and customer assignments.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/network/odps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: odp.id }),
      });

      const result = await res.json();
      if (result.success) {
        await showSuccess(t('common.odpDeleted'));
        loadData();
      } else {
        await showError(result.error || t('common.failedDeleteOdp'));
      }
    } catch (error) {
      await showError(t('common.failedDeleteOdp'));
    }
  };

  const filteredOdps = odps.filter(odp => {
    if (filterOlt && odp.oltId !== filterOlt) return false;
    if (filterOdc && odp.odcId !== filterOdc) return false;
    return true;
  });

  // Filter ODCs by selected OLT
  const filteredOdcs = formData.oltId
    ? odcs.filter(odc => odc.oltId === formData.oltId)
    : odcs;

  // Filter parent ODPs by selected OLT
  const filteredParentOdps = formData.oltId
    ? odps.filter(odp => odp.oltId === formData.oltId && odp.id !== editingOdp?.id)
    : [];

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
              <Box className="h-6 w-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
              ODP Management
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Manage Optical Distribution Points (ODP) for FTTH network
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingOdp(null); setIsDialogOpen(true); }}
            className="inline-flex items-center px-4 py-2.5 text-sm font-bold bg-[#00f7ff] text-black rounded-lg hover:bg-[#00f7ff]/90 transition-all shadow-[0_0_20px_rgba(0,247,255,0.4)] uppercase tracking-wide"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('network.addOdp')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('network.totalOdps')}</p>
                <p className="text-base font-bold text-primary">{odps.length}</p>
              </div>
              <Box className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('network.active')}</p>
                <p className="text-base font-bold text-success">
                  {odps.filter(o => o.status === 'active').length}
                </p>
              </div>
              <Activity className="h-5 w-5 text-success" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('network.totalPorts')}</p>
                <p className="text-base font-bold text-accent">
                  {odps.reduce((sum, o) => sum + o.portCount, 0)}
                </p>
              </div>
              <LinkIcon className="h-5 w-5 text-accent" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('network.withChildren')}</p>
                <p className="text-base font-bold text-orange-600">
                  {odps.filter(o => (o._count?.childOdps || 0) > 0).length}
                </p>
              </div>
              <Users className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-medium text-muted-foreground">OLT:</label>
              <select
                value={filterOlt}
                onChange={(e) => { setFilterOlt(e.target.value); setFilterOdc(''); }}
                className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-input"
              >
                <option value="">{t('network.allOlts')}</option>
                {olts.map(olt => (
                  <option key={olt.id} value={olt.id}>{olt.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-medium text-muted-foreground">ODC:</label>
              <select
                value={filterOdc}
                onChange={(e) => setFilterOdc(e.target.value)}
                className="px-2 py-1 text-xs border dark:border-gray-700 rounded dark:bg-input"
              >
                <option value="">{t('network.allOdcs')}</option>
                {(filterOlt ? odcs.filter(o => o.oltId === filterOlt) : odcs).map(odc => (
                  <option key={odc.id} value={odc.id}>{odc.name}</option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Showing {filteredOdps.length} of {odps.length} ODPs
            </span>
            {(filterOlt || filterOdc) && (
              <button
                onClick={() => { setFilterOlt(''); setFilterOdc(''); }}
                className="text-[10px] text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filteredOdps.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-4 text-center text-muted-foreground text-xs">
              No ODPs found. Click &quot;Add ODP&quot; to create one.
            </div>
          ) : (
            filteredOdps.map((odp) => (
              <div key={odp.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{odp.name}</span>
                    {(odp._count?.childOdps || 0) > 0 && (
                      <span className="px-1 py-0.5 text-[9px] bg-orange-100 text-orange-700 rounded">
                        {odp._count.childOdps} children
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${odp.status === 'active'
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {odp.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground text-[10px]">Connection</span>
                    <div className="space-y-0.5 mt-0.5">
                      <div className="flex items-center gap-1">
                        <Server className="h-3 w-3 text-primary" />
                        <span className="text-[10px]">{odp.olt?.name}</span>
                      </div>
                      {odp.odc && (
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3 text-orange-600" />
                          <span className="text-[10px] text-muted-foreground">{odp.odc.name}</span>
                        </div>
                      )}
                      {odp.parentOdp && (
                        <div className="flex items-center gap-1">
                          <Box className="h-3 w-3 text-primary" />
                          <span className="text-[10px] text-muted-foreground">{odp.parentOdp.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">PON Port</span>
                    <p className="mt-0.5">
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                        PON {odp.ponPort}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Ports</span>
                    <p className="mt-0.5">
                      <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                        {odp.portCount} ports
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Location</span>
                    <a
                      href={`https://www.google.com/maps?q=${odp.latitude},${odp.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline text-[10px] mt-0.5"
                    >
                      <MapPin className="h-3 w-3" />
                      View
                    </a>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button
                    onClick={() => handleEdit(odp)}
                    className="p-2 text-muted-foreground hover:bg-muted rounded"
                    title="Edit ODP"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(odp)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded"
                    title="Hapus ODP"
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
            <span className="text-xs font-medium">ODP List</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Name</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Connection</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">PON</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Location</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Ports</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOdps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      No ODPs found. Click "Add ODP" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredOdps.map((odp) => (
                    <tr key={odp.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-primary" />
                          <div>
                            <span className="text-xs font-medium">{odp.name}</span>
                            {(odp._count?.childOdps || 0) > 0 && (
                              <span className="ml-1 px-1 py-0.5 text-[9px] bg-orange-100 text-orange-700 rounded">
                                {odp._count.childOdps} children
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Server className="h-3 w-3 text-primary" />
                            <span className="text-[10px]">{odp.olt?.name}</span>
                          </div>
                          {odp.odc && (
                            <div className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3 text-orange-600" />
                              <span className="text-[10px] text-muted-foreground">{odp.odc.name}</span>
                            </div>
                          )}
                          {odp.parentOdp && (
                            <div className="flex items-center gap-1">
                              <Box className="h-3 w-3 text-primary" />
                              <span className="text-[10px] text-muted-foreground">{odp.parentOdp.name}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell">
                        <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                          PON {odp.ponPort}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                        <a
                          href={`https://www.google.com/maps?q=${odp.latitude},${odp.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <MapPin className="h-3 w-3" />
                          View
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                          {odp.portCount} ports
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${odp.status === 'active'
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                            }`}
                        >
                          {odp.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleEdit(odp)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit ODP"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(odp)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Hapus ODP"
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
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingOdp(null); resetForm(); }} size="lg">
          <ModalHeader>
            <ModalTitle>{editingOdp ? t('network.editOdp') : t('network.addOdp')}</ModalTitle>
            <ModalDescription>{t('network.configureOdp')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('common.name')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder={t('network.odpNamePlaceholder')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel required>{t('olt.title')}</ModalLabel>
                  <ModalSelect value={formData.oltId} onChange={(e) => setFormData({ ...formData, oltId: e.target.value, odcId: '', parentOdpId: '' })} required>
                    <option value="" className="bg-[#0a0520]">{t('network.selectOlt')}</option>
                    {olts.map(olt => (<option key={olt.id} value={olt.id} className="bg-[#0a0520]">{olt.name}</option>))}
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel required>{t('network.ponPort')}</ModalLabel>
                  <ModalInput type="number" value={formData.ponPort} onChange={(e) => setFormData({ ...formData, ponPort: e.target.value })} required min={1} placeholder={t('network.ponPortPlaceholder')} />
                </div>
              </div>
              <div>
                <ModalLabel required>{t('network.connectTo')}</ModalLabel>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setConnectionType('odc')} className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all ${connectionType === 'odc' ? 'bg-[#ff8c00]/20 border-[#ff8c00] text-[#ff8c00] shadow-[0_0_10px_rgba(255,140,0,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#bc13fe]/50'}`}>
                    <HardDrive className="h-3 w-3 inline mr-1" /> {t('network.odcCabinet')}
                  </button>
                  <button type="button" onClick={() => setConnectionType('odp')} className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-all ${connectionType === 'odp' ? 'bg-[#00f7ff]/20 border-[#00f7ff] text-[#00f7ff] shadow-[0_0_10px_rgba(0,247,255,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#bc13fe]/50'}`}>
                    <Box className="h-3 w-3 inline mr-1" /> {t('network.parentOdp')}
                  </button>
                </div>
                {connectionType === 'odc' ? (
                  <ModalSelect value={formData.odcId} onChange={(e) => setFormData({ ...formData, odcId: e.target.value })} required={connectionType === 'odc'}>
                    <option value="" className="bg-[#0a0520]">{t('network.selectOdc')}</option>
                    {filteredOdcs.map(odc => (<option key={odc.id} value={odc.id} className="bg-[#0a0520]">{odc.name}</option>))}
                  </ModalSelect>
                ) : (
                  <ModalSelect value={formData.parentOdpId} onChange={(e) => setFormData({ ...formData, parentOdpId: e.target.value })} required={connectionType === 'odp'}>
                    <option value="" className="bg-[#0a0520]">{t('network.selectParentOdp')}</option>
                    {filteredParentOdps.map(odp => (<option key={odp.id} value={odp.id} className="bg-[#0a0520]">{odp.name}</option>))}
                  </ModalSelect>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel>{t('network.portCount')}</ModalLabel>
                  <ModalInput type="number" value={formData.portCount} onChange={(e) => setFormData({ ...formData, portCount: e.target.value })} min={1} placeholder={t('network.portCountPlaceholder')} />
                </div>
                <div>
                  <ModalLabel>{t('common.status')}</ModalLabel>
                  <ModalSelect value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="active" className="bg-[#0a0520]">{t('network.active')}</option>
                    <option value="inactive" className="bg-[#0a0520]">{t('network.inactive')}</option>
                    <option value="maintenance" className="bg-[#0a0520]">{t('network.maintenance')}</option>
                  </ModalSelect>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <ModalLabel required>{t('network.gpsLocation')}</ModalLabel>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-[#00f7ff] text-black font-bold rounded shadow-[0_0_10px_rgba(0,247,255,0.3)]">
                      <Map className="h-2.5 w-2.5 mr-1" /> {t('network.openMap')}
                    </button>
                    <button type="button" onClick={() => { if (!navigator.geolocation) { showError(t('common.gpsNotAvailableInBrowser')); return; } navigator.geolocation.getCurrentPosition((p) => { setFormData({ ...formData, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }); showSuccess(t('common.gpsSuccess')); }, (err) => { console.error('GPS Error:', err); if (err.code === 1) { showError(t('common.gpsPermissionDenied')); } else if (err.code === 2) { showError(t('common.gpsNotAvailable')); } else if (err.code === 3) { showError(t('common.gpsTimeout')); } else { showError(t('common.gpsFailedGet')); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-[#00ff88] text-black font-bold rounded shadow-[0_0_10px_rgba(0,255,136,0.3)]">
                      <MapPin className="h-2.5 w-2.5 mr-1" /> {t('network.autoGps')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ModalInput type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} required placeholder={t('network.latitude')} />
                  <ModalInput type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} required placeholder={t('network.longitude')} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="followRoad" checked={formData.followRoad} onChange={(e) => setFormData({ ...formData, followRoad: e.target.checked })} className="w-3 h-3 rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]" />
                <label htmlFor="followRoad" className="text-xs text-foreground">{t('network.followRoadPath')}</label>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingOdp(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingOdp ? t('network.update') : t('network.create')}</ModalButton>
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
