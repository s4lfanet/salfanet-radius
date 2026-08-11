'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus,
  Pencil,
  Trash2,
  Truck,
  RefreshCcw,
  Phone,
  Mail,
  MapPin,
  User,
} from 'lucide-react';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  _count?: {
    items: number;
  };
}

export default function SuppliersPage() {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    isActive: true,
  });

  useEffect(() => {
    loadSuppliers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/suppliers');
      if (res.ok) {
        setSuppliers(await res.json());
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
      contactName: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      isActive: true,
    });
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
      isActive: supplier.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      await showError(t('inventory.supplierNameRequired'));
      return;
    }

    try {
      const method = editingSupplier ? 'PUT' : 'POST';
      const payload = editingSupplier
        ? { ...formData, id: editingSupplier.id }
        : formData;

      const res = await fetch('/api/inventory/suppliers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok) {
        await showSuccess(
          editingSupplier
            ? t('inventory.supplierUpdated')
            : t('inventory.supplierCreated')
        );
        setIsDialogOpen(false);
        setEditingSupplier(null);
        resetForm();
        loadSuppliers();
      } else {
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    const confirmed = await showConfirm(
      t('inventory.deleteSupplier'),
      t('inventory.deleteSupplierConfirm', { name: supplier.name })
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/inventory/suppliers?id=${supplier.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await showSuccess(t('inventory.supplierDeleted'));
        loadSuppliers();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.error'));
      }
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="w-12 h-12 border-4 border-brand-500 dark:border-[#00f7ff] border-t-transparent rounded-full animate-spin dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10"></div>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Truck className="h-6 w-6 text-[#00f7ff]" />
              {t('inventory.suppliers')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('inventory.suppliersDesc')}
            </p>
          </div>

          {/* Actions Bar */}
          <div className="bg-card rounded-lg shadow mb-6 p-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {t('inventory.total')}: {suppliers.length} {t('inventory.suppliers').toLowerCase()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadSuppliers}
                  className="px-3 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted transition-colors text-sm font-medium"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingSupplier(null);
                    resetForm();
                    setIsDialogOpen(true);
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t('inventory.addSupplier')}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-3">
            {suppliers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">{t('inventory.noSuppliers')}</div>
            ) : (
              suppliers.map((supplier) => (
                <div key={supplier.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{supplier.name}</p>
                      {supplier.address && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{supplier.address}</span>
                        </div>
                      )}
                    </div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ml-2 shrink-0 ${
                      supplier.isActive ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {supplier.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                    {supplier.contactName && (
                      <div className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground shrink-0" /> <span className="text-foreground truncate">{supplier.contactName}</span></div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground shrink-0" /> <span className="text-foreground">{supplier.phone}</span></div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-1 col-span-2"><Mail className="h-3 w-3 text-muted-foreground shrink-0" /> <span className="text-foreground truncate">{supplier.email}</span></div>
                    )}
                    <div><span className="text-muted-foreground">{t('inventory.items')}:</span> <span className="text-foreground">{supplier._count?.items || 0}</span></div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <button onClick={() => handleEdit(supplier)} className="p-2 text-primary hover:text-primary/80 dark:text-violet-200 dark:hover:text-violet-100" title="Edit Supplier">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(supplier)} className="p-2 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300" title="Hapus Supplier">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Suppliers Table */}
          <div className="hidden md:block bg-card rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.name')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('inventory.contact')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.phone')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.email')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('inventory.items')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-muted">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {supplier.name}
                        </div>
                        {supplier.address && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            {supplier.address}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {supplier.contactName && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {supplier.contactName}
                          </div>
                        )}
                        {!supplier.contactName && '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {supplier.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {supplier.phone}
                          </div>
                        )}
                        {!supplier.phone && '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {supplier.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {supplier.email}
                          </div>
                        )}
                        {!supplier.email && '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {supplier._count?.items || 0}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${supplier.isActive
                              ? 'bg-success/20 text-success'
                              : 'bg-muted text-muted-foreground'
                            }`}
                        >
                          {supplier.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(supplier)}
                            className="p-1 text-primary hover:text-primary/80 dark:text-violet-200 dark:hover:text-violet-100"
                            title="Edit Supplier"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(supplier)}
                            className="p-1 text-destructive hover:text-red-800 dark:text-destructive dark:hover:text-red-300"
                            title="Hapus Supplier"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {suppliers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  {t('inventory.noSuppliers')}
                </div>
              )}
            </div>
          </div>

          {/* Add/Edit Modal */}
          <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingSupplier(null); resetForm(); }} size="lg">
            <ModalHeader>
              <ModalTitle>{editingSupplier ? t('inventory.editSupplier') : t('inventory.addSupplier')}</ModalTitle>
            </ModalHeader>
            <form onSubmit={handleSubmit}>
              <ModalBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <ModalLabel required>{t('inventory.supplierName')}</ModalLabel>
                    <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div>
                    <ModalLabel>{t('inventory.contactName')}</ModalLabel>
                    <ModalInput type="text" value={formData.contactName} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} />
                  </div>
                  <div>
                    <ModalLabel>{t('common.phone')}</ModalLabel>
                    <ModalInput type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <ModalLabel>{t('common.email')}</ModalLabel>
                    <ModalInput type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <ModalLabel>{t('common.address')}</ModalLabel>
                    <ModalTextarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
                  </div>
                  <div className="md:col-span-2">
                    <ModalLabel>{t('inventory.notes')}</ModalLabel>
                    <ModalTextarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-[#bc13fe]/50 bg-background dark:bg-[#0a0520] accent-brand-500 dark:accent-[#00f7ff] w-4 h-4" />
                      <span>{t('common.active')}</span>
                    </label>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingSupplier(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
                <ModalButton type="submit" variant="primary">{editingSupplier ? t('common.update') : t('common.create')}</ModalButton>
              </ModalFooter>
            </form>
          </SimpleModal>
        </div>
      </div>
    </div>
  );
}
