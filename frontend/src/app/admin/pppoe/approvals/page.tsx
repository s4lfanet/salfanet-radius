'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import {
  CheckCircle, XCircle, Clock, RefreshCw, User, Phone, Wifi, MapPin,
  CreditCard, Calendar, UserCheck,
} from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import { apiAdmin } from '@/lib/api';
import { useApiQuery, useQueryClient } from '@/lib/api/hooks';

interface PendingUser {
  id: string;
  username: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  subscriptionType: string;
  billingDay: number | null;
  expiredAt: string | null;
  createdAt: string;
  idCardNumber: string | null;
  idCardPhoto: string | null;
  installationPhotos: string[] | null;
  comment: string | null;
  profile: { id: string; name: string; price: number } | null;
  area: { id: string; name: string } | null;
  router: { id: string; name: string } | null;
  registeredByTechnician: { id: string; name: string } | null;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

export default function ApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const { data, isLoading, refetch } = useApiQuery<{ users: PendingUser[] }>(
    '/api/pppoe/approvals',
  );

  const users = data?.users ?? [];

  const handleApprove = useCallback(async (user: PendingUser) => {
    const confirmed = await showConfirm(
      'Setujui Pendaftaran?',
      `Pelanggan "${user.name}" (${user.username}) akan diaktifkan. RADIUS dan MikroTik akan disinkronkan.`,
      'Ya, Setujui',
    );
    if (!confirmed) return;

    try {
      await apiAdmin('/api/pppoe/approvals', {
        method: 'POST',
        body: JSON.stringify({ userId: user.id, action: 'approve' }),
      });
      await showSuccess('Pendaftaran disetujui dan pelanggan telah diaktifkan');
      queryClient.invalidateQueries({ queryKey: ['/api/pppoe/approvals'] });
    } catch (err: unknown) {
      await showError((err instanceof Error ? err.message : String(err)) || 'Gagal menyetujui pendaftaran');
    }
  }, [queryClient]);

  const handleReject = useCallback(async () => {
    if (!rejecting || !rejectReason.trim()) return;
    try {
      await apiAdmin('/api/pppoe/approvals', {
        method: 'POST',
        body: JSON.stringify({ userId: rejecting, action: 'reject', reason: rejectReason.trim() }),
      });
      await showSuccess('Pendaftaran ditolak');
      setShowRejectModal(false);
      setRejecting(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['/api/pppoe/approvals'] });
    } catch (err: unknown) {
      await showError((err instanceof Error ? err.message : String(err)) || 'Gagal menolak pendaftaran');
    }
  }, [rejecting, rejectReason, queryClient]);

  const openRejectModal = (userId: string) => {
    setRejecting(userId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            Approval Pendaftaran Teknisi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Persetujuan pendaftaran pelanggan oleh teknisi
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{users.length}</p>
              <p className="text-xs text-muted-foreground">Menunggu Approval</p>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
          <p className="text-sm font-semibold text-foreground">Tidak ada pendaftaran menunggu approval</p>
          <p className="text-xs text-muted-foreground mt-1">Semua pendaftaran teknisi telah diproses</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Left: Customer info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        {user.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Username: <span className="font-mono text-foreground">{user.username}</span>
                        {user.customerId && <> · ID: <span className="font-mono text-primary">{user.customerId}</span></>}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full">
                      <Clock className="w-3 h-3" /> Menunggu
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{user.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wifi className="w-3.5 h-3.5" />
                      <span>{user.profile?.name ?? '—'} ({user.profile ? formatIDR(user.profile.price) : ''}/bln)</span>
                    </div>
                    {user.area && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{user.area.name}</span>
                      </div>
                    )}
                    {user.router && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Wifi className="w-3.5 h-3.5" />
                        <span>{user.router.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{user.subscriptionType === 'POSTPAID' ? 'Pascabayar' : 'Prabayar'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Daftar: {formatWIB(user.createdAt)}</span>
                    </div>
                  </div>

                  {user.registeredByTechnician && (
                    <p className="text-xs text-muted-foreground">
                      Didaftarkan oleh: <span className="font-semibold text-foreground">{user.registeredByTechnician.name}</span>
                    </p>
                  )}

                  {user.comment && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                      Catatan: {user.comment}
                    </p>
                  )}

                  {user.idCardPhoto && (
                    <div className="flex gap-2">
                      <a href={user.idCardPhoto} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        Lihat Foto KTP
                      </a>
                      {Array.isArray(user.installationPhotos) && user.installationPhotos.length > 0 && (
                        <a href={user.installationPhotos[0]} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          Lihat Foto Instalasi ({user.installationPhotos.length})
                        </a>
                      )}
                    </div>
                  )}

                  {user.latitude && user.longitude && (
                    <a
                      href={`https://maps.google.com/?q=${user.latitude},${user.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <MapPin className="w-3 h-3" /> Lihat Lokasi GPS
                    </a>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex flex-row lg:flex-col gap-2 lg:w-40">
                  <button
                    onClick={() => handleApprove(user)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Setujui
                  </button>
                  <button
                    onClick={() => openRejectModal(user.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Tolak
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowRejectModal(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Tolak Pendaftaran
            </h3>
            <p className="text-xs text-muted-foreground mb-3">Berikan alasan penolakan:</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Contoh: Data KTP tidak jelas, koordinat GPS salah, dll."
              className="w-full px-3 py-2 text-sm bg-input/80 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejecting(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                Tolak Pendaftaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
