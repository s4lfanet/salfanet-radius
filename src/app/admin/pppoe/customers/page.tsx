'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import {
  Plus, Pencil, Trash2, Search, X, Eye, Users, Phone, Mail, MapPin,
  User, CreditCard, CheckCircle2, XCircle, UserPlus, Loader2, Download, Upload,
  Calendar, RefreshCw, Ban, Wifi, WifiOff,
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
  areaId?: string | null;
  area?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { pppoeUsers: number };
  sessionStatus?: 'online' | 'offline' | 'partial';
  onlineCount?: number;
  pppoeUsers?: {
    id: string; username: string; status: string; customerId: string | null; expiredAt: string | null;
    profile: { name: string; downloadSpeed: number; uploadSpeed: number };
  }[];
}

function generateCustomerId(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

interface Area { id: string; name: string; }

// Isolated modal component — formData lives here so typing only re-renders this
// component, not the entire PppoeCustomersPage. Previously CustomerForm was defined
// inline inside the parent render, causing React to unmount/remount the form on
// every keystroke (new component identity each render) → cursor lost, keyboard closes.
function CustomerFormModal({ isOpen, onClose, onSuccess, editCustomer }: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editCustomer?: Customer | null;
}) {
  const isEdit = !!editCustomer;
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', address: '', idCardNumber: '', customerId: generateCustomerId(), areaId: '',
  });
  const [areas, setAreas] = useState<Area[]>([]);
  const [saving, setSaving] = useState(false);

  // Load areas once
  useEffect(() => {
    fetch('/api/pppoe/areas')
      .then(r => r.json())
      .then(d => setAreas(d.areas || []))
      .catch(() => {});
  }, []);

  // Reset / populate form when modal opens
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      if (editCustomer) {
        setFormData({ name: editCustomer.name, phone: editCustomer.phone, email: editCustomer.email || '', address: editCustomer.address || '', idCardNumber: editCustomer.idCardNumber || '', customerId: editCustomer.customerId, areaId: editCustomer.areaId || '' });
      } else {
        setFormData({ name: '', phone: '', email: '', address: '', idCardNumber: '', customerId: generateCustomerId(), areaId: '' });
      }
      setSaving(false);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, editCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit ? { id: editCustomer!.id, ...formData } : formData;
      const res = await fetch('/api/pppoe/customers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onClose();
        onSuccess();
        await showSuccess(isEdit ? 'Customer berhasil diperbarui' : 'Customer berhasil ditambahkan');
      } else {
        await showError(data.error || (isEdit ? 'Gagal memperbarui customer' : 'Gagal menambahkan customer'));
      }
    } catch { await showError(isEdit ? 'Gagal memperbarui customer' : 'Gagal menambahkan customer'); }
    finally { setSaving(false); }
  };

  return (
    <SimpleModal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader>
        <ModalTitle>{isEdit ? 'Edit Customer' : 'Tambah Customer'}</ModalTitle>
        <ModalDescription>{isEdit ? editCustomer?.name : 'Tambah data pelanggan baru'}</ModalDescription>
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <ModalLabel required>Nama Lengkap</ModalLabel>
              <ModalInput type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Nama lengkap customer" required />
            </div>
            <div>
              <ModalLabel required>No. HP / WhatsApp</ModalLabel>
              <ModalInput type="tel" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} placeholder="08xxxxxxxxxx" required />
            </div>
            <div>
              <ModalLabel>Email</ModalLabel>
              <ModalInput type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder="email@contoh.com" />
            </div>
          </div>
          <div>
            <ModalLabel>Alamat</ModalLabel>
            <ModalTextarea value={formData.address} onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))} placeholder="Alamat lengkap customer..." rows={3} />
          </div>
          <div>
            <ModalLabel>Area</ModalLabel>
            <ModalSelect value={formData.areaId} onChange={(e) => setFormData(prev => ({ ...prev, areaId: e.target.value }))}>
              <option value="" className="bg-[#0a0520]">-- Pilih Area --</option>
              {areas.map((a) => <option key={a.id} value={a.id} className="bg-[#0a0520]">{a.name}</option>)}
            </ModalSelect>
          </div>
          <div>
            <ModalLabel>No. KTP <span className="text-muted-foreground text-[10px]">(opsional)</span></ModalLabel>
            <ModalInput type="text" value={formData.idCardNumber} onChange={(e) => setFormData(prev => ({ ...prev, idCardNumber: e.target.value }))} placeholder="16 digit NIK KTP" maxLength={16} />
          </div>
          <div>
            <ModalLabel>ID Customer</ModalLabel>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border border-border rounded-lg">
              <span className="font-mono text-sm font-semibold text-[#00f7ff] flex-1 tracking-widest">{formData.customerId}</span>
              {!isEdit && (
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, customerId: generateCustomerId() }))} className="p-1 text-muted-foreground hover:text-foreground" title="Generate ulang ID">
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{isEdit ? 'ID customer tidak dapat diubah' : 'ID di-generate otomatis, klik ↻ untuk generate ulang'}</p>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButton type="button" variant="secondary" onClick={onClose}>Batal</ModalButton>
          <ModalButton type="submit" variant="primary" disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {isEdit ? 'Simpan' : 'Tambah Customer'}
          </ModalButton>
        </ModalFooter>
      </form>
    </SimpleModal>
  );
}

