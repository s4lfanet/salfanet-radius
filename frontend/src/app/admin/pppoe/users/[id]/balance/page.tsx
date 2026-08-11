'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, TrendingUp, Wallet, Calendar, DollarSign, CheckCircle2, XCircle, Loader2, AlertCircle, Download } from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';
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

interface BalanceTransaction {
  id: string;
  amount: number;
  type: string;
  category: string;
  description: string | null;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

interface PppoeUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  balance: number;
  autoRenewal: boolean;
  profile: {
    id: string;
    name: string;
    price: number;
  };
}

export default function BalanceManagementPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const userId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<PppoeUser | null>(null);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [topUpData, setTopUpData] = useState({
    amount: '',
    paymentMethod: 'CASH' as 'CASH' | 'TRANSFER' | 'EWALLET',
    note: '',
  });

  const paymentMethodLabel = (method: string) => {
    if (method === 'CASH') return t('pppoe.cash');
    if (method === 'TRANSFER') return t('pppoe.bankTransfer');
    if (method === 'EWALLET') return t('pppoe.eWallet');
    return method;
  };

  const exportToCSV = () => {
    if (transactions.length === 0) {
      showError(t('common.noTransactionsToExport'));
      return;
    }

    // CSV Header
    const headers = [t('pppoe.balance.csvDate'), t('pppoe.balance.csvType'), t('pppoe.balance.csvDescription'), t('pppoe.balance.csvMethod'), t('pppoe.balance.csvAmount'), t('pppoe.balance.csvStatus')];

    // CSV Rows
    const rows = transactions.map(tx => [
      tx.createdAt,
      tx.type === 'DEPOSIT' ? t('pppoe.balance.topUp') : t('pppoe.balance.autoRenewalLabel'),
      `"${(tx.description || '-').replace(/"/g, '""')}"`,
      tx.paymentMethod || '-',
      tx.amount,
      tx.status
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `balance-${user?.username}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    showSuccess(t('common.csvDownloaded'));
  };

  useEffect(() => {
    loadBalanceData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadBalanceData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/pppoe/users/${userId}/deposit`);
      if (!response.ok) throw new Error('Failed to load balance data');

      const data = await response.json();
      setUser(data.user);
      setTransactions(data.transactions || []);
    } catch (error: any) {
      showError(error.message || t('pppoe.failedLoadBalance'));
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseInt(topUpData.amount);
    if (isNaN(amount) || amount <= 0) {
      showError(t('pppoe.topUpAmount'));
      return;
    }

    const confirmed = await showConfirm(
      t('pppoe.confirmTopUp'),
      t('pppoe.topUpConfirmMsg').replace('{amount}', amount.toLocaleString('id-ID')).replace('{name}', user?.name || user?.username || 'user'),
      t('pppoe.yesTopUp'),
      t('common.cancel')
    );

    if (!confirmed) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/admin/pppoe/users/${userId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          paymentMethod: topUpData.paymentMethod,
          note: topUpData.note || t('pppoe.balance.topUpVia', { method: topUpData.paymentMethod }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('pppoe.failedTopUp'));
      }

      const result = await response.json();
      showSuccess(
        t('pppoe.topUpSuccess'),
        t('pppoe.topUpSuccessMsg').replace('{amount}', amount.toLocaleString('id-ID')).replace('{newBalance}', result.data.newBalance.toLocaleString('id-ID'))
      );

      // Reset form and reload data
      setTopUpData({ amount: '', paymentMethod: 'CASH', note: '' });
      setIsTopUpModalOpen(false);
      loadBalanceData();
    } catch (error: any) {
      showError(error.message || t('pppoe.failedTopUp'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAutoRenewal = async () => {
    if (!user) return;

    const action = user.autoRenewal ? t('pppoe.disableAction') : t('pppoe.enableAction');
    const confirmed = await showConfirm(
      t('pppoe.confirmAutoRenewal'),
      t('pppoe.autoRenewalConfirmMsg').replace('{action}', action).replace('{name}', user.name || user.username || 'user'),
      user.autoRenewal ? t('pppoe.yesDisable') : t('pppoe.yesEnable'),
      t('common.cancel')
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/pppoe/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoRenewal: !user.autoRenewal,
        }),
      });

      if (!response.ok) throw new Error(t('pppoe.failedChangeAutoRenewal'));

      showSuccess(user.autoRenewal ? t('pppoe.autoRenewalDisabled') : t('pppoe.autoRenewalEnabled'));
      loadBalanceData();
    } catch (error: any) {
      showError(error.message || t('pppoe.failedChangeAutoRenewal'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">{t('pppoe.userNotFound')}</p>
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-primary text-white rounded">
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const totalDeposit = transactions
    .filter(t => t.status === 'SUCCESS' && t.type === 'DEPOSIT')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = transactions
    .filter(t => t.status === 'SUCCESS' && t.type === 'AUTO_RENEWAL')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('pppoe.backToUserList')}
        </button>

        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold mb-1">{user.name || user.username}</h1>
              <p className="text-cyan-100 text-sm">@{user.username}</p>
              <p className="text-cyan-100 text-sm">{user.phone || '-'}</p>
            </div>
            <Wallet className="w-12 h-12 opacity-80" />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Current Balance */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('pppoe.currentBalance')}</p>
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-primary">
            {new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              minimumFractionDigits: 0
            }).format(user.balance)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('pppoe.packagePrice')}: Rp {user.profile?.price?.toLocaleString('id-ID') || '0'}
          </p>
          {/* Low Balance Warning */}
          {user.profile?.price && user.balance < user.profile.price && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{t('pppoe.balanceNotEnough')}</span>
            </div>
          )}
        </div>

        {/* Total Deposit */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('pppoe.totalTopUp')}</p>
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-success">
            Rp {totalDeposit.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('pppoe.allDeposits')}
          </p>
        </div>

        {/* Total Spent */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase">{t('pppoe.totalUsed')}</p>
            <Calendar className="w-5 h-5 text-warning" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-warning">
            Rp {totalSpent.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('pppoe.autoRenewalPayments')}
          </p>
        </div>
      </div>

      {/* Auto-Renewal Toggle */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-semibold mb-1">{t('pppoe.balance.autoRenewalLabel')}</h3>
            <p className="text-xs text-muted-foreground">
              {user.autoRenewal
                ? t('pppoe.autoRenewalActiveDesc')
                : t('pppoe.autoRenewalInactiveDesc')}
            </p>
          </div>
          <button
            onClick={handleToggleAutoRenewal}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${user.autoRenewal ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
              }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user.autoRenewal ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setIsTopUpModalOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('pppoe.topUpBalance')}
        </button>
      </div>

      {/* Transaction History */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{t('pppoe.transactionHistory')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('pppoe.totalTransactions').replace('{count}', String(transactions.length))}
            </p>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-sm rounded transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('pppoe.exportCsv')}
          </button>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3 p-3">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('pppoe.noTransactions')}
            </div>
          ) : (
            transactions.map((transaction) => (
              <div key={transaction.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    transaction.type === 'DEPOSIT'
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning'
                  }`}>
                    {transaction.type === 'DEPOSIT' ? t('pppoe.balance.topUp') : t('pppoe.balance.autoRenewalLabel')}
                  </span>
                  {transaction.status === 'SUCCESS' ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
                <div className={`text-sm font-semibold mb-2 ${
                  transaction.type === 'DEPOSIT' ? 'text-success' : 'text-warning'
                }`}>
                  {transaction.type === 'DEPOSIT' ? '+' : '-'}Rp {Math.abs(transaction.amount).toLocaleString('id-ID')}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t('pppoe.date')}</span>
                    <p className="text-foreground">{formatWIB(transaction.createdAt, 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('pppoe.method')}</span>
                    <p className="text-foreground">{paymentMethodLabel(transaction.paymentMethod)}</p>
                  </div>
                  {transaction.description && (
                    <div className="col-span-2 mt-1">
                      <span className="text-muted-foreground">{t('pppoe.description')}</span>
                      <p className="text-foreground">{transaction.description}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{t('pppoe.date')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{t('pppoe.type')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{t('pppoe.description')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{t('pppoe.method')}</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">{t('pppoe.amount')}</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    {t('pppoe.noTransactions')}
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">
                      {formatWIB(transaction.createdAt, 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${transaction.type === 'DEPOSIT'
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning'
                        }`}>
                        {transaction.type === 'DEPOSIT' ? t('pppoe.balance.topUp') : t('pppoe.balance.autoRenewalLabel')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {transaction.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {paymentMethodLabel(transaction.paymentMethod)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${transaction.type === 'DEPOSIT' ? 'text-success' : 'text-warning'
                        }`}>
                        {transaction.type === 'DEPOSIT' ? '+' : '-'}
                        Rp {Math.abs(transaction.amount).toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {transaction.status === 'SUCCESS' ? (
                        <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive mx-auto" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top-Up Modal */}
      <SimpleModal isOpen={isTopUpModalOpen} onClose={() => { setIsTopUpModalOpen(false); setTopUpData({ amount: '', paymentMethod: 'CASH', note: '' }); }} size="md">
        <ModalHeader>
          <ModalTitle>{t('pppoe.topUpBalance')}</ModalTitle>
          <ModalDescription>{user ? t('pppoe.addBalanceFor').replace('{name}', user.name || user.username) : t('pppoe.addBalance')}</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleTopUp}>
          <ModalBody className="space-y-4">
            <div>
              <ModalLabel required>{t('pppoe.topUpAmountLabel')}</ModalLabel>
              <ModalInput type="number" value={topUpData.amount} onChange={(e) => setTopUpData({ ...topUpData, amount: e.target.value })} placeholder="50000" required min={1000} step={1000} />
              <p className="text-[10px] text-muted-foreground mt-1">{t('pppoe.minAmount')}</p>
            </div>
            <div>
              <ModalLabel required>{t('pppoe.paymentMethod')}</ModalLabel>
              <ModalSelect value={topUpData.paymentMethod} onChange={(e) => setTopUpData({ ...topUpData, paymentMethod: e.target.value as any })}>
                <option value="CASH" className="dark:bg-[#0a0520]">{t('pppoe.cash')}</option>
                <option value="TRANSFER" className="dark:bg-[#0a0520]">{t('pppoe.bankTransfer')}</option>
                <option value="EWALLET" className="dark:bg-[#0a0520]">{t('pppoe.eWallet')}</option>
              </ModalSelect>
            </div>
            <div>
              <ModalLabel>{t('pppoe.noteOptional')}</ModalLabel>
              <ModalTextarea value={topUpData.note} onChange={(e) => setTopUpData({ ...topUpData, note: e.target.value })} placeholder={t('pppoe.additionalNote')} rows={3} />
            </div>
            <div className="bg-[#00f7ff]/10 border border-[#00f7ff]/30 rounded-lg p-3">
              <p className="text-xs text-[#00f7ff]">ℹ️ {t('pppoe.balanceInfo')}</p>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" variant="secondary" onClick={() => { setIsTopUpModalOpen(false); setTopUpData({ amount: '', paymentMethod: 'CASH', note: '' }); }}>{t('common.cancel')}</ModalButton>
            <ModalButton type="submit" variant="primary" disabled={submitting}>
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin mr-1" />{t('pppoe.processing')}</>) : (<><Plus className="w-4 h-4 mr-1" />{t('pppoe.balance.topUpButton')}</>)}
            </ModalButton>
          </ModalFooter>
        </form>
      </SimpleModal>
    </div>
  );
}
