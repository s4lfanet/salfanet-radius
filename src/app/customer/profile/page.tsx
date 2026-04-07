'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, CreditCard, Calendar, Package, LogOut, Shield, Edit3, Save, X, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface CustomerData {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  status: string;
  customerId?: string | null;
  packageName: string | null;
  packagePrice: number | null;
  expiryDate: string | null;
  createdAt?: string;
  profile?: {
    id: string;
    name: string;
    downloadSpeed: string;
    uploadSpeed: string;
  };
}

export default function CustomerProfilePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('Radius');

  // Edit state
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [editName, setEditName]   = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const toast = (type: 'success' | 'error' | 'info', title: string, desc?: string) =>
    addToast({ type, title, description: desc, duration: type === 'error' ? 8000 : 5000 });

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('customer_token');
    
    if (!token) {
      router.push('/customer/login');
      return;
    }

    fetchCustomerProfile(token);
    fetch('/api/public/company').then(r => r.json()).then(d => { if (d.success && d.company?.name) setCompanyName(d.company.name); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchCustomerProfile = async (token: string) => {
    try {
      const response = await fetch('/api/customer/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('customer_token');
          localStorage.removeItem('customer_user');
          router.push('/customer/login');
          return;
        }
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      if (data.success && data.user) {
        const user = data.user;
        const c = {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          customerId: user.customerId || null,
          packageName: user.profile?.name || null,
          packagePrice: null,
          expiryDate: user.expiredAt,
          profile: user.profile
        };
        setCustomer(c);
        setEditName(user.name || '');
        setEditPhone(user.phone || '');
        setEditEmail(user.email || '');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_user');
    router.push('/customer/login');
  };

  const handleSave = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;
    if (!editName.trim() || editName.trim().length < 2) {
      toast('error', 'Validasi', 'Nama minimal 2 karakter');
      return;
    }
    if (editPhone && !/^[0-9+\-\s]{8,20}$/.test(editPhone)) {
      toast('error', 'Validasi', 'Format nomor telepon tidak valid');
      return;
    }
    if (editEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      toast('error', 'Validasi', 'Format email tidak valid');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null, email: editEmail.trim() || null }),
      });
      const data = await res.json();
      if (!data.success) {
        toast('error', 'Gagal menyimpan', data.message || data.error || 'Terjadi kesalahan');
        return;
      }
      const u = data.user;
      setCustomer(prev => prev ? { ...prev, name: u.name, phone: u.phone, email: u.email } : prev);
      setEditing(false);
      toast('success', 'Profil diperbarui', 'Data berhasil disimpan');
    } catch {
      toast('error', 'Error', 'Terjadi kesalahan saat menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!customer) return;
    setEditName(customer.name || '');
    setEditPhone(customer.phone || '');
    setEditEmail(customer.email || '');
    setEditing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-success/20 text-success border border-success/40 shadow-[0_0_5px_rgba(0,255,136,0.3)]';
      case 'SUSPENDED':
        return 'bg-destructive/20 text-destructive border border-destructive/40 shadow-[0_0_5px_rgba(255,51,102,0.3)]';
      case 'EXPIRED':
        return 'bg-warning/20 text-warning border border-warning/40 shadow-[0_0_5px_rgba(255,170,0,0.3)]';
      default:
        return 'bg-muted text-muted-foreground border border-border';
    }
  };

  if (loading) {
    return (
      <div className="p-3 flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary shadow-[0_0_15px_rgba(188,19,254,0.5)]"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-3">
        <CyberCard className="p-4 text-center bg-destructive/10 border-2 border-destructive/30">
          <p className="text-destructive text-sm font-bold">
            {t('profile.loadError')}
          </p>
        </CyberCard>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Profile Header */}
      <CyberCard className="p-6 bg-gradient-to-r from-primary/20 to-accent/20 backdrop-blur-xl border-2 border-primary/40 shadow-[0_0_30px_rgba(188,19,254,0.3)]">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/30 border-2 border-primary flex items-center justify-center shadow-[0_0_20px_rgba(188,19,254,0.5)]">
            <User size={32} className="text-primary drop-shadow-[0_0_10px_rgba(188,19,254,0.8)]" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{customer.name}</h1>
            <p className="text-accent text-sm font-mono">@{customer.username}</p>
          </div>
          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getStatusBadge(customer.status)}`}>
            {customer.status}
          </span>
        </div>
      </CyberCard>

      {/* Contact Information */}
      <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-accent/30 shadow-[0_0_30px_rgba(0,247,255,0.15)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-accent flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(0,247,255,0.5)]">
            <Mail size={16} className="drop-shadow-[0_0_5px_rgba(0,247,255,0.8)]" />
            {t('profile.contactInfo')}
          </h2>
          {!editing ? (
            <CyberButton onClick={() => setEditing(true)} variant="outline" size="sm" className="text-xs px-2 py-1">
              <Edit3 className="w-3.5 h-3.5 mr-1" />Edit
            </CyberButton>
          ) : (
            <div className="flex gap-2">
              <CyberButton onClick={handleSave} disabled={saving} variant="cyan" size="sm" className="text-xs px-2 py-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1" />Simpan</>}
              </CyberButton>
              <CyberButton onClick={handleCancelEdit} disabled={saving} variant="outline" size="sm" className="text-xs px-2 py-1">
                <X className="w-3.5 h-3.5" />
              </CyberButton>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {/* Name */}
          <div className="flex items-start gap-3">
            <User size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">Nama Lengkap</p>
              {editing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-background dark:bg-slate-800/60 border border-border dark:border-slate-600/50 focus:border-cyan-500/60 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition-colors"
                  placeholder="Nama lengkap"
                />
              ) : (
                <p className="text-sm text-white">{customer.name || '-'}</p>
              )}
            </div>
          </div>
          {/* Email */}
          <div className="flex items-start gap-3">
            <Mail size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">{t('profile.email')}</p>
              {editing ? (
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full bg-background dark:bg-slate-800/60 border border-border dark:border-slate-600/50 focus:border-cyan-500/60 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition-colors"
                  placeholder="email@contoh.com"
                />
              ) : (
                <p className="text-sm text-white">{customer.email || <span className="text-slate-500 italic text-xs">Belum diisi</span>}</p>
              )}
            </div>
          </div>
          {/* Phone */}
          <div className="flex items-start gap-3">
            <Phone size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">{t('profile.phone')}</p>
              {editing ? (
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full bg-background dark:bg-slate-800/60 border border-border dark:border-slate-600/50 focus:border-cyan-500/60 rounded-lg px-3 py-2 text-sm text-foreground outline-none transition-colors"
                  placeholder="0812-3456-7890"
                />
              ) : (
                <p className="text-sm text-white">{customer.phone || <span className="text-slate-500 italic text-xs">Belum diisi</span>}</p>
              )}
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Package Information */}
      {customer.profile && (
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-[0_0_30px_rgba(188,19,254,0.15)]">
          <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">
            <Package size={16} className="drop-shadow-[0_0_5px_rgba(188,19,254,0.8)]" />
            {t('profile.packageInfo')}
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Package size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.package')}</p>
                <p className="text-sm font-medium text-white">{customer.profile.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">Kecepatan</p>
                <p className="text-sm font-medium text-white">
                  ↓ {customer.profile.downloadSpeed} Mbps / ↑ {customer.profile.uploadSpeed} Mbps
                </p>
              </div>
            </div>
            {customer.expiryDate && (
              <div className="flex items-start gap-3">
                <Calendar size={16} className="text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.expiryDate')}</p>
                  <p className="text-sm text-white">
                    {formatWIB(customer.expiryDate, 'd MMMM yyyy')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CyberCard>
      )}

      {/* Account Information */}
      <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-[0_0_30px_rgba(188,19,254,0.15)]">
        <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(188,19,254,0.5)]">
          <Shield size={16} className="drop-shadow-[0_0_5px_rgba(188,19,254,0.8)]" />
          {t('profile.accountInfo')}
        </h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <User size={16} className="text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.username')}</p>
              <p className="text-sm font-mono text-white">{customer.username}</p>
            </div>
          </div>
          {customer.customerId && (
            <div className="flex items-start gap-3">
              <Shield size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">ID Pelanggan</p>
                <p className="text-sm font-mono font-bold text-white">{customer.customerId}</p>
              </div>
            </div>
          )}
        </div>
      </CyberCard>

      {/* Actions */}
      <div className="space-y-2">
        <CyberButton
          onClick={handleLogout}
          variant="destructive"
          className="w-full flex items-center justify-center gap-2 py-3"
        >
          <LogOut size={18} />
          <span className="font-medium">{t('profile.logout')}</span>
        </CyberButton>
      </div>

      {/* Version Info */}
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground/60 font-mono">
          {companyName} v1.0.0
        </p>
      </div>
    </div>
  );
}
