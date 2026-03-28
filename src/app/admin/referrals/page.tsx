'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import { CyberCard, CyberButton, CyberBadge } from '@/components/cyberpunk';
import {
  Gift, Users, Wallet, Clock, CheckCircle, XCircle, Search,
  Loader2, ChevronLeft, ChevronRight, AlertCircle
} from 'lucide-react';

interface ReferralReward {
  id: string;
  amount: number;
  status: string;
  type: string;
  creditedAt: string | null;
  createdAt: string;
  referrer: {
    id: string;
    name: string;
    username: string;
    phone: string;
    referralCode: string;
  };
  referred: {
    id: string;
    name: string;
    username: string;
    phone: string;
    createdAt: string;
  };
}

interface Stats {
  totalRewards: number;
  pendingRewards: number;
  creditedRewards: number;
  totalCredited: number;
  usersWithCode: number;
  referredUsers: number;
}

export default function AdminReferralsPage() {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/referrals?${params}`);
      const data = await res.json();
      if (data.success) {
        setRewards(data.rewards);
        setStats(data.stats);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Load referrals error:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const processReward = async (rewardId: string, action: 'credit' | 'expire') => {
    setProcessing(rewardId);
    try {
      const res = await fetch(`/api/admin/referrals/${rewardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Berhasil!', description: data.message });
        loadData();
      } else {
        addToast({ type: 'error', title: 'Error', description: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', description: t('referrals.errorProcess') });
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy HH:mm');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gift className="w-6 h-6 text-cyan-500" />
            {t('referrals.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('referrals.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <CyberCard className="p-3">
            <div className="text-center">
              <Users className="w-5 h-5 mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.usersWithCode}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statHasCode')}</p>
            </div>
          </CyberCard>
          <CyberCard className="p-3">
            <div className="text-center">
              <Users className="w-5 h-5 mx-auto text-purple-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.referredUsers}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statReferred')}</p>
            </div>
          </CyberCard>
          <CyberCard className="p-3">
            <div className="text-center">
              <Gift className="w-5 h-5 mx-auto text-cyan-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.totalRewards}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statTotalRewards')}</p>
            </div>
          </CyberCard>
          <CyberCard className="p-3">
            <div className="text-center">
              <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.pendingRewards}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statPending')}</p>
            </div>
          </CyberCard>
          <CyberCard className="p-3">
            <div className="text-center">
              <CheckCircle className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{stats.creditedRewards}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statCredited')}</p>
            </div>
          </CyberCard>
          <CyberCard className="p-3">
            <div className="text-center">
              <Wallet className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalCredited)}</p>
              <p className="text-xs text-muted-foreground">{t('referrals.statTotalCredited')}</p>
            </div>
          </CyberCard>
        </div>
      )}

      {/* Filters */}
      <CyberCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('referrals.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            <option value="">{t('referrals.allStatus')}</option>
            <option value="PENDING">{t('referrals.statusPending')}</option>
            <option value="CREDITED">{t('referrals.statusCredited')}</option>
            <option value="EXPIRED">{t('referrals.statusExpired')}</option>
          </select>
        </div>
      </CyberCard>

      {/* Rewards Table */}
      <CyberCard className="p-4">
        {rewards.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">{t('referrals.noData')}</p>
          </div>
        ) : (
          <>
          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-border">
            {rewards.map((reward) => (
              <div key={reward.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{reward.referrer.name}</p>
                    <p className="text-[10px] text-muted-foreground">{reward.referrer.phone}</p>
                    <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{reward.referrer.referralCode}</code>
                  </div>
                  <CyberBadge
                    variant={
                      reward.status === 'CREDITED' ? 'success' :
                      reward.status === 'PENDING' ? 'warning' : 'destructive'
                    }
                  >
                    {reward.status === 'CREDITED' ? t('referrals.statusCredited') :
                     reward.status === 'PENDING' ? t('referrals.statusPending') : t('referrals.statusExpired')}
                  </CyberBadge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Referred:</span>
                    <p className="font-medium text-foreground">{reward.referred.name}</p>
                    <p className="text-[10px] text-muted-foreground">{reward.referred.phone}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Reward:</span>
                    <p className="font-semibold text-foreground">{formatCurrency(reward.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(reward.createdAt)}</p>
                  </div>
                </div>
                {reward.status === 'PENDING' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => processReward(reward.id, 'credit')}
                      disabled={processing === reward.id}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {processing === reward.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Credit
                    </button>
                    <button
                      onClick={() => processReward(reward.id, 'expire')}
                      disabled={processing === reward.id}
                      className="flex-1 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3 h-3" /> Expire
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colReferrer')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colCode')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colReferred')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colReward')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colStatus')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colDate')}</th>
                  <th className="py-3 px-3 text-xs font-semibold text-muted-foreground">{t('referrals.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr key={reward.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{reward.referrer.name}</p>
                      <p className="text-xs text-muted-foreground">{reward.referrer.phone}</p>
                    </td>
                    <td className="py-3 px-3">
                      <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                        {reward.referrer.referralCode}
                      </code>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-foreground">{reward.referred.name}</p>
                      <p className="text-xs text-muted-foreground">{reward.referred.phone}</p>
                    </td>
                    <td className="py-3 px-3 font-semibold text-foreground">
                      {formatCurrency(reward.amount)}
                    </td>
                    <td className="py-3 px-3">
                      <CyberBadge
                        variant={
                          reward.status === 'CREDITED' ? 'success' :
                          reward.status === 'PENDING' ? 'warning' : 'destructive'
                        }
                      >
                        {reward.status === 'CREDITED' ? t('referrals.statusCredited') :
                         reward.status === 'PENDING' ? t('referrals.statusPending') : t('referrals.statusExpired')}
                      </CyberBadge>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground">
                      {formatDate(reward.createdAt)}
                    </td>
                    <td className="py-3 px-3">
                      {reward.status === 'PENDING' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => processReward(reward.id, 'credit')}
                            disabled={processing === reward.id}
                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                            title={t('referrals.credit')}
                          >
                            {processing === reward.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => processReward(reward.id, 'expire')}
                            disabled={processing === reward.id}
                            className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                            title="Expire"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {t('referrals.page')} {page} {t('referrals.of')} {totalPages}
            </p>
            <div className="flex gap-2">
              <CyberButton
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </CyberButton>
              <CyberButton
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </CyberButton>
            </div>
          </div>
        )}
      </CyberCard>
    </div>
  );
}
