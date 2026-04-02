'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatWIB } from '@/lib/timezone';
import { 
  Gift, Copy, Share2, Users, Wallet, Clock, CheckCircle, 
  Loader2, AlertCircle, ExternalLink, QrCode
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { CyberCard, CyberButton } from '@/components/cyberpunk';

export const dynamic = 'force-dynamic';

interface ReferralData {
  code: string | null;
  shareUrl: string | null;
  referredBy: { id: string; name: string } | null;
  stats: {
    totalReferred: number;
    totalRewardsCredited: number;
    totalRewardsCount: number;
    pendingRewardsAmount: number;
    pendingRewardsCount: number;
  };
  recentReferrals: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
}

interface ReferralConfig {
  enabled: boolean;
  rewardAmount: number;
  rewardType: string;
}

interface RewardItem {
  id: string;
  amount: number;
  status: string;
  type: string;
  creditedAt: string | null;
  createdAt: string;
  referred: {
    id: string;
    name: string;
    createdAt: string;
  };
}

export default function CustomerReferralPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'rewards'>('overview');

  const getToken = () => localStorage.getItem('customer_token');

  const loadReferralData = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) { router.push('/customer/login'); return; }

      const res = await fetch('/api/customer/referral', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) { router.push('/customer/login'); return; }

      const data = await res.json();
      if (data.success) {
        setReferral(data.referral);
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Load referral error:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadRewards = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch('/api/customer/referral/rewards', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (data.success) {
        setRewards(data.rewards);
      }
    } catch (error) {
      console.error('Load rewards error:', error);
    }
  }, []);

  useEffect(() => {
    loadReferralData();
    loadRewards();
  }, [loadReferralData, loadRewards]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch('/api/customer/referral', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Berhasil!', description: 'Kode referral berhasil dibuat' });
        loadReferralData();
      } else {
        addToast({ type: 'error', title: 'Error', description: data.error || 'Gagal membuat kode referral' });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', description: 'Gagal membuat kode referral' });
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', title: 'Tersalin!', description: 'Berhasil disalin ke clipboard' });
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      addToast({ type: 'success', title: 'Tersalin!', description: 'Berhasil disalin ke clipboard' });
    }
  };

  const shareReferral = async () => {
    if (!referral?.shareUrl) return;

    const shareData = {
      title: 'Referral Internet',
      text: `Daftar internet menggunakan kode referral saya: ${referral.code}\nDapatkan bonus saldo!`,
      url: referral.shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          copyCode(referral.shareUrl);
        }
      }
    } else {
      copyCode(referral.shareUrl);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (dateStr: string) => formatWIB(dateStr, 'd MMM yyyy');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Referral</h1>
        <CyberCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">
              Sistem Referral Belum Aktif
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2 max-w-sm">
              Program referral saat ini belum diaktifkan oleh admin. Silakan cek kembali nanti.
            </p>
          </div>
        </CyberCard>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Gift className="w-5 h-5 text-cyan-500" />
        Program Referral
      </h1>

      {/* Referral Code Card */}
      <CyberCard>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Kode Referral Anda</p>
            {referral?.code ? (
              <>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-bold tracking-widest text-cyan-600 dark:text-cyan-400 font-mono">
                    {referral.code}
                  </span>
                  <button
                    onClick={() => copyCode(referral.code!)}
                    className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-900/50 transition-colors"
                    title="Salin kode"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>

                {/* Share URL */}
                {referral.shareUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-xs">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-500 dark:text-gray-400 truncate flex-1">
                        {referral.shareUrl}
                      </span>
                      <button
                        onClick={() => copyCode(referral.shareUrl!)}
                        className="text-cyan-500 hover:text-cyan-600 flex-shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Share Button */}
                <div className="mt-4">
                  <CyberButton onClick={shareReferral} className="w-full">
                    <Share2 className="w-4 h-4 mr-2" />
                    Bagikan Kode Referral
                  </CyberButton>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Anda belum memiliki kode referral. Buat sekarang untuk mulai mengajak teman!
                </p>
                <CyberButton onClick={generateCode} disabled={generating}>
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4 mr-2" />
                  )}
                  {generating ? 'Membuat...' : 'Buat Kode Referral'}
                </CyberButton>
              </div>
            )}
          </div>
        </div>
      </CyberCard>

      {/* Reward Info + How it Works */}
      <CyberCard>
        <div className="p-1 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0">
              <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Bonus Referral</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Ajak teman untuk berlangganan dan dapatkan bonus{' '}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(config.rewardAmount)}
                </span>
                {' '}per referral
                {config.rewardType === 'FIRST_PAYMENT' ? ' (setelah pembayaran pertama teman)' : ' (saat pendaftaran disetujui)'}.
              </p>
            </div>
          </div>

          {/* Flow steps */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cara Kerja</p>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-xs font-bold text-cyan-600 dark:text-cyan-400">1</div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Bagikan kode referral</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Kirim kode atau link pendaftaran ke teman Anda</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-xs font-bold text-cyan-600 dark:text-cyan-400">2</div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Teman mendaftar dengan kode Anda</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Teman membuka link atau memasukkan kode referral saat daftar</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-xs font-bold text-cyan-600 dark:text-cyan-400">3</div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {config.rewardType === 'FIRST_PAYMENT' ? 'Teman melakukan pembayaran pertama' : 'Pendaftaran disetujui admin'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {config.rewardType === 'FIRST_PAYMENT'
                    ? 'Bonus dicatat sebagai pending, lalu dikreditkan saat teman melunasi tagihan pertama'
                    : 'Bonus langsung dikreditkan saat admin menyetujui pendaftaran teman'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bonus diterima!</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Anda mendapat reward{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(config.rewardAmount)}
                  </span>{' '}
                  yang tercatat di tab Riwayat Reward
                </p>
              </div>
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Stats */}
      {referral?.code && (
        <div className="grid grid-cols-3 gap-3">
          <CyberCard>
            <div className="text-center py-1">
              <Users className="w-5 h-5 mx-auto text-blue-500 mb-1" />
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {referral.stats.totalReferred}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Teman</p>
            </div>
          </CyberCard>
          <CyberCard>
            <div className="text-center py-1">
              <Wallet className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(referral.stats.totalRewardsCredited)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Diterima</p>
            </div>
          </CyberCard>
          <CyberCard>
            <div className="text-center py-1">
              <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(referral.stats.pendingRewardsAmount)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
            </div>
          </CyberCard>
        </div>
      )}

      {/* Tabs */}
      {referral?.code && (
        <>
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Teman Terdaftar
            </button>
            <button
              onClick={() => setActiveTab('rewards')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'rewards'
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Riwayat Reward
            </button>
          </div>

          {/* Tab Content: Recent Referrals */}
          {activeTab === 'overview' && (
            <div className="space-y-2">
              {referral.recentReferrals.length === 0 ? (
                <CyberCard>
                  <div className="text-center py-8">
                    <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Belum ada teman yang mendaftar dari referral Anda
                    </p>
                  </div>
                </CyberCard>
              ) : (
                referral.recentReferrals.map((ref) => (
                  <CyberCard key={ref.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                          <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">{ref.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Bergabung {formatDate(ref.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CyberCard>
                ))
              )}
            </div>
          )}

          {/* Tab Content: Rewards History */}
          {activeTab === 'rewards' && (
            <div className="space-y-2">
              {rewards.length === 0 ? (
                <CyberCard>
                  <div className="text-center py-8">
                    <Wallet className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Belum ada riwayat reward
                    </p>
                  </div>
                </CyberCard>
              ) : (
                rewards.map((reward) => (
                  <CyberCard key={reward.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          reward.status === 'CREDITED'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : reward.status === 'PENDING'
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {reward.status === 'CREDITED' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : reward.status === 'PENDING' ? (
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {reward.referred.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(reward.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-sm ${
                          reward.status === 'CREDITED'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : reward.status === 'PENDING'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400'
                        }`}>
                          {reward.status === 'CREDITED' ? '+' : ''}{formatCurrency(reward.amount)}
                        </p>
                        <p className={`text-xs ${
                          reward.status === 'CREDITED'
                            ? 'text-emerald-500'
                            : reward.status === 'PENDING'
                            ? 'text-amber-500'
                            : 'text-gray-400'
                        }`}>
                          {reward.status === 'CREDITED' ? 'Diterima' : reward.status === 'PENDING' ? 'Menunggu' : 'Expired'}
                        </p>
                      </div>
                    </div>
                  </CyberCard>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Referred By Info */}
      {referral?.referredBy && (
        <CyberCard>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Gift className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Direferensikan oleh</p>
              <p className="font-medium text-gray-900 dark:text-white text-sm">{referral.referredBy.name}</p>
            </div>
          </div>
        </CyberCard>
      )}
    </div>
  );
}
