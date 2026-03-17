'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  Calendar,
  Ticket,
  Zap,
  Check,
  X as CloseIcon,
  Wallet,
  Plus,
  RefreshCcw,
  Copy,
} from 'lucide-react';

interface AgentData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  balance: number;
  minBalance: number;
  lastLogin?: string | null;
  voucherStock?: number;
}
interface Deposit {
  id: string;
  amount: number;
  status: string;
  paymentGateway: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  expiredAt: string | null;
  createdAt: string;
}

interface Profile {
  id: string;
  name: string;
  costPrice: number;
  resellerFee: number;
  sellingPrice: number;
  downloadSpeed: number;
  uploadSpeed: number;
  validityValue: number;
  validityUnit: string;
}

interface Voucher {
  id: string;
  code: string;
  batchCode: string;
  status: string;
  profileName: string;
  sellingPrice: number;
  resellerFee: number;
  routerName: string | null;
  firstLoginAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function AgentDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [stats, setStats] = useState({
    currentMonth: { total: 0, count: 0, income: 0 },
    allTime: { total: 0, count: 0, income: 0 },
    today: { total: 0, count: 0, income: 0 },
    generated: 0,
    waiting: 0,
    sold: 0,
    used: 0,
  });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [generatedVouchers, setGeneratedVouchers] = useState<Voucher[]>([]);
  const [showVouchersModal, setShowVouchersModal] = useState(false);
  const [codeLength, setCodeLength] = useState(6);
  const [codeType, setCodeType] = useState('alpha-upper');
  const [voucherPrefix, setVoucherPrefix] = useState('');

