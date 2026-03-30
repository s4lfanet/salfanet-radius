'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import {
  UserPlus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Wrench,
  Filter,
  Trash2,
  MapPin,
} from 'lucide-react';
import { formatToWIB } from '@/lib/utils/dateUtils';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalTextarea,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface Registration {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  areaId: string | null;
  area?: { id: string; name: string } | null;
  status: string;
  installationFee: number;
  rejectionReason: string | null;
  createdAt: string;
  profile: {
    id: string;
    name: string;
    price: number;
    downloadSpeed: number;
    uploadSpeed: number;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    amount: number;
  } | null;
  pppoeUser: {
    id: string;
    username: string;
    status: string;
  } | null;
}

interface Area { id: string; name: string; }

interface Stats {
  total: number;
  pending: number;
  approved: number;
  installed: number;
  active: number;
  rejected: number;
}

export default function RegistrationsPage() {
  const { t } = useTranslation();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [installationFee, setInstallationFee] = useState('');
  const [subscriptionType, setSubscriptionType] = useState<'POSTPAID' | 'PREPAID'>('POSTPAID');
  const [billingDay, setBillingDay] = useState('1');
  const [approveAreaId, setApproveAreaId] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [approving, setApproving] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchFilter) params.set('search', searchFilter);

      const res = await fetch(`/api/admin/registrations?${params}`);
      const data = await res.json();
      setRegistrations(data.registrations || []);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch registrations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
    fetch('/api/pppoe/areas').then(r => r.json()).then(d => setAreas(d.areas || [])).catch(() => {});
  }, [statusFilter, searchFilter]);

  const handleApproveClick = (registration: Registration) => {
    setSelectedRegistration(registration);
    setInstallationFee('');
    setSubscriptionType('POSTPAID');
    setBillingDay('1');
    setApproveAreaId(registration.areaId || '');
    setApproveModalOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRegistration) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${selectedRegistration.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationFee: installationFee ? parseFloat(installationFee) : 0,
          subscriptionType: subscriptionType,
          billingDay: subscriptionType === 'POSTPAID' ? parseInt(billingDay) : 1,
          areaId: approveAreaId || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await showSuccess(
          `Approved!\n` +
          `Username: ${data.pppoeUser.username}\n` +
          `Password: ${data.pppoeUser.password}\n\n` +
          `Tagihan dibuat:\n` +
          `${data.invoice.invoiceNumber}\n` +
          `Total: Rp ${data.invoice.amount.toLocaleString('id-ID')}`
        );
        setApproveModalOpen(false);
        fetchRegistrations();
      } else {
        await showError(data.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('pppoe.failedApprove'));
    } finally {
      setApproving(false);
    }
  };

  const handleRejectClick = (registration: Registration) => {
    setSelectedRegistration(registration);
    setRejectionReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!selectedRegistration || !rejectionReason) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/admin/registrations/${selectedRegistration.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      if (res.ok) {
        await showSuccess(t('pppoe.rejected'));
        setRejectModalOpen(false);
        fetchRegistrations();
      } else {
        const data = await res.json();
        await showError(data.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('pppoe.failedReject'));
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkInstalled = async (registration: Registration) => {
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registration.id}/mark-installed`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        await showSuccess(t('pppoe.installedWithInvoice').replace('{invoice}', data.invoice.invoiceNumber));
        fetchRegistrations();
      } else {
        await showError(data.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('pppoe.failedMarkInstalled'));
    } finally {
      setMarking(false);
    }
  };

  const handleDelete = async (registrationId: string, name: string) => {
    const confirmed = await showConfirm(t('pppoe.deleteRegistrationConfirm', { name }));
    if (!confirmed) return;

    setDeleting(registrationId);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        await showSuccess(t('common.registrationDeleted'));
        fetchRegistrations();
      } else {
        await showError(data.error || t('common.failedDelete'));
      }
    } catch (error) {
      await showError(t('common.failedDeleteRegistration'));
    } finally {
      setDeleting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-warning/10 text-warning',
      APPROVED: 'bg-primary/10 text-primary',
      INSTALLED: 'bg-accent/100/10 text-accent',
      ACTIVE: 'bg-success/10 text-success',
      REJECTED: 'bg-destructive/10 text-destructive',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[status] || 'bg-muted text-muted-foreground'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]"><div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div><div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div></div><RefreshCw className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" /></div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-[#00f7ff]" />
              {t('pppoe.registrationsTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pppoe.registrationsSubtitle')}</p>
          </div>
          <button
            onClick={fetchRegistrations}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border rounded-md hover:bg-muted"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('common.refresh')}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.total')}</div>
              <div className="text-lg font-bold text-foreground">{stats.total}</div>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-warning uppercase flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {t('pppoe.pending')}
              </div>
              <div className="text-lg font-bold text-warning">{stats.pending}</div>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-primary uppercase">{t('pppoe.approved')}</div>
              <div className="text-lg font-bold text-primary">{stats.approved}</div>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-accent uppercase">{t('pppoe.installed')}</div>
              <div className="text-lg font-bold text-accent">{stats.installed}</div>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-success uppercase">{t('pppoe.active')}</div>
              <div className="text-lg font-bold text-success">{stats.active}</div>
            </div>
            <div className="bg-card p-2.5 rounded-lg border border-border">
              <div className="text-[10px] font-medium text-destructive uppercase">{t('pppoe.rejected')}</div>
              <div className="text-lg font-bold text-destructive">{stats.rejected}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card p-3 rounded-lg border border-border">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{t('pppoe.filters')}:</span>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('pppoe.searchNamePhone')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-7 pr-3 py-1.5 w-full border border-border bg-muted rounded-md text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 border border-border bg-muted rounded-md text-xs"
            >
              <option value="all">{t('pppoe.allStatus')}</option>
              <option value="PENDING">{t('pppoe.pending')}</option>
              <option value="APPROVED">{t('pppoe.approved')}</option>
              <option value="INSTALLED">{t('pppoe.installed')}</option>
              <option value="ACTIVE">{t('pppoe.active')}</option>
              <option value="REJECTED">{t('pppoe.rejected')}</option>
            </select>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {registrations.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-6 text-center text-muted-foreground text-xs">{t('pppoe.noRegistrations')}</div>
          ) : (
            registrations.filter(reg => reg.status !== 'INSTALLED').map((reg) => (
              <div key={reg.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm text-foreground">{reg.name}</p>
                    <p className="text-xs text-muted-foreground">{reg.address}</p>
                  </div>
                  {getStatusBadge(reg.status)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-muted-foreground">{t('pppoe.contact')}:</span>
                    <p className="font-medium">{reg.phone}</p>
                    {reg.email && <p className="text-[10px] text-muted-foreground">{reg.email}</p>}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('pppoe.profile')}:</span>
                    <p className="font-medium">{reg.profile.name}</p>
                    <p className="text-[10px] text-muted-foreground">{reg.profile.downloadSpeed}/{reg.profile.uploadSpeed}M</p>
                    <p className="text-[10px] text-success font-medium">Rp {reg.profile.price.toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  {reg.latitude && reg.longitude && (
                    <div>
                      <span className="text-muted-foreground">{t('pppoe.gpsLocation')}:</span>
                      <button onClick={() => window.open(`https://www.google.com/maps?q=${reg.latitude},${reg.longitude}`, '_blank')} className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"><MapPin className="w-3 h-3" />{t('pppoe.openMap')}</button>
                    </div>
                  )}
                  {reg.pppoeUser && (
                    <div>
                      <span className="text-muted-foreground">{t('pppoe.pppoeUser')}:</span>
                      <p className="font-mono text-[10px]">{reg.pppoeUser.username}</p>
                      <span className={`text-[9px] ${reg.pppoeUser.status === 'isolated' ? 'text-warning' : 'text-success'}`}>{reg.pppoeUser.status}</span>
                    </div>
                  )}
                  {reg.invoice && (
                    <div>
                      <span className="text-muted-foreground">{t('pppoe.invoice')}:</span>
                      <p className="font-mono text-[10px]">{reg.invoice.invoiceNumber}</p>
                      <p className="text-[10px] text-muted-foreground">Rp {reg.invoice.amount.toLocaleString()}</p>
                      <span className={`text-[9px] ${reg.invoice.status === 'PAID' ? 'text-success' : 'text-warning'}`}>{reg.invoice.status}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">{t('common.date')}:</span>
                    <p className="text-[10px]">{formatToWIB(reg.createdAt)}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  {reg.status === 'PENDING' && (
                    <>
                      <button onClick={() => handleApproveClick(reg)} className="p-2 text-success hover:bg-success/10 rounded" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleRejectClick(reg)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Reject"><XCircle className="w-4 h-4" /></button>
                    </>
                  )}
                  {reg.status === 'APPROVED' && (
                    <button onClick={() => handleMarkInstalled(reg)} disabled={marking} className="p-2 text-accent hover:bg-accent/100/10 rounded disabled:opacity-50" title="Mark Installed"><Wrench className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => handleDelete(reg.id, reg.name)} disabled={deleting === reg.id} className="p-2 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.customer')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('pppoe.contact')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.profile')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('pppoe.gpsLocation')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('pppoe.pppoeUser')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('pppoe.invoice')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('common.date')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('pppoe.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {registrations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                      {t('pppoe.noRegistrations')}
                    </td>
                  </tr>
                ) : (
                  registrations
                    .filter(reg => reg.status !== 'INSTALLED')
                    .map((reg) => (
                      <tr key={reg.id} className="hover:bg-muted">
                        <td className="px-3 py-2">
                          <div className="font-medium text-xs text-foreground">{reg.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">{reg.address}</div>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <div className="text-xs">{reg.phone}</div>
                          {reg.email && <div className="text-[10px] text-muted-foreground">{reg.email}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-xs">{reg.profile.name}</div>
                          <div className="text-[10px] text-muted-foreground">{reg.profile.downloadSpeed}/{reg.profile.uploadSpeed}M</div>
                          <div className="text-[10px] text-success font-medium">Rp {reg.profile.price.toLocaleString()}</div>
                        </td>
                        <td className="px-3 py-2">{getStatusBadge(reg.status)}</td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          {reg.latitude && reg.longitude ? (
                            <button
                              onClick={() => window.open(`https://www.google.com/maps?q=${reg.latitude},${reg.longitude}`, '_blank')}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] text-primary hover:bg-primary/10 rounded transition"
                              title={`Lat: ${reg.latitude.toFixed(6)}, Lng: ${reg.longitude.toFixed(6)}`}
                            >
                              <MapPin className="w-3 h-3" />
                              {t('pppoe.openMap')}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          {reg.pppoeUser ? (
                            <div>
                              <div className="font-mono text-[10px]">{reg.pppoeUser.username}</div>
                              <span className={`text-[9px] ${reg.pppoeUser.status === 'isolated' ? 'text-warning' : 'text-success'}`}>
                                {reg.pppoeUser.status}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell">
                          {reg.invoice ? (
                            <div>
                              <div className="font-mono text-[10px]">{reg.invoice.invoiceNumber}</div>
                              <div className="text-[10px] text-muted-foreground">Rp {reg.invoice.amount.toLocaleString()}</div>
                              <span className={`text-[9px] ${reg.invoice.status === 'PAID' ? 'text-success' : 'text-warning'}`}>
                                {reg.invoice.status}
                              </span>
                            </div>
                          ) : reg.status === 'APPROVED' ? (
                            <span className="text-primary text-[10px]">{t('pppoe.awaiting')}</span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground hidden lg:table-cell">
                          {formatToWIB(reg.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {reg.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleApproveClick(reg)}
                                  className="p-1 text-success hover:bg-success/10 rounded"
                                  title="Approve"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleRejectClick(reg)}
                                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                                  title="Reject"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {reg.status === 'APPROVED' && (
                              <button
                                onClick={() => handleMarkInstalled(reg)}
                                disabled={marking}
                                className="p-1 text-accent hover:bg-accent/100/10 rounded disabled:opacity-50"
                                title="Mark Installed"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(reg.id, reg.name)}
                              disabled={deleting === reg.id}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

        {/* Approve Modal */}
        <SimpleModal isOpen={approveModalOpen && !!selectedRegistration} onClose={() => setApproveModalOpen(false)} size="md">
          <ModalHeader>
            <ModalTitle>{t('pppoe.approveRegistration')}</ModalTitle>
            <ModalDescription>{t('pppoe.setInstallFee')}</ModalDescription>
          </ModalHeader>
          {selectedRegistration && (
            <>
              <ModalBody className="space-y-4">
                <div className="bg-[#00f7ff]/10 p-3 rounded-lg space-y-1.5 text-xs border border-[#00f7ff]/30">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('common.name')}:</span><span className="font-medium text-foreground">{selectedRegistration.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('common.phone')}:</span><span className="font-medium text-foreground">{selectedRegistration.phone}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('pppoe.profile')}:</span><span className="font-medium text-foreground">{selectedRegistration.profile.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('pppoe.username')}:</span><span className="font-mono text-[#00f7ff]">{selectedRegistration.name.split(' ')[0].toLowerCase()}-{selectedRegistration.phone}</span></div>
                </div>
                <div>
                  <ModalLabel required>{t('pppoe.subscriptionType')}</ModalLabel>
                  <div className="space-y-2">
                    <label className={`flex items-center p-2.5 border rounded-lg cursor-pointer transition-all ${subscriptionType === 'POSTPAID' ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_10px_rgba(0,247,255,0.2)]' : 'border-[#bc13fe]/30 hover:border-[#bc13fe]/50'}`}>
                      <input type="radio" name="subscriptionType" value="POSTPAID" checked={subscriptionType === 'POSTPAID'} onChange={(e) => setSubscriptionType(e.target.value as 'POSTPAID')} className="w-4 h-4 text-[#00f7ff] border-[#bc13fe]/50 bg-[#0a0520] focus:ring-[#00f7ff]" />
                      <div className="ml-3 flex-1"><div className="text-xs font-medium text-foreground">📅 {t('pppoe.postpaid')}</div><div className="text-[10px] text-muted-foreground">{t('pppoe.monthlyBillingDesc')}</div></div>
                    </label>
                    <label className={`flex items-center p-2.5 border rounded-lg cursor-pointer transition-all ${subscriptionType === 'PREPAID' ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_10px_rgba(0,247,255,0.2)]' : 'border-[#bc13fe]/30 hover:border-[#bc13fe]/50'}`}>
                      <input type="radio" name="subscriptionType" value="PREPAID" checked={subscriptionType === 'PREPAID'} onChange={(e) => setSubscriptionType(e.target.value as 'PREPAID')} className="w-4 h-4 text-[#00f7ff] border-[#bc13fe]/50 bg-[#0a0520] focus:ring-[#00f7ff]" />
                      <div className="ml-3 flex-1"><div className="text-xs font-medium text-foreground">⏰ {t('pppoe.prepaid')}</div><div className="text-[10px] text-muted-foreground">{t('pppoe.prepaidValidityDesc')}</div></div>
                    </label>
                  </div>
                </div>
                {subscriptionType === 'POSTPAID' && (
                  <div>
                    <ModalLabel required>📅 {t('pppoe.billingDate')}</ModalLabel>
                    <ModalSelect value={billingDay} onChange={(e) => setBillingDay(e.target.value)}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (<option key={day} value={day} className="bg-[#0a0520]">{t('pppoe.dayOf')} {day}</option>))}
                    </ModalSelect>
                    <p className="text-[10px] text-muted-foreground mt-1">{t('pppoe.monthlyDueDateLabel')}</p>
                  </div>
                )}
                <div>
                  <ModalLabel>{t('pppoe.installationFee')} (opsional)</ModalLabel>
                  <ModalInput type="number" placeholder="e.g. 350000 (kosongkan atau isi 0 jika gratis)" value={installationFee} onChange={(e) => setInstallationFee(e.target.value)} min={0} />
                </div>
                <div>
                  <ModalLabel>Area</ModalLabel>
                  <ModalSelect value={approveAreaId} onChange={(e) => setApproveAreaId(e.target.value)}>
                    <option value="" className="bg-[#0a0520]">-- Pilih Area (opsional) --</option>
                    {areas.map((a) => <option key={a.id} value={a.id} className="bg-[#0a0520]">{a.name}</option>)}
                  </ModalSelect>
                  {selectedRegistration.area && (
                    <p className="text-[10px] text-[#00f7ff] mt-1">💡 Dipilih saat daftar: <strong>{selectedRegistration.area.name}</strong></p>
                  )}
                </div>
                {subscriptionType === 'PREPAID' && (
                  <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-medium text-[#00ff88]">💡 Rincian Tagihan Prepaid:</div>
                    <div className="flex justify-between text-xs text-[#00ff88]"><span>{t('pppoe.installationFee')}:</span><span>Rp {(installationFee ? parseFloat(installationFee) : 0).toLocaleString('id-ID')}</span></div>
                    <div className="flex justify-between text-xs text-[#00ff88]"><span>{t('pppoe.packageFee')}:</span><span>Rp {selectedRegistration.profile.price.toLocaleString('id-ID')}</span></div>
                    <div className="flex justify-between text-sm font-bold text-[#00ff88] pt-1 border-t border-[#00ff88]/30"><span>{t('pppoe.totalBilling')}:</span><span>Rp {((installationFee ? parseFloat(installationFee) : 0) + selectedRegistration.profile.price).toLocaleString('id-ID')}</span></div>
                  </div>
                )}
                {subscriptionType === 'POSTPAID' && (
                  <div className="bg-[#ff8c00]/10 border border-[#ff8c00]/30 rounded-lg p-3">
                    <div className="text-xs font-medium text-[#ff8c00] mb-1">ℹ️ Informasi Postpaid:</div>
                    <div className="text-[10px] text-[#ff8c00]">
                      • Tagihan <strong>Rp {selectedRegistration.profile.price.toLocaleString('id-ID')}</strong> setiap bulan<br/>
                      • Jatuh tempo setiap <strong>tanggal {billingDay}</strong> bulan berikutnya<br/>
                      • expiredAt otomatis diperpanjang setiap bulan<br/>
                      {installationFee && parseFloat(installationFee) > 0 && (<span>• Biaya instalasi <strong>Rp {parseFloat(installationFee).toLocaleString('id-ID')}</strong> (sekali di awal)</span>)}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <ModalButton type="button" variant="secondary" onClick={() => setApproveModalOpen(false)}>{t('common.cancel')}</ModalButton>
                <ModalButton type="button" variant="primary" onClick={handleApprove} disabled={approving}>{approving ? t('pppoe.approving') : t('pppoe.approve')}</ModalButton>
              </ModalFooter>
            </>
          )}
        </SimpleModal>

        {/* Reject Modal */}
        <SimpleModal isOpen={rejectModalOpen && !!selectedRegistration} onClose={() => setRejectModalOpen(false)} size="sm">
          <ModalHeader>
            <ModalTitle>{t('pppoe.rejectRegistration')}</ModalTitle>
            <ModalDescription>{t('pppoe.provideReason')}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div>
              <ModalLabel required>{t('pppoe.rejectionReason')}</ModalLabel>
              <ModalTextarea placeholder="e.g. Area not covered..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" variant="secondary" onClick={() => setRejectModalOpen(false)}>{t('common.cancel')}</ModalButton>
            <ModalButton type="button" variant="danger" onClick={handleReject} disabled={!rejectionReason || rejecting}>{rejecting ? t('pppoe.rejecting') : t('pppoe.reject')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  );
}
