'use client';

import { useState, useEffect } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { Plus, Pencil, Trash2, Users, TrendingUp, Calendar, Eye, X, Wallet, DollarSign, RefreshCw } from 'lucide-react';
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
import { formatWIB } from '@/lib/timezone';

interface Router {
  id: string;
  name: string;
  nasname: string;
  shortname: string;
}

interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  isActive: boolean;
  balance: number;
  minBalance: number;
  routerId: string | null;
  router: Router | null;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  voucherStock: number;
  stats: {
    currentMonth: { total: number; count: number };
    allTime: { total: number; count: number };
  };
}

interface MonthlyHistory {
  year: number;
  month: number;
  monthName: string;
  total: number;
  count: number;
}

interface MonthDetail {
  month: number;
  year: number;
  total: number;
  count: number;
  sales: {
    id: string;
    voucherCode: string;
    profileName: string;
    amount: number;
    createdAt: string;
  }[];
}

export default function AgentPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<boolean>(true);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [selectedAgentForBalance, setSelectedAgentForBalance] = useState<Agent | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceType, setBalanceType] = useState<'add' | 'subtract'>('add');
  const [balanceNote, setBalanceNote] = useState('');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyHistory[]>([]);
  const [selectedMonthDetail, setSelectedMonthDetail] = useState<MonthDetail | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const currentMonthName = formatWIB(new Date(), 'MMMM yyyy');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    routerId: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [agentsRes, routersRes] = await Promise.all([
        fetch('/api/hotspot/agents'),
        fetch('/api/network/routers'),
      ]);
      const agentsData = await agentsRes.json();
      const routersData = await routersRes.json();
      setAgents(agentsData.agents || []);
      setRouters(routersData.routers || []);
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = '/api/hotspot/agents';
      const method = editingAgent ? 'PUT' : 'POST';
      const payload = { ...formData, ...(editingAgent && { id: editingAgent.id }) };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (res.ok) {
        setIsDialogOpen(false);
        setEditingAgent(null);
        resetForm();
        loadData();
        await showSuccess(editingAgent ? t('common.updated') : t('common.created'));
      } else {
        await showError(result.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('agent.failedSaveAgent'));
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      phone: agent.phone,
      email: agent.email || '',
      address: agent.address || '',
      routerId: agent.routerId || '',
      isActive: agent.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteAgentId) return;
    const confirmed = await showConfirm(t('hotspot.deleteAgentConfirm'));
    if (!confirmed) { setDeleteAgentId(null); return; }
    try {
      const res = await fetch(`/api/hotspot/agents?id=${deleteAgentId}`, { method: 'DELETE' });
      if (res.ok) {
        await showSuccess(t('agent.agentDeleted'));
        loadData();
      } else {
        const result = await res.json();
        await showError(result.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('agent.failedDeleteAgent'));
    } finally {
      setDeleteAgentId(null);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', address: '', routerId: '', isActive: true });
  };

  const toggleSelectAll = () => {
    if (selectedAgents.length === agents.length) {
      setSelectedAgents([]);
    } else {
      setSelectedAgents(agents.map(a => a.id));
    }
  };

  const toggleSelectAgent = (agentId: string) => {
    if (selectedAgents.includes(agentId)) {
      setSelectedAgents(selectedAgents.filter(id => id !== agentId));
    } else {
      setSelectedAgents([...selectedAgents, agentId]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAgents.length === 0) return;
    const confirmed = await showConfirm(t('hotspot.deleteAgentsConfirm', { count: selectedAgents.length }));
    if (!confirmed) return;
    try {
      const results = await Promise.all(
        selectedAgents.map(id =>
          fetch(`/api/hotspot/agents?id=${id}`, { method: 'DELETE' })
        )
      );
      const allSuccess = results.every(r => r.ok);
      if (allSuccess) {
        await showSuccess(t('agent.agentsDeleted'));
        setSelectedAgents([]);
        setBulkDeleteOpen(false);
        loadData();
      } else {
        await showError(t('agent.someDeletionsFailed'));
      }
    } catch (error) {
      await showError(t('agent.failedDeleteAgent'));
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedAgents.length === 0) return;
    const confirmed = await showConfirm(
      `Set ${selectedAgents.length} agent(s) to ${bulkStatusValue ? 'Active' : 'Inactive'}?`
    );
    if (!confirmed) return;
    try {
      const results = await Promise.all(
        selectedAgents.map(id =>
          fetch('/api/hotspot/agents', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, isActive: bulkStatusValue }),
          })
        )
      );
      const allSuccess = results.every(r => r.ok);
      if (allSuccess) {
        await showSuccess(t('agent.statusUpdated'));
        setSelectedAgents([]);
        setBulkStatusOpen(false);
        loadData();
      } else {
        await showError(t('agent.someUpdatesFailed'));
      }
    } catch (error) {
      await showError(t('agent.failedUpdateStatus'));
    }
  };

  const handleBalanceAdjust = async () => {
    if (!selectedAgentForBalance || !balanceAmount) {
      await showError(t('agent.enterAmount'));
      return;
    }
    const amount = parseInt(balanceAmount);
    if (isNaN(amount) || amount <= 0) {
      await showError(t('common.invalidAmount'));
      return;
    }
    const confirmed = await showConfirm(t('hotspot.agentBalanceConfirm', { action: balanceType === 'add' ? t('common.add') : t('common.subtract'), amount: formatCurrency(amount), name: selectedAgentForBalance.name }));
    if (!confirmed) return;
    try {
      const res = await fetch('/api/hotspot/agents/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentForBalance.id,
          amount,
          type: balanceType,
          note: balanceNote || null,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(t('agent.balanceUpdated'));
        setBalanceModalOpen(false);
        setSelectedAgentForBalance(null);
        setBalanceAmount('');
        setBalanceNote('');
        loadData();
      } else {
        await showError(result.error || t('common.failed'));
      }
    } catch (error) {
      await showError(t('common.failed'));
    }
  };

  const openBalanceModal = (agent: Agent) => {
    setSelectedAgentForBalance(agent);
    setBalanceModalOpen(true);
    setBalanceAmount('');
    setBalanceType('add');
    setBalanceNote('');
  };

  const handleViewHistory = async (agent: Agent) => {
    setSelectedAgent(agent);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/hotspot/agents/${agent.id}/history`);
      const data = await res.json();
      setMonthlyHistory(data.history || []);
    } catch (error) {
      console.error('Load history error:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleViewMonthDetail = async (year: number, month: number) => {
    if (!selectedAgent) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/hotspot/agents/${selectedAgent.id}/history?year=${year}&month=${month}`);
      const data = await res.json();
      setSelectedMonthDetail(data);
    } catch (error) {
      console.error('Load month detail error:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (date: string) => formatWIB(date, 'dd MMM yyyy HH:mm');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <RefreshCw className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#00f7ff]" />
              {t('agent.title')}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('agent.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {selectedAgents.length > 0 && (
              <>
                <button
                  onClick={() => setBulkStatusOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Users className="w-3.5 h-3.5" />
                  Set Status ({selectedAgents.length})
                </button>
                <button
                  onClick={() => setBulkDeleteOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedAgents.length})
                </button>
              </>
            )}
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border rounded-md hover:bg-muted"
              title="Perbarui Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { resetForm(); setEditingAgent(null); setIsDialogOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('agent.addAgent')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.total')}</div>
                <div className="text-lg font-bold text-foreground">{agents.length}</div>
              </div>
              <Users className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.active')}</div>
                <div className="text-lg font-bold text-success">{agents.filter((a) => a.isActive).length}</div>
              </div>
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="bg-card p-2.5 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('agent.allTime')}</div>
                <div className="text-sm font-bold text-accent">
                  {formatCurrency(agents.reduce((sum, a) => sum + a.stats.allTime.total, 0))}
                </div>
              </div>
              <Calendar className="w-4 h-4 text-accent" />
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">{t('agent.noAgentsFound')}</div>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.id)}
                      onChange={() => toggleSelectAgent(agent.id)}
                      className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <div className="font-medium text-sm text-foreground">{agent.name}</div>
                      {agent.email && <div className="text-[10px] text-muted-foreground">{agent.email}</div>}
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agent.isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {agent.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('common.phone')}</div>
                    <div>{agent.phone}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('agent.router')}</div>
                    <div>{agent.router ? agent.router.name : <span className="italic text-muted-foreground">{t('agent.notAssigned')}</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('hotspot.stockLabel')}</div>
                    <div className="font-medium text-primary">{agent.voucherStock || 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('agent.balance')}</div>
                    <div className="font-semibold text-success">{formatCurrency(agent.balance)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{currentMonthName}</div>
                    <div className="font-medium">{formatCurrency(agent.stats.currentMonth.total)}</div>
                    <div className="text-[9px] text-muted-foreground">{agent.stats.currentMonth.count} vcr</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">{t('agent.allTime')}</div>
                    <div className="font-medium">{formatCurrency(agent.stats.allTime.total)}</div>
                    <div className="text-[9px] text-muted-foreground">{agent.stats.allTime.count} vcr</div>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button onClick={() => openBalanceModal(agent)} className="p-2 text-primary hover:bg-primary/10 rounded" title="Sesuaikan Saldo">
                    <Wallet className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleViewHistory(agent)} className="p-2 text-accent hover:bg-accent/10 rounded" title="Riwayat">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(agent)} className="p-2 text-muted-foreground hover:bg-muted rounded" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteAgentId(agent.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Hapus">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table - Desktop */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedAgents.length === agents.length && agents.length > 0}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.name')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('common.phone')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('agent.router')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.stockLabel')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('hotspot.lastLoginLabel')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('agent.balance')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">
                    <div>{currentMonthName}</div>
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden xl:table-cell">{t('agent.allTime')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground text-xs">{t('agent.noAgentsFound')}</td>
                  </tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(agent.id)}
                          onChange={() => toggleSelectAgent(agent.id)}
                          className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs text-foreground">{agent.name}</div>
                        {agent.email && <div className="text-[10px] text-muted-foreground">{agent.email}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell">{agent.phone}</td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {agent.router ? (
                          <div>
                            <div className="font-medium text-[10px]">{agent.router.name}</div>
                            <div className="text-[9px] text-muted-foreground">{agent.router.nasname}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">{t('agent.notAssigned')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs text-primary">{agent.voucherStock || 0}</div>
                        <div className="text-[9px] text-muted-foreground">{t('hotspot.voucherLabel')}</div>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell">
                        {agent.lastLogin ? (
                          <div>
                            <div className="text-[10px] font-medium">{formatDate(agent.lastLogin).split(',')[0]}</div>
                            <div className="text-[9px] text-muted-foreground">{formatDate(agent.lastLogin).split(',')[1]}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">{t('hotspot.notLoggedIn')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <div>
                            <div className="font-semibold text-[10px] text-success">{formatCurrency(agent.balance)}</div>
                            {agent.minBalance > 0 && (
                              <div className="text-[9px] text-muted-foreground">Min: {formatCurrency(agent.minBalance)}</div>
                            )}
                          </div>
                          <button
                            onClick={() => openBalanceModal(agent)}
                            className="p-1 text-primary hover:bg-primary/10 rounded"
                            title="Sesuaikan Saldo"
                          >
                            <Wallet className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-[10px]">{formatCurrency(agent.stats.currentMonth.total)}</div>
                        <div className="text-[9px] text-muted-foreground">{agent.stats.currentMonth.count} vcr</div>
                      </td>
                      <td className="px-3 py-2 hidden xl:table-cell">
                        <div className="font-medium text-[10px]">{formatCurrency(agent.stats.allTime.total)}</div>
                        <div className="text-[9px] text-muted-foreground">{agent.stats.allTime.count} vcr</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agent.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-destructive/10 text-destructive'
                          }`}>
                          {agent.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleViewHistory(agent)}
                            className="p-1 text-accent hover:bg-accent/10 rounded"
                            title="Riwayat"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEdit(agent)}
                            className="p-1 text-muted-foreground hover:bg-muted rounded"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteAgentId(agent.id)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded"
                            title="Hapus"
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

        {/* Add/Edit Dialog */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingAgent(null); resetForm(); }} size="sm">
          <ModalHeader>
            <ModalTitle>{editingAgent ? t('agent.editAgent') : t('agent.addAgent')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('common.name')}</ModalLabel>
                <ModalInput type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t('agent.agentName')} required />
              </div>
              <div>
                <ModalLabel required>{t('common.phone')}</ModalLabel>
                <ModalInput type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="08123456789" required />
              </div>
              <div>
                <ModalLabel>{t('common.email')}</ModalLabel>
                <ModalInput type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="agent@example.com" />
              </div>
              <div>
                <ModalLabel>{t('common.address')}</ModalLabel>
                <ModalTextarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={t('common.address')} rows={2} />
              </div>
              <div>
                <ModalLabel>{t('agent.router')}/NAS</ModalLabel>
                <ModalSelect value={formData.routerId} onChange={(e) => setFormData({ ...formData, routerId: e.target.value })}>
                  <option value="" className="bg-[#0a0520]">{t('agent.noRouter')}</option>
                  {routers.map((router) => (<option key={router.id} value={router.id} className="bg-[#0a0520]">{router.name} ({router.nasname})</option>))}
                </ModalSelect>
              </div>
              {editingAgent && (
                <div>
                  <ModalLabel>{t('common.status')}</ModalLabel>
                  <ModalSelect value={formData.isActive ? 'active' : 'inactive'} onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}>
                    <option value="active" className="bg-[#0a0520]">{t('common.active')}</option>
                    <option value="inactive" className="bg-[#0a0520]">{t('common.inactive')}</option>
                  </ModalSelect>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingAgent(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingAgent ? t('common.update') : t('common.create')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Delete Confirmation */}
        <SimpleModal isOpen={!!deleteAgentId} onClose={() => setDeleteAgentId(null)} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#ff4466]/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('agent.deleteAgent')}</h2>
            <p className="text-xs text-muted-foreground">{t('agent.deleteConfirm')}</p>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setDeleteAgentId(null)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleDelete}>{t('common.delete')}</ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Balance Modal */}
        <SimpleModal isOpen={balanceModalOpen && !!selectedAgentForBalance} onClose={() => { setBalanceModalOpen(false); setSelectedAgentForBalance(null); }} size="sm">
          <ModalHeader>
            <ModalTitle>{t('agent.adjustBalance')}</ModalTitle>
            <ModalDescription>{selectedAgentForBalance?.name}</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="bg-[#bc13fe]/10 rounded-lg p-3 border border-[#bc13fe]/30">
              <p className="text-[10px] text-muted-foreground">{t('agent.currentBalance')}</p>
              <p className="text-lg font-bold text-[#00f7ff] drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]">{selectedAgentForBalance && formatCurrency(selectedAgentForBalance.balance)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBalanceType('add')} className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${balanceType === 'add' ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#00ff88]/50'}`}>
                <DollarSign className="w-3.5 h-3.5 mx-auto mb-0.5" /> {t('agent.addBalance')}
              </button>
              <button type="button" onClick={() => setBalanceType('subtract')} className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${balanceType === 'subtract' ? 'border-[#ff4466] bg-[#ff4466]/10 text-[#ff6b8a] shadow-[0_0_15px_rgba(255,68,102,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#ff4466]/50'}`}>
                <DollarSign className="w-3.5 h-3.5 mx-auto mb-0.5" /> {t('agent.subtractBalance')}
              </button>
            </div>
            <div>
              <ModalLabel required>{t('common.amount')}</ModalLabel>
              <ModalInput type="number" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} placeholder="0" min={0} step={1000} />
            </div>
            <div>
              <ModalLabel>{t('common.note')}</ModalLabel>
              <ModalTextarea value={balanceNote} onChange={(e) => setBalanceNote(e.target.value)} placeholder={t('common.optional')} rows={2} />
            </div>
            {balanceAmount && selectedAgentForBalance && !isNaN(parseInt(balanceAmount)) && (
              <div className="bg-muted/50 dark:bg-[#0a0520] rounded-lg p-2 text-xs border border-[#bc13fe]/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('agent.newBalance')}:</span>
                  <span className="font-bold text-[#00f7ff]">{formatCurrency(balanceType === 'add' ? selectedAgentForBalance.balance + parseInt(balanceAmount) : selectedAgentForBalance.balance - parseInt(balanceAmount))}</span>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setBalanceModalOpen(false); setSelectedAgentForBalance(null); }}>{t('common.cancel')}</ModalButton>
            <ModalButton variant={balanceType === 'add' ? 'success' : 'danger'} onClick={handleBalanceAdjust}>{balanceType === 'add' ? t('agent.addBalance') : t('agent.subtractBalance')}</ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* History Modal */}
        <SimpleModal isOpen={historyModalOpen && !!selectedAgent} onClose={() => { setHistoryModalOpen(false); setSelectedAgent(null); setSelectedMonthDetail(null); setMonthlyHistory([]); }} size="lg">
          <ModalHeader>
            <ModalTitle>{selectedAgent?.name}</ModalTitle>
            <ModalDescription>{t('agent.salesHistory')}</ModalDescription>
          </ModalHeader>
          <ModalBody className="max-h-[60vh] overflow-y-auto">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-24">
                <RefreshCw className="w-4 h-4 animate-spin text-[#00f7ff]" />
              </div>
            ) : selectedMonthDetail ? (
              <div className="space-y-3">
                <button onClick={() => setSelectedMonthDetail(null)} className="text-xs text-[#00f7ff] hover:underline">
                  ← {t('common.back')}
                </button>
                <div className="bg-[#00f7ff]/10 rounded-lg p-3 border border-[#00f7ff]/30">
                  <p className="text-xs font-semibold text-foreground">
                    {formatWIB(new Date(selectedMonthDetail.year, selectedMonthDetail.month), 'MMMM yyyy')}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t('agent.totalSales')}</p>
                      <p className="text-sm font-bold text-[#00ff88]">{formatCurrency(selectedMonthDetail.total)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t('agent.vouchers')}</p>
                      <p className="text-sm font-bold text-foreground">{selectedMonthDetail.count}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {selectedMonthDetail.sales.map((sale) => (
                    <div key={sale.id} className="border border-[#bc13fe]/30 rounded-lg p-2 hover:bg-[#bc13fe]/10 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-xs text-foreground">{sale.voucherCode}</p>
                          <p className="text-[10px] text-muted-foreground">{sale.profileName}</p>
                          <p className="text-[9px] text-[#e0d0ff]/40 mt-0.5">{formatDate(sale.createdAt)}</p>
                        </div>
                        <p className="font-semibold text-xs text-[#00ff88]">{formatCurrency(sale.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {monthlyHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground text-xs py-6">{t('agent.noHistory')}</p>
                ) : (
                  monthlyHistory.map((month) => (
                    <button
                      key={`${month.year}-${month.month}`}
                      onClick={() => handleViewMonthDetail(month.year, month.month - 1)}
                      className="w-full border border-[#bc13fe]/30 rounded-lg p-3 hover:bg-[#bc13fe]/10 text-left transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-xs text-foreground">{month.monthName}</p>
                          <p className="text-[10px] text-muted-foreground">{month.count} vouchers</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-xs text-[#00ff88]">{formatCurrency(month.total)}</p>
                          <Eye className="w-3 h-3 text-[#e0d0ff]/40 ml-auto mt-0.5" />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton type="button" variant="secondary" onClick={() => { setHistoryModalOpen(false); setSelectedAgent(null); setSelectedMonthDetail(null); setMonthlyHistory([]); }}>{t('common.close')}</ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Bulk Delete Modal */}
        <SimpleModal isOpen={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#ff4466]/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('hotspot.deleteMultipleAgents')}</h2>
            <p className="text-xs text-muted-foreground">{t('hotspot.deleteAgentsBtn', { count: selectedAgents.length })}</p>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setBulkDeleteOpen(false)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleBulkDelete}>{t('hotspot.deleteAgentsBtn', { count: selectedAgents.length })}</ModalButton>
          </ModalFooter>
        </SimpleModal>

        {/* Bulk Status Change Modal */}
        <SimpleModal isOpen={bulkStatusOpen} onClose={() => setBulkStatusOpen(false)} size="sm">
          <ModalHeader>
            <ModalTitle>{t('hotspot.changeAgentStatus')}</ModalTitle>
            <ModalDescription>{t('hotspot.setStatusForAgents', { count: selectedAgents.length })}</ModalDescription>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setBulkStatusValue(true)} className={`px-3 py-3 rounded-lg border-2 text-xs font-medium transition-all ${bulkStatusValue ? 'border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#00ff88]/50 text-foreground'}`}>
                ✓ {t('common.active')}
              </button>
              <button type="button" onClick={() => setBulkStatusValue(false)} className={`px-3 py-3 rounded-lg border-2 text-xs font-medium transition-all ${!bulkStatusValue ? 'border-[#ff4466] bg-[#ff4466]/10 text-[#ff6b8a] shadow-[0_0_15px_rgba(255,68,102,0.3)]' : 'border-[#bc13fe]/30 hover:border-[#ff4466]/50 text-foreground'}`}>
                ✗ {t('common.inactive')}
              </button>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => setBulkStatusOpen(false)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant={bulkStatusValue ? 'success' : 'danger'} onClick={handleBulkStatusChange}>{t('hotspot.updateStatus')}</ModalButton>
          </ModalFooter>
        </SimpleModal>
      </div>
    </div>
  );
}
