'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, Users, MapPin, X, RefreshCcw,
  User, Box, Server, HardDrive, Link2, Navigation, Search,
} from 'lucide-react';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalSelect,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface Customer {
  id: string;
  name: string;
  username: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  profile: {
    name: string;
  };
}

interface ODP {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  ponPort: number;
  portCount: number;
  distance?: number;
  availablePorts?: number[];
  assignedCount?: number;
  odc: {
    name: string;
  } | null;
  olt: {
    name: string;
  };
}

interface Assignment {
  id: string;
  customerId: string;
  odpId: string;
  portNumber: number;
  distance: number | null;
  notes: string | null;
  createdAt: string;
  customer: Customer;
  odp: ODP;
}

export default function CustomerAssignmentPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOdpId, setSelectedOdpId] = useState('');
  const [selectedPort, setSelectedPort] = useState('');
  const [notes, setNotes] = useState('');

  // For customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // For nearest ODPs
  const [nearestOdps, setNearestOdps] = useState<ODP[]>([]);
  const [loadingNearestOdps, setLoadingNearestOdps] = useState(false);

  // Filter
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      const res = await fetch('/api/network/customers/assign');
      const data = await res.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchCustomers = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/pppoe/users?search=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      // Filter out customers that are already assigned
      const assignedIds = assignments.map(a => a.customerId);
      const available = (data.users || []).filter((u: Customer) => !assignedIds.includes(u.id));
      setSearchResults(available);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const loadNearestOdps = async (customerId: string) => {
    setLoadingNearestOdps(true);
    try {
      const res = await fetch(`/api/network/customers/assign?customerId=${customerId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setNearestOdps(data);
      } else {
        await showError(data.error || 'Failed to load nearest ODPs');
        setNearestOdps([]);
      }
    } catch (error) {
      console.error('Load nearest ODPs error:', error);
      setNearestOdps([]);
    } finally {
      setLoadingNearestOdps(false);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedCustomerId(customer.id);
    setCustomerSearch('');
    setSearchResults([]);

    // Load nearest ODPs
    if (customer.latitude && customer.longitude) {
      loadNearestOdps(customer.id);
    } else {
      setNearestOdps([]);
    }
  };

  const handleOdpSelect = (odp: ODP) => {
    setSelectedOdpId(odp.id);
    // Auto-select first available port
    if (odp.availablePorts && odp.availablePorts.length > 0) {
      setSelectedPort(odp.availablePorts[0].toString());
    }
  };

  const resetForm = () => {
    setSelectedCustomerId('');
    setSelectedOdpId('');
    setSelectedPort('');
    setNotes('');
    setCustomerSearch('');
    setSearchResults([]);
    setSelectedCustomer(null);
    setNearestOdps([]);
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setSelectedCustomerId(assignment.customerId);
    setSelectedCustomer(assignment.customer);
    setSelectedOdpId(assignment.odpId);
    setSelectedPort(assignment.portNumber.toString());
    setNotes(assignment.notes || '');
    // Load nearest ODPs for editing
    loadNearestOdps(assignment.customerId);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId || !selectedOdpId || !selectedPort) {
      await showError(t('common.fillAllRequiredFields'));
      return;
    }

    try {
      const method = editingAssignment ? 'PUT' : 'POST';
      const payload = {
        ...(editingAssignment && { id: editingAssignment.id }),
        customerId: selectedCustomerId,
        odpId: selectedOdpId,
        portNumber: parseInt(selectedPort),
        notes: notes || null,
      };

      const res = await fetch('/api/network/customers/assign', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok) {
        await showSuccess(editingAssignment ? t('common.updated') : t('common.created'));
        setIsDialogOpen(false);
        setEditingAssignment(null);
        resetForm();
        loadAssignments();
      } else {
        await showError(result.error || t('common.failedSaveAssignment'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      await showError(t('common.failedSaveAssignment'));
    }
  };

  const handleDelete = async (assignment: Assignment) => {
    const confirmed = await showConfirm(
      'Remove Assignment',
      `Are you sure you want to remove "${assignment.customer.name}" from ODP "${assignment.odp.name}"?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/network/customers/assign?id=${assignment.id}`, {
        method: 'DELETE',
      });

      const result = await res.json();
      if (res.ok) {
        await showSuccess(t('common.assignmentRemoved'));
        loadAssignments();
      } else {
        await showError(result.error || t('common.failedRemoveAssignment'));
      }
    } catch (error) {
      await showError(t('common.failedRemoveAssignment'));
    }
  };

  const filteredAssignments = assignments.filter(a => {
    if (!filterSearch) return true;
    const search = filterSearch.toLowerCase();
    return (
      a.customer.name.toLowerCase().includes(search) ||
      a.customer.username.toLowerCase().includes(search) ||
      a.odp.name.toLowerCase().includes(search)
    );
  });

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
              <Link2 className="h-6 w-6 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
              Customer - ODP Assignment
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Assign customers to ODP ports for FTTH network
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingAssignment(null); setIsDialogOpen(true); }}
            className="inline-flex items-center px-4 py-2.5 text-sm font-bold bg-[#00f7ff] text-black rounded-lg hover:bg-[#00f7ff]/90 transition-all shadow-[0_0_20px_rgba(0,247,255,0.4)] uppercase tracking-wide"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('network.newAssignment')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('network.totalAssignments')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{assignments.length}</p>
              </div>
              <Link2 className="h-8 w-8 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('network.uniqueOdps')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">
                  {new Set(assignments.map(a => a.odpId)).size}
                </p>
              </div>
              <Box className="h-8 w-8 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('network.uniqueCustomers')}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground mt-1">
                  {new Set(assignments.map(a => a.customerId)).size}
                </p>
              </div>
              <Users className="h-8 w-8 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
            </div>
          </div>
        </div>

        {/* Search Filter */}
        <div className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder={t('network.searchCustomerOdp')}
            className="flex-1 px-2 py-1 text-xs border-0 bg-transparent focus:ring-0"
          />
          {filterSearch && (
            <button
              onClick={() => setFilterSearch('')}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filteredAssignments.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-4 text-center text-muted-foreground text-xs">
              {t('network.noAssignmentsFound')}
            </div>
          ) : (
            filteredAssignments.map((assignment) => (
              <div key={assignment.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <div>
                      <span className="text-sm font-medium block">{assignment.customer.name}</span>
                      <span className="text-[10px] text-muted-foreground">@{assignment.customer.username}</span>
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 text-[10px] bg-accent/20 text-accent dark:bg-purple-900/30 rounded font-mono">
                    Port {assignment.portNumber}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground text-[10px]">ODP</span>
                    <div className="space-y-0.5 mt-0.5">
                      <div className="flex items-center gap-1">
                        <Box className="h-3 w-3 text-primary" />
                        <span className="text-xs">{assignment.odp.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Server className="h-2.5 w-2.5" />
                        {assignment.odp.olt?.name}
                        {assignment.odp.odc && (
                          <>
                            <span className="mx-0.5">&rarr;</span>
                            <HardDrive className="h-2.5 w-2.5" />
                            {assignment.odp.odc.name}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">{t('network.distance')}</span>
                    <p className="mt-0.5">
                      {assignment.distance !== null ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Navigation className="h-3 w-3 text-success" />
                          {assignment.distance.toFixed(2)} km
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </p>
                  </div>
                  {assignment.notes && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-[10px]">{t('common.notes')}</span>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{assignment.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button
                    onClick={() => handleEdit(assignment)}
                    className="p-2 text-muted-foreground hover:bg-muted rounded"
                    title="Edit Penugasan"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(assignment)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded"
                    title="Hapus Penugasan"
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
            <span className="text-xs font-medium">{t('network.assignmentList')} ({filteredAssignments.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('network.customer')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">ODP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('network.port')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('network.distance')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('common.notes')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {t('network.noAssignmentsFound')}
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          <div>
                            <span className="text-xs font-medium block">{assignment.customer.name}</span>
                            <span className="text-[10px] text-muted-foreground">@{assignment.customer.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Box className="h-3 w-3 text-primary" />
                            <span className="text-xs">{assignment.odp.name}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Server className="h-2.5 w-2.5" />
                            {assignment.odp.olt?.name}
                            {assignment.odp.odc && (
                              <>
                                <span className="mx-0.5">→</span>
                                <HardDrive className="h-2.5 w-2.5" />
                                {assignment.odp.odc.name}
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <span className="px-1.5 py-0.5 text-[10px] bg-accent/20 text-accent dark:bg-purple-900/30 rounded font-mono">
                          Port {assignment.portNumber}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs hidden md:table-cell">
                        {assignment.distance !== null ? (
                          <span className="flex items-center gap-1">
                            <Navigation className="h-3 w-3 text-success" />
                            {assignment.distance.toFixed(2)} km
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell max-w-[150px] truncate">
                        {assignment.notes || '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleEdit(assignment)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit Penugasan"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(assignment)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Hapus Penugasan"
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
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingAssignment(null); resetForm(); }} size="xl">
          <ModalHeader>
            <ModalTitle>{editingAssignment ? t('network.editAssignment') : t('network.newAssignment')}</ModalTitle>
            <ModalDescription>{t('network.assignCustomerToOdp')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              {/* Customer Selection */}
              <div>
                <ModalLabel required>{t('network.customer')}</ModalLabel>
                {selectedCustomer ? (
                  <div className="p-2 bg-[#00f7ff]/10 border border-[#00f7ff]/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-[#00f7ff]" />
                        <div>
                          <span className="text-xs font-medium text-foreground">{selectedCustomer.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">@{selectedCustomer.username}</span>
                        </div>
                      </div>
                      {!editingAssignment && (
                        <button type="button" onClick={() => { setSelectedCustomer(null); setSelectedCustomerId(''); setNearestOdps([]); }} className="text-[10px] text-[#ff4466] hover:underline">{t('network.change')}</button>
                      )}
                    </div>
                    {selectedCustomer.latitude && selectedCustomer.longitude ? (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" /> GPS: {selectedCustomer.latitude.toFixed(6)}, {selectedCustomer.longitude.toFixed(6)}
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] text-[#ff8c00]">⚠ {t('network.noGpsCoordinates')}</div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }} placeholder={t('network.searchCustomerPlaceholder')} className="w-full px-3 py-2 text-xs bg-background dark:bg-[#0a0520] border border-[#bc13fe]/40 rounded-lg text-foreground placeholder-[#e0d0ff]/40 focus:border-[#00f7ff] focus:ring-1 focus:ring-[#00f7ff]/30 transition-all" />
                    {isSearching && (<RefreshCcw className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-[#00f7ff]" />)}
                    {searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-popover dark:bg-[#0a0520] border border-[#bc13fe]/50 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {searchResults.map(customer => (
                          <button key={customer.id} type="button" onClick={() => handleCustomerSelect(customer)} className="w-full px-3 py-2 text-left hover:bg-[#bc13fe]/20 transition-colors">
                            <div className="text-xs font-medium text-foreground">{customer.name}</div>
                            <div className="text-[10px] text-muted-foreground">@{customer.username} • {customer.phone || t('network.noPhone')}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Nearest ODPs */}
              {selectedCustomer && (
                <div>
                  <ModalLabel required>{t('network.selectOdp')} {loadingNearestOdps && (<RefreshCcw className="inline h-2.5 w-2.5 ml-1 animate-spin text-[#00f7ff]" />)}</ModalLabel>
                  {nearestOdps.length === 0 && !loadingNearestOdps ? (
                    <div className="p-3 bg-muted/50 dark:bg-[#0a0520]/50 border border-[#bc13fe]/30 rounded-lg text-xs text-muted-foreground text-center">
                      {selectedCustomer.latitude && selectedCustomer.longitude ? t('network.noOdpsFoundOrAvailable') : t('network.customerNoGpsShowingAll')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {nearestOdps.map(odp => (
                        <button key={odp.id} type="button" onClick={() => handleOdpSelect(odp)} disabled={(odp.availablePorts?.length || 0) === 0} className={`p-2 text-left rounded-lg border transition-all ${selectedOdpId === odp.id ? 'bg-[#00f7ff]/20 border-[#00f7ff] shadow-[0_0_10px_rgba(0,247,255,0.3)]' : (odp.availablePorts?.length || 0) === 0 ? 'bg-muted/50 dark:bg-[#0a0520]/50 border-[#bc13fe]/20 opacity-50 cursor-not-allowed' : 'border-[#bc13fe]/30 hover:border-[#00f7ff]/50'}`}>
                          <div className="flex items-center gap-1">
                            <Box className="h-3 w-3 text-[#00f7ff]" />
                            <span className="text-xs font-medium text-foreground">{odp.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Navigation className="h-2.5 w-2.5 text-[#00ff88]" />{odp.distance?.toFixed(2)} km</span>
                            <span>•</span>
                            <span className={(odp.availablePorts?.length || 0) > 0 ? 'text-[#00ff88]' : 'text-[#ff4466]'}>{odp.availablePorts?.length || 0}/{odp.portCount} {t('network.portsFree')}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Port Selection */}
              {selectedOdpId && (
                <div>
                  <ModalLabel required>{t('network.portNumber')}</ModalLabel>
                  <ModalSelect value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)} required>
                    <option value="" className="bg-[#0a0520]">{t('network.selectPort')}</option>
                    {(nearestOdps.find(o => o.id === selectedOdpId)?.availablePorts || []).map(port => (<option key={port} value={port} className="bg-[#0a0520]">{t('network.port')} {port}</option>))}
                  </ModalSelect>
                </div>
              )}

              {/* Notes */}
              <div>
                <ModalLabel>{t('common.notes')}</ModalLabel>
                <ModalTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('network.optionalNotes')} />
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingAssignment(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary" disabled={!selectedCustomerId || !selectedOdpId || !selectedPort}>{editingAssignment ? t('network.update') : t('network.assign')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}
