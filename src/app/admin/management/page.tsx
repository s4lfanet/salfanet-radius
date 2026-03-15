'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { usePermissions } from '@/hooks/usePermissions';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface User {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
}

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
}

const ROLES = [
  { value: 'SUPER_ADMIN', translationKey: 'superAdmin' },
  { value: 'FINANCE', translationKey: 'finance' },
  { value: 'CUSTOMER_SERVICE', translationKey: 'customerService' },
  { value: 'TECHNICIAN', translationKey: 'technician' },
  { value: 'MARKETING', translationKey: 'marketing' },
  { value: 'VIEWER', translationKey: 'viewer' },
];

export default function ManagementPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const { data: session } = useSession();
  const { hasPermission } = usePermissions();
  const currentUserIsSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'CUSTOMER_SERVICE',
    permissions: [] as string[],
  });

  useEffect(() => {
    fetchUsers();
    fetchPermissions();
    fetchRoleTemplates();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || data);
      }
    } catch {
      console.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const res = await fetch('/api/permissions');
      if (res.ok) {
        const data = await res.json();
        // API returns grouped object: { category1: [...], category2: [...] }
        // Convert to flat array for state
        if (data.success && data.permissions) {
          const flatPermissions = Object.values(data.permissions).flat();
          setPermissions(flatPermissions as Permission[]);
        } else if (Array.isArray(data)) {
          setPermissions(data);
        }
      }
    } catch {
      console.error('Failed to fetch permissions');
    }
  };

  const fetchRoleTemplates = async () => {
    try {
      const res = await fetch('/api/permissions/role-templates');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.templates) {
          setRoleTemplates(data.templates);
        }
      }
    } catch {
      console.error('Failed to fetch role templates');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const method = editingUser ? 'PUT' : 'POST';

      const submitData = { ...formData };
      if (editingUser && !submitData.password) {
        const { password, ...rest } = submitData;
        Object.assign(submitData, rest);
        delete (submitData as { password?: string }).password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (res.ok) {
        addToast({ type: 'success', title: t('common.success'), description: editingUser ? t('management.userUpdated') : t('management.userCreated'), duration: 2000 });
        setShowModal(false);
        resetForm();
        fetchUsers();
      } else {
        const error = await res.json();
        addToast({ type: 'error', title: t('common.error'), description: error.error || t('management.failedSaveUser') });
      }
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: t('management.failedSaveUser') });
    }
  };

  const handleEdit = async (user: User) => {
    setEditingUser(user);
    
    // Load user's actual permissions from API
    try {
      const res = await fetch(`/api/admin/users/${user.id}/permissions`);
      if (res.ok) {
        const data = await res.json();
        const userPermissionIds = data.permissions || [];
        
        setFormData({
          username: user.username,
          email: user.email,
          phone: user.phone || '',
          password: '',
          role: user.role,
          permissions: userPermissionIds,
        });
      } else {
        // Fallback to cached data if API fails
        setFormData({
          username: user.username,
          email: user.email,
          phone: user.phone || '',
          password: '',
          role: user.role,
          permissions: user.permissions || [],
        });
      }
    } catch (error) {
      console.error('Failed to load user permissions:', error);
      // Fallback to cached data
      setFormData({
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        password: '',
        role: user.role,
        permissions: user.permissions || [],
      });
    }
    
    setShowModal(true);
  };

  const handleDelete = async (user: User) => {
    if (await confirm({
      title: t('management.deleteConfirm'),
      message: t('management.deleteMessage').replace('{username}', user.username),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) {
      try {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          addToast({ type: 'success', title: t('common.success'), description: t('management.userDeleted'), duration: 2000 });
          fetchUsers();
        } else {
          const error = await res.json();
          addToast({ type: 'error', title: t('common.error'), description: error.error || t('management.failedSaveUser') });
        }
      } catch {
        addToast({ type: 'error', title: t('common.error'), description: t('management.failedSaveUser') });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      phone: '',
      password: '',
      role: 'CUSTOMER_SERVICE',
      permissions: [],
    });
    setEditingUser(null);
  };

  const handleRoleChange = (role: string) => {
    // Auto-load permissions from role template
    const rolePermissions = roleTemplates[role] || [];
    setFormData({
      ...formData,
      role,
      permissions: rolePermissions,
    });
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const togglePermission = (permId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId],
    }));
  };

  const permissionsByCategory = (Array.isArray(permissions) ? permissions : []).reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-destructive/10 text-destructive';
      case 'FINANCE':
        return 'bg-success/10 text-success';
      case 'CUSTOMER_SERVICE':
        return 'bg-info/10 text-info';
      case 'TECHNICIAN':
        return 'bg-primary/10 text-primary';
      case 'MARKETING':
        return 'bg-warning/10 text-warning';
      case 'VIEWER':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleLabel = (role: string) => {
    const roleConfig = ROLES.find((item) => item.value === role);
    return roleConfig ? t(`management.${roleConfig.translationKey}`) : role.replace('_', ' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <div className="flex flex-col items-center gap-2 relative z-10">
          <div className="w-12 h-12 border-2 border-[#00f7ff] border-t-transparent rounded-full animate-spin drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
          <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
        </div>
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
      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('management.title')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('management.subtitle')}</p>
          </div>
          {hasPermission('users.create') && (
            <button
              onClick={openCreateModal}
              className="h-8 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 self-start sm:self-auto"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('management.addUser')}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded">
                <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">{users.length}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{t('management.totalUsers')}</p>
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-destructive/10 rounded">
                <svg className="w-3.5 h-3.5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">
                  {users.filter(u => u.role === 'SUPER_ADMIN').length}
                </p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{t('management.superAdmin')}</p>
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-info/10 rounded">
                <svg className="w-3.5 h-3.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">
                  {users.filter(u => u.role === 'CUSTOMER_SERVICE').length}
                </p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{t('management.customerService')}</p>
              </div>
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-3 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded">
                <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">
                  {users.filter(u => u.role === 'TECHNICIAN').length}
                </p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{t('management.technician')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Mobile Card View */}
          <div className="block sm:hidden divide-y divide-border">
            {users.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t('management.noUsersFound')}
              </div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="p-3 space-y-2 active:bg-muted transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-primary uppercase">
                          {user.username.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{user.username}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {hasPermission('users.edit') && (user.role !== 'SUPER_ADMIN' || currentUserIsSuperAdmin) && (
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                          title={t('management.editTooltip')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {hasPermission('users.delete') && user.role !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                          title={t('management.deleteTooltip')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {user.phone && (
                    <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${getRoleBadgeColor(user.role)}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                    {user.permissions && user.permissions.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {user.permissions.length} {t('management.permissions').toLowerCase()}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(user.createdAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('management.username')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('management.email')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">{t('management.phoneNumber')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('management.role')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">{t('management.permissions')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">{t('management.createdAt')}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      {t('management.noUsersFound')}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-muted transition-colors">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-primary uppercase">
                              {user.username.charAt(0)}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-foreground">{user.username}</p>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </td>
                      <td className="px-3 py-1.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground font-mono">{user.phone || '-'}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${getRoleBadgeColor(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 hidden md:table-cell">
                        <div className="flex flex-wrap gap-0.5 max-w-xs">
                          {user.permissions && user.permissions.length > 0 ? (
                            <>
                              {user.permissions.slice(0, 3).map((perm) => (
                                <span
                                  key={perm}
                                  className="inline-flex px-1 py-0.5 text-[9px] font-medium bg-muted text-muted-foreground rounded"
                                >
                                  {perm}
                                </span>
                              ))}
                              {user.permissions.length > 3 && (
                                <span className="inline-flex px-1 py-0.5 text-[9px] font-medium bg-primary/10 text-primary rounded">
                                  +{user.permissions.length - 3}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 hidden lg:table-cell">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {hasPermission('users.edit') && (user.role !== 'SUPER_ADMIN' || currentUserIsSuperAdmin) && (
                            <button
                              onClick={() => handleEdit(user)}
                              className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                              title={t('management.editTooltip')}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {hasPermission('users.delete') && user.role !== 'SUPER_ADMIN' && (
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title={t('management.deleteTooltip')}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
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
        </div>

        {/* Modal */}
        <SimpleModal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} size="lg">
          <ModalHeader>
            <ModalTitle>{editingUser ? t('management.editUser') : t('management.addNewUser')}</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">
              <div>
                <ModalLabel required>{t('management.username')}</ModalLabel>
                <ModalInput type="text" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
              </div>
              <div>
                <ModalLabel required>{t('management.email')}</ModalLabel>
                <ModalInput type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
              </div>
              <div>
                <ModalLabel>{t('management.phoneWhatsapp')} <span className="text-muted-foreground text-[10px]">({t('management.phoneWhatsappHint')})</span></ModalLabel>
                <ModalInput type="tel" placeholder={t('management.phoneWhatsappPlaceholder')} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <ModalLabel required={!editingUser}>{t('management.password')} {editingUser && <span className="text-muted-foreground">({t('management.passwordHint')})</span>}</ModalLabel>
                <ModalInput type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} {...(!editingUser && { required: true })} />
              </div>
              <div>
                <ModalLabel required>{t('management.role')}</ModalLabel>
                <ModalSelect value={formData.role} onChange={(e) => handleRoleChange(e.target.value)}>
                  {ROLES.filter((role) => role.value !== 'SUPER_ADMIN' || currentUserIsSuperAdmin).map((role) => (<option key={role.value} value={role.value} className="bg-[#0a0520]">{t(`management.${role.translationKey}`)}</option>))}
                </ModalSelect>
                <p className="text-[10px] text-muted-foreground mt-1">{t('management.roleAutoLoad')}</p>
              </div>
              <div>
                <ModalLabel>{t('management.permissions')}</ModalLabel>
                <div className="border border-[#bc13fe]/30 rounded-lg p-2 max-h-48 overflow-y-auto space-y-2 bg-[#0a0520]/50">
                  {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category}>
                      <p className="text-[10px] font-semibold text-[#00f7ff] mb-1 uppercase tracking-wider">{category}</p>
                      <div className="grid grid-cols-2 gap-1">
                        {perms.map((perm) => (
                          <label key={perm.id} className="flex items-center gap-1.5 cursor-pointer p-1 hover:bg-[#bc13fe]/10 rounded transition-colors">
                            <input type="checkbox" checked={formData.permissions.includes(perm.key)} onChange={() => togglePermission(perm.key)} className="w-3 h-3 rounded border-[#bc13fe]/50 bg-[#0a0520] text-[#00f7ff] focus:ring-[#00f7ff]" />
                            <span className="text-[10px] text-foreground">{perm.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {permissions.length === 0 && (<p className="text-[10px] text-muted-foreground text-center py-2">{t('management.noPermissions')}</p>)}
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingUser ? t('management.saveChanges') : t('management.addUser')}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>
      </div>
    </div>
  );
}
