'use client';

import { useEffect, useState } from 'react';
import { showConfirm, showError, showSuccess } from '@/lib/sweetalert';
import { RefreshCw } from 'lucide-react';

interface AgentDepositItem {
  id: string;
  amount: number;
  paymentGateway: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  agent: {
    id: string;
    name: string;
    phone: string;
  };
}

type DepositFilter = 'ALL' | 'PENDING' | 'PAID' | 'CANCELLED';

export default function AgentDepositsPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DepositFilter>('ALL');
  const [deposits, setDeposits] = useState<AgentDepositItem[]>([]);

  const loadDeposits = async (status: DepositFilter = filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-deposits?status=${status}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat data deposit agent');
      }
      setDeposits(data.deposits || []);
    } catch (error: any) {
      await showError(error.message || 'Gagal memuat data deposit agent');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeposits('ALL');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = (nextFilter: DepositFilter) => {
    setFilter(nextFilter);
    loadDeposits(nextFilter);
  };

  const handleAction = async (deposit: AgentDepositItem, action: 'approve' | 'reject') => {
    const textAction = action === 'approve' ? 'setujui' : 'tolak';
    const confirmed = await showConfirm(
      `Yakin ingin ${textAction} deposit ${deposit.agent.name} sebesar Rp ${deposit.amount.toLocaleString('id-ID')}?`
    );
    if (!confirmed) return;

    setActionLoadingId(deposit.id);
    try {
      const res = await fetch('/api/admin/agent-deposits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositId: deposit.id, action }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Gagal ${textAction} deposit`);
      }

      await showSuccess(action === 'approve' ? 'Deposit berhasil disetujui' : 'Deposit berhasil ditolak');
      await loadDeposits(filter);
    } catch (error: any) {
      await showError(error.message || `Gagal ${textAction} deposit`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusClass = (status: string) => {
    if (status === 'PAID') return 'bg-green-500/20 text-green-400 border border-green-500/30';
    if (status === 'PENDING') return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Deposit Agen</h1>
        <p className="text-sm text-muted-foreground mt-1">Verifikasi deposit saldo agen</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(['ALL', 'PENDING', 'PAID', 'CANCELLED'] as DepositFilter[]).map((item) => (
          <button
            key={item}
            onClick={() => handleFilter(item)}
            className={`px-4 py-2 text-sm rounded-lg border transition ${
              filter === item
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-muted'
            }`}
          >
            {item === 'ALL' ? 'Semua' : item}
          </button>
        ))}

        <button
          onClick={() => loadDeposits(filter)}
          className="ml-auto px-3 py-2 rounded-lg border border-border hover:bg-muted transition"
          title="Segarkan"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-muted/70 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Agen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Jumlah</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Metode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat data...</td>
                </tr>
              ) : deposits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada deposit</td>
                </tr>
              ) : (
                deposits.map((deposit) => (
                  <tr key={deposit.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{deposit.agent.name}</div>
                      <div className="text-xs text-muted-foreground">{deposit.agent.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">Rp {deposit.amount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-sm uppercase">{deposit.paymentGateway || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusClass(deposit.status)}`}>
                        {deposit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>Request: {formatDate(deposit.createdAt)}</div>
                      {deposit.paidAt && <div>Paid: {formatDate(deposit.paidAt)}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {deposit.status === 'PENDING' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction(deposit, 'approve')}
                            disabled={actionLoadingId === deposit.id}
                            className="px-3 py-1.5 text-xs rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-60"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => handleAction(deposit, 'reject')}
                            disabled={actionLoadingId === deposit.id}
                            className="px-3 py-1.5 text-xs rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
