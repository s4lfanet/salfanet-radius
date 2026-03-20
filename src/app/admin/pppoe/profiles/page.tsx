'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, FileText, RefreshCw, Download, Upload, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  SimpleModal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalInput,
  ModalSelect,
  ModalLabel,
  ModalButton,
} from '@/components/cyberpunk';

interface PPPoEProfile {
  id: string; name: string; description: string | null; price: number;
  hpp?: number | null; ppnActive?: boolean; ppnRate?: number | null;
  downloadSpeed: number; uploadSpeed: number; groupName: string;
  rateLimit?: string;
  validityValue: number; validityUnit: 'DAYS' | 'MONTHS';
  sharedUser: boolean; isActive: boolean; syncedToRadius: boolean; createdAt: string;
}

type UnitType = 'Mbps' | 'Kbps';

const defaultForm = {
  name: '', description: '', price: '', hpp: '', ppnActive: false, ppnRate: '11',
  downloadSpeed: '10', uploadSpeed: '10', speedUnit: 'Mbps' as UnitType,
  burstDownload: '', burstUpload: '',
  burstThresholdDownload: '', burstThresholdUpload: '', burstTime: '8',
  groupName: '', validityValue: '1', validityUnit: 'MONTHS' as 'DAYS' | 'MONTHS',
  sharedUser: true, isActive: true,
};

