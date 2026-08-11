'use client';

import { useState, useEffect } from 'react';
import { Check, X, Eye, Download, Loader2, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';

interface TopUpRequest {
  id: string;
  amount: number;
  paymentMethod: string;
  description: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  metadata: any;
  user: {
    id: string;
    username: string;
    name: string;
    phone: string;
  };
}

export default function TopUpRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUCCESS' | 'FAILED'>('PENDING');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/topup-requests');
      if (!response.ok) throw new Error('Failed to load requests');
      
      const data = await response.json();
      setRequests(data.requests || []);
    } catch (error: any) {
      showError(error.message || t('topup.failedLoadRequests'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    const confirmed = await showConfirm(
      t('topup.approveConfirmTitle'),
      t('topup.approveConfirmDesc'),
      t('topup.approveConfirmButton')
    );

    if (!confirmed) return;

    try {
      setProcessing(requestId);
      const response = await fetch(`/api/admin/topup-requests/${requestId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('topup.failedApprove'));
      }

      showSuccess(t('topup.approveSuccess'));
      loadRequests();
    } catch (error: any) {
      showError(error.message || t('topup.failedProcess'));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    const confirmed = await showConfirm(
      t('topup.rejectConfirmTitle'),
      t('topup.rejectConfirmDesc'),
      t('topup.rejectConfirmButton'),
      t('common.cancel')
    );

    if (!confirmed) return;

    try {
      setProcessing(requestId);
      const response = await fetch(`/api/admin/topup-requests/${requestId}/reject`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('topup.failedReject'));
      }

      showSuccess(t('topup.rejectSuccess'));
      loadRequests();
    } catch (error: any) {
      showError(error.message || t('topup.failedProcess'));
    } finally {
      setProcessing(null);
    }
  };

  const filteredRequests = requests.filter(req => 
    filter === 'ALL' || req.status === filter
  );

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'SUCCESS').length;
  const rejectedCount = requests.filter(r => r.status === 'FAILED').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] mb-2">{t('topup.requestsTitle')}</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {t('topup.requestsDesc')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setFilter('PENDING')}
          className={`bg-card border-2 rounded-lg p-4 transition-all ${
            filter === 'PENDING' ? 'border-warning' : 'border-border hover:border-warning/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('topup.pending')}</p>
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-warning">{pendingCount}</p>
        </button>

        <button
          onClick={() => setFilter('SUCCESS')}
          className={`bg-card border-2 rounded-lg p-4 transition-all ${
            filter === 'SUCCESS' ? 'border-success' : 'border-border hover:border-success/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('topup.approved')}</p>
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-success">{approvedCount}</p>
        </button>

        <button
          onClick={() => setFilter('FAILED')}
          className={`bg-card border-2 rounded-lg p-4 transition-all ${
            filter === 'FAILED' ? 'border-destructive' : 'border-border hover:border-destructive/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('topup.rejected')}</p>
            <XCircle className="w-5 h-5 text-destructive" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-destructive">{rejectedCount}</p>
        </button>

        <button
          onClick={() => setFilter('ALL')}
          className={`bg-card border-2 rounded-lg p-4 transition-all ${
            filter === 'ALL' ? 'border-primary' : 'border-border hover:border-primary/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('common.total')}</p>
            <AlertCircle className="w-5 h-5 text-primary" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-primary">{requests.length}</p>
        </button>
      </div>

      {/* Requests List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('topup.noRequests')} {filter !== 'ALL' && filter.toLowerCase()}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRequests.map((req) => (
              <div key={req.id} className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  {/* User Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{req.user.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        req.status === 'PENDING' ? 'bg-warning/20 text-warning' :
                        req.status === 'SUCCESS' ? 'bg-success/20 text-success' :
                        'bg-destructive/20 text-destructive'
                      }`}>
                        {req.status === 'PENDING' ? t('topup.pending') :
                         req.status === 'SUCCESS' ? t('topup.approved') : t('topup.rejected')}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Username: <span className="text-foreground font-medium">{req.user.username}</span></p>
                      <p>{t('common.phone')}: <span className="text-foreground font-medium">{req.user.phone}</span></p>
                      <p>{t('topup.amount')}: <span className="text-primary font-bold text-lg">
                        Rp {req.amount.toLocaleString('id-ID')}
                      </span></p>
                      <p>{t('topup.method')}: <span className="text-foreground">{req.paymentMethod}</span></p>
                      <p>{t('topup.time')}: <span className="text-foreground">{formatWIB(req.createdAt)}</span></p>
                      {req.metadata?.note && (
                        <p className="text-xs bg-muted p-2 rounded mt-2">
                          <span className="font-medium">{t('topup.note')}:</span> {req.metadata.note}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    {/* Proof Image */}
                    {req.metadata?.proofPath && (
                      <button
                        onClick={() => setSelectedImage(req.metadata.proofPath)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-sm rounded transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        {t('topup.viewProof')}
                      </button>
                    )}

                    {/* Approve/Reject */}
                    {req.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={processing === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-success hover:bg-success/90 text-white text-sm rounded transition-colors disabled:opacity-50"
                        >
                          {processing === req.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          {t('topup.approve')}
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={processing === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-white text-sm rounded transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                          {t('topup.reject')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-card rounded-lg overflow-hidden">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 p-2 bg-destructive text-white rounded-full hover:bg-destructive/90 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt={t('topup.paymentProof')}
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
