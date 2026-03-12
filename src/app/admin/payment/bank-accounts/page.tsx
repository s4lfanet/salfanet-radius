'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Building2, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export default function BankAccountsPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchBankAccounts = async () => {
    try {
      const res = await fetch('/api/company');
      if (res.ok) {
        const data = await res.json();
        setBankAccounts(data.bankAccounts || []);
      }
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addAccount = () => {
    setBankAccounts(prev => [...prev, { bankName: '', accountNumber: '', accountName: '' }]);
  };

  const removeAccount = (index: number) => {
    setBankAccounts(prev => prev.filter((_, i) => i !== index));
  };

  const updateAccount = (index: number, field: keyof BankAccount, value: string) => {
    setBankAccounts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // First fetch current company data so we don't overwrite other fields
      const getRes = await fetch('/api/company');
      if (!getRes.ok) throw new Error('Failed to fetch company');
      const current = await getRes.json();

      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current, bankAccounts }),
      });
      if (!res.ok) throw new Error('Save failed');
      addToast({ type: 'success', title: t('common.success'), description: t('settings.bankAccountsSaved') || 'Rekening bank berhasil disimpan', duration: 2500 });
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: t('settings.saveSettingsFailed') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="space-y-3">
          {/* Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Building2 className="w-6 h-6 text-[#00f7ff]" />
              <span>{t('settings.bankAccountsTitle') || 'Rekening Bank'}</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {t('settings.bankAccountsHelp') || 'Rekening yang ditampilkan di halaman pembayaran manual customer'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-card rounded-lg border border-border p-3">
            <div className="space-y-4">
              {bankAccounts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Belum ada rekening bank. Klik tombol di bawah untuk menambahkan.
                </div>
              )}

              {bankAccounts.map((account, index) => (
                <div key={index} className="p-3 bg-muted rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-foreground">
                      {t('settings.accountNumber') || 'Rekening'} {index + 1}
                    </h4>
                    <button
                      type="button"
                      onClick={() => removeAccount(index)}
                      className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                      title="Hapus rekening"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">
                        {t('settings.bankName') || 'Nama Bank'}
                      </label>
                      <input
                        type="text"
                        value={account.bankName}
                        onChange={(e) => updateAccount(index, 'bankName', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-border rounded bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                        placeholder={t('settings.bankNamePlaceholder') || 'Contoh: BCA, Mandiri'}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">
                        {t('settings.accountNo') || 'Nomor Rekening'}
                      </label>
                      <input
                        type="text"
                        value={account.accountNumber}
                        onChange={(e) => updateAccount(index, 'accountNumber', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-border rounded bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                        placeholder="1234567890"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">
                        {t('settings.ownerName') || 'Nama Pemilik'}
                      </label>
                      <input
                        type="text"
                        value={account.accountName}
                        onChange={(e) => updateAccount(index, 'accountName', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-border rounded bg-card focus:ring-1 focus:ring-ring focus:border-primary"
                        placeholder={t('settings.ownerNamePlaceholder') || 'Nama sesuai rekening'}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Add account button */}
              <button
                type="button"
                onClick={addAccount}
                disabled={bankAccounts.length >= 10}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-dashed border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Rekening
              </button>

              {/* Save button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('settings.saving') || 'Menyimpan...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3" />
                      {t('settings.saveSettings') || 'Simpan'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
