'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { CyberCard, CyberButton } from '@/components/cyberpunk';
import {
  Gift, Save, Loader2, ToggleLeft, ToggleRight,
  Wallet, AlertCircle
} from 'lucide-react';

interface ReferralConfig {
  enabled: boolean;
  rewardAmount: number;
  rewardType: string;
  rewardBoth: boolean;
  referredAmount: number;
}

export default function ReferralSettingsPage() {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReferralConfig>({
    enabled: false,
    rewardAmount: 10000,
    rewardType: 'FIRST_PAYMENT',
    rewardBoth: false,
    referredAmount: 0,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/referrals/config');
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Fetch config error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/referrals/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: 'Berhasil!', description: t('referrals.saveSuccess') });
        setConfig(data.config);
      } else {
        addToast({ type: 'error', title: 'Error', description: data.error || t('referrals.saveError') });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', description: t('referrals.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gift className="w-6 h-6 text-cyan-500" />
          {t('referrals.settingsTitle')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('referrals.settingsSubtitle')}
        </p>
      </div>

      {/* Enable/Disable */}
      <CyberCard className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.enabled ? (
              <ToggleRight className="w-6 h-6 text-emerald-500" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-muted-foreground" />
            )}
            <div>
              <h3 className="font-semibold text-foreground">{t('referrals.enableSystem')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('referrals.enableDesc')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
              config.enabled ? 'translate-x-[24px]' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </CyberCard>

      {/* Reward Configuration */}
      <CyberCard className="p-5">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-cyan-500" />
          {t('referrals.rewardConfig')}
        </h3>

        <div className="space-y-4">
          {/* Reward Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('referrals.whenReward')}
            </label>
            <select
              value={config.rewardType}
              onChange={(e) => setConfig({ ...config, rewardType: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="FIRST_PAYMENT">{t('referrals.afterFirstPayment')}</option>
              <option value="REGISTRATION">{t('referrals.atRegistration')}</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {config.rewardType === 'FIRST_PAYMENT'
                ? t('referrals.afterFirstPaymentDesc')
                : t('referrals.atRegistrationDesc')}
            </p>
          </div>

          {/* Referrer Reward Amount */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('referrals.referrerBonus')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
              <input
                type="number"
                value={config.rewardAmount}
                onChange={(e) => setConfig({ ...config, rewardAmount: parseInt(e.target.value) || 0 })}
                min={0}
                step={1000}
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('referrals.referrerBonusDesc')}
            </p>
          </div>
        </div>
      </CyberCard>

      {/* Summary */}
      <CyberCard className="p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">{t('referrals.summary')}</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Status: <span className={config.enabled ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'}>
                {config.enabled ? t('referrals.statusActive') : t('referrals.statusInactive')}
              </span></li>
              <li>{t('referrals.referrerGets')} <span className="font-medium text-foreground">{formatCurrency(config.rewardAmount)}</span> {t('referrals.perReferral')}</li>
              <li>{t('referrals.rewardGiven')}: <span className="font-medium text-foreground">
                {config.rewardType === 'FIRST_PAYMENT' ? t('referrals.afterFirstPaymentShort') : t('referrals.atRegistrationShort')}
              </span></li>
            </ul>
          </div>
        </div>
      </CyberCard>

      {/* Save Button */}
      <div className="flex justify-end">
        <CyberButton onClick={saveConfig} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saving ? t('referrals.saving') : t('referrals.saveSettings')}
        </CyberButton>
      </div>
    </div>
  );
}
