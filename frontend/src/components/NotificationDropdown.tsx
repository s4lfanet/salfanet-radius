'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Banknote, Bell, Check, CheckCheck, CreditCard, FileText, Megaphone, Trash2, User, UserX, Wallet, X } from 'lucide-react';
import { formatWIB } from '@/lib/timezone';
import Link from 'next/link';
import { apiAdmin } from '@/lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [_loading, _setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
    // Refresh every 60 seconds (layout already polls at 30s for toasts + badge)
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadNotifications = async () => {
    try {
      const data = await apiAdmin<{ success: boolean; notifications: Notification[]; unreadCount: number }>('/api/notifications?limit=10');
      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Load notifications error:', error);
    }
  };

  const markAsRead = async (notificationIds: string[]) => {
    try {
      await apiAdmin('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({ notificationIds }),
      });
      loadNotifications();
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiAdmin('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({ markAll: true }),
      });
      loadNotifications();
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await apiAdmin(`/api/notifications?id=${id}`, {
        method: 'DELETE',
      });
      loadNotifications();
    } catch (error) {
      console.error('Delete notification error:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = 'w-6 h-6 flex items-center justify-center rounded-full';
    const glyph = 'w-3.5 h-3.5';
    switch (type) {
      case 'invoice_overdue':
        return <div className={`${iconClass} bg-red-100 text-red-600`}><Banknote className={glyph} /></div>;
      case 'invoice_generated':
        return <div className={`${iconClass} bg-blue-100 text-blue-600`}><FileText className={glyph} /></div>;
      case 'new_registration':
        return <div className={`${iconClass} bg-blue-100 text-blue-600`}><User className={glyph} /></div>;
      case 'payment_received':
        return <div className={`${iconClass} bg-green-100 text-green-600`}><Wallet className={glyph} /></div>;
      case 'manual_payment_submitted':
        return <div className={`${iconClass} bg-cyan-100 text-cyan-600`}><CreditCard className={glyph} /></div>;
      case 'manual_payment_approved':
        return <div className={`${iconClass} bg-green-100 text-green-600`}><Check className={glyph} /></div>;
      case 'manual_payment_rejected':
        return <div className={`${iconClass} bg-red-100 text-red-600`}><X className={glyph} /></div>;
      case 'user_expired':
        return <div className={`${iconClass} bg-yellow-100 text-yellow-600`}><UserX className={glyph} /></div>;
      case 'system_alert':
        return <div className={`${iconClass} bg-purple-100 text-purple-600`}><AlertTriangle className={glyph} /></div>;
      default:
        return <div className={`${iconClass} bg-muted text-muted-foreground`}><Megaphone className={glyph} /></div>;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 hover:bg-muted rounded-xl transition-colors"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-card rounded-lg shadow-xl border border-border z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unreadCount} unread
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b border-border hover:bg-muted transition-colors ${
                    !notif.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{getNotificationIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      {notif.link ? (
                        <Link
                          href={notif.link}
                          onClick={() => {
                            if (!notif.isRead) {
                              markAsRead([notif.id]);
                            }
                            setIsOpen(false);
                          }}
                          className="block"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notif.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatWIB(notif.createdAt, 'dd MMM yyyy HH:mm')}
                          </p>
                        </Link>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notif.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatWIB(notif.createdAt, 'dd MMM yyyy HH:mm')}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!notif.isRead && (
                        <button
                          onClick={() => markAsRead([notif.id])}
                          className="p-1 hover:bg-muted rounded"
                          title="Mark as read"
                        >
                          <Check className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notif.id)}
                        className="p-1 hover:bg-destructive/10 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-border">
              <Link
                href="/admin/notifications"
                className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={() => setIsOpen(false)}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
