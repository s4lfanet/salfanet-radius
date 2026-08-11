'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { formatToWIB } from '@/lib/utils/dateUtils';
import {
  ShoppingCart,
  Search,
  RefreshCw,
  Ban,
  Send,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Filter,
  Trash2,
} from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  totalAmount: number;
  status: string;
  quantity: number;
  createdAt: string;
  paidAt?: string;
  profile: { name: string };
  vouchers: any[];
}

export default function EVoucherManagementPage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    paid: 0,
    cancelled: 0,
    expired: 0,
    revenue: 0,
  });

  useEffect(() => {
    loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, statusFilter, searchQuery]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/evoucher/orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
        calculateStats(data.orders);
      }
    } catch (error) {
      showError(t('evoucher.failedLoadOrders'));
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (orderList: Order[]) => {
    setStats({
      total: orderList.length,
      pending: orderList.filter((o) => o.status === 'PENDING').length,
      paid: orderList.filter((o) => o.status === 'PAID').length,
      cancelled: orderList.filter((o) => o.status === 'CANCELLED').length,
      expired: orderList.filter((o) => o.status === 'EXPIRED').length,
      revenue: orderList.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.totalAmount, 0),
    });
  };

  const filterOrders = () => {
    let filtered = orders;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(query) ||
          o.customerName.toLowerCase().includes(query) ||
          o.customerPhone.includes(query)
      );
    }
    setFilteredOrders(filtered);
  };

  const handleCancelOrder = async (orderId: string, orderNumber: string) => {
    const confirmed = await showConfirm(t('hotspot.cancelOrderConfirm', { number: orderNumber }));
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/evoucher/orders/${orderId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showSuccess(t('evoucher.orderCancelled'));
        loadOrders();
      } else {
        showError(data.error || t('common.failed'));
      }
    } catch (error) {
      showError(t('common.failed'));
    }
  };

  const handleResendVoucher = async (orderId: string, orderNumber: string) => {
    const confirmed = await showConfirm(t('hotspot.resendVouchersConfirm', { number: orderNumber }));
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/evoucher/orders/${orderId}/resend`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showSuccess(t('evoucher.orderResent'));
      } else {
        showError(data.error || t('common.failed'));
      }
    } catch (error) {
      showError(t('common.failed'));
    }
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map((o) => o.id));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedOrders.length === 0) {
      await showError(t('evoucher.selectOrdersToDelete'));
      return;
    }

    const confirmed = await showConfirm(
      `Delete ${selectedOrders.length} selected order(s)?`,
      'This action cannot be undone'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/evoucher/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: selectedOrders }),
      });

      const data = await res.json();
      if (data.success) {
        await showSuccess(t('evoucher.ordersDeleted').replace('{count}', String(data.deleted)));
        setSelectedOrders([]);
        loadOrders();
      } else {
        await showError(data.error || t('evoucher.failedDeleteOrders'));
      }
    } catch (error) {
      await showError(t('evoucher.failedDeleteOrders'));
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; icon: any }> = {
      PENDING: { bg: 'bg-warning/20 text-warning dark:bg-yellow-900/30 dark:text-warning', icon: Clock },
      PAID: { bg: 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success', icon: CheckCircle },
      CANCELLED: { bg: 'bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive', icon: Ban },
      EXPIRED: { bg: 'bg-gray-100 text-muted-foreground dark:bg-inputdark:text-muted-foreground', icon: XCircle },
    };
    const c = cfg[status] || cfg.PENDING;
    const Icon = c.icon;
    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg}`}>
        <Icon className="w-2.5 h-2.5" />
        {status}
      </span>
    );
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#00f7ff]" />
            {t('evoucher.title')}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('evoucher.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedOrders.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selectedOrders.length})
            </button>
          )}
          <button
            onClick={loadOrders}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('common.total')}</div>
              <div className="text-lg font-bold text-foreground">{stats.total}</div>
            </div>
            <Package className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-warning uppercase">{t('evoucher.pending')}</div>
              <div className="text-lg font-bold text-warning">{stats.pending}</div>
            </div>
            <Clock className="w-4 h-4 text-warning" />
          </div>
        </div>
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-success uppercase">{t('evoucher.paid')}</div>
              <div className="text-lg font-bold text-success">{stats.paid}</div>
            </div>
            <CheckCircle className="w-4 h-4 text-success" />
          </div>
        </div>
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-destructive uppercase">{t('evoucher.cancelled')}</div>
              <div className="text-lg font-bold text-destructive">{stats.cancelled}</div>
            </div>
            <Ban className="w-4 h-4 text-destructive" />
          </div>
        </div>
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase">{t('evoucher.expired')}</div>
              <div className="text-lg font-bold text-muted-foreground">{stats.expired}</div>
            </div>
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <div className="bg-card p-2.5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium text-primary uppercase">{t('evoucher.revenue')}</div>
              <div className="text-sm font-bold text-primary">{formatCurrency(stats.revenue)}</div>
            </div>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card p-3 rounded-lg border border-border">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">{t('evoucher.filters')}:</span>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('evoucher.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-3 py-1.5 w-full border border-border bg-muted rounded-md text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 border border-border bg-muted rounded-md text-xs"
          >
            <option value="all">{t('evoucher.allStatus')}</option>
            <option value="PENDING">{t('evoucher.pending')}</option>
            <option value="PAID">{t('evoucher.paid')}</option>
            <option value="CANCELLED">{t('evoucher.cancelled')}</option>
            <option value="EXPIRED">{t('evoucher.expired')}</option>
          </select>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">{t('evoucher.noOrdersFound')}</div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order.id)}
                    onChange={() => handleSelectOrder(order.id)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="font-mono text-xs text-foreground">{order.orderNumber}</div>
                    <div className="text-[10px] text-muted-foreground">{formatToWIB(order.createdAt)}</div>
                  </div>
                </div>
                {getStatusBadge(order.status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('evoucher.customer')}</div>
                  <div className="font-medium">{order.customerName}</div>
                  <div className="text-[10px] text-muted-foreground">{order.customerPhone}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('evoucher.profile')}</div>
                  <div>{order.profile.name}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('evoucher.quantity')}</div>
                  <div>{order.quantity}x</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{t('evoucher.amount')}</div>
                  <div className="font-medium">{formatCurrency(order.totalAmount)}</div>
                </div>
              </div>
              {(order.status === 'PENDING' || order.status === 'PAID') && (
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  {order.status === 'PENDING' && (
                    <button onClick={() => handleCancelOrder(order.id, order.orderNumber)} className="p-2 text-destructive hover:bg-destructive/10 rounded" title="Batalkan Pesanan">
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {order.status === 'PAID' && (
                    <button onClick={() => handleResendVoucher(order.id, order.orderNumber)} className="p-2 text-primary hover:bg-primary/10 rounded" title="Kirim Ulang Voucher">
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Table - Desktop */}
      <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('evoucher.order')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('evoucher.customer')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('evoucher.profile')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('evoucher.quantity')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('evoucher.amount')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('common.date')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">{t('evoucher.noOrdersFound')}</td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => handleSelectOrder(order.id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-foreground">{order.orderNumber}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs text-foreground">{order.customerName}</div>
                        <div className="text-[10px] text-muted-foreground">{order.customerPhone}</div>
                      </td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell">{order.profile.name}</td>
                      <td className="px-3 py-2 text-xs">{order.quantity}x</td>
                      <td className="px-3 py-2 text-xs font-medium">{formatCurrency(order.totalAmount)}</td>
                      <td className="px-3 py-2">{getStatusBadge(order.status)}</td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <div className="text-[10px]">{formatToWIB(order.createdAt)}</div>
                        {order.paidAt && <div className="text-[9px] text-success">Paid: {formatToWIB(order.paidAt)}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {order.status === 'PENDING' && (
                            <button
                              onClick={() => handleCancelOrder(order.id, order.orderNumber)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded"
                              title="Batalkan Pesanan"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {order.status === 'PAID' && (
                            <button
                              onClick={() => handleResendVoucher(order.id, order.orderNumber)}
                              className="p-1 text-primary hover:bg-primary/10 rounded"
                              title="Kirim Ulang Voucher"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}  
      </div>
      </div>
    </div>
  );
}
