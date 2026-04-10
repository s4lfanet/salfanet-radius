'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, MapPin, Users, Search, X, Loader2 } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface Area {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function AreasPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<Area[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [deleteAreaId, setDeleteAreaId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch('/api/pppoe/areas');
      const data = await res.json();
      setAreas(data.areas || []);
    } catch (error) {
      console.error('Load areas error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingArea ? 'PUT' : 'POST';
      const payload = { ...formData, ...(editingArea && { id: editingArea.id }) };

      const res = await fetch('/api/pppoe/areas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok) {
        setIsDialogOpen(false);
        setEditingArea(null);
        resetForm();
        loadData();
        await showSuccess(editingArea ? t('common.areaUpdated') : t('common.areaCreated'));
      } else {
        await showError(result.error || t('common.failed'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      await showError(t('common.failedSaveArea'));
    }
  };

  const handleEdit = (area: Area) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      description: area.description || '',
      isActive: area.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteAreaId) return;
    const confirmed = await showConfirm(t('common.deleteAreaConfirm'));
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/pppoe/areas?id=${deleteAreaId}`, { method: 'DELETE' });
      const result = await res.json();

      if (res.ok) {
        await showSuccess(t('common.areaDeleted'));
        loadData();
      } else {
        await showError(result.error || t('common.failedDeleteArea'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      await showError(t('common.failedDeleteArea'));
    } finally {
      setDeleteAreaId(null);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', isActive: true });
  };

  const filteredAreas = areas.filter((area) => {
    const matchesSearch =
      searchQuery === '' ||
      area.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (area.description && area.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  const totalUsers = areas.reduce((sum, area) => sum + area.userCount, 0);
  const activeAreas = areas.filter((a) => a.isActive).length;

  const canView = hasPermission('customers.view');
  const canCreate = hasPermission('customers.create');

  if (!permLoading && !canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-1">{t('pppoe.accessDenied')}</h2>
        <p className="text-xs text-muted-foreground">{t('pppoe.noPermission')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]"><div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div><div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div></div><MapPin className="w-12 h-12 text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10 animate-pulse" /></div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('pppoe.areasTitle')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('pppoe.areasSubtitle')}
            </p>
          </div>
          <div className="flex gap-1.5">
            {canCreate && (
              <button
                onClick={() => {
                  resetForm();
                  setEditingArea(null);
                  setIsDialogOpen(true);
                }}
                className="inline-flex items-center px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded"
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('pppoe.addArea')}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('pppoe.totalArea')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{areas.length}</p>
              </div>
              <MapPin className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('pppoe.activeArea')}</p>
                <p className="text-base font-bold text-success">{activeAreas}</p>
              </div>
              <MapPin className="h-5 w-5 text-success" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t('pppoe.totalCustomers')}</p>
                <p className="text-base font-bold text-primary">{totalUsers}</p>
              </div>
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('pppoe.searchArea')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-7 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            {t('pppoe.showing')} {filteredAreas.length} {t('pppoe.of')} {areas.length} {t('pppoe.area')}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filteredAreas.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-6 text-center text-muted-foreground text-xs">
              {areas.length === 0 ? t('pppoe.noArea') : t('pppoe.noMatchArea')}
            </div>
          ) : (
            filteredAreas.map((area) => (
              <div key={area.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium text-sm text-foreground">{area.name}</span>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${area.isActive ? 'bg-success/20 text-success' : 'bg-gray-100 text-muted-foreground dark:bg-input'}`}>
                    {area.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><span className="text-muted-foreground">{t('common.description')}:</span><p className="font-medium">{area.description || '-'}</p></div>
                  <div>
                    <span className="text-muted-foreground">{t('pppoe.customer')}:</span>
                    <p className="mt-0.5"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/20 text-primary"><Users className="h-2.5 w-2.5 mr-1" />{area.userCount}</span></p>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button onClick={() => handleEdit(area)} className="p-2 text-muted-foreground hover:bg-muted rounded" title="Edit Area"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDeleteAreaId(area.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Hapus Area"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Areas Table */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b dark:border-gray-800">
            <span className="text-xs font-medium">{t('pppoe.areaList')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">
                    {t('pppoe.areaName')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">
                    {t('common.description')}
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-muted-foreground uppercase">
                    {t('pppoe.customer')}
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-muted-foreground uppercase">
                    {t('common.status')}
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredAreas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {areas.length === 0 ? t('pppoe.noArea') : t('pppoe.noMatchArea')}
                    </td>
                  </tr>
                ) : (
                  filteredAreas.map((area) => (
                    <tr key={area.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium text-xs">{area.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {area.description || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/20 text-primary">
                          <Users className="h-2.5 w-2.5 mr-1" />
                          {area.userCount}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${area.isActive
                              ? 'bg-success/20 text-success dark:bg-green-900/30'
                              : 'bg-gray-100 text-muted-foreground dark:bg-input'
                            }`}
                        >
                          {area.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-0.5">
                          <button
                            onClick={() => handleEdit(area)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit Area"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeleteAreaId(area.id)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Hapus Area"
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
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingArea(null); resetForm(); }} size="md">
          <ModalHeader>
            <ModalTitle>{editingArea ? t('pppoe.editArea') : t('pppoe.addArea')}</ModalTitle>
            <ModalDescription>{editingArea ? t('pppoe.updateArea') : t('pppoe.createArea')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('pppoe.areaName')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder={t('pppoe.areaExample')} />
              </div>
              <div>
                <ModalLabel>{t('common.description')}</ModalLabel>
                <ModalTextarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t('pppoe.descriptionOptional')} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff] w-4 h-4" />
                <label htmlFor="isActive" className="text-xs sm:text-sm text-foreground">{t('pppoe.areaActive')}</label>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingArea(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingArea ? t('common.save') : t('common.create')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Delete Dialog */}
        <SimpleModal isOpen={!!deleteAreaId} onClose={() => setDeleteAreaId(null)} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#ff4466]/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('pppoe.deleteArea')}</h2>
            <p className="text-xs text-muted-foreground">{t('pppoe.deleteAreaConfirm')}</p>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setDeleteAreaId(null)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleDelete}>{t('common.delete')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  );
}
