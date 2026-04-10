'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  RefreshCcw,
  Phone,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Search,
} from 'lucide-react';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';
import { formatWIB } from '@/lib/timezone';

interface Coordinator {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  isActive: boolean;
  requireOtp: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export default function CoordinatorsManagementPage() {
  const { t } = useTranslation();
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<Coordinator | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    isActive: true,
    requireOtp: true,
  });

  useEffect(() => {
    loadCoordinators();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterActive]);

  const loadCoordinators = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterActive) params.append('isActive', filterActive);

      const res = await fetch(`/api/admin/coordinators?${params}`);
      if (res.ok) {
        setCoordinators(await res.json());
      }
    } catch (error) {
      await showError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phoneNumber: '',
      email: '',
      isActive: true,
      requireOtp: true,
    });
  };

  const handleEdit = (coordinator: Coordinator) => {
    setEditingCoordinator(coordinator);
    setFormData({
      name: coordinator.name,
      phoneNumber: coordinator.phoneNumber,
      email: coordinator.email || '',
      isActive: coordinator.isActive,
      requireOtp: coordinator.requireOtp,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phoneNumber) {
      await showError(t('coordinator.namePhoneRequired'));
      return;
    }

    try {
      const method = editingCoordinator ? 'PUT' : 'POST';
      const payload = editingCoordinator
        ? { ...formData, id: editingCoordinator.id }
        : formData;

      const res = await fetch('/api/admin/coordinators', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(
          editingCoordinator
            ? t('coordinator.coordinatorUpdated')
            : t('coordinator.coordinatorCreated')
        );
        setIsDialogOpen(false);
        setEditingCoordinator(null);
        resetForm();
        loadCoordinators();
      } else {
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (coordinator: Coordinator) => {
    const confirmed = await showConfirm(
      t('coordinator.deleteCoordinator'),
      t('coordinator.deleteCoordinatorConfirm', { name: coordinator.name })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/coordinators?id=${coordinator.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('coordinator.coordinatorDeleted'));
        loadCoordinators();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const stats = {
    total: coordinators.length,
    active: coordinators.filter((c) => c.isActive).length,
    inactive: coordinators.filter((c) => !c.isActive).length,
  };

  if (loading && coordinators.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#00f7ff]" />
              {t('coordinator.management')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('coordinator.managementDesc')}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">
                  {t('coordinator.totalCoordinators')}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">
                  {stats.total}
                </p>
              </div>
              <UserCheck className="h-6 w-6 text-[#00f7ff]" />
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  {t('coordinator.activeCoordinators')}
                </p>
                <p className="text-lg font-bold text-success">{stats.active}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  {t('coordinator.inactiveCoordinators')}
                </p>
                <p className="text-lg font-bold text-muted-foreground">{stats.inactive}</p>
              </div>
              <XCircle className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-3">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('coordinator.searchCoordinators')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background text-foreground"
              />
            </div>

            {/* Filter and Actions */}
            <div className="flex gap-2">
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="px-2.5 py-1.5 border border-border rounded-lg text-xs bg-background text-foreground"
              >
                <option value="">{t('coordinator.allStatus')}</option>
                <option value="true">{t('common.active')}</option>
                <option value="false">{t('common.inactive')}</option>
              </select>

              <button
                onClick={loadCoordinators}
                className="px-2.5 py-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors text-xs font-medium"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => {
                  setEditingCoordinator(null);
                  resetForm();
                  setIsDialogOpen(true);
                }}
                className="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-xs font-medium flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('coordinator.addCoordinator')}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {coordinators.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-6 text-center text-muted-foreground text-sm">
              {t('coordinator.noCoordinators')}
            </div>
          ) : (
            coordinators.map((coordinator) => (
              <div
                key={coordinator.id}
                className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3"
              >
                {/* Header: Name + Status */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCheck className="h-4 w-4 text-[#00f7ff] shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {coordinator.name}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 ${
                      coordinator.isActive
                        ? 'bg-success/20 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {coordinator.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('coordinator.contact')}</span>
                    <div className="flex items-center gap-1 text-foreground mt-0.5">
                      <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{coordinator.phoneNumber}</span>
                    </div>
                    {coordinator.email && (
                      <div className="flex items-center gap-1 text-muted-foreground text-[10px] mt-0.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{coordinator.email}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('coordinator.lastLogin')}</span>
                    <div className="text-foreground mt-0.5">
                      {coordinator.lastLoginAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          {formatWIB(coordinator.lastLoginAt, 'dd/MM/yyyy')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#bc13fe]/10">
                  <button
                    onClick={() => handleEdit(coordinator)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(coordinator)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Coordinators Table (Desktop) */}
        <div className="hidden md:block bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('common.name')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('coordinator.contact')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('coordinator.lastLogin')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coordinators.map((coordinator) => (
                  <tr
                    key={coordinator.id}
                    className="hover:bg-muted"
                  >
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">
                        {coordinator.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1 text-foreground">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {coordinator.phoneNumber}
                        </div>
                        {coordinator.email && (
                          <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                            <Mail className="h-3 w-3" />
                            {coordinator.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {coordinator.lastLoginAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatWIB(coordinator.lastLoginAt, 'dd/MM/yyyy')}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${coordinator.isActive
                            ? 'bg-success/20 text-success'
                            : 'bg-muted text-muted-foreground'
                          }`}
                      >
                        {coordinator.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(coordinator)}
                          className="p-0.5 text-primary hover:text-blue-800 dark:text-primary dark:hover:text-blue-300"
                          title="Edit Koordinator"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(coordinator)}
                          className="p-0.5 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                          title="Hapus Koordinator"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {coordinators.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('coordinator.noCoordinators')}
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingCoordinator(null); resetForm(); }} size="md">
          <ModalHeader>
            <ModalTitle>{editingCoordinator ? t('coordinator.editCoordinator') : t('coordinator.addCoordinator')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('common.name')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <ModalLabel required>{t('coordinator.phoneNumber')}</ModalLabel>
                <ModalInput type="tel" value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })} placeholder="08123456789" required />
                <p className="text-[10px] text-muted-foreground mt-1">{t('coordinator.phoneHelp')}</p>
              </div>
              <div>
                <ModalLabel>{t('common.email')}</ModalLabel>
                <ModalInput type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff] w-4 h-4" />
                  <span>{t('common.active')}</span>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.requireOtp} onChange={(e) => setFormData({ ...formData, requireOtp: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff] w-4 h-4" />
                  <span>{t('coordinator.requireOtp')}</span>
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground">{t('coordinator.requireOtpHelp')}</p>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingCoordinator(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{t('common.save')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}
