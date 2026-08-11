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

interface AdminBankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
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
  const [adminBankAccounts, setAdminBankAccounts] = useState<AdminBankAccount[]>([]);
  const [selectedAdminBankKey, setSelectedAdminBankKey] = useState('');
  const [senderAccountName, setSenderAccountName] = useState('');
  const [senderAccountNumber, setSenderAccountNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);

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
    loadDashboard();
    loadAdminBankAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Auto-load payment methods when modal is open and both gateway + amount are valid
  useEffect(() => {
    if (showDepositModal && depositMode === 'gateway' && depositGateway) {
      const parsed = parseInt(depositAmount);
      if (!isNaN(parsed) && parsed >= 10000) {
        loadPaymentMethods(depositGateway, parsed);
      } else {
        setPaymentMethods([]);
        setDepositPaymentMethod('');
      }
    }
  }, [showDepositModal, depositMode, depositGateway, depositAmount]);

  const loadAdminBankAccounts = async () => {
    try {
      const res = await fetch('/api/company/info');
      const data = await res.json();
      const accounts = (data?.data?.bankAccounts || []) as AdminBankAccount[];
      setAdminBankAccounts(accounts);
      if (accounts.length > 0) {
        const firstKey = `${accounts[0].bankName}|${accounts[0].accountNumber}|${accounts[0].accountName}`;
        setSelectedAdminBankKey(firstKey);
      }
    } catch {
      setAdminBankAccounts([]);
    }
  };

  const loadDashboard = async (page = 1, status = '', profileId = '', search = '') => {
    try {
      const token = localStorage.getItem('agentToken');
      if (!token) { router.push('/agent'); return; }
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (status) params.append('status', status);
      if (profileId) params.append('profileId', profileId);
      if (search) params.append('search', search);

      const res = await fetch(`/api/agent/dashboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    loadDashboard(1, filterStatus, filterProfile, searchCode);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    loadDashboard(newPage, filterStatus, filterProfile, searchCode);
  };

  const handleClearFilter = () => {
    setFilterStatus('');
    setFilterProfile('');
    setSearchCode('');
    setCurrentPage(1);
    loadDashboard(1, '', '', '');
  };

  const handleLogout = () => {
    localStorage.removeItem('agentData');
    localStorage.removeItem('agentToken');
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
      const token = localStorage.getItem('agentToken');
      const res = await fetch('/api/agent/generate-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        loadDashboard();
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
      const token = localStorage.getItem('agentToken');
      const res = await fetch('/api/agent/deposit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
          setTimeout(() => loadDashboard(), 3000);
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

    if (adminBankAccounts.length === 0 || !selectedAdminBankKey) {
      await showError('Rekening admin belum tersedia. Hubungi admin untuk mengisi rekening tujuan transfer.');
      return;
    }

    if (!senderAccountName.trim()) {
      await showError('Nama pemilik rekening pengirim wajib diisi');
      return;
    }

    if (!proofFile) {
      await showError('Bukti transfer wajib diupload');
      return;
    }

    const [targetBankName, targetBankAccountNumber, targetBankAccountName] = selectedAdminBankKey.split('|');

    setCreatingManualDeposit(true);
    try {
      setUploadingProof(true);
      const uploadForm = new FormData();
      uploadForm.append('file', proofFile);
      const uploadRes = await fetch('/api/upload/payment-proof', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success || !uploadData.url) {
        throw new Error(uploadData.error || 'Gagal upload bukti transfer');
      }
      setUploadingProof(false);

      const token = localStorage.getItem('agentToken');
      const res = await fetch('/api/agent/deposit/manual-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentId: agent.id,
          amount,
          targetBankName,
          targetBankAccountNumber,
          targetBankAccountName,
          senderAccountName: senderAccountName.trim(),
          senderAccountNumber: senderAccountNumber.trim() || undefined,
          receiptImage: uploadData.url,
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
      setSenderAccountName('');
      setSenderAccountNumber('');
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
      await loadDashboard();
    } catch (error: any) {
      await showError(error.message || 'Gagal membuat permintaan deposit manual');
    } finally {
      setUploadingProof(false);
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
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 dark:text-slate-400">{t('agent.portal.loading')}</p>
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
      <div className="bg-gradient-to-r from-violet-600 to-cyan-600 rounded-2xl shadow-lg p-4 lg:p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs lg:text-sm opacity-90 uppercase tracking-wider">{t('agent.portal.yourBalance')}</p>
            <p className="text-2xl lg:text-3xl font-bold mt-1">{formatCurrency(agent.balance || 0)}</p>
            {agent.minBalance > 0 && (
              <p className="text-[10px] lg:text-xs opacity-75 mt-1">{t('agent.portal.minBalance')}: {formatCurrency(agent.minBalance)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDepositModal(true)}
              className="flex items-center px-3 lg:px-4 py-2 bg-white hover:bg-white/90 text-violet-700 rounded-xl text-xs lg:text-sm font-bold transition shadow-lg hover:shadow-xl"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t('agent.portal.deposit')}
            </button>
            <button
              onClick={() => loadDashboard()}
              className="flex items-center justify-center px-3 py-2 bg-white hover:bg-white/90 text-violet-700 rounded-xl transition shadow-lg hover:shadow-xl min-w-[40px]"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-emerald-200 dark:border-emerald-500/20 p-3 lg:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.commissionThisMonth')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-emerald-600 dark:text-emerald-400">
                {formatCurrency(stats.currentMonth?.total || 0)}
              </p>
            </div>
            <TrendingUp className="h-5 lg:h-6 w-5 lg:w-6 text-emerald-500 dark:text-emerald-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-violet-200 dark:border-violet-500/20 p-3 lg:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.totalCommission')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-violet-600 dark:text-violet-400">
                {formatCurrency(stats.allTime?.total || 0)}
              </p>
            </div>
            <Calendar className="h-5 lg:h-6 w-5 lg:w-6 text-violet-500 dark:text-violet-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-cyan-200 dark:border-cyan-500/20 p-3 lg:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.availableVouchers')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-cyan-600 dark:text-cyan-400">{stats.waiting || 0}</p>
            </div>
            <Ticket className="h-5 lg:h-6 w-5 lg:w-6 text-cyan-500 dark:text-cyan-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-pink-200 dark:border-pink-500/20 p-3 lg:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.usedVouchers')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-pink-600 dark:text-pink-400">{stats.used || 0}</p>
            </div>
            <Check className="h-5 lg:h-6 w-5 lg:w-6 text-pink-500 dark:text-pink-400" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-blue-200 dark:border-blue-500/20 p-3 lg:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.todaySales')}</p>
              <p className="text-base lg:text-lg font-bold mt-0.5 text-blue-600 dark:text-blue-400">
                {formatCurrency(stats.today?.total || 0)}
              </p>
              <p className="text-[9px] lg:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{stats.today?.count || 0} {t('agent.portal.voucher').toLowerCase()}</p>
            </div>
            <Zap className="h-5 lg:h-6 w-5 lg:w-6 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Quick Generate */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 lg:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-violet-100 dark:bg-violet-500/20 rounded-lg border border-violet-200 dark:border-violet-500/30 flex items-center justify-center">
              <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('agent.portal.generateVoucher')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('agent.portal.selectPackage')}</label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id} className="bg-white dark:bg-slate-900">
                    {profile.name} - {formatCurrency(profile.sellingPrice)} - {profile.validityValue} {profile.validityUnit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('agent.portal.quantity')}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
              />
            </div>
          </div>

          {/* Code Options */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('agent.portal.codeType')}</label>
              <select
                value={codeType}
                onChange={(e) => setCodeType(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
              >
                <option value="alpha-upper" className="bg-white dark:bg-slate-900">{t('agent.portal.uppercase')}</option>
                <option value="alpha-lower" className="bg-white dark:bg-slate-900">{t('agent.portal.lowercase')}</option>
                <option value="numeric" className="bg-white dark:bg-slate-900">{t('agent.portal.numeric')}</option>
                <option value="alphanumeric-upper" className="bg-white dark:bg-slate-900">{t('agent.portal.alphaNum')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('agent.portal.codeLength')} (4–10)</label>
              <input
                type="number"
                min="4"
                max="10"
                value={codeLength}
                onChange={(e) => setCodeLength(Math.min(10, Math.max(4, parseInt(e.target.value) || 6)))}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{t('agent.portal.voucherPrefix')}</label>
              <input
                type="text"
                maxLength={5}
                value={voucherPrefix}
                onChange={(e) => setVoucherPrefix(e.target.value.toUpperCase())}
                placeholder="mis. HS-"
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {selectedProfileData && (
            <div className="mt-3 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.costPrice')}</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(selectedProfileData.costPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.profitPerPiece')}</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedProfileData.resellerFee)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.validity')}</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedProfileData.validityValue} {selectedProfileData.validityUnit}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('agent.portal.totalPayment')}</p>
                  <p className="font-semibold text-cyan-700 dark:text-cyan-400">{formatCurrency(selectedProfileData.costPrice * quantity)}</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedProfile}
            className="mt-4 w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
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
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                {t('agent.portal.voucherCreated')}
              </h2>
              <button
                onClick={() => setShowVouchersModal(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                <CloseIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('agent.portal.copyVoucherCode')}</p>
              <div className="space-y-2">
                {generatedVouchers.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <p className="font-mono font-bold text-sm text-slate-900 dark:text-white">{v.code}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{v.profileName}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(v.code);
                        showSuccess(t('agent.portal.codeCopied'));
                      }}
                      className="p-2 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-lg transition"
                      title={t('agent.portal.copy')}
                    >
                      <Copy className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
              <button
                onClick={() => {
                  const all = generatedVouchers.map(v => v.code).join('\n');
                  navigator.clipboard.writeText(all);
                  showSuccess(t('agent.portal.codeCopied'));
                }}
                className="px-4 py-2 text-sm font-bold bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 rounded-xl transition"
              >
                <Copy className="h-4 w-4 inline mr-1" />
                {t('agent.portal.copy')} {t('agent.portal.total').toLowerCase()}
              </button>
              <button
                onClick={() => setShowVouchersModal(false)}
                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-violet-600 to-cyan-600 text-white rounded-xl transition"
              >
                {t('agent.portal.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl w-full max-w-sm sm:max-w-lg max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                {t('agent.portal.topUpBalance')}
              </h2>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto min-h-0">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDepositMode('gateway')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                    depositMode === 'gateway'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-700 dark:bg-cyan-500/20 dark:border-cyan-400 dark:text-cyan-300'
                      : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Bayar Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMode('manual')}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
                    depositMode === 'manual'
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-700 dark:bg-cyan-500/20 dark:border-cyan-400 dark:text-cyan-300'
                      : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Request Manual
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('agent.portal.depositAmount')}</label>
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
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                  min="10000"
                  step="10000"
                />
              </div>

              {depositMode === 'gateway' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t('agent.portal.paymentMethod')}</label>
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
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                      >
                        {paymentGateways.map((gw) => (
                          <option key={gw.provider} value={gw.provider} className="bg-white dark:bg-slate-900">{gw.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-700/30">
                        {t('agent.portal.noPaymentGateway')}
                      </div>
                    )}
                  </div>

                  {/* Payment method selection - only shown after amount + gateway selected */}
                  {depositGateway && parseInt(depositAmount) >= 10000 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Pilih Kanal Pembayaran
                      </label>
                      {loadingMethods ? (
                        <div className="flex items-center gap-2 p-3 text-sm text-slate-500 dark:text-slate-400">
                          <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-cyan-500 dark:border-t-cyan-400 rounded-full animate-spin"></div>
                          Memuat metode pembayaran...
                        </div>
                      ) : paymentMethods.length === 0 ? (
                        <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-xl">
                          <p className="text-xs text-red-600 dark:text-red-400">Gagal memuat metode pembayaran</p>
                          <button
                            onClick={() => loadPaymentMethods(depositGateway, parseInt(depositAmount))}
                            className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline ml-2 flex-shrink-0"
                            type="button"
                          >
                            Coba lagi
                          </button>
                        </div>
                      ) : paymentMethods.length === 1 && (paymentMethods[0].code === 'snap' || paymentMethods[0].code === 'invoice') ? (
                        <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-200 dark:border-cyan-700/30 text-sm text-cyan-700 dark:text-cyan-400">
                          {paymentMethods[0].name}
                        </div>
                      ) : (
                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                          {paymentMethods.map((method) => (
                            <label
                              key={method.code}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                depositPaymentMethod === method.code
                                  ? 'border-cyan-500 dark:border-cyan-400 bg-cyan-50 dark:bg-cyan-500/10'
                                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/50 hover:border-slate-300 dark:hover:border-slate-500'
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
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={method.iconUrl} alt={method.name} className="w-8 h-8 object-contain rounded" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{method.name}</p>
                                {method.totalFee !== undefined && method.totalFee > 0 && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Biaya: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(method.totalFee)}
                                  </p>
                                )}
                              </div>
                              {depositPaymentMethod === method.code && (
                                <div className="w-4 h-4 rounded-full bg-cyan-500 dark:bg-cyan-400 flex-shrink-0" />
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Rekening Tujuan Admin</label>
                    {adminBankAccounts.length > 0 ? (
                      <select
                        value={selectedAdminBankKey}
                        onChange={(e) => setSelectedAdminBankKey(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                      >
                        {adminBankAccounts.map((account) => {
                          const key = `${account.bankName}|${account.accountNumber}|${account.accountName}`;
                          return (
                            <option key={key} value={key} className="bg-white dark:bg-slate-900">
                              {account.bankName} - {account.accountNumber} (a/n {account.accountName})
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-700/30">
                        Tidak ada rekening admin untuk transfer manual.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nama Rekening Pengirim</label>
                    <input
                      type="text"
                      value={senderAccountName}
                      onChange={(e) => setSenderAccountName(e.target.value)}
                      placeholder="Nama pemilik rekening pengirim"
                      className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nomor Rekening Pengirim (opsional)</label>
                    <input
                      type="text"
                      value={senderAccountNumber}
                      onChange={(e) => setSenderAccountNumber(e.target.value)}
                      placeholder="Contoh: 1234567890"
                      className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Upload Bukti Transfer</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                        setProofFile(file);
                        setProofPreviewUrl(file ? URL.createObjectURL(file) : null);
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300"
                    />
                    {proofPreviewUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proofPreviewUrl} alt="Bukti transfer" className="w-full max-h-48 object-contain bg-slate-100 dark:bg-black/20" />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Catatan (opsional)</label>
                    <textarea
                      value={manualDepositNote}
                      onChange={(e) => setManualDepositNote(e.target.value)}
                      placeholder="Contoh: Transfer BCA via m-banking"
                      rows={3}
                      className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:border-violet-500 dark:focus:border-violet-400 outline-none"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Permintaan akan masuk ke admin untuk diverifikasi manual.
                    </p>
                  </div>
                </div>
              )}

              {depositAmount && parseInt(depositAmount) >= 10000 && (
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-900 dark:text-white">
                    {t('agent.portal.totalAmount')}: <span className="font-bold text-cyan-700 dark:text-cyan-400">{formatCurrency(parseInt(depositAmount))}</span>
                  </p>
                  {depositPaymentMethod && paymentMethods.find(m => m.code === depositPaymentMethod)?.totalFee ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Total bayar: <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(parseInt(depositAmount) + (paymentMethods.find(m => m.code === depositPaymentMethod)?.totalFee ?? 0))}
                      </span>
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="px-4 sm:px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row gap-2 justify-end shrink-0">
              <button
                onClick={() => {
                  setShowDepositModal(false);
                  setDepositAmount('');
                  setPaymentMethods([]);
                  setDepositPaymentMethod('');
                  setManualDepositNote('');
                  setSenderAccountName('');
                  setSenderAccountNumber('');
                  setProofFile(null);
                  if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
                  setProofPreviewUrl(null);
                  setDepositMode('gateway');
                }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition w-full sm:w-auto border border-slate-200 dark:border-slate-600"
                disabled={creatingDeposit || creatingManualDeposit || uploadingProof}
              >
                {t('agent.portal.cancel')}
              </button>
              <button
                onClick={depositMode === 'manual' ? handleCreateManualDepositRequest : handleCreateDeposit}
                disabled={
                  creatingDeposit ||
                  creatingManualDeposit ||
                  uploadingProof ||
                  !depositAmount ||
                  parseInt(depositAmount) < 10000 ||
                  (depositMode === 'gateway' && paymentGateways.length === 0) ||
                  (depositMode === 'manual' && adminBankAccounts.length === 0)
                }
                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {creatingDeposit || creatingManualDeposit || uploadingProof ? (
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

