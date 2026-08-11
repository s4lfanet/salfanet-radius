'use client';

import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Info } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface FooterSettings {
  footerAdmin: string;
  footerCustomer: string;
  footerTechnician: string;
  footerAgent: string;
}

const PORTALS = [
  {
    key: 'footerAdmin' as keyof FooterSettings,
    emoji: '🔒',
    label: 'Footer Admin',
    desc: 'Ditampilkan di halaman login Admin',
    placeholder: 'Powered by Salfa Net',
    path: '/admin/login',
  },
  {
    key: 'footerCustomer' as keyof FooterSettings,
    emoji: '👤',
    label: 'Footer Pelanggan',
    desc: 'Ditampilkan di halaman login Pelanggan',
    placeholder: 'Powered by Salfa Net',
    path: '/customer/login',
  },
  {
    key: 'footerTechnician' as keyof FooterSettings,
    emoji: '🔧',
    label: 'Footer Teknisi',
    desc: 'Ditampilkan di halaman login Teknisi',
    placeholder: 'Powered by Salfa Net',
    path: '/technician/login',
  },
  {
    key: 'footerAgent' as keyof FooterSettings,
    emoji: '🤝',
    label: 'Footer Agen',
    desc: 'Ditampilkan di halaman login Agen',
    placeholder: 'Powered by Salfa Net',
    path: '/agent',
  },
];

export default function FooterSettingsPage() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<FooterSettings>({
    footerAdmin: '',
    footerCustomer: '',
    footerTechnician: '',
    footerAgent: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/company')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setSettings({
            footerAdmin: data.footerAdmin || '',
            footerCustomer: data.footerCustomer || '',
            footerTechnician: data.footerTechnician || '',
            footerAgent: data.footerAgent || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Fetch current full company data first so we don't overwrite other fields
      const currentRes = await fetch('/api/company');
      const current = await currentRes.json();

      const response = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...current,
          footerAdmin: settings.footerAdmin,
          footerCustomer: settings.footerCustomer,
          footerTechnician: settings.footerTechnician,
          footerAgent: settings.footerAgent,
        }),
      });

      if (response.ok) {
        addToast({ type: 'success', title: 'Tersimpan', description: 'Pengaturan footer berhasil disimpan.', duration: 2000 });
      } else {
        throw new Error('Gagal menyimpan');
      }
    } catch {
      addToast({ type: 'error', title: 'Gagal', description: 'Terjadi kesalahan saat menyimpan.', duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/10 rounded-lg">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Pengaturan Footer Login</h1>
          <p className="text-xs text-muted-foreground">Teks footer yang ditampilkan di bawah halaman login setiap portal</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 p-3 mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-300/80">
          Teks footer ini akan menggantikan teks default. Kosongkan untuk tidak menampilkan footer di halaman login tersebut.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {PORTALS.map(portal => (
          <div key={portal.key} className="p-4 border border-border rounded-xl bg-card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span>{portal.emoji}</span>
                  {portal.label}
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">{portal.desc}</p>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded flex-shrink-0">
                {portal.path}
              </span>
            </div>
            <input
              type="text"
              value={settings[portal.key]}
              onChange={(e) => setSettings(prev => ({ ...prev, [portal.key]: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:ring-1 focus:ring-ring focus:border-primary outline-none transition-all"
              placeholder={portal.placeholder}
            />
          </div>
        ))}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</>
            ) : (
              <><Save className="w-4 h-4" />Simpan Pengaturan Footer</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
