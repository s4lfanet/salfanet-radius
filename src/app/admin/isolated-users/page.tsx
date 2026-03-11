'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Shield, Users, Wifi, WifiOff, DollarSign, RefreshCw, Search, Download,
  AlertTriangle, CheckCircle, XCircle, Phone, Calendar, TrendingUp, Activity,
  ChevronDown, ChevronUp, Copy, ExternalLink, Check, CreditCard, Eye,
  FileText, Clock, Ban, MapPin, Hash,
} from 'lucide-react';

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  status: string;
  paymentLink: string | null;
  paymentToken: string | null;
}

interface IsolatedUser {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  expiredAt: string;
  customerId: string | null;
  areaName: string | null;
  profileName: string;
  profilePrice: number;
  unpaidInvoicesCount: number;
  totalUnpaid: number;
  isOnline: boolean;
  ipAddress: string | null;
  loginTime: string | null;
  nasIp: string | null;
  unpaidInvoices: UnpaidInvoice[];
}

interface Stats {
  totalIsolated: number;
  totalOnline: number;
  totalOffline: number;
  totalUnpaidAmount: number;
  totalUnpaidInvoices: number;
}

export default function IsolatedUsersMonitorPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<IsolatedUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const res = await fetch('/api/admin/isolated-users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch isolated users:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const getPayLink = (inv: UnpaidInvoice) =>
    inv.paymentLink || (inv.paymentToken ? `/pay/${inv.paymentToken}` : null);

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone && u.phone.includes(searchQuery));
    const matchStatus =
      filterStatus === 'all' ? true : filterStatus === 'online' ? u.isOnline : !u.isOnline;
    return matchSearch && matchStatus;
  });

  const exportToCSV = () => {
    const headers = ['Username', 'Nama', 'Telepon', 'Status', 'Profil', 'Expired', 'Online', 'IP', 'Jumlah Invoice', 'Total Belum Bayar'];
    const rows = filteredUsers.map((u) => [
      u.username, u.name, u.phone || '-', u.status, u.profileName,
      formatDate(u.expiredAt), u.isOnline ? 'Online' : 'Offline',
      u.ipAddress || '-', u.unpaidInvoicesCount, u.totalUnpaid,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `isolated-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
          <p className="text-sm text-muted-foreground">{t('isolatedUsers.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-destructive" />
            {t('isolatedUsers.title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('isolatedUsers.subtitle')}
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 transition-all text-sm text-primary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? t('isolatedUsers.refreshing') : t('common.refresh')}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card border border-red-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <Users className="w-4 h-4 text-red-500" />
              <TrendingUp className="w-3.5 h-3.5 text-red-500/40" />
            </div>
            <div className="text-xl font-bold text-foreground">{stats.totalIsolated}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{t('isolatedUsers.totalIsolated')}</div>
          </div>
          <div className="bg-card border border-emerald-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <Wifi className="w-4 h-4 text-emerald-500" />
              <Activity className="w-3.5 h-3.5 text-emerald-500/40" />
            </div>
            <div className="text-xl font-bold text-foreground">{stats.totalOnline}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{t('isolatedUsers.online')}</div>
          </div>
          <div className="bg-card border border-gray-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <WifiOff className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-xl font-bold text-foreground">{stats.totalOffline}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{t('isolatedUsers.offline')}</div>
          </div>
          <div className="bg-card border border-amber-500/20 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <FileText className="w-3.5 h-3.5 text-amber-500/40" />
            </div>
            <div className="text-xl font-bold text-foreground">{stats.totalUnpaidInvoices}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{t('isolatedUsers.unpaidInvoices')}</div>
          </div>
          <div className="bg-card border border-cyan-500/20 rounded-xl p-3 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between mb-1.5">
              <DollarSign className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="text-base font-bold text-foreground">{formatCurrency(stats.totalUnpaidAmount)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{t('isolatedUsers.totalArrears')}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('isolatedUsers.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'online', 'offline'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filterStatus === s
                  ? s === 'online'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : s === 'offline'
                    ? 'bg-gray-500/15 text-gray-500 border-gray-500/30'
                    : 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-input text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              {s === 'all' ? t('isolatedUsers.filterAll', { count: String(users.length) }) : s === 'online' ? t('isolatedUsers.filterOnline', { count: String(stats?.totalOnline || 0) }) : t('isolatedUsers.filterOffline', { count: String(stats?.totalOffline || 0) })}
            </button>
          ))}
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 transition-all text-xs text-primary"
        >
          <Download className="w-3.5 h-3.5" />
          {t('isolatedUsers.exportCsv')}
        </button>
      </div>

      {/* User List */}
      <div className="space-y-2">
        {filteredUsers.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-success/50" />
            <p className="text-muted-foreground text-sm">{t('isolatedUsers.noIsolated')}</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isExpanded = expandedUser === user.id;
            const hasUnpaid = user.unpaidInvoicesCount > 0;
            const firstPayLink = user.unpaidInvoices.length > 0 ? getPayLink(user.unpaidInvoices[0]) : null;

            return (
              <div key={user.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
                {/* Main Row */}
                <div className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    {/* Status badges */}
                    <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border
                        ${user.status === 'isolated'
                          ? 'text-pink-500 bg-pink-500/10 border-pink-500/30'
                          : 'text-destructive bg-destructive/10 border-destructive/30'}`}>
                        {user.status === 'isolated' ? <XCircle className="w-2.5 h-2.5" /> : <Ban className="w-2.5 h-2.5" />}
                        {user.status}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border
                        ${user.isOnline
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                          : 'text-gray-400 bg-gray-400/10 border-gray-400/30'}`}>
                        {user.isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                        {user.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-foreground">{user.username}</div>
                          <div className="text-xs text-muted-foreground">{user.name}</div>
                          {user.phone && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                              <Phone className="w-2.5 h-2.5" /> {user.phone}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={`/admin/pppoe/users/${user.id}`}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-primary/10 border border-primary/30 rounded text-primary hover:bg-primary/20 transition-all"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </a>
                          <a
                            href={`/isolated?username=${user.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-muted border border-border rounded text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
                          >
                            Preview
                          </a>
                        </div>
                      </div>

                      {/* Detail grid */}
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block">{t('isolatedUsers.profile')}</span>
                          <span className="text-foreground font-medium">{user.profileName}</span>
                          <span className="text-primary block">{formatCurrency(user.profilePrice)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Customer ID</span>
                          {user.customerId ? (
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground inline-flex items-center gap-1">
                              <Hash className="w-2.5 h-2.5" />{user.customerId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Area</span>
                          {user.areaName ? (
                            <span className="text-foreground flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-primary" />{user.areaName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">{t('isolatedUsers.dueDate')}</span>
                          <span className="text-destructive flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {formatDate(user.expiredAt)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">{t('isolatedUsers.connection')}</span>
                          {user.isOnline ? (
                            <>
                              <span className="font-mono text-foreground">{user.ipAddress}</span>
                              <span className="text-muted-foreground block">{t('isolatedUsers.connectedSince', { date: formatDateTime(user.loginTime!) })}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t('isolatedUsers.notConnected')}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">{t('isolatedUsers.arrears')}</span>
                          {hasUnpaid ? (
                            <>
                              <span className="text-pink-600 dark:text-pink-400 font-semibold">{t('isolatedUsers.invoiceCount', { count: String(user.unpaidInvoicesCount) })}</span>
                              <span className="text-destructive font-bold block">{formatCurrency(user.totalUnpaid)}</span>
                            </>
                          ) : (
                            <span className="text-success flex items-center gap-1">
                              <CheckCircle className="w-2.5 h-2.5" /> {t('isolatedUsers.paid')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom action bar (only if unpaid) */}
                  {hasUnpaid && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                      {firstPayLink && (
                        <>
                          <button
                            onClick={() => copyLink(firstPayLink, `quick-${user.id}`)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-muted border border-border rounded hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all"
                          >
                            {copiedId === `quick-${user.id}`
                              ? <Check className="w-3 h-3 text-success" />
                              : <Copy className="w-3 h-3" />}
                            {copiedId === `quick-${user.id}` ? t('isolatedUsers.copied') : t('isolatedUsers.copyPayLink')}
                          </button>
                          <a
                            href={firstPayLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-primary/10 border border-primary/30 rounded text-primary hover:bg-primary/20 transition-all"
                          >
                            <CreditCard className="w-3 h-3" />
                            {t('isolatedUsers.openPayLink')}
                          </a>
                          {user.phone && (
                            <a
                              href={`https://wa.me/${user.phone.replace(/^0/, '62').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Halo ${user.name}, silakan lakukan pembayaran melalui link berikut: ${firstPayLink}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-green-500/10 border border-green-500/30 rounded text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-all"
                            >
                              <Phone className="w-3 h-3" />
                              {t('isolatedUsers.sendWa')}
                            </a>
                          )}
                        </>
                      )}
                      <button
                        className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? t('common.close') : t('isolatedUsers.viewInvoices', { count: String(user.unpaidInvoicesCount) })}
                      </button>
                    </div>
                  )}
                </div>

                {/* Expandable invoice detail */}
                {isExpanded && hasUnpaid && (
                  <div className="border-t border-border bg-muted/30">
                    <div className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('isolatedUsers.unpaidInvoicesSection')}
                    </div>
                    <div className="divide-y divide-border">
                      {user.unpaidInvoices.map((inv) => {
                        const payLink = getPayLink(inv);
                        const isOverdue = inv.status === 'OVERDUE';
                        return (
                          <div key={inv.id} className="px-4 py-2.5 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
                                <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${isOverdue ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                                  {inv.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                                <Clock className="w-2.5 h-2.5" />
                                {t('isolatedUsers.dueOn', { date: formatDate(inv.dueDate) })}
                              </div>
                            </div>
                            <div className={`text-sm font-bold shrink-0 ${isOverdue ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                              {formatCurrency(Number(inv.amount))}
                            </div>
                            {payLink ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => copyLink(payLink, inv.id)}
                                  title="Salin link pembayaran"
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {copiedId === inv.id
                                    ? <Check className="w-3 h-3 text-success" />
                                    : <Copy className="w-3 h-3" />}
                                </button>
                                <a
                                  href={payLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Buka halaman pembayaran"
                                  className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground px-2 py-1 bg-muted rounded shrink-0">No link</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2.5 bg-destructive/5 border-t border-destructive/20 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('isolatedUsers.totalArrearsAmount')}</span>
                      <span className="text-sm font-bold text-destructive">{formatCurrency(user.totalUnpaid)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-muted-foreground">
        {t('isolatedUsers.lastUpdated', { time: new Date().toLocaleTimeString('id-ID') })}
      </div>
    </div>
  );
}
