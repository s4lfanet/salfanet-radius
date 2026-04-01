'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Loader2, CheckCircle, Zap, AlertCircle, CreditCard, ArrowRight, Calendar, Wifi, Download, Upload } from 'lucide-react';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import { showSuccess, showError } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

interface InternetPackage {
  id: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  price: number;
  description: string | null;
}

interface CurrentPackage {
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  expiredAt: string;
}

interface PaymentGateway {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
}

export default function UpgradePackagePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<InternetPackage[]>([]);
  const [currentPackage, setCurrentPackage] = useState<CurrentPackage | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<string>('');
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('customer_token');
    if (!token) {
      router.push('/customer/login');
      return;
    }
    loadData();
  }, [router]);

  // Debug logging
  useEffect(() => {
    console.log('[Upgrade Page] selectedPackage:', selectedPackage);
  }, [selectedPackage]);

  useEffect(() => {
    console.log('[Upgrade Page] selectedGateway:', selectedGateway);
  }, [selectedGateway]);

  const loadData = async () => {
    const token = localStorage.getItem('customer_token');
    if (!token) return;

    try {
      // Load current user info
      const userRes = await fetch('/api/customer/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const userData = await userRes.json();
      if (userData.success && userData.user) {
        setCurrentPackage({
          name: userData.user.profile?.name || 'Unknown',
          downloadSpeed: userData.user.profile?.downloadSpeed || 0,
          uploadSpeed: userData.user.profile?.uploadSpeed || 0,
          expiredAt: userData.user.expiredAt
        });
      }

      // Load available packages
      const packagesRes = await fetch('/api/public/profiles');
      const packagesData = await packagesRes.json();
      if (packagesData.success) {
        setPackages(packagesData.profiles || []);
      }

      // Load payment gateways
      const gatewaysRes = await fetch('/api/public/payment-gateways');
      const gatewaysData = await gatewaysRes.json();
      if (gatewaysData.success) {
        const gateways = gatewaysData.gateways || [];
        console.log('[Upgrade Page] Loaded gateways:', gateways);
        setPaymentGateways(gateways);
        // Auto select first gateway
        if (gateways.length > 0) {
          console.log('[Upgrade Page] Auto-selecting gateway:', gateways[0].provider);
          setSelectedGateway(gateways[0].provider);
        }
      }
    } catch (error) {
      console.error('Load data error:', error);
      setError(t('customer.failedLoadPackages'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!selectedPackage || !selectedGateway) {
      setError(t('customer.selectPackageAndPayment'));
      return;
    }

    setUpgrading(true);
    setError('');
    const token = localStorage.getItem('customer_token');

    try {
      const res = await fetch('/api/customer/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          newProfileId: selectedPackage,
          gateway: selectedGateway
        })
      });
      const data = await res.json();

      if (data.success) {
        // Show success toast and redirect
        showSuccess(
          `${t('customer.invoiceNo')}: ${data.invoiceNumber} — ${t('customer.total')}: ${formatCurrency(data.amount)}`,
          t('customer.invoiceCreated')
        );

        // Redirect to payment or customer page
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          router.push('/customer');
        }
      } else {
        setError(data.error || 'Gagal membuat invoice upgrade');
      }
    } catch (error) {
      setError('Gagal menghubungi server');
    } finally {
      setUpgrading(false);
    }
  };

  // No-gateway flow: same as mobile (creates invoice, pay via manual transfer)
  const handleUpgradeManual = async () => {
    if (!selectedPackage) {
      setError(t('customer.selectPackage'));
      return;
    }

    setUpgrading(true);
    setError('');
    const token = localStorage.getItem('customer_token');

    try {
      const res = await fetch('/api/customer/upgrade-package', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ packageId: selectedPackage })
      });
      const data = await res.json();

      if (data.success) {
        showSuccess(
          `${t('customer.invoiceNo')}: ${data.invoice?.invoiceNumber} — ${t('customer.total')}: ${formatCurrency(data.invoice?.amount || 0)}. ${t('customer.contactAdminPayment')}`,
          t('customer.invoiceCreated')
        );
        router.push('/customer/history');
      } else {
        setError(data.error || 'Gagal membuat invoice');
      }
    } catch (error) {
      setError('Gagal menghubungi server');
    } finally {
      setUpgrading(false);
    }
  };

  const formatSpeed = (mbps: number) => {
    if (mbps >= 1000) return `${mbps / 1000} Gbps`;
    return `${mbps} Mbps`;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);

  // Debug render
  console.log('[Upgrade Page] Rendering with:', {
    selectedPackage,
    selectedGateway,
    packagesCount: packages.length,
    gatewaysCount: paymentGateways.length,
    shouldShowButton: !!selectedPackage
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-lg font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{t('customer.upgradePackage')}</h1>
        <p className="text-xs text-[#e0d0ff]/60 mt-0.5">{t('customer.selectPackagePaymentMethod')}</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        {/* ── LEFT COLUMN: Current package info (2/5) ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Current Package Card */}
          {currentPackage && (
            <CyberCard className="bg-card/80 backdrop-blur-xl border-2 border-[#bc13fe]/30 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-[#bc13fe] via-[#ff44cc] to-[#00f7ff]" />
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-[#bc13fe]/20 rounded-xl border border-[#bc13fe]/30 shadow-[0_0_15px_rgba(188,19,254,0.3)]">
                    <Package className="w-5 h-5 text-[#bc13fe]" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#e0d0ff]/50 uppercase tracking-wider font-bold">{t('customer.currentPackage')}</p>
                    <h3 className="font-bold text-lg text-white leading-tight">{currentPackage.name}</h3>
                  </div>
                </div>

                {/* Speed bars */}
                <div className="space-y-3 mb-4 p-3 bg-[#bc13fe]/5 rounded-xl border border-[#bc13fe]/15">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1 text-[10px] text-[#e0d0ff]/60 font-bold uppercase">
                        <Download className="w-3 h-3" /> Download
                      </span>
                      <span className="text-xs font-bold text-[#00f7ff]">{formatSpeed(currentPackage.downloadSpeed)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#00f7ff] to-[#bc13fe] rounded-full"
                        style={{ width: `${Math.min(100, (currentPackage.downloadSpeed / 1000) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1 text-[10px] text-[#e0d0ff]/60 font-bold uppercase">
                        <Upload className="w-3 h-3" /> Upload
                      </span>
                      <span className="text-xs font-bold text-[#ff44cc]">{formatSpeed(currentPackage.uploadSpeed)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#ff44cc] to-[#bc13fe] rounded-full"
                        style={{ width: `${Math.min(100, (currentPackage.uploadSpeed / 1000) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expiry */}
                <div className="flex items-center gap-2 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                  <Calendar className="w-4 h-4 text-accent flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Expired</p>
                    <p className="text-xs font-semibold text-white">
                      {formatWIB(currentPackage.expiredAt, 'd MMMM yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </CyberCard>
          )}

          {/* Info Box */}
          <CyberCard className="p-4 bg-card/80 backdrop-blur-xl border-2 border-cyan-500/20">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/30 flex-shrink-0 mt-0.5">
                <Wifi className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-cyan-400">Cara Kerja Ganti Paket</p>
                <ul className="space-y-1">
                  {[
                    'Pilih paket baru dari daftar di sebelah kanan',
                    'Pilih metode pembayaran yang tersedia',
                    'Invoice akan dibuat dan dikirim ke akun Anda',
                    'Paket aktif setelah pembayaran dikonfirmasi',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#e0d0ff]/60">
                      <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-[8px] font-bold text-cyan-400 mt-0.5">{i + 1}</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CyberCard>
        </div>

        {/* ── RIGHT COLUMN: Package selection + payment (3/5) ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Available Packages */}
          <CyberCard className="bg-card/80 backdrop-blur-xl border-2 border-[#00f7ff]/30">
            <div className="px-5 pt-5 pb-3 border-b border-[#00f7ff]/10 flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">{t('customer.selectNewPackage')}</h2>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {packages.map((pkg) => {
                const isCurrentPackage = currentPackage?.name === pkg.name;
                const isSelected = selectedPackage === pkg.id;

                return (
                  <button
                    key={pkg.id}
                    onClick={() => !isCurrentPackage && setSelectedPackage(pkg.id)}
                    disabled={isCurrentPackage}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                      isCurrentPackage
                        ? 'border-slate-600/30 bg-slate-800/30 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_20px_rgba(0,247,255,0.25)]'
                          : 'border-[#bc13fe]/30 bg-slate-900/50 hover:border-[#00f7ff]/60 hover:bg-[#00f7ff]/5 hover:shadow-[0_0_15px_rgba(0,247,255,0.15)]'
                    }`}
                  >
                    {isSelected && !isCurrentPackage && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle className="w-5 h-5 text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]" />
                      </div>
                    )}
                    <div className="flex items-start justify-between mb-2 pr-6">
                      <h3 className="font-bold text-sm text-white leading-tight">{pkg.name}</h3>
                      {isCurrentPackage && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded-full border border-slate-600/50 absolute top-2 right-2">Aktif</span>
                      )}
                    </div>
                    <p className="text-xs text-[#e0d0ff]/60 mb-3">
                      ↓ {formatSpeed(pkg.downloadSpeed)} / ↑ {formatSpeed(pkg.uploadSpeed)}
                    </p>
                    <p className="text-lg font-bold text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.4)]">
                      {formatCurrency(pkg.price)}<span className="text-[10px] font-normal text-[#e0d0ff]/40">/{t('common.month')}</span>
                    </p>
                    {pkg.description && (
                      <p className="text-[10px] text-[#e0d0ff]/40 mt-1.5 leading-tight">{pkg.description}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </CyberCard>

          {/* Selected package summary */}
          {selectedPackage && (() => {
            const pkg = packages.find(p => p.id === selectedPackage);
            if (!pkg) return null;
            return (
              <div className="flex items-center gap-3 p-3 bg-[#00f7ff]/5 border border-[#00f7ff]/20 rounded-xl">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] text-[#e0d0ff]/50">Dipilih:</span>
                  <span className="text-xs font-bold text-white truncate">{pkg.name}</span>
                  <span className="text-[10px] text-[#e0d0ff]/50 hidden sm:inline">({formatSpeed(pkg.downloadSpeed)}/{formatSpeed(pkg.uploadSpeed)})</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#00f7ff] flex-shrink-0" />
                <span className="text-sm font-bold text-[#00f7ff] flex-shrink-0">{formatCurrency(pkg.price)}</span>
              </div>
            );
          })()}

          {/* Payment Gateway Selection */}
          {selectedPackage && paymentGateways.length > 0 && (
            <CyberCard className="bg-card/80 backdrop-blur-xl border-2 border-[#ff44cc]/30">
              <div className="px-5 pt-5 pb-3 border-b border-[#ff44cc]/10 flex items-center gap-3">
                <div className="p-2 bg-[#ff44cc]/20 rounded-lg border border-[#ff44cc]/30">
                  <CreditCard className="w-4 h-4 text-[#ff44cc]" />
                </div>
                <h2 className="text-sm font-bold text-[#ff44cc] uppercase tracking-wider">{t('customer.paymentMethod')}</h2>
              </div>

              <div className="p-4 space-y-2">
                {paymentGateways.map((gateway) => (
                  <button
                    key={gateway.id}
                    onClick={() => setSelectedGateway(gateway.provider)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                      selectedGateway === gateway.provider
                        ? 'border-[#00f7ff] bg-[#00f7ff]/10 shadow-[0_0_15px_rgba(0,247,255,0.2)]'
                        : 'border-[#bc13fe]/20 bg-slate-900/50 hover:border-[#00f7ff]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 border border-[#bc13fe]/20 rounded-lg">
                          <CreditCard className="w-4 h-4 text-[#00f7ff]" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{gateway.name}</p>
                          <p className="text-[10px] text-[#e0d0ff]/50 capitalize">{gateway.provider}</p>
                        </div>
                      </div>
                      {selectedGateway === gateway.provider && (
                        <CheckCircle className="w-5 h-5 text-[#00f7ff] drop-shadow-[0_0_8px_rgba(0,247,255,0.8)]" />
                      )}
                    </div>
                  </button>
                ))}

                {selectedGateway && (
                  <>
                    <CyberButton
                      onClick={handleUpgrade}
                      disabled={upgrading}
                      className="w-full mt-3"
                      variant="cyan"
                      size="lg"
                    >
                      {upgrading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" />{t('common.processing')}</>
                      ) : (
                        <><CreditCard className="w-5 h-5" />{t('customer.payNow')}</>
                      )}
                    </CyberButton>
                    <p className="text-[10px] text-[#e0d0ff]/40 text-center">{t('customer.paymentRedirectInfo')}</p>
                  </>
                )}
              </div>
            </CyberCard>
          )}

          {/* No-gateway fallback */}
          {selectedPackage && paymentGateways.length === 0 && (
            <CyberCard className="p-5 bg-card/80 backdrop-blur-xl border-2 border-[#00f7ff]/30">
              <div className="flex items-start gap-3 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-400">{t('customer.contactAdminPayment')}</p>
              </div>
              <CyberButton
                onClick={handleUpgradeManual}
                disabled={upgrading}
                className="w-full"
                variant="cyan"
                size="lg"
              >
                {upgrading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />{t('common.processing')}</>
                ) : (
                  <><Package className="w-5 h-5" />{t('customer.createInvoice')}</>
                )}
              </CyberButton>
            </CyberCard>
          )}
        </div>
      </div>
    </div>
  );
}
