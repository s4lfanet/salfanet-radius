'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus,
  Pencil,
  Trash2,
  Users,
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

interface Technician {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  isActive: boolean;
  requireOtp: boolean;
  createdAt: string;
  lastLoginAt?: string;
  _count?: {
    workOrders: number;
  };
}

export default function TechniciansManagementPage() {
  const { t } = useTranslation();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
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
    loadTechnicians();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterActive]);

  const loadTechnicians = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterActive) params.append('isActive', filterActive);

      const res = await fetch(`/api/admin/technicians?${params}`);
      if (res.ok) {
        setTechnicians(await res.json());
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

  const handleEdit = (technician: Technician) => {
    setEditingTechnician(technician);
    setFormData({
      name: technician.name,
      phoneNumber: technician.phoneNumber,
      email: technician.email || '',
      isActive: technician.isActive,
      requireOtp: technician.requireOtp,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phoneNumber) {
      await showError(t('technician.namePhoneRequired'));
      return;
    }

    try {
      const method = editingTechnician ? 'PUT' : 'POST';
      const payload = editingTechnician
        ? { ...formData, id: editingTechnician.id }
        : formData;

      const res = await fetch('/api/admin/technicians', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(
          editingTechnician
            ? t('technician.technicianUpdated')
            : t('technician.technicianCreated')
        );
        setIsDialogOpen(false);
        setEditingTechnician(null);
        resetForm();
        loadTechnicians();
      } else {
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (technician: Technician) => {
    const confirmed = await showConfirm(
      t('technician.deleteTechnician'),
      t('technician.deleteTechnicianConfirm', { name: technician.name })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/technicians?id=${technician.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('technician.technicianDeleted'));
        loadTechnicians();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const stats = {
    total: technicians.length,
    active: technicians.filter((t) => t.isActive).length,
    inactive: technicians.filter((t) => !t.isActive).length,
  };

  if (loading && technicians.length === 0) {
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
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <Users className="h-6 w-6 text-[#00f7ff]" />
            {t('technician.management')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t('technician.managementDesc')}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">
                  {t('technician.totalTechnicians')}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">
                  {stats.total}
                </p>
              </div>
              <Users className="h-10 w-10 text-[#00f7ff]" />
            </div>
          </div>

          <div className="bg-card rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('technician.activeTechnicians')}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-success">{stats.active}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-success" />
            </div>
          </div>

          <div className="bg-card rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('technician.inactiveTechnicians')}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-muted-foreground">{stats.inactive}</p>
              </div>
              <XCircle className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="bg-card rounded-lg shadow mb-6 p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('technician.searchTechnicians')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary dark:bg-input dark:text-foreground"
              />
            </div>

            {/* Filter and Actions */}
            <div className="flex gap-2">
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm dark:bg-input dark:text-foreground"
              >
                <option value="">{t('technician.allStatus')}</option>
                <option value="true">{t('common.active')}</option>
                <option value="false">{t('common.inactive')}</option>
              </select>

              <button
                onClick={loadTechnicians}
                className="px-3 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>

              <button
                onClick={() => {
                  setEditingTechnician(null);
                  resetForm();
                  setIsDialogOpen(true);
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {t('technician.addTechnician')}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {technicians.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('technician.noTechnicians')}
            </div>
          ) : (
            technicians.map((technician) => (
              <div
                key={technician.id}
                className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3"
              >
                {/* Header: Name + Status */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground truncate mr-2">
                    {technician.name}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                      technician.isActive
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {technician.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
                  <div>
                    <span className="text-muted-foreground">{t('technician.contact')}</span>
                    <div className="flex items-center gap-1 text-foreground mt-0.5">
                      <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{technician.phoneNumber}</span>
                    </div>
                    {technician.email && (
                      <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{technician.email}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('technician.workOrders')}</span>
                    <p className="text-foreground mt-0.5">
                      {technician._count?.workOrders || 0} {t('technician.tasks').toLowerCase()}
                    </p>
                  </div>
                  <div className="col-span-2 mt-1">
                    <span className="text-muted-foreground">{t('technician.lastLogin')}</span>
                    <p className="text-foreground mt-0.5">
                      {technician.lastLoginAt ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatWIB(technician.lastLoginAt, 'dd/MM/yyyy')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 border-t border-[#bc13fe]/10 pt-2">
                  <button
                    onClick={() => handleEdit(technician)}
                    className="flex-1 flex items-center justify-center gap-1.5 p-2 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(technician)}
                    className="flex-1 flex items-center justify-center gap-1.5 p-2 text-xs font-medium text-destructive bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Technicians Table (Desktop) */}
        <div className="hidden md:block bg-card rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('common.name')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('technician.contact')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('technician.workOrders')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('technician.lastLogin')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {technicians.map((technician) => (
                  <tr
                    key={technician.id}
                    className="hover:bg-muted"
                  >
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-foreground">
                        {technician.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-foreground">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {technician.phoneNumber}
                        </div>
                        {technician.email && (
                          <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <Mail className="h-3 w-3" />
                            {technician.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {technician._count?.workOrders || 0} {t('technician.tasks').toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {technician.lastLoginAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatWIB(technician.lastLoginAt, 'dd/MM/yyyy')}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${technician.isActive
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                          }`}
                      >
                        {technician.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(technician)}
                          className="p-1 text-primary hover:text-blue-800 dark:text-primary dark:hover:text-blue-300"
                          title="Edit Teknisi"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(technician)}
                          className="p-1 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                          title="Hapus Teknisi"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {technicians.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {t('technician.noTechnicians')}
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Modal */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingTechnician(null); resetForm(); }} size="md">
          <ModalHeader>
            <ModalTitle>{editingTechnician ? t('technician.editTechnician') : t('technician.addTechnician')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('common.name')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <ModalLabel required>{t('technician.phoneNumber')}</ModalLabel>
                <ModalInput type="tel" value={formData.phoneNumber} onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })} placeholder="08123456789" required />
                <p className="text-[10px] text-muted-foreground mt-1">{t('technician.phoneHelp')}</p>
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
                  <span>{t('technician.requireOtp')}</span>
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground">{t('technician.requireOtpHelp')}</p>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingTechnician(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{t('common.save')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}