export default function PPPoEProfilesPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<PPPoEProfile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PPPoEProfile | null>(null);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [showBurst, setShowBurst] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  // Import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; error: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProfiles(); }, []);

  const loadProfiles = async () => {
    try { const res = await fetch('/api/pppoe/profiles'); const data = await res.json(); setProfiles(data.profiles || []); }
    catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const toKbpsDisplay = (speed: string, unit: UnitType) => {
    const n = parseFloat(speed);
    if (!speed || isNaN(n) || n === 0) return null;
    if (unit === 'Mbps') return `= ${Math.round(n * 1024).toLocaleString('id-ID')} Kbps`;
    return `= ${(n / 1024).toFixed(2)} Mbps`;
  };

  const buildRateLimit = (data: typeof formData, burst: boolean) => {
    const dl = data.downloadSpeed || '0';
    const ul = data.uploadSpeed || '0';
    const unit = data.speedUnit === 'Mbps' ? 'M' : 'k';
    if (burst && (data.burstDownload || data.burstUpload)) {
      const bDl = data.burstDownload || dl;
      const bUl = data.burstUpload || ul;
      const tDl = data.burstThresholdDownload || dl;
      const tUl = data.burstThresholdUpload || ul;
      const bt = data.burstTime || '8';
      return `${dl}${unit}/${ul}${unit} ${bDl}${unit}/${bUl}${unit} ${tDl}${unit}/${tUl}${unit} ${bt}`;
    }
    return `${dl}${unit}/${ul}${unit}`;
  };

  const speedToMbps = (speed: string, unit: UnitType) => {
    const n = parseFloat(speed);
    if (!speed || isNaN(n)) return 0;
    return unit === 'Mbps' ? Math.round(n) : Math.round(n / 1024);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingProfile ? 'PUT' : 'POST';
      const generatedGroupName = formData.groupName || formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
      const rateLimit = buildRateLimit(formData, showBurst);
      const dlMbps = speedToMbps(formData.downloadSpeed, formData.speedUnit);
      const ulMbps = speedToMbps(formData.uploadSpeed, formData.speedUnit);
      const payload: any = {
        ...(editingProfile && { id: editingProfile.id }),
        name: formData.name,
        description: formData.description || undefined,
        groupName: generatedGroupName,
        price: parseInt(formData.price),
        hpp: formData.hpp ? parseInt(formData.hpp) : null,
        ppnActive: formData.ppnActive,
        downloadSpeed: dlMbps,
        uploadSpeed: ulMbps,
        rateLimit,
        validityValue: parseInt(formData.validityValue),
        validityUnit: formData.validityUnit,
        sharedUser: formData.sharedUser,
        isActive: formData.isActive,
        ppnRate: formData.ppnActive ? (parseInt(formData.ppnRate) || 11) : null,
      };
      const res = await fetch('/api/pppoe/profiles', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (res.ok) {
        setIsDialogOpen(false); setEditingProfile(null); resetForm(); loadProfiles(); setFieldErrors({});
        await showSuccess(editingProfile ? t('pppoe.profileUpdated') : t('pppoe.profileCreated'));
      } else {
        const missing = Array.isArray(result.details) ? result.details : [];
        const errMap: Record<string, boolean> = {};
        missing.forEach((key: string) => { errMap[key] = true; });
        setFieldErrors(errMap);
        await showError(`Error: ${result.error || t('common.failed')}${missing.length ? `\nMissing: ${missing.join(', ')}` : ''}`);
      }
    } catch (e) { console.error('Submit error:', e); await showError(t('common.failed')); }
  };

  const handleEdit = (profile: PPPoEProfile) => {
    setEditingProfile(profile);
    let burstDl = '', burstUl = '', thDl = '', thUl = '', burstT = '8';
    let hasBurst = false;
    if (profile.rateLimit) {
      const parts = profile.rateLimit.trim().split(/\s+/);
      if (parts.length >= 3) {
        hasBurst = true;
        const bPart = parts[1]?.split('/') || [];
        const tPart = parts[2]?.split('/') || [];
        burstDl = bPart[0]?.replace(/[^0-9.]/g, '') || '';
        burstUl = bPart[1]?.replace(/[^0-9.]/g, '') || '';
        thDl = tPart[0]?.replace(/[^0-9.]/g, '') || '';
        thUl = tPart[1]?.replace(/[^0-9.]/g, '') || '';
        burstT = parts[3]?.replace(/[^0-9]/g, '') || '8';
      }
    }
    setShowBurst(hasBurst);
    setFormData({
      name: profile.name, description: profile.description || '',
      price: profile.price.toString(), hpp: profile.hpp?.toString() || '', ppnActive: profile.ppnActive || false,
      downloadSpeed: profile.downloadSpeed.toString(), uploadSpeed: profile.uploadSpeed.toString(), speedUnit: 'Mbps',
      burstDownload: burstDl, burstUpload: burstUl,
      burstThresholdDownload: thDl, burstThresholdUpload: thUl, burstTime: burstT,
      groupName: profile.groupName, validityValue: profile.validityValue.toString(), validityUnit: profile.validityUnit,
      sharedUser: profile.sharedUser, isActive: profile.isActive,
      ppnRate: profile.ppnRate?.toString() || '11',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteProfileId) return;
    const confirmed = await showConfirm(t('pppoe.deleteProfileConfirmMsg'));
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/pppoe/profiles?id=${deleteProfileId}`, { method: 'DELETE' });
      const result = await res.json();
      if (res.ok) { await showSuccess(t('pppoe.profileDeleted')); loadProfiles(); }
      else { await showError(result.error || t('common.failed')); }
    } catch (e) { console.error('Delete error:', e); await showError(t('common.failed')); }
    finally { setDeleteProfileId(null); }
  };

  const resetForm = () => { setFormData({ ...defaultForm, groupName: '' }); setShowBurst(false); setFieldErrors({}); };

  // Export CSV
  const handleExport = () => {
    const headers = ['Nama Paket', 'Group RADIUS', 'Download (Mbps)', 'Upload (Mbps)', 'Harga Jual', 'Harga Modal', 'PPN', 'Masa Aktif', 'Satuan', 'Deskripsi'];
    const rows = profiles.map(p => [p.name, p.groupName, p.downloadSpeed, p.uploadSpeed, p.price, p.hpp ?? '', p.ppnActive ? '1' : '0', p.validityValue, p.validityUnit, p.description ?? '']);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `paket-pppoe-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Download template
  const handleDownloadTemplate = () => {
    const headers = ['Nama Paket', 'Group RADIUS', 'Download (Mbps)', 'Upload (Mbps)', 'Harga Jual', 'Harga Modal', 'PPN', 'Masa Aktif', 'Satuan', 'Deskripsi'];
    const example = ['Paket 10 Mbps', 'paket10mbps', '10', '10', '150000', '100000', '0', '1', 'MONTHS', 'Paket internet 10 Mbps'];
    const csv = [headers, example].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'template-paket-pppoe.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Import CSV
  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true); setImportResults(null);
    let success = 0, error = 0;
    const errors: string[] = [];
    try {
      const text = await importFile.text();
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
      if (lines.length < 2) { setImporting(false); await showError('File CSV kosong atau tidak valid.'); return; }

      const parseCSVLine = (line: string) => {
        const result: string[] = []; let current = ''; let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } }
          else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += line[i]; }
        }
        result.push(current.trim()); return result;
      };

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const getVal = (row: string[], key: string) => { const idx = headers.findIndex(h => h.includes(key)); return idx >= 0 ? (row[idx] || '') : ''; };

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const name = getVal(values, 'namapaket') || getVal(values, 'name') || getVal(values, 'nama');
        const groupName = getVal(values, 'groupradius') || getVal(values, 'groupname') || getVal(values, 'group');
        const dl = parseInt(getVal(values, 'download') || '0');
        const ul = parseInt(getVal(values, 'upload') || '0');
        const price = parseInt(getVal(values, 'hargajual') || getVal(values, 'price') || getVal(values, 'harga') || '0');
        const hpp = getVal(values, 'hargamodal') || getVal(values, 'hpp') || '';
        const ppnActive = getVal(values, 'ppn') === '1';
        const validityValue = parseInt(getVal(values, 'masaaktif') || getVal(values, 'validity') || '1');
        const validityUnit = (getVal(values, 'satuan') || getVal(values, 'unit') || 'MONTHS').toUpperCase();
        const description = getVal(values, 'deskripsi') || getVal(values, 'description') || '';
        if (!name) { error++; errors.push(`Baris ${i + 1}: Nama Paket kosong`); continue; }
        try {
          const res = await fetch('/api/pppoe/profiles', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, groupName: groupName || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''), downloadSpeed: dl, uploadSpeed: ul, rateLimit: `${dl}M/${ul}M`, price, hpp: hpp ? parseInt(hpp) : null, ppnActive, validityValue, validityUnit, description }),
          });
          if (res.ok) { success++; } else { error++; const d = await res.json(); errors.push(`Baris ${i + 1} (${name}): ${d.error}`); }
        } catch { error++; errors.push(`Baris ${i + 1} (${name}): Gagal memproses`); }
      }
    } catch { error++; errors.push('Gagal membaca file CSV'); }
    setImporting(false);
    setImportResults({ success, error, errors });
    if (success > 0) loadProfiles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div><div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div></div>
        <RefreshCw className="w-12 h-12 animate-spin text-[#00f7ff] drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[#00f7ff] via-white to-[#ff44cc] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">{t('pppoe.profilesTitle')}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('pppoe.profilesSubtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground transition-colors">
              <FileText className="h-3 w-3" />Template
            </button>
            <button onClick={() => { setIsImportOpen(true); setImportFile(null); setImportResults(null); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground transition-colors">
              <Upload className="h-3 w-3" />Import
            </button>
            <button onClick={handleExport} disabled={profiles.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40">
              <Download className="h-3 w-3" />Export
            </button>
            <button onClick={() => { resetForm(); setEditingProfile(null); setIsDialogOpen(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-white rounded transition-colors">
              <Plus className="h-3 w-3" />{t('pppoe.addProfile')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('common.total')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{profiles.length}</p></div>
              <FileText className="h-7 w-7 text-[#00f7ff] drop-shadow-[0_0_15px_rgba(0,247,255,0.6)]" />
            </div>
          </div>
          <div className="bg-card/80 backdrop-blur-xl rounded-xl border-2 border-[#bc13fe]/30 p-2.5 sm:p-4 shadow-[0_0_20px_rgba(188,19,254,0.2)] hover:border-[#bc13fe]/50 transition-all">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-[#00f7ff] uppercase tracking-wide">{t('pppoe.active')}</p><p className="text-lg sm:text-2xl font-bold text-foreground mt-1">{profiles.filter(p => p.isActive).length}</p></div>
              <CheckCircle2 className="h-7 w-7 text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]" />
            </div>
          </div>
          <div className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] text-muted-foreground uppercase">{t('pppoe.synced')}</p><p className="text-base font-bold text-primary">{profiles.filter(p => p.syncedToRadius).length}</p></div>
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {profiles.length === 0 ? (
            <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-6 text-center text-muted-foreground text-xs">{t('pppoe.noProfiles')}</div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm text-foreground">{profile.name}</p>
                    {profile.description && <p className="text-xs text-muted-foreground mt-0.5">{profile.description}</p>}
                  </div>
                  {profile.syncedToRadius ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/10 text-success"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{t('pppoe.synced')}</span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-warning/10 text-warning"><XCircle className="h-2.5 w-2.5 mr-0.5" />{t('pppoe.pending')}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><span className="text-muted-foreground">{t('hotspot.price')}:</span><p className="font-medium">Rp {profile.price.toLocaleString('id-ID')}</p></div>
                  <div><span className="text-muted-foreground">{t('hotspot.speed')}:</span><p className="font-mono font-medium">{profile.downloadSpeed}M/{profile.uploadSpeed}M</p></div>
                  <div><span className="text-muted-foreground">{t('pppoe.validity')}:</span><p className="font-medium">{profile.validityValue} {profile.validityUnit === 'MONTHS' ? 'Mo' : 'D'}</p></div>
                  <div><span className="text-muted-foreground">{t('pppoe.groupLabel')}:</span><p className="font-mono font-medium">{profile.groupName}</p></div>
                </div>
                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <button onClick={() => handleEdit(profile)} className="p-2 text-muted-foreground hover:bg-muted rounded"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDeleteProfileId(profile.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Table */}
        <div className="hidden md:block bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium">{t('pppoe.profilesList')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.name')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden md:table-cell">{t('pppoe.groupLabel')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('hotspot.price')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden sm:table-cell">{t('hotspot.speed')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase hidden lg:table-cell">{t('pppoe.validity')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{t('common.status')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profiles.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-xs">{t('pppoe.noProfiles')}</td></tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-muted/50">
                      <td className="px-3 py-2"><p className="font-medium text-xs">{profile.name}</p>{profile.description && <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{profile.description}</p>}</td>
                      <td className="px-3 py-2 font-mono text-xs hidden md:table-cell">{profile.groupName}</td>
                      <td className="px-3 py-2 text-xs">Rp {profile.price.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{profile.downloadSpeed}M/{profile.uploadSpeed}M</td>
                      <td className="px-3 py-2 text-xs hidden lg:table-cell">{profile.validityValue} {profile.validityUnit === 'MONTHS' ? 'Mo' : 'D'}</td>
                      <td className="px-3 py-2">
                        {profile.syncedToRadius ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/10 text-success"><CheckCircle2 className="h-2 w-2 mr-0.5" />{t('pppoe.synced')}</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-warning/10 text-warning"><XCircle className="h-2 w-2 mr-0.5" />{t('pppoe.pending')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-0.5">
                          <button onClick={() => handleEdit(profile)} className="p-1 text-muted-foreground hover:bg-muted rounded"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => setDeleteProfileId(profile.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <SimpleModal isOpen={isDialogOpen} onClose={() => { setIsDialogOpen(false); setEditingProfile(null); resetForm(); }} size="lg">
          <ModalHeader>
            <ModalTitle>{editingProfile ? t('pppoe.editProfile') : t('pppoe.addProfile')}</ModalTitle>
            <ModalDescription>{editingProfile ? t('pppoe.updateConfig') : t('pppoe.createProfile')}</ModalDescription>
          </ModalHeader>
          <form onSubmit={handleSubmit}>
            <ModalBody className="space-y-4">

              {/* Nama Paket */}
              <div>
                <ModalLabel required>Nama Paket</ModalLabel>
                <ModalInput
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Paket 10 Mbps"
                  required
                  className={fieldErrors['name'] ? 'border-[#ff4466]' : ''}
                />
              </div>

              {/* Group RADIUS */}
              <div>
                <ModalLabel required>{t('pppoe.radiusGroup')} <span className="text-[10px] font-normal text-muted-foreground">(unik per tenant, tanpa spasi)</span></ModalLabel>
                <ModalInput
                  type="text"
                  value={formData.groupName}
                  onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                  placeholder="Auto-generate dari nama paket"
                  className={`font-mono ${fieldErrors['groupName'] ? 'border-[#ff4466]' : ''}`}
                />
                <p className="text-[9px] text-muted-foreground mt-1">{t('pppoe.matchMikrotik')}</p>
              </div>

              {/* Kecepatan */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <ModalLabel className="mb-0" required>Kecepatan</ModalLabel>
                  <div className="flex rounded overflow-hidden border border-border text-[10px]">
                    {(['Mbps', 'Kbps'] as UnitType[]).map(u => (
                      <button key={u} type="button" onClick={() => setFormData({ ...formData, speedUnit: u })}
                        className={`px-3 py-1 transition-colors ${formData.speedUnit === u ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel required>Download ({formData.speedUnit})</ModalLabel>
                    <ModalInput type="number" min="1" value={formData.downloadSpeed} onChange={(e) => setFormData({ ...formData, downloadSpeed: e.target.value })} required />
                    {toKbpsDisplay(formData.downloadSpeed, formData.speedUnit) && (
                      <p className="text-[10px] text-[#00f7ff] mt-1">{toKbpsDisplay(formData.downloadSpeed, formData.speedUnit)}</p>
                    )}
                  </div>
                  <div>
                    <ModalLabel required>Upload ({formData.speedUnit})</ModalLabel>
                    <ModalInput type="number" min="1" value={formData.uploadSpeed} onChange={(e) => setFormData({ ...formData, uploadSpeed: e.target.value })} required />
                    {toKbpsDisplay(formData.uploadSpeed, formData.speedUnit) && (
                      <p className="text-[10px] text-[#00f7ff] mt-1">{toKbpsDisplay(formData.uploadSpeed, formData.speedUnit)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Burst */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button type="button" onClick={() => setShowBurst(!showBurst)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-xs font-medium hover:bg-muted/50 transition-colors text-left">
                  {showBurst ? <ChevronDown className="h-3.5 w-3.5 text-[#00f7ff]" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>Pengaturan Burst (MikroTik)</span>
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">opsional — kecepatan sementara saat awal koneksi</span>
                </button>
                {showBurst && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border bg-muted/20">
                    <p className="text-[10px] text-muted-foreground pt-3">
                      Burst memberi kecepatan lebih tinggi sementara. Aktif saat trafik rata-rata di bawah <strong>threshold</strong> selama <strong>burst time</strong> detik.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <ModalLabel>Burst Download ({formData.speedUnit})</ModalLabel>
                        <ModalInput type="number" min="0" value={formData.burstDownload} onChange={(e) => setFormData({ ...formData, burstDownload: e.target.value })} placeholder={formData.downloadSpeed ? String(parseInt(formData.downloadSpeed) * 2) : '20'} />
                      </div>
                      <div>
                        <ModalLabel>Burst Upload ({formData.speedUnit})</ModalLabel>
                        <ModalInput type="number" min="0" value={formData.burstUpload} onChange={(e) => setFormData({ ...formData, burstUpload: e.target.value })} placeholder={formData.uploadSpeed ? String(parseInt(formData.uploadSpeed) * 2) : '20'} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <ModalLabel>Threshold Download ({formData.speedUnit})</ModalLabel>
                        <ModalInput type="number" min="0" value={formData.burstThresholdDownload} onChange={(e) => setFormData({ ...formData, burstThresholdDownload: e.target.value })} placeholder={formData.downloadSpeed ? String(Math.round(parseInt(formData.downloadSpeed) * 0.8)) : '8'} />
                        <p className="text-[9px] text-muted-foreground mt-0.5">Kosong = pakai kecepatan normal</p>
                      </div>
                      <div>
                        <ModalLabel>Threshold Upload ({formData.speedUnit})</ModalLabel>
                        <ModalInput type="number" min="0" value={formData.burstThresholdUpload} onChange={(e) => setFormData({ ...formData, burstThresholdUpload: e.target.value })} placeholder={formData.uploadSpeed ? String(Math.round(parseInt(formData.uploadSpeed) * 0.8)) : '8'} />
                        <p className="text-[9px] text-muted-foreground mt-0.5">Kosong = pakai kecepatan normal</p>
                      </div>
                    </div>
                    <div className="w-1/2 pr-1.5">
                      <ModalLabel>Burst Time (detik)</ModalLabel>
                      <ModalInput type="number" min="1" value={formData.burstTime} onChange={(e) => setFormData({ ...formData, burstTime: e.target.value })} />
                      <p className="text-[9px] text-muted-foreground mt-0.5">Durasi pengukuran rata-rata (umumnya 8 detik)</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Harga Modal / HPP */}
              <div>
                <ModalLabel>Harga Modal / HPP (IDR)</ModalLabel>
                <ModalInput type="number" min="0" value={formData.hpp} onChange={(e) => setFormData({ ...formData, hpp: e.target.value })} placeholder="100000" />
                <p className="text-[9px] text-muted-foreground mt-1">Biaya pokok / harga beli dari provider upstream</p>
              </div>

              {/* Harga Jual */}
              <div>
                <ModalLabel required>Harga Jual (IDR)</ModalLabel>
                <ModalInput type="number" min="0" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="150000" required className={fieldErrors['price'] ? 'border-[#ff4466]' : ''} />
              </div>

              {/* PPN */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <input type="checkbox" id="ppnActive" checked={formData.ppnActive} onChange={(e) => setFormData({ ...formData, ppnActive: e.target.checked })} className="rounded border-border bg-muted text-primary focus:ring-primary" />
                  <label htmlFor="ppnActive" className="text-xs text-foreground cursor-pointer">PPN aktif (Pajak Pertambahan Nilai)</label>
                </div>
                {formData.ppnActive && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border bg-muted/20">
                    <div className="flex items-center gap-2 pt-2">
                      <ModalInput
                        type="number" min="1" max="100"
                        value={formData.ppnRate}
                        onChange={(e) => setFormData({ ...formData, ppnRate: e.target.value })}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">% (PPN Indonesia = 11%)</span>
                    </div>
                    {formData.price && (
                      <div className="text-[10px] text-[#00f7ff]">
                        Total termasuk PPN: Rp {Math.round(parseInt(formData.price) * (1 + (parseInt(formData.ppnRate) || 11) / 100)).toLocaleString('id-ID')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Masa Aktif */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel required>Masa Aktif</ModalLabel>
                  <ModalInput type="number" min="1" value={formData.validityValue} onChange={(e) => setFormData({ ...formData, validityValue: e.target.value })} required className={fieldErrors['validityValue'] ? 'border-[#ff4466]' : ''} />
                </div>
                <div>
                  <ModalLabel required>Satuan</ModalLabel>
                  <ModalSelect value={formData.validityUnit} onChange={(e) => setFormData({ ...formData, validityUnit: e.target.value as 'DAYS' | 'MONTHS' })}>
                    <option value="DAYS" className="bg-[#0a0520]">Hari</option>
                    <option value="MONTHS" className="bg-[#0a0520]">Bulan</option>
                  </ModalSelect>
                </div>
              </div>

              {/* Deskripsi */}
              <div>
                <ModalLabel>{t('common.description')}</ModalLabel>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
              </div>

              {/* Aktif & Shared User */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-border bg-muted text-primary focus:ring-primary" />
                  <span>Aktif</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={formData.sharedUser} onChange={(e) => setFormData({ ...formData, sharedUser: e.target.checked })} className="rounded border-border bg-muted text-primary focus:ring-primary" />
                  <span>Shared User <span className="text-muted-foreground">(boleh multi-device per akun; jika dimatikan MikroTik enforce 1 device)</span></span>
                </label>
              </div>

            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={() => { setIsDialogOpen(false); setEditingProfile(null); resetForm(); }}>{t('common.cancel')}</ModalButton>
              <ModalButton type="submit" variant="primary">{editingProfile ? 'Simpan Perubahan' : 'Simpan Paket'}</ModalButton>
            </ModalFooter>
          </form>
        </SimpleModal>

        {/* Import Dialog */}
        <SimpleModal isOpen={isImportOpen} onClose={() => { setIsImportOpen(false); setImportResults(null); }} size="md">
          <ModalHeader>
            <ModalTitle>Import Paket PPPoE</ModalTitle>
            <ModalDescription>Upload file CSV untuk menambahkan paket secara massal</ModalDescription>
          </ModalHeader>
          <ModalBody className="space-y-4">
            {!importResults ? (
              <>
                <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Format CSV yang diperlukan:</p>
                  <p>Kolom: Nama Paket, Group RADIUS, Download (Mbps), Upload (Mbps), Harga Jual, Harga Modal, PPN, Masa Aktif, Satuan, Deskripsi</p>
                  <p>Gunakan tombol <strong>Template</strong> untuk download contoh file.</p>
                </div>
                <div>
                  <ModalLabel required>File CSV</ModalLabel>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:text-xs file:bg-muted file:text-foreground file:cursor-pointer hover:file:bg-muted/80"
                  />
                  {importFile && <p className="text-[10px] text-muted-foreground mt-1">File: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-center">
                    <p className="text-xl font-bold text-success">{importResults.success}</p>
                    <p className="text-[10px] text-muted-foreground">Berhasil diimpor</p>
                  </div>
                  <div className={`p-3 rounded-lg text-center border ${importResults.error > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-muted border-border'}`}>
                    <p className={`text-xl font-bold ${importResults.error > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{importResults.error}</p>
                    <p className="text-[10px] text-muted-foreground">Gagal</p>
                  </div>
                </div>
                {importResults.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importResults.errors.map((err, i) => (
                      <p key={i} className="text-[10px] text-destructive bg-destructive/10 px-2 py-1 rounded">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={() => { setIsImportOpen(false); setImportResults(null); }}>{importResults ? 'Tutup' : t('common.cancel')}</ModalButton>
            {!importResults && (
              <ModalButton variant="primary" onClick={handleImport} disabled={!importFile || importing}>
                {importing ? <><RefreshCw className="h-3 w-3 animate-spin mr-1 inline" />Mengimpor...</> : 'Mulai Import'}
              </ModalButton>
            )}
          </ModalFooter>
        </SimpleModal>

        {/* Delete Dialog */}
        <SimpleModal isOpen={!!deleteProfileId} onClose={() => setDeleteProfileId(null)} size="sm">
          <ModalBody className="text-center py-6">
            <div className="w-14 h-14 bg-[#ff4466]/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-[#ff4466]/50">
              <Trash2 className="w-7 h-7 text-[#ff6b8a]" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-2">{t('pppoe.deleteProfile')}</h2>
            <p className="text-xs text-muted-foreground">{t('pppoe.deleteProfileConfirm')}</p>
          </ModalBody>
          <ModalFooter className="justify-center">
            <ModalButton variant="secondary" onClick={() => setDeleteProfileId(null)}>{t('common.cancel')}</ModalButton>
            <ModalButton variant="danger" onClick={handleDelete}>{t('common.delete')}</ModalButton>
          </ModalFooter>
        </SimpleModal>

      </div>
    </div>
  );
}
