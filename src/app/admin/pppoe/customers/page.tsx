'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import {
  Plus, Pencil, Trash2, Search, X, Eye, Users, Phone, Mail, MapPin,
  User, CreditCard, CheckCircle2, XCircle, UserPlus, Loader2, Download, Upload,
  Calendar, RefreshCw,
} from 'lucide-react';
import {
  SimpleModal, ModalHeader, ModalTitle, ModalDescription, ModalBody,
  ModalFooter, ModalInput, ModalSelect, ModalTextarea, ModalLabel, ModalButton,
} from '@/components/cyberpunk';

interface Customer {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  idCardNumber: string | null;
  idCardPhoto: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { pppoeUsers: number };
  pppoeUsers?: { id: string; username: string; status: string; profile: { name: string } }[];
}

function generateCustomerId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function PppoeCustomersPage() {
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', address: '', idCardNumber: '', customerId: '',
  });

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/pppoe/customers?${params}`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) { console.error('Load customers error:', error); }
    finally { setLoading(false); }
  }, [searchQuery, filterStatus]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', address: '', idCardNumber: '', customerId: generateCustomerId() });
  };

  const openAdd = () => { resetForm(); setIsAddOpen(true); };
  const openEdit = (c: Customer) => {
    setSelectedCustomer(c);
    setFormData({ name: c.name, phone: c.phone, email: c.email || '', address: c.address || '', idCardNumber: c.idCardNumber || '', customerId: c.customerId });
    setIsEditOpen(true);
  };
  const openDetail = async (c: Customer) => {
    try {
      const res = await fetch(`/api/pppoe/customers?id=${c.id}`);
      const data = await res.json();
      setSelectedCustomer(data.customer || c);
    } catch { setSelectedCustomer(c); }
    setIsDetailOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/pppoe/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setIsAddOpen(false);
        loadCustomers();
        await showSuccess('Customer berhasil ditambahkan');
      } else {
        await showError(data.error || 'Gagal menambahkan customer');
      }
    } catch { await showError('Gagal menambahkan customer'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pppoe/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCustomer.id, ...formData }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsEditOpen(false);
        loadCustomers();
        await showSuccess('Customer berhasil diperbarui');
      } else {
        await showError(data.error || 'Gagal memperbarui customer');
      }
    } catch { await showError('Gagal memperbarui customer'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c: Customer) => {
    const confirmed = await showConfirm(
      `Hapus customer "${c.name}"? Tindakan ini tidak dapat dibatalkan.`,
      'Hapus Customer'
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/pppoe/customers?id=${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { loadCustomers(); await showSuccess('Customer berhasil dihapus'); }
      else { await showError(data.error || 'Gagal menghapus customer'); }
    } catch { await showError('Gagal menghapus customer'); }
  };

  const handleToggleStatus = async (c: Customer) => {
    try {
      const res = await fetch('/api/pppoe/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      if (res.ok) { loadCustomers(); }
      else { await showError('Gagal mengubah status'); }
    } catch { await showError('Gagal mengubah status'); }
  };

  const canCreate = hasPermission('customers.edit');
  const canDelete = hasPermission('customers.edit');

  const CustomerForm = ({ onSubmit, isEdit = false }: { onSubmit: (e: React.FormEvent) => void; isEdit?: boolean }) => (
    <form onSubmit={onSubmit}>
      <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <ModalLabel required>Nama Lengkap</ModalLabel>
            <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nama lengkap customer" required />
          </div>
          <div>
            <ModalLabel required>No. HP / WhatsApp</ModalLabel>
            <ModalInput type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="08xxxxxxxxxx" required />
          </div>
          <div>
            <ModalLabel>Email</ModalLabel>
            <ModalInput type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@contoh.com" />
          </div>
        </div>
        <div>
          <ModalLabel>Alamat</ModalLabel>
          <ModalTextarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Alamat lengkap customer..." rows={3} />
        </div>
        <div>
          <ModalLabel>No. KTP</ModalLabel>
          <ModalInput type="text" value={formData.idCardNumber} onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value })} placeholder="16 digit NIK KTP" maxLength={16} />
        </div>
        <div>
          <ModalLabel>ID Customer</ModalLabel>
          <div className="flex gap-2">
            <ModalInput type="text" value={formData.customerId} onChange={(e) => setFormData({ ...formData, customerId: e.target.value })} placeholder="8 digit ID" maxLength={10} className="flex-1" />
            {!isEdit && (
              <button type="button" onClick={() => setFormData({ ...formData, customerId: generateCustomerId() })} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">ID unik customer, akan di-generate otomatis jika kosong</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <ModalButton type="button" variant="secondary" onClick={() => { setIsAddOpen(false); setIsEditOpen(false); }}>Batal</ModalButton>
        <ModalButton type="submit" variant="primary" disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {isEdit ? 'Simpan' : 'Tambah Customer'}
        </ModalButton>
      </ModalFooter>
    </form>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
            Data Pelanggan
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Data pelanggan utama. 1 customer dapat memiliki beberapa langganan PPPoE.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {canCreate && (
            <button onClick={openAdd} className="inline-flex items-center px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded">
              <Plus className="h-3 w-3 mr-1" /> Tambah Customer
            </button>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="bg-card rounded-lg border border-border p-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nama, no. HP, email, ID customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-7 py-1.5 text-xs border border-border rounded bg-muted"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Status:</span>
          {['', 'active', 'inactive'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition ${filterStatus === s ? (s === '' ? 'bg-teal-600 text-white' : s === 'active' ? 'bg-success text-white' : 'bg-destructive text-white') : 'bg-muted text-muted-foreground'}`}
            >
              {s === '' ? 'Semua' : s === 'active' ? 'Aktif' : 'Tidak Aktif'}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">{customers.length} customer</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Belum ada data customer</p>
            {canCreate && (
              <button onClick={openAdd} className="inline-flex items-center px-3 py-1.5 text-xs bg-primary text-white rounded">
                <Plus className="h-3 w-3 mr-1" /> Tambah Customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Customer</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Kontak</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">Alamat</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Langganan</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    {/* Customer */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{c.name}</p>
                          <p className="text-[10px] text-[#00f7ff] font-mono">{c.customerId}</p>
                        </div>
                      </div>
                    </td>
                    {/* Kontak */}
                    <td className="px-3 py-2 hidden md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs flex items-center gap-1"><Phone className="h-2.5 w-2.5 text-muted-foreground" />{c.phone}</span>
                        {c.email && <span className="text-[10px] text-[#00f7ff] flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{c.email}</span>}
                      </div>
                    </td>
                    {/* Alamat */}
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <p className="text-xs text-muted-foreground max-w-[180px] truncate">{c.address || '-'}</p>
                    </td>
                    {/* Langganan */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {c._count?.pppoeUsers ?? 0} PPPoE
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2">
                      <span
                        onClick={() => handleToggleStatus(c)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${c.isActive ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}
                      >
                        {c.isActive ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Aktif</> : <><XCircle className="h-2.5 w-2.5 mr-0.5" />Nonaktif</>}
                      </span>
                    </td>
                    {/* Aksi */}
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openDetail(c)}
                          title="Lihat detail"
                          className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canCreate && (
                          <button
                            onClick={() => openEdit(c)}
                            title="Edit customer"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/admin/pppoe/users?pppoeCustomerId=${c.id}`)}
                          title="Lihat langganan PPPoE"
                          className="p-1.5 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(c)}
                            title="Hapus customer"
                            className="p-1.5 text-destructive hover:bg-destructive/10 rounded"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <SimpleModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} size="md">
        <ModalHeader>
          <ModalTitle>Tambah Customer</ModalTitle>
          <ModalDescription>Tambah data pelanggan baru</ModalDescription>
        </ModalHeader>
        <CustomerForm onSubmit={handleCreate} />
      </SimpleModal>

      {/* Edit Modal */}
      <SimpleModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} size="md">
        <ModalHeader>
          <ModalTitle>Edit Customer</ModalTitle>
          <ModalDescription>{selectedCustomer?.name}</ModalDescription>
        </ModalHeader>
        <CustomerForm onSubmit={handleUpdate} isEdit />
      </SimpleModal>

      {/* Detail Modal */}
      <SimpleModal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} size="md">
        <ModalHeader>
          <ModalTitle>📋 Detail Customer</ModalTitle>
          <ModalDescription>{selectedCustomer?.customerId}</ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {selectedCustomer && (
            <>
              {/* Informasi Dasar */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">Informasi Dasar</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Nama Lengkap</span>
                    <span className="font-medium">{selectedCustomer.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">ID Customer</span>
                    <span className="font-mono text-[#00f7ff]">{selectedCustomer.customerId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">No. HP / WhatsApp</span>
                    <span>{selectedCustomer.phone}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Email</span>
                    <span>{selectedCustomer.email || '-'}</span>
                  </div>
                </div>
                {selectedCustomer.address && (
                  <div className="text-xs">
                    <span className="text-muted-foreground block">Alamat</span>
                    <span>{selectedCustomer.address}</span>
                  </div>
                )}
              </div>

              {/* Informasi KTP */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">Informasi KTP</h3>
                <div className="text-xs">
                  <span className="text-muted-foreground block">Nomor KTP</span>
                  <span>{selectedCustomer.idCardNumber || '-'}</span>
                </div>
                {selectedCustomer.idCardPhoto ? (
                  <img src={selectedCustomer.idCardPhoto} alt="Foto KTP" className="w-full h-32 object-cover rounded border border-border" />
                ) : (
                  <p className="text-xs text-muted-foreground italic">Belum ada foto KTP</p>
                )}
              </div>

              {/* Status */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">Status</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Status Customer</span>
                    <span className={`inline-flex items-center gap-1 font-medium ${selectedCustomer.isActive ? 'text-success' : 'text-destructive'}`}>
                      {selectedCustomer.isActive ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {selectedCustomer.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Langganan PPPoE</span>
                    <span className="font-medium">{selectedCustomer.pppoeUsers?.length ?? selectedCustomer._count?.pppoeUsers ?? 0} langganan</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Dibuat Pada</span>
                    <span>{formatWIB(selectedCustomer.createdAt, 'dd MMM yyyy HH:mm')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Diperbarui</span>
                    <span>{formatWIB(selectedCustomer.updatedAt, 'dd MMM yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>

              {/* PPPoE langganan */}
              {selectedCustomer.pppoeUsers && selectedCustomer.pppoeUsers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">Langganan PPPoE</h3>
                  <div className="space-y-1">
                    {selectedCustomer.pppoeUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-2 py-1.5 bg-muted/50 rounded text-xs">
                        <span className="font-mono font-medium">{u.username}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{u.profile?.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${u.status === 'active' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>{u.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <ModalButton variant="secondary" onClick={() => setIsDetailOpen(false)}>Tutup</ModalButton>
          {selectedCustomer && (
            <ModalButton variant="primary" onClick={() => { setIsDetailOpen(false); router.push(`/admin/pppoe/users?pppoeCustomerId=${selectedCustomer.id}`); }}>
              <UserPlus className="h-3 w-3 mr-1" /> Lihat Langganan PPPoE
            </ModalButton>
          )}
        </ModalFooter>
      </SimpleModal>
    </div>
  );
}