  // Deposit functionality
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositGateway, setDepositGateway] = useState('');
  const [depositPaymentMethod, setDepositPaymentMethod] = useState('');
  const [creatingDeposit, setCreatingDeposit] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<{ provider: string; name: string }[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; name: string; totalFee?: number; iconUrl?: string }[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [depositMode, setDepositMode] = useState<'gateway' | 'manual'>('gateway');
  const [manualDepositNote, setManualDepositNote] = useState('');
  const [creatingManualDeposit, setCreatingManualDeposit] = useState(false);

  // WhatsApp functionality
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Filter & Pagination
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  useEffect(() => {
    const agentDataStr = localStorage.getItem('agentData');
    if (!agentDataStr) {
      router.push('/agent');
      return;
    }

    const agentData = JSON.parse(agentDataStr);
    setAgent(agentData);
    loadDashboard(agentData.id);
  }, [router]);

  // Auto-load payment methods when modal is open and both gateway + amount are valid
  useEffect(() => {
    if (showDepositModal && depositGateway) {
      const parsed = parseInt(depositAmount);
      if (!isNaN(parsed) && parsed >= 10000) {
        loadPaymentMethods(depositGateway, parsed);
      } else {
        setPaymentMethods([]);
        setDepositPaymentMethod('');
      }
    }
  }, [showDepositModal, depositGateway, depositAmount]);

  const loadDashboard = async (agentId: string, page = 1, status = '', profileId = '', search = '') => {
    try {
      const params = new URLSearchParams({
        agentId,
        page: page.toString(),
        limit: '20',
      });
      if (status) params.append('status', status);
      if (profileId) params.append('profileId', profileId);
      if (search) params.append('search', search);

      const res = await fetch(`/api/agent/dashboard?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setAgent(data.agent);
        setStats(data.stats || {
          currentMonth: { total: 0, count: 0, income: 0 },
          allTime: { total: 0, count: 0, income: 0 },
          today: { total: 0, count: 0, income: 0 },
          generated: 0,
          waiting: 0,
          sold: 0,
          used: 0,
        });
        setProfiles(data.profiles || []);
        setVouchers(data.vouchers || []);
        setDeposits(data.deposits || []);
        setPaymentGateways(data.paymentGateways || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
        if (data.paymentGateways && data.paymentGateways.length > 0) {
          setDepositGateway(data.paymentGateways[0].provider);
        }
        if (data.profiles && data.profiles.length > 0 && !selectedProfile) {
          setSelectedProfile(data.profiles[0].id);
        }
      }
    } catch (error) {
      console.error('Load dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    setCurrentPage(1);
    if (agent) {
      loadDashboard(agent.id, 1, filterStatus, filterProfile, searchCode);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (agent) {
      loadDashboard(agent.id, newPage, filterStatus, filterProfile, searchCode);
    }
  };

  const handleClearFilter = () => {
    setFilterStatus('');
    setFilterProfile('');
    setSearchCode('');
    setCurrentPage(1);
    if (agent) {
      loadDashboard(agent.id, 1, '', '', '');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('agentData');
    router.push('/agent');
  };

  const handleSelectVoucher = (voucherId: string) => {
    setSelectedVouchers(prev =>
      prev.includes(voucherId)
        ? prev.filter(id => id !== voucherId)
        : [...prev, voucherId]
    );
  };

  const handleSelectAll = () => {
    const waitingVouchers = vouchers.filter(v => v.status === 'WAITING').map(v => v.id);
    setSelectedVouchers(waitingVouchers.length === selectedVouchers.length ? [] : waitingVouchers);
  };

  const handleSendWhatsApp = async () => {
    if (selectedVouchers.length === 0) {
      await showError('Pilih voucher terlebih dahulu');
      return;
    }
    setShowWhatsAppDialog(true);
  };

  const handleWhatsAppSubmit = async () => {
    if (!whatsappPhone) {
      await showError('Masukkan nomor WhatsApp');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const vouchersToSend = vouchers.filter(v => selectedVouchers.includes(v.id));

      const vouchersData = vouchersToSend.map(v => {
        const profile = profiles.find(p => p.name === v.profileName);
        return {
          code: v.code,
          profileName: v.profileName,
          price: profile?.sellingPrice || 0,
          validity: profile ? `${profile.validityValue} ${profile.validityUnit.toLowerCase()}` : '-'
        };
      });

      const res = await fetch('/api/hotspot/voucher/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: whatsappPhone,
          vouchers: vouchersData
        })
      });

      const data = await res.json();

      if (data.success) {
        await showSuccess(t('agent.portal.whatsappSentSuccess', { phone: whatsappPhone }));
        setShowWhatsAppDialog(false);
        setWhatsappPhone('');
        setSelectedVouchers([]);
      } else {
        await showError(t('common.error') + ': ' + data.error);
      }
    } catch (error) {
      console.error('Send WhatsApp error:', error);
      await showError(t('agent.portal.whatsappSentError'));
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleGenerate = async () => {
    if (!agent || !selectedProfile) return;

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) return;

    const totalCost = profile.costPrice * quantity;

    if (agent.balance < totalCost) {
      const deficit = totalCost - agent.balance;
      const result = await showConfirm(
        t('agent.portal.insufficientBalanceMessage', {
          current: formatCurrency(agent.balance),
          required: formatCurrency(totalCost),
          deficit: formatCurrency(deficit)
        }),
        t('agent.portal.insufficientBalanceTitle')
      );
      if (result) {
        setShowDepositModal(true);
        setDepositAmount(Math.ceil(deficit / 10000) * 10000 + '');
      }
      return;
    }

    const confirmed = await showConfirm(
      t('agent.portal.generateVoucherConfirm', {
        quantity: quantity.toString(),
        profile: profile.name,
        cost: formatCurrency(totalCost),
        balance: formatCurrency(agent.balance),
        after: formatCurrency(agent.balance - totalCost)
      }),
      t('agent.portal.generateVoucherTitle')
    );

    if (!confirmed) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/agent/generate-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          profileId: selectedProfile,
          quantity,
          codeLength,
          codeType,
          prefix: voucherPrefix,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setGeneratedVouchers(data.vouchers);
        setShowVouchersModal(true);
        if (data.newBalance !== undefined && agent) {
          setAgent({ ...agent, balance: data.newBalance });
        }
        loadDashboard(agent.id);
        await showSuccess(t('agent.portal.vouchersGeneratedSuccess', {
          count: data.vouchers.length.toString(),
          balance: formatCurrency(data.newBalance || 0)
        }));
      } else {
        if (data.error === 'Insufficient balance') {
          const deficit = data.deficit || 0;
          const result = await showConfirm(
            t('agent.portal.insufficientBalanceMessage', {
              current: formatCurrency(data.current || 0),
              required: formatCurrency(data.required || 0),
              deficit: formatCurrency(deficit)
            }),
            t('agent.portal.insufficientBalanceTitle')
          );
          if (result) {
            setShowDepositModal(true);
            setDepositAmount(Math.ceil(deficit / 10000) * 10000 + '');
          }
        } else {
          await showError(t('common.error') + ': ' + data.error);
        }
      }
    } catch (error) {
      console.error('Generate error:', error);
      await showError(t('agent.portal.voucherGenerateError'));
    } finally {
      setGenerating(false);
    }
  };

  const loadPaymentMethods = async (gateway: string, amount: number) => {
    if (!gateway || amount < 10000) {
      setPaymentMethods([]);
      setDepositPaymentMethod('');
      return;
    }
    setLoadingMethods(true);
    try {
      const res = await fetch(`/api/agent/deposit/payment-methods?gateway=${gateway}&amount=${amount}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentMethods(data.methods || []);
        if (data.methods?.length > 0) {
          setDepositPaymentMethod(data.methods[0].code);
        }
      } else {
        setPaymentMethods([]);
      }
    } catch {
      setPaymentMethods([]);
    } finally {
      setLoadingMethods(false);
    }
  };

  const handleCreateDeposit = async () => {
    if (!agent) return;

    if (paymentGateways.length === 0) {
      await showError(t('agent.portal.paymentGatewayNotConfigured'));
      return;
    }

    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount < 10000) {
      await showError(t('agent.portal.minimumDeposit'));
      return;
    }

    if (!depositGateway) {
      await showError(t('agent.portal.selectPaymentMethod'));
      return;
    }

    setCreatingDeposit(true);
    try {
      const res = await fetch('/api/agent/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          amount,
          gateway: depositGateway,
          paymentMethod: depositPaymentMethod || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.deposit.paymentUrl) {
          window.open(data.deposit.paymentUrl, '_blank');
          await showSuccess(t('agent.portal.paymentLinkOpened'));
          setShowDepositModal(false);
          setDepositAmount('');
          setDepositPaymentMethod('');
          setPaymentMethods([]);
          setTimeout(() => loadDashboard(agent.id), 3000);
        }
      } else {
        await showError(t('common.error') + ': ' + data.error);
      }
    } catch (error) {
      console.error('Create deposit error:', error);
      await showError(t('agent.portal.depositCreateError'));
    } finally {
      setCreatingDeposit(false);
    }
  };

  const handleCreateManualDepositRequest = async () => {
    if (!agent) return;

    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount < 10000) {
      await showError(t('agent.portal.minimumDeposit'));
      return;
    }

    setCreatingManualDeposit(true);
    try {
      const res = await fetch('/api/agent/deposit/manual-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          amount,
          note: manualDepositNote || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal membuat permintaan deposit manual');
      }

      await showSuccess('Permintaan deposit manual berhasil dikirim ke admin');
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositPaymentMethod('');
      setPaymentMethods([]);
      setManualDepositNote('');
      await loadDashboard(agent.id);
    } catch (error: any) {
      await showError(error.message || 'Gagal membuat permintaan deposit manual');
    } finally {
      setCreatingManualDeposit(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  const selectedProfileData = profiles.find(p => p.id === selectedProfile);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center relative z-10">
          <div className="w-10 h-10 border-4 border-[#00f7ff] border-t-transparent rounded-full animate-spin mx-auto mb-3 shadow-[0_0_20px_rgba(0,247,255,0.5)]"></div>
          <p className="text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.loading')}</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return null;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Balance Card - Desktop: smaller, Mobile: full */}
      <div className="bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] rounded-2xl shadow-[0_0_40px_rgba(188,19,254,0.3)] p-4 lg:p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs lg:text-sm opacity-90 uppercase tracking-wider">{t('agent.portal.yourBalance')}</p>
            <p className="text-2xl lg:text-3xl font-bold mt-1 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">{formatCurrency(agent.balance || 0)}</p>
            {agent.minBalance > 0 && (
              <p className="text-[10px] lg:text-xs opacity-75 mt-1">{t('agent.portal.minBalance')}: {formatCurrency(agent.minBalance)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDepositModal(true)}
              className="flex items-center px-3 lg:px-4 py-2 bg-white hover:bg-white/90 text-[#bc13fe] rounded-xl text-xs lg:text-sm font-bold transition shadow-lg hover:shadow-xl"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t('agent.portal.deposit')}
            </button>
            <button
              onClick={() => agent && loadDashboard(agent.id)}
              className="flex items-center justify-center px-3 py-2 bg-white hover:bg-white/90 text-[#bc13fe] rounded-xl transition shadow-lg hover:shadow-xl min-w-[40px]"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-emerald-200 dark:border-[#00ff88]/30 p-3 lg:p-4 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.commissionThisMonth')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-[#00ff88]">
                {formatCurrency(stats.currentMonth?.total || 0)}
              </p>
            </div>
            <TrendingUp className="h-5 lg:h-6 w-5 lg:w-6 text-[#00ff88] drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-purple-300 dark:border-[#bc13fe]/30 p-3 lg:p-4 shadow-[0_0_20px_rgba(188,19,254,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.totalCommission')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-[#bc13fe]">
                {formatCurrency(stats.allTime?.total || 0)}
              </p>
            </div>
            <Calendar className="h-5 lg:h-6 w-5 lg:w-6 text-[#bc13fe] drop-shadow-[0_0_10px_rgba(188,19,254,0.5)]" />
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-cyan-200 dark:border-[#00f7ff]/30 p-3 lg:p-4 shadow-[0_0_20px_rgba(0,247,255,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.availableVouchers')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-white">{stats.waiting || 0}</p>
            </div>
            <Ticket className="h-5 lg:h-6 w-5 lg:w-6 text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]" />
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-pink-200 dark:border-[#ff44cc]/30 p-3 lg:p-4 shadow-[0_0_20px_rgba(255,68,204,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.usedVouchers')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-white">{stats.used || 0}</p>
            </div>
            <Check className="h-5 lg:h-6 w-5 lg:w-6 text-[#ff44cc] drop-shadow-[0_0_10px_rgba(255,68,204,0.5)]" />
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-xl border-2 border-cyan-200 dark:border-[#00f7ff]/30 p-3 lg:p-4 shadow-[0_0_20px_rgba(0,247,255,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-[#e0d0ff]/70">{t('agent.portal.todaySales')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-[#00f7ff]">
                {formatCurrency(stats.today?.total || 0)}
              </p>
              <p className="text-[9px] lg:text-[10px] text-slate-400 dark:text-[#e0d0ff]/50 mt-0.5">{stats.today?.count || 0} {t('agent.portal.voucher').toLowerCase()}</p>
            </div>
            <Zap className="h-5 lg:h-6 w-5 lg:w-6 text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]" />
          </div>
        </div>
      </div>

      {/* Quick Generate */}
      <div className="bg-white/80 dark:bg-[#0a0520]/80 backdrop-blur-xl rounded-2xl border-2 border-purple-300 dark:border-[#bc13fe]/30 p-4 lg:p-5 shadow-[0_0_30px_rgba(188,19,254,0.15)]">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-[#ff44cc]/20 rounded-lg border border-pink-200 dark:border-[#ff44cc]/30">
              <Zap className="h-5 w-5 text-[#ff44cc] drop-shadow-[0_0_10px_rgba(255,68,204,0.6)]" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('agent.portal.generateVoucher')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-[#e0d0ff]/80 mb-1.5">{t('agent.portal.selectPackage')}</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-slate-900 dark:text-white focus:border-[#00f7ff] outline-none"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id} className="bg-white dark:bg-[#0a0520]">
                    {profile.name} - {formatCurrency(profile.sellingPrice)} - {profile.downloadSpeed}/{profile.uploadSpeed} Mbps
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#e0d0ff]/80 mb-1.5">{t('agent.portal.quantity')}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-slate-900 dark:text-white focus:border-[#00f7ff] outline-none"
              />
            </div>
          </div>

          {/* Code Options */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#e0d0ff]/80 mb-1.5">{t('agent.portal.codeType')}</label>
              <select
                value={codeType}
                onChange={(e) => setCodeType(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-slate-900 dark:text-white focus:border-[#00f7ff] outline-none"
              >
                <option value="alpha-upper" className="bg-white dark:bg-[#0a0520]">{t('agent.portal.uppercase')}</option>
                <option value="alpha-lower" className="bg-white dark:bg-[#0a0520]">{t('agent.portal.lowercase')}</option>
                <option value="numeric" className="bg-white dark:bg-[#0a0520]">{t('agent.portal.numeric')}</option>
                <option value="alphanumeric-upper" className="bg-white dark:bg-[#0a0520]">{t('agent.portal.alphaNum')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#e0d0ff]/80 mb-1.5">{t('agent.portal.codeLength')} (4–10)</label>
              <input
                type="number"
                min="4"
                max="10"
                value={codeLength}
                onChange={(e) => setCodeLength(Math.min(10, Math.max(4, parseInt(e.target.value) || 6)))}
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-slate-900 dark:text-white focus:border-[#00f7ff] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#e0d0ff]/80 mb-1.5">{t('agent.portal.voucherPrefix')}</label>
              <input
                type="text"
                maxLength={5}
                value={voucherPrefix}
                onChange={(e) => setVoucherPrefix(e.target.value.toUpperCase())}
                placeholder="mis. HS-"
                className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-slate-900 dark:text-white focus:border-[#00f7ff] outline-none placeholder:text-slate-400 dark:placeholder:text-[#e0d0ff]/30"
              />
            </div>
          </div>

          {selectedProfileData && (
            <div className="mt-3 p-4 bg-gradient-to-br from-[#bc13fe]/10 to-[#00f7ff]/10 rounded-xl border border-purple-200 dark:border-[#bc13fe]/20">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{t('agent.portal.costPrice')}</p>
                  <p className="font-semibold text-white">{formatCurrency(selectedProfileData.costPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{t('agent.portal.profitPerPiece')}</p>
                  <p className="font-semibold text-[#00ff88]">{formatCurrency(selectedProfileData.resellerFee)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{t('agent.portal.speed')}</p>
                  <p className="font-semibold text-white">{selectedProfileData.downloadSpeed}/{selectedProfileData.uploadSpeed} Mbps</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{t('agent.portal.totalPayment')}</p>
                  <p className="font-semibold text-[#00f7ff]">{formatCurrency(selectedProfileData.costPrice * quantity)}</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedProfile}
            className="mt-4 w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] hover:from-[#a010e0] hover:to-[#00d4dd] text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_25px_rgba(188,19,254,0.4)] hover:shadow-[0_0_35px_rgba(188,19,254,0.6)]"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                {t('agent.portal.generating')}...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                {t('agent.portal.generateVoucher')}
              </>
            )}
          </button>
        </div>

      {/* Generated Vouchers Modal */}
      {showVouchersModal && generatedVouchers.length > 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a0f35] border-2 border-cyan-400 dark:border-[#00f7ff]/50 rounded-2xl shadow-[0_0_50px_rgba(0,247,255,0.3)] max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-cyan-200 dark:border-[#00f7ff]/20 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#00f7ff]" />
                {t('agent.portal.voucherCreated')}
              </h2>
              <button
                onClick={() => setShowVouchersModal(false)}
                className="p-1.5 hover:bg-[#bc13fe]/20 rounded-lg transition"
              >
                <CloseIcon className="h-4 w-4 text-[#e0d0ff]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60 mb-3">{t('agent.portal.copyVoucherCode')}</p>
              <div className="space-y-2">
                {generatedVouchers.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-[#0a0520] rounded-xl border border-cyan-200 dark:border-[#00f7ff]/20">
                    <div>
                      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white">{v.code}</p>
                      <p className="text-[10px] text-slate-400 dark:text-[#e0d0ff]/50">{v.profileName}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(v.code);
                        showSuccess(t('agent.portal.codeCopied'));
                      }}
                      className="p-2 hover:bg-[#00f7ff]/10 rounded-lg transition"
                      title={t('agent.portal.copy')}
                    >
                      <Copy className="h-4 w-4 text-[#00f7ff]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-cyan-200 dark:border-[#00f7ff]/20 flex gap-2 justify-end">
              <button
                onClick={() => {
                  const all = generatedVouchers.map(v => v.code).join('\n');
                  navigator.clipboard.writeText(all);
                  showSuccess(t('agent.portal.codeCopied'));
                }}
                className="px-4 py-2 text-sm font-bold bg-[#00f7ff]/10 hover:bg-[#00f7ff]/20 text-[#00f7ff] border border-cyan-300 dark:border-[#00f7ff]/30 rounded-xl transition"
              >
                <Copy className="h-4 w-4 inline mr-1" />
                {t('agent.portal.copy')} {t('agent.portal.total').toLowerCase()}
              </button>
              <button
                onClick={() => setShowVouchersModal(false)}
                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] text-white rounded-xl transition"
              >
                {t('agent.portal.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#1a0f35] border-2 border-purple-400 dark:border-[#bc13fe]/50 rounded-2xl shadow-[0_0_50px_rgba(188,19,254,0.3)] max-w-sm w-full">
            <div className="px-5 py-4 border-b border-purple-200 dark:border-[#bc13fe]/20">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-[#00f7ff]" />
                {t('agent.portal.topUpBalance')}
              </h2>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDepositMode('gateway')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                    depositMode === 'gateway'
                      ? 'bg-[#00f7ff]/20 border-[#00f7ff] text-[#00f7ff]'
                      : 'bg-slate-100 dark:bg-[#0a0520] border-purple-300 dark:border-[#bc13fe]/30 text-slate-700 dark:text-[#e0d0ff]'
                  }`}
                >
                  Bayar Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMode('manual')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                    depositMode === 'manual'
                      ? 'bg-[#00f7ff]/20 border-[#00f7ff] text-[#00f7ff]'
                      : 'bg-slate-100 dark:bg-[#0a0520] border-purple-300 dark:border-[#bc13fe]/30 text-slate-700 dark:text-[#e0d0ff]'
                  }`}
                >
                  Request Manual
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-[#e0d0ff] mb-1.5">{t('agent.portal.depositAmount')}</label>
                <input
                  type="number"
                  placeholder={t('agent.portal.minimumDeposit')}
                  value={depositAmount}
                  onChange={(e) => {
                    setDepositAmount(e.target.value);
                    const parsed = parseInt(e.target.value);
                    if (depositMode === 'gateway' && depositGateway && !isNaN(parsed) && parsed >= 10000) {
                      loadPaymentMethods(depositGateway, parsed);
                    }
                  }}
                  className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-white focus:border-[#00f7ff] outline-none"
                  min="10000"
                  step="10000"
                />
              </div>

              {depositMode === 'gateway' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-[#e0d0ff] mb-1.5">{t('agent.portal.paymentMethod')}</label>
                    {paymentGateways.length > 0 ? (
                      <select
                        value={depositGateway}
                        onChange={(e) => {
                          setDepositGateway(e.target.value);
                          const parsed = parseInt(depositAmount);
                          if (!isNaN(parsed) && parsed >= 10000) {
                            loadPaymentMethods(e.target.value, parsed);
                          } else {
                            setPaymentMethods([]);
                            setDepositPaymentMethod('');
                          }
                        }}
                        className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-white focus:border-[#00f7ff] outline-none"
                      >
                        {paymentGateways.map((gw) => (
                          <option key={gw.provider} value={gw.provider} className="bg-white dark:bg-[#0a0520]">{gw.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-[#ff6b8a] p-3 bg-[#ff4466]/10 rounded-xl border border-red-200 dark:border-[#ff4466]/30">
                        {t('agent.portal.noPaymentGateway')}
                      </div>
                    )}
                  </div>

                  {/* Payment method selection - only shown after amount + gateway selected */}
                  {depositGateway && parseInt(depositAmount) >= 10000 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-[#e0d0ff] mb-2">
                        Pilih Kanal Pembayaran
                      </label>
                      {loadingMethods ? (
                        <div className="flex items-center gap-2 p-3 text-sm text-[#e0d0ff]/70">
                          <div className="w-4 h-4 border-2 border-[#00f7ff]/30 border-t-[#00f7ff] rounded-full animate-spin"></div>
                          Memuat metode pembayaran...
                        </div>
                      ) : paymentMethods.length === 0 ? (
                        <div className="flex items-center justify-between p-3 bg-[#ff4466]/10 border border-[#ff4466]/30 rounded-xl">
                          <p className="text-xs text-[#ff6b8a]">Gagal memuat metode pembayaran</p>
                          <button
                            onClick={() => loadPaymentMethods(depositGateway, parseInt(depositAmount))}
                            className="text-xs text-[#00f7ff] hover:underline ml-2 flex-shrink-0"
                            type="button"
                          >
                            Coba lagi
                          </button>
                        </div>
                      ) : paymentMethods.length === 1 && (paymentMethods[0].code === 'snap' || paymentMethods[0].code === 'invoice') ? (
                        <div className="p-3 bg-[#00f7ff]/10 rounded-xl border border-[#00f7ff]/30 text-sm text-[#00f7ff]">
                          {paymentMethods[0].name}
                        </div>
                      ) : (
                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                          {paymentMethods.map((method) => (
                            <label
                              key={method.code}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                depositPaymentMethod === method.code
                                  ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_10px_rgba(0,247,255,0.2)]'
                                  : 'border-[#bc13fe]/20 bg-[#0a0520] hover:border-[#bc13fe]/50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="paymentMethod"
                                value={method.code}
                                checked={depositPaymentMethod === method.code}
                                onChange={() => setDepositPaymentMethod(method.code)}
                                className="sr-only"
                              />
                              {method.iconUrl && (
                                <img src={method.iconUrl} alt={method.name} className="w-8 h-8 object-contain rounded" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{method.name}</p>
                                {method.totalFee !== undefined && method.totalFee > 0 && (
                                  <p className="text-xs text-[#e0d0ff]/60">
                                    Biaya: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(method.totalFee)}
                                  </p>
                                )}
                              </div>
                              {depositPaymentMethod === method.code && (
                                <div className="w-4 h-4 rounded-full bg-[#00f7ff] flex-shrink-0 shadow-[0_0_8px_rgba(0,247,255,0.6)]" />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#e0d0ff] mb-1.5">Catatan (opsional)</label>
                  <textarea
                    value={manualDepositNote}
                    onChange={(e) => setManualDepositNote(e.target.value)}
                    placeholder="Contoh: Transfer BCA a/n Agent"
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm bg-slate-100 dark:bg-[#0a0520] border-2 border-purple-300 dark:border-[#bc13fe]/30 rounded-xl text-white focus:border-[#00f7ff] outline-none"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-[#e0d0ff]/60 mt-1">
                    Permintaan akan masuk ke admin untuk diverifikasi manual.
                  </p>
                </div>
              )}

              {depositAmount && parseInt(depositAmount) >= 10000 && (
                <div className="bg-gradient-to-br from-[#bc13fe]/20 to-[#00f7ff]/20 p-4 rounded-xl border border-purple-300 dark:border-[#bc13fe]/30">
                  <p className="text-sm text-white">
                    {t('agent.portal.totalAmount')}: <span className="font-bold text-[#00f7ff]">{formatCurrency(parseInt(depositAmount))}</span>
                  </p>
                  {depositPaymentMethod && paymentMethods.find(m => m.code === depositPaymentMethod)?.totalFee ? (
                    <p className="text-xs text-[#e0d0ff]/70 mt-1">
                      Total bayar: <span className="font-bold text-[#00ff88]">
                        {formatCurrency(parseInt(depositAmount) + (paymentMethods.find(m => m.code === depositPaymentMethod)?.totalFee ?? 0))}
                      </span>
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-purple-200 dark:border-[#bc13fe]/20 flex gap-2 justify-end">
              <button
                onClick={() => { setShowDepositModal(false); setDepositAmount(''); setPaymentMethods([]); setDepositPaymentMethod(''); setManualDepositNote(''); setDepositMode('gateway'); }}
                className="px-4 py-2 text-sm text-slate-500 dark:text-[#e0d0ff]/70 hover:bg-purple-50 dark:hover:bg-[#bc13fe]/10 rounded-xl transition"
                disabled={creatingDeposit || creatingManualDeposit}
              >
                {t('agent.portal.cancel')}
              </button>
              <button
                onClick={depositMode === 'manual' ? handleCreateManualDepositRequest : handleCreateDeposit}
                disabled={
                  creatingDeposit ||
                  creatingManualDeposit ||
                  !depositAmount ||
                  parseInt(depositAmount) < 10000 ||
                  (depositMode === 'gateway' && paymentGateways.length === 0)
                }
                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-[#bc13fe] to-[#00f7ff] hover:from-[#a010e0] hover:to-[#00d4dd] text-white rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingDeposit || creatingManualDeposit ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mr-2"></div>{t('agent.portal.processing')}...</>
                ) : (
                  depositMode === 'manual' ? 'Kirim Permintaan' : t('agent.portal.payNow')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