export default function PppoeCustomersPage() {
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSession, setFilterSession] = useState(''); // '' | 'online' | 'offline'

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: any[] } | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSession) params.set('session', filterSession);
      const res = await fetch(`/api/pppoe/customers?${params}`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) { console.error('Load customers error:', error); }
    finally { setLoading(false); }
  }, [searchQuery, filterStatus, filterSession]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openAdd = () => { setIsAddOpen(true); };
  const openEdit = (c: Customer) => {
    setSelectedCustomer(c);
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

  const handleStopSubscriptions = async (c: Customer) => {
    const count = c._count?.pppoeUsers ?? 0;
    if (count === 0) { await showError('Customer ini tidak memiliki langganan PPPoE aktif'); return; }
    const confirmed = await showConfirm(
      `Hentikan semua langganan PPPoE untuk customer "${c.name}"?\n${count} langganan akan dihentikan dan terputus dari jaringan.`,
      'Stop Langganan'
    );
    if (!confirmed) return;
    try {
      const detailRes = await fetch(`/api/pppoe/customers?id=${c.id}`);
      const detailData = await detailRes.json();
      const activeUsers = (detailData.customer?.pppoeUsers ?? []).filter((u: any) => u.status === 'active' || u.status === 'isolated');
      if (activeUsers.length === 0) { await showError('Tidak ada langganan PPPoE yang aktif'); return; }
      const res = await fetch('/api/pppoe/users/bulk-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: activeUsers.map((u: any) => u.id), status: 'stop' }),
      });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(`${result.updated ?? activeUsers.length} langganan berhasil dihentikan`);
        loadCustomers();
      } else { await showError(result.error || 'Gagal menghentikan langganan'); }
    } catch { await showError('Gagal menghentikan langganan'); }
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

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/pppoe/customers/bulk?type=template&format=xlsx');
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'template-customer.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { await showError('Gagal mengunduh template'); }
  };

  const handleExportCustomers = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/pppoe/customers/export');
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Data-Pelanggan-${new Date().toISOString().split('T')[0]}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { await showError('Gagal mengexport data'); }
    finally { setIsExporting(false); }
  };

  const handleImportCustomers = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await fetch('/api/pppoe/customers/bulk', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data.results);
        if (data.results.success > 0) loadCustomers();
      } else {
        await showError(data.error || 'Gagal mengimport data');
      }
    } catch { await showError('Gagal mengimport data'); }
    finally { setIsImporting(false); }
  };

  const canCreate = hasPermission('customers.edit');
  const canDelete = hasPermission('customers.edit');

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
          <button onClick={handleDownloadTemplate} className="inline-flex items-center px-2 py-1.5 text-xs border border-border rounded hover:bg-muted"><Download className="h-3 w-3 mr-1" />Template</button>
          <button onClick={handleExportCustomers} disabled={isExporting} className="inline-flex items-center px-2 py-1.5 text-xs border border-success text-success rounded hover:bg-success/10">
            {isExporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}Export
          </button>
          <button onClick={() => { setIsImportOpen(true); setImportFile(null); setImportResult(null); }} className="inline-flex items-center px-2 py-1.5 text-xs border border-border rounded hover:bg-muted"><Upload className="h-3 w-3 mr-1" />Import</button>
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Status:</span>
          {(['', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2 py-0.5 text-[10px] rounded-full transition ${filterStatus === s ? (s === '' ? 'bg-teal-600 text-white' : s === 'active' ? 'bg-success text-white' : 'bg-destructive text-white') : 'bg-muted text-muted-foreground'}`}
            >
              {s === '' ? 'Semua' : s === 'active' ? 'Aktif' : 'Tidak Aktif'}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground/40">|</span>
          <span className="text-[10px] text-muted-foreground">Sesi PPPoE:</span>
          {([['', 'Semua'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterSession(val)}
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded-full transition ${
                filterSession === val
                  ? val === '' ? 'bg-teal-600 text-white'
                    : val === 'online' ? 'bg-emerald-600 text-white'
                    : 'bg-slate-500 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {val === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-current mr-0.5" />}
              {val === 'offline' && <span className="w-1.5 h-1.5 rounded-full bg-current mr-0.5 opacity-50" />}
              {label}
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
          <>
          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-border">
            {customers.map((c) => (
              <div key={c.id} className="p-3 space-y-2 hover:bg-muted/50 transition-colors">
                {/* Header: avatar + name + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      <button onClick={() => openDetail(c)} className="font-mono text-[10px] text-[#00f7ff] hover:underline">{c.customerId}</button>
                    </div>
                  </div>
                  <span
                    onClick={() => handleToggleStatus(c)}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer flex-shrink-0 ${c.isActive ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}
                  >
                    {c.isActive ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Aktif</> : <><XCircle className="h-2.5 w-2.5 mr-0.5" />Nonaktif</>}
                  </span>
                </div>
                {/* Contact + address info */}
                <div className="space-y-1 text-[11px] pl-10">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span>{c.phone}</span>
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-[#00f7ff] truncate">{c.email}</span>
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground line-clamp-2">{c.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Bergabung: {formatWIB(c.createdAt, 'd MMM yyyy')}</span>
                  </div>
                  {c.idCardNumber && (
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground font-mono">{c.idCardNumber}</span>
                    </div>
                  )}
                </div>
                {/* Actions row */}
                <div className="flex items-center gap-1 pl-10 pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button onClick={() => router.push(`/admin/pppoe/users?pppoeCustomerId=${c.id}`)}
                      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40"
                    >
                      {c._count?.pppoeUsers ?? 0} PPPoE
                    </button>
                    {(c._count?.pppoeUsers ?? 0) > 0 && (
                      c.sessionStatus === 'online' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Online
                        </span>
                      ) : c.sessionStatus === 'partial' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{c.onlineCount}/{c._count?.pppoeUsers}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />Offline
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => openDetail(c)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Lihat detail">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {canCreate && (
                      <button onClick={() => openEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded" title="Edit customer">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => router.push(`/admin/pppoe/users?pppoeCustomerId=${c.id}`)} className="p-1.5 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded" title="Langganan PPPoE">
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                    {canDelete && (
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded" title="Hapus customer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Customer</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">Kontak</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">Alamat</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Langganan</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Sesi PPPoE</th>
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
                          <button
                            onClick={() => openDetail(c)}
                            className="text-[10px] text-[#00f7ff] font-mono hover:underline hover:text-[#00c7d4] transition-colors"
                            title="Lihat detail customer"
                          >{c.customerId}</button>
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
                      <button
                        onClick={() => router.push(`/admin/pppoe/users?pppoeCustomerId=${c.id}`)}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/40 cursor-pointer"
                      >
                        {c._count?.pppoeUsers ?? 0} PPPoE
                      </button>
                    </td>
                    {/* Sesi PPPoE */}
                    <td className="px-3 py-2">
                      {(c._count?.pppoeUsers ?? 0) === 0 ? (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      ) : c.sessionStatus === 'online' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Online
                        </span>
                      ) : c.sessionStatus === 'partial' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {c.onlineCount}/{c._count?.pppoeUsers} Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                          Offline
                        </span>
                      )}
                    </td>
                    {/* Status */
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
                        {canCreate && (c._count?.pppoeUsers ?? 0) > 0 && (
                          <button
                            onClick={() => handleStopSubscriptions(c)}
                            title="Stop semua langganan PPPoE"
                            className="p-1.5 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
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
          </>
        )}
      </div>

      {/* Add Modal */}
      <CustomerFormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadCustomers()}
      />

      {/* Edit Modal */}
      <CustomerFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSuccess={() => loadCustomers()}
        editCustomer={selectedCustomer}
      />

      {/* Detail Modal */}
      <SimpleModal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} size="md">
        {selectedCustomer && (
          <>
            <ModalHeader>
              <ModalTitle>{selectedCustomer.name}</ModalTitle>
              <ModalDescription>
                <span className="font-mono text-[#00f7ff]">{selectedCustomer.customerId}</span>
              </ModalDescription>
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* Compact contact info */}
              <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-green-500" />{selectedCustomer.phone}</span>
                  {selectedCustomer.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-muted-foreground" />{selectedCustomer.email}</span>}
                </div>
                {selectedCustomer.address && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 text-red-400 flex-shrink-0" />
                    <span>{selectedCustomer.address}</span>
                  </div>
                )}
              </div>

              {/* Langganan PPPoE */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold">Langganan PPPoE</h3>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/20 text-primary text-[10px] font-bold">
                      {selectedCustomer.pppoeUsers?.length ?? selectedCustomer._count?.pppoeUsers ?? 0}
                    </span>
                  </div>
                  <button
                    onClick={() => { setIsDetailOpen(false); router.push(`/admin/pppoe/users/new?pppoeCustomerId=${selectedCustomer.id}`); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-success hover:bg-success/90 text-white rounded"
                  >
                    <Plus className="h-3 w-3" /> Tambah PPPoE
                  </button>
                </div>

                {selectedCustomer.pppoeUsers && selectedCustomer.pppoeUsers.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCustomer.pppoeUsers.slice(0, 3).map((u) => (
                      <div key={u.id} className="bg-muted/50 border border-border rounded-lg px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{u.username}</span>
                            {u.customerId && <span className="text-[9px] font-mono text-muted-foreground">{u.customerId}</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {u.profile?.name} · {(u.profile?.downloadSpeed / 1024).toLocaleString()}/{(u.profile?.uploadSpeed / 1024).toLocaleString()} Mbps
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${u.status === 'active' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                            {u.status}
                          </span>
                          {u.expiredAt && (
                            <button
                              onClick={() => { setIsDetailOpen(false); router.push(`/admin/pppoe/users?search=${u.username}`); }}
                              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                            >
                              {formatWIB(u.expiredAt, 'dd MMM yy')} →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(selectedCustomer.pppoeUsers?.length ?? 0) > 3 && (
                      <p className="text-[10px] text-muted-foreground text-center">+{(selectedCustomer.pppoeUsers?.length ?? 0) - 3} lainnya</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic py-3 text-center">Belum ada langganan PPPoE</p>
                )}

                {(selectedCustomer.pppoeUsers?.length ?? 0) > 0 && (
                  <button
                    onClick={() => { setIsDetailOpen(false); router.push(`/admin/pppoe/users?pppoeCustomerId=${selectedCustomer.id}`); }}
                    className="block w-full text-center text-[11px] text-[#00f7ff] hover:text-[#00c7d4] mt-2 py-1"
                  >
                    Lihat semua di halaman PPPoE →
                  </button>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton variant="secondary" onClick={() => { setIsDetailOpen(false); openEdit(selectedCustomer); }}>
                <Pencil className="h-3 w-3 mr-1" /> Edit Customer
              </ModalButton>
              <ModalButton variant="primary" onClick={() => setIsDetailOpen(false)}>
                Tutup
              </ModalButton>
            </ModalFooter>
          </>
        )}
      </SimpleModal>

      {/* Import Modal */}
      <SimpleModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} size="md">
        <ModalHeader>
          <ModalTitle>Import Data Pelanggan</ModalTitle>
          <ModalDescription>Upload file CSV atau Excel (.xlsx) sesuai format template</ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="flex gap-2">
            <button onClick={handleDownloadTemplate} className="inline-flex items-center px-2 py-1.5 text-xs border border-border rounded hover:bg-muted">
              <Download className="h-3 w-3 mr-1" />Download Template
            </button>
          </div>
          <div>
            <ModalLabel>File Import (CSV / XLSX)</ModalLabel>
            <input
              type="file" accept=".csv,.xlsx"
              onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
              className="w-full text-xs border border-border rounded px-3 py-2 bg-muted"
            />
          </div>
          {importResult && (
            <div className="text-xs space-y-1.5 p-3 rounded border border-border bg-muted/40">
              <p className="font-semibold">Hasil Import:</p>
              <p className="text-success">✓ Berhasil: {importResult.success}</p>
              {importResult.failed > 0 && <p className="text-destructive">✗ Gagal: {importResult.failed}</p>}
              {importResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 mt-1">
                  {importResult.errors.slice(0, 10).map((e: any, i: number) => (
                    <p key={i} className="text-destructive/80">Baris {e.line}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <ModalButton type="button" variant="secondary" onClick={() => setIsImportOpen(false)}>Tutup</ModalButton>
          <ModalButton type="button" variant="primary" disabled={!importFile || isImporting} onClick={handleImportCustomers}>
            {isImporting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Import
          </ModalButton>
        </ModalFooter>
      </SimpleModal>
    </div>
  );
}
