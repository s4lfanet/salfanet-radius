'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Bell, Check, CheckCheck, Trash2, Loader2, Filter, AlertCircle, UserPlus, DollarSign, Clock, AlertTriangle, Users, Briefcase, Wallet, Wrench, Receipt, CreditCard } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

// Category definitions - will be translated in component
const NOTIFICATION_CATEGORIES = [
  { type: 'all', key: 'notifications.categories.all', icon: Bell },
  { type: 'unread', key: 'notifications.categories.unread', icon: AlertCircle },
  { type: 'invoice_overdue', key: 'notifications.categories.invoice_overdue', icon: DollarSign },
  { type: 'invoice_generated', key: 'notifications.categories.invoice_generated', icon: Receipt },
  { type: 'payment_received', key: 'notifications.categories.payment_received', icon: CheckCheck },
  { type: 'manual_payment_submitted', key: 'notifications.categories.manual_payment_submitted', icon: CreditCard },
  { type: 'manual_payment_approved', key: 'notifications.categories.manual_payment_approved', icon: CheckCheck },
  { type: 'manual_payment_rejected', key: 'notifications.categories.manual_payment_rejected', icon: AlertCircle },
  { type: 'new_registration', key: 'notifications.categories.new_registration', icon: UserPlus },
  { type: 'user_expired', key: 'notifications.categories.user_expired', icon: Clock },
  { type: 'package_change_request', key: 'notifications.categories.package_change_request', icon: Briefcase },
  { type: 'agent_deposit', key: 'notifications.categories.agent_deposit', icon: Wallet },
  { type: 'agent_voucher_generated', key: 'notifications.categories.agent_voucher_generated', icon: Receipt },
  { type: 'agent_balance_adjustment', key: 'notifications.categories.agent_balance_adjustment', icon: DollarSign },
  { type: 'system_alert', key: 'notifications.categories.system_alert', icon: AlertTriangle },
];

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, categoryFilter]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      let url = '/api/notifications?limit=100';
      
      if (filter === 'unread') {
        url += '&unreadOnly=true';
      }
      
      if (categoryFilter !== 'all' && categoryFilter !== 'unread') {
        url += `&type=${categoryFilter}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        if (data.categoryCounts) {
          setCategoryCounts(data.categoryCounts);
        }
      }
    } catch (error) {
      console.error('Load notifications error:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationIds: string[]) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds }),
      });
      
      toast({
        title: "✅ " + t('notifications.markedAsRead'),
        description: `${notificationIds.length} ${t('notifications.notificationMarked')}`,
      });
      
      loadNotifications();
    } catch (error) {
      console.error('Mark as read error:', error);
      toast({
        variant: "destructive",
        title: "❌ " + t('common.error'),
        description: t('notifications.markReadFailed'),
      });
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      
      toast({
        title: "✅ " + t('notifications.allMarkedAsRead'),
        description: t('notifications.allNotificationsMarked'),
      });
      
      loadNotifications();
    } catch (error) {
      console.error('Mark all as read error:', error);
      toast({
        variant: "destructive",
        title: "❌ " + t('common.error'),
        description: t('notifications.markAllFailed'),
      });
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await fetch(`/api/notifications?id=${id}`, {
        method: 'DELETE',
      });
      
      toast({
        title: "🗑️ " + t('notifications.deleted'),
        description: t('notifications.notificationDeleted'),
      });
      
      loadNotifications();
    } catch (error) {
      console.error('Delete notification error:', error);
      toast({
        variant: "destructive",
        title: "❌ " + t('common.error'),
        description: t('notifications.deleteFailed'),
      });
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      await fetch(`/api/notifications?ids=${selectedIds.join(',')}`, {
        method: 'DELETE',
      });
      
      toast({
        title: "🗑️ " + t('notifications.deleted'),
        description: `${selectedIds.length} ${t('notifications.notificationsDeleted')}`,
      });
      
      setSelectedIds([]);
      loadNotifications();
    } catch (error) {
      console.error('Delete selected error:', error);
      toast({
        variant: "destructive",
        title: "❌ " + t('common.error'),
        description: t('notifications.deleteFailed'),
      });
    }
  };

  const markSelectedAsRead = async () => {
    if (selectedIds.length === 0) return;

    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: selectedIds }),
      });
      
      toast({
        title: "✅ " + t('notifications.markedAsRead'),
        description: `${selectedIds.length} ${t('notifications.notificationsMarked')}`,
      });
      
      setSelectedIds([]);
      loadNotifications();
    } catch (error) {
      console.error('Mark selected as read error:', error);
      toast({
        variant: "destructive",
        title: "❌ " + t('common.error'),
        description: t('notifications.markReadFailed'),
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === notifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notifications.map(n => n.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'invoice_overdue':
        return 'border-l-destructive bg-destructive/10';
      case 'manual_payment_rejected':
        return 'border-l-destructive bg-destructive/10';
      case 'new_registration':
        return 'border-l-info bg-info/10';
      case 'package_change_request':
        return 'border-l-info bg-info/10';
      case 'payment_received':
        return 'border-l-success bg-success/10';
      case 'manual_payment_approved':
        return 'border-l-success bg-success/10';
      case 'invoice_generated':
        return 'border-l-success bg-success/10';
      case 'user_expired':
        return 'border-l-warning bg-warning/10';
      case 'manual_payment_submitted':
        return 'border-l-warning bg-warning/10';
      case 'agent_deposit':
        return 'border-l-warning bg-warning/10';
      case 'agent_balance_adjustment':
        return 'border-l-warning bg-warning/10';
      case 'agent_voucher_generated':
        return 'border-l-primary bg-primary/10';
      case 'system_alert':
        return 'border-l-primary bg-primary/10';
      default:
        return 'border-l-border bg-muted/50';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'invoice_overdue': return '💸';
      case 'invoice_generated': return '🧾';
      case 'new_registration': return '👤';
      case 'payment_received': return '✅';
      case 'manual_payment_submitted': return '📄';
      case 'manual_payment_approved': return '✅';
      case 'manual_payment_rejected': return '❌';
      case 'package_change_request': return '📦';
      case 'agent_deposit': return '💰';
      case 'agent_voucher_generated': return '🎟️';
      case 'agent_balance_adjustment': return '💳';
      case 'user_expired': return '⏰';
      case 'system_alert': return '⚠️';
      default: return '📢';
    }
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
      <div className="bg-brand-500 dark:bg-gradient-to-r dark:from-[#bc13fe] dark:to-[#ff44cc] rounded-xl p-4 text-white dark:shadow-[0_0_30px_rgba(188,19,254,0.3)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{t('notifications.title')}</h1>
              <p className="text-sm text-white/80 mt-1">{t('notifications.manageAll')}</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-white/20 rounded">
              {unreadCount} {t('notifications.unread')}
            </span>
          )}
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {NOTIFICATION_CATEGORIES.map((category) => {
            const Icon = category.icon;
            let count = 0;
            
            if (category.type === 'all') {
              count = notifications.length;
            } else if (category.type === 'unread') {
              count = unreadCount;
            } else {
              count = categoryCounts[category.type] || 0;
            }
            
            const isActive = categoryFilter === category.type;

            return (
              <button
                key={category.type}
                onClick={() => setCategoryFilter(category.type)}
                className={`p-2.5 rounded-lg border-2 transition-all ${
                  isActive 
                    ? 'bg-gradient-to-br from-[#bc13fe]/20 to-[#ff44cc]/20 border-[#bc13fe] shadow-[0_0_20px_rgba(188,19,254,0.4)]' 
                    : 'bg-card border-border hover:border-[#bc13fe]/50 hover:bg-card/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#00f7ff] drop-shadow-[0_0_6px_rgba(0,247,255,0.8)]' : 'text-muted-foreground'}`} />
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-[10px] font-semibold line-clamp-1 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t(category.key)}
                    </p>
                    <p className={`text-sm font-bold ${isActive ? 'text-[#00f7ff]' : 'text-foreground/60'}`}>
                      {count}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tombol Tandai Semua Dibaca (prominent) */}
        {unreadCount > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={markAllAsRead}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#00ff88] to-[#00f7ff] hover:from-[#00ff88]/90 hover:to-[#00f7ff]/90 text-[#0a0118] text-sm font-bold rounded-lg transition-all shadow-[0_0_25px_rgba(0,255,136,0.4)]"
            >
              <CheckCheck className="w-5 h-5" />
              {t('notifications.markAllRead')} ({unreadCount})
            </button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-gradient-to-r from-primary/20 to-info/20 rounded-lg border border-primary/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-primary/20 text-primary text-xs font-semibold rounded">
                {selectedIds.length} {t('common.selected')}
              </span>
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-muted-foreground hover:text-foreground transition underline"
              >
                {t('common.clearSelection')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={markSelectedAsRead}
                className="flex items-center gap-1 px-2.5 py-1 bg-success hover:bg-success/90 text-success-foreground text-xs font-medium rounded-lg transition"
              >
                <Check className="w-3.5 h-3.5" />
                {t('notifications.markRead')}
              </button>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1 px-2.5 py-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-medium rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">{t('notifications.noNotifications')}</p>
            <p className="text-[10px] mt-0.5">
              {filter === 'unread' ? t('notifications.allRead') : t('notifications.noNotificationsYet')}
            </p>
          </div>
        ) : (
          <>
            {/* Table Header with Select All */}
            {notifications.length > 0 && (
              <div className="p-3 bg-muted/50 border-b border-border flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={notifications.length > 0 && selectedIds.length === notifications.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedIds.length === notifications.length
                    ? t('common.deselectAll')
                    : t('common.selectAll')}
                </span>
              </div>
            )}
            
            <div className="divide-y divide-border">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3 border-l-3 transition-colors ${getNotificationStyle(notif.type)} ${!notif.isRead ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(notif.id)}
                    onChange={() => toggleSelect(notif.id)}
                    className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer flex-shrink-0"
                  />
                  
                  <div className="text-lg flex-shrink-0">{getNotificationIcon(notif.type)}</div>
                  
                  <div className="flex-1 min-w-0">
                    {notif.link ? (
                      <Link
                        href={notif.link}
                        onClick={() => {
                          if (!notif.isRead) {
                            markAsRead([notif.id]);
                          }
                        }}
                        className="block group"
                      >
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition line-clamp-1">
                          {notif.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatWIB(notif.createdAt, 'dd MMM yyyy HH:mm')}
                        </p>
                      </Link>
                    ) : (
                      <>
                        <h3 className="text-sm font-semibold text-foreground line-clamp-1">
                          {notif.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatWIB(notif.createdAt, 'dd MMM yyyy HH:mm')}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!notif.isRead && (
                      <button
                        onClick={() => markAsRead([notif.id])}
                        className="p-1 hover:bg-primary/10 rounded transition"
                        title={t('notifications.markRead')}
                      >
                        <Check className="w-3.5 h-3.5 text-primary" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notif.id)}
                      className="p-1 hover:bg-destructive/10 rounded transition"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}




