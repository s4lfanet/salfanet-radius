'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, CreditCard, Calendar, Package, LogOut, Shield, ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { apiCustomer, ApiError } from '@/lib/api';

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
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('Radius');

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
      const data = await apiCustomer<{ success: boolean; user: {
        id: string; username: string; name: string; email: string | null; phone: string | null;
        status: string; customerId?: string | null; expiredAt: string | null;
        profile?: { id: string; name: string; downloadSpeed: string; uploadSpeed: string };
      } }>('/api/customer/me');

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
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_user');
        router.push('/customer/login');
        return;
      }
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary shadow-[0_0_15px_rgba(139,92,246,0.5)]"></div>
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
    <div className="p-3 lg:p-6 space-y-3 w-full">
      {/* Profile Header */}
      <CyberCard className="p-6 bg-gradient-to-r from-primary/20 to-accent/20 backdrop-blur-xl border-2 border-primary/40 dark:shadow-[0_0_30px_rgba(139,92,246,0.3)] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/30 border-2 border-primary flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)]">
            <User size={32} className="text-primary drop-shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{customer.name}</h1>
            <p className="text-accent text-sm font-mono">@{customer.username}</p>
          </div>
          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getStatusBadge(customer.status)}`}>
            {customer.status}
          </span>
        </div>
      </CyberCard>

      {/* Contact Information */}
      <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-accent/30 dark:shadow-[0_0_30px_rgba(6,182,212,0.15)] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-accent flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">
            <Mail size={16} className="drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
            {t('profile.contactInfo')}
          </h2>
          <p className="text-[10px] text-muted-foreground italic">Hubungi admin untuk mengubah data</p>
        </div>
        <div className="space-y-3">
          {/* Name */}
          <div className="flex items-start gap-3">
            <User size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">Nama Lengkap</p>
              <p className="text-sm text-foreground">{customer.name || '-'}</p>
            </div>
          </div>
          {/* Email */}
          <div className="flex items-start gap-3">
            <Mail size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">{t('profile.email')}</p>
              <p className="text-sm text-foreground">{customer.email || <span className="text-slate-500 italic text-xs">Belum diisi</span>}</p>
            </div>
          </div>
          {/* Phone */}
          <div className="flex items-start gap-3">
            <Phone size={16} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide mb-1">{t('profile.phone')}</p>
              <p className="text-sm text-foreground">{customer.phone || <span className="text-slate-500 italic text-xs">Belum diisi</span>}</p>
            </div>
          </div>
        </div>
      </CyberCard>

      {/* Package Information + Account Information â€” 2-col on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Package Information */}
      {customer.profile && (
        <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 dark:shadow-[0_0_30px_rgba(139,92,246,0.15)] shadow-sm">
          <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]">
            <Package size={16} className="drop-shadow-[0_0_5px_rgba(139,92,246,0.8)]" />
            {t('profile.packageInfo')}
          </h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Package size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.package')}</p>
                <p className="text-sm font-medium text-foreground">{customer.profile.name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CreditCard size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">Kecepatan</p>
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <ArrowDown size={13} className="text-green-500" /> {customer.profile.downloadSpeed} Mbps
                  <span className="text-muted-foreground">/</span>
                  <ArrowUp size={13} className="text-blue-500" /> {customer.profile.uploadSpeed} Mbps
                </p>
              </div>
            </div>
            {customer.expiryDate && (
              <div className="flex items-start gap-3">
                <Calendar size={16} className="text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.expiryDate')}</p>
                  <p className="text-sm text-foreground">
                    {formatWIB(customer.expiryDate, 'd MMMM yyyy')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CyberCard>
      )}

      {/* Account Information */}
      <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-primary/30 dark:shadow-[0_0_30px_rgba(139,92,246,0.15)] shadow-sm">
        <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2 uppercase tracking-wider drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]">
          <Shield size={16} className="drop-shadow-[0_0_5px_rgba(139,92,246,0.8)]" />
          {t('profile.accountInfo')}
        </h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <User size={16} className="text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-accent font-bold uppercase tracking-wide">{t('profile.username')}</p>
              <p className="text-sm font-mono text-foreground">{customer.username}</p>
            </div>
          </div>
          {customer.customerId && (
            <div className="flex items-start gap-3">
              <Shield size={16} className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-accent font-bold uppercase tracking-wide">ID Pelanggan</p>
                <p className="text-sm font-mono font-bold text-foreground">{customer.customerId}</p>
              </div>
            </div>
          )}
        </div>
      </CyberCard>
      </div>{/* end desktop 2-col grid */}

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


