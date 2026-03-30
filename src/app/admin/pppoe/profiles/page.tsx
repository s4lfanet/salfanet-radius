'use client';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, FileText, RefreshCw, Download, Upload, ChevronRight, ChevronDown, Eye, Radio, Wifi, WifiOff, RotateCcw } from 'lucide-react';
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
  mikrotikProfileName?: string | null; ipPoolName?: string | null;
  localAddress?: string | null; lastRouterId?: string | null;
  rateLimit?: string;
  validityValue: number; validityUnit: 'DAYS' | 'MONTHS';
  sharedUser: boolean; isActive: boolean; syncedToRadius: boolean; createdAt: string;
  userCount?: number;
}

type UnitType = 'Mbps' | 'Kbps';

interface RouterOption {
  id: string;
  name: string;
  nasname: string;
  ipAddress: string;
  shortname: string;
  description: string | null;
}

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

  // Detail view state
  const [detailProfile, setDetailProfile] = useState<PPPoEProfile | null>(null);

  // Sync state
  const [syncingRadiusId, setSyncingRadiusId] = useState<string | null>(null);
  const [syncingMikrotikId, setSyncingMikrotikId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Router picker state
  const [syncMikrotikTarget, setSyncMikrotikTarget] = useState<PPPoEProfile | null>(null);
  const [routers, setRouters] = useState<RouterOption[]>([]);
  const [selectedRouterIds, setSelectedRouterIds] = useState<string[]>([]);
  const [syncIpPoolName, setSyncIpPoolName] = useState('');
  const [syncLocalAddress, setSyncLocalAddress] = useState('');
  const [syncPoolRanges, setSyncPoolRanges] = useState('');
  const [syncLockedRouter, setSyncLockedRouter] = useState(false);
  const [isSyncAllMode, setIsSyncAllMode] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Import state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; error: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProfiles(); loadRouterList(); }, []);

  const loadProfiles = async () => {
    try { const res = await fetch('/api/pppoe/profiles'); const data = await res.json(); setProfiles(data.profiles || []); }
    catch (e) { console.error('Load error:', e); }
    finally { setLoading(false); }
  };

  const loadRouterList = async () => {
    try {
      const res = await fetch('/api/pppoe/profiles/sync-mikrotik');
      const data = await res.json();
      setRouters(data.routers || []);
    } catch { setRouters([]); }
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

  const getAutoGroupName = (name: string) => name.trim();
  const isAutoFilledField = (value: string, previousName: string, resolver: (name: string) => string) => {
    const previousAutoValue = resolver(previousName);
    return value.trim() === '' || value === previousAutoValue;
  };

  const closeSyncMikrotikModal = () => {
    setSyncMikrotikTarget(null);
    setIsSyncAllMode(false);
    setSelectedRouterIds([]);
    setSyncIpPoolName('');
    setSyncLocalAddress('');
    setSyncPoolRanges('');
    setSyncLockedRouter(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const method = editingProfile ? 'PUT' : 'POST';
      const generatedGroupName = formData.groupName.trim() || getAutoGroupName(formData.name);
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
    finally { setIsSaving(false); }
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

  const handleSyncRadius = async (profile: PPPoEProfile) => {
    setSyncingRadiusId(profile.id);
    try {
      const res = await fetch('/api/pppoe/profiles/sync-radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id }),
      });
      const result = await res.json();
      if (res.ok) {
        await showSuccess(result.message || 'Berhasil sync ke FreeRADIUS');
        loadProfiles();
      } else {
        await showError(result.error || 'Gagal sync ke FreeRADIUS');
      }
    } catch (e) { await showError('Gagal sync ke FreeRADIUS'); }
    finally { setSyncingRadiusId(null); }
  };

  const handleSyncMikrotik = (profile: PPPoEProfile) => {
    setIsSyncAllMode(false);
    setSyncMikrotikTarget(profile);
    // Pre-select all active routers by default
    setSelectedRouterIds(routers.map(r => r.id));
    setSyncIpPoolName(profile.ipPoolName || '');
    setSyncLocalAddress(profile.localAddress || '');
    setSyncPoolRanges('');
    setSyncLockedRouter(false);
  };

  const handleSyncAllMikrotik = () => {
    setIsSyncAllMode(true);
    setSyncMikrotikTarget(null);
    setSelectedRouterIds(routers.map(r => r.id));
    setSyncIpPoolName('');
    setSyncLocalAddress('');
    setSyncPoolRanges('');
    setSyncLockedRouter(false);
  };

  const handleConfirmSyncMikrotik = async () => {
    if (selectedRouterIds.length === 0) return;

    // ── Sync ALL profiles mode ─────────────────────────────────────────────
    if (isSyncAllMode) {
      setSyncingAll(true);
      let successCount = 0;
      let failCount = 0;
      try {
        for (const profile of profiles) {
          try {
            const res = await fetch('/api/pppoe/profiles/sync-mikrotik', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // Jika user isi field pool di modal → override per-profile; jika kosong → API pakai setting masing-masing profile
              body: JSON.stringify({
                id: profile.id,
                routerIds: selectedRouterIds,
                ...(syncIpPoolName.trim() ? { ipPoolName: syncIpPoolName.trim() } : {}),
                ...(syncLocalAddress.trim() ? { localAddress: syncLocalAddress.trim() } : {}),
                ...(syncPoolRanges.trim() ? { poolRanges: syncPoolRanges.trim() } : {}),
              }),
            });
            const result = await res.json();
            if (result.success) successCount++;
            else failCount++;
          } catch { failCount++; }
        }
        loadProfiles();
        closeSyncMikrotikModal();
        if (failCount === 0) {
          await showSuccess(`Berhasil sync ${successCount} paket ke ${selectedRouterIds.length} router`);
        } else {
          await showError(`${successCount} paket berhasil, ${failCount} paket gagal disync`);
        }
      } catch { await showError('Gagal sync ke MikroTik'); }
      finally { setSyncingAll(false); }
      return;
    }

    // ── Single profile mode ────────────────────────────────────────────────
    if (!syncMikrotikTarget) return;
    const target = syncMikrotikTarget;
    setSyncingMikrotikId(target.id);
    try {
      const res = await fetch('/api/pppoe/profiles/sync-mikrotik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, routerIds: selectedRouterIds, ipPoolName: syncIpPoolName.trim(), localAddress: syncLocalAddress.trim(), poolRanges: syncPoolRanges.trim() }),
      });
      const result = await res.json();
      // Immediately update profiles state + modal fields so next open pre-fills correctly
      if (result.savedProfile) {
        setProfiles(prev => prev.map(p =>
          p.id === target.id
            ? { ...p, ipPoolName: result.savedProfile.ipPoolName, localAddress: result.savedProfile.localAddress }
            : p
        ));
        setSyncIpPoolName(result.savedProfile.ipPoolName || '');
        setSyncLocalAddress(result.savedProfile.localAddress || '');
      }
      loadProfiles();
      const debugInfo = result.debug?.length ? `\n\nDetail:\n${result.debug.join('\n')}` : '';
      if (result.success) {
        await showSuccess((result.message || 'Berhasil sync ke MikroTik') + debugInfo);
      } else {
        await showError((result.message || result.error || 'Gagal sync ke MikroTik') + debugInfo);
      }
    } catch { await showError('Gagal sync ke MikroTik'); }
    finally { setSyncingMikrotikId(null); }
  };

  const [testingConnection, setTestingConnection] = useState(false);
  const handleTestConnection = async () => {
    if (selectedRouterIds.length === 0) return;
    const selectedRouterId = selectedRouterIds[0];
    setTestingConnection(true);
    try {
      const res = await fetch('/api/pppoe/profiles/sync-mikrotik', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routerId: selectedRouterId }),
      });
      const result = await res.json();
      const okPort = result.results?.find((r: any) => r.success);
      if (okPort) {
        const pppReadOk = okPort.pppRead;
        const pppWriteOk = okPort.pppWrite;
        const lines = [
          `Router: ${result.routerName}  |  User: ${result.user}`,
          `Port: ${okPort.port}  |  Identity: ${okPort.identity}`,
          ``,
          `PPP Profile Read: ${pppReadOk ? '✅ ' + okPort.pppReadError : '❌ ' + okPort.pppReadError}`,
          `PPP Profile Write: ${pppWriteOk ? '✅ OK' : '❌ ' + okPort.pppWriteError}`,
        ];
        if (result.hint) lines.push('', '⚠️ ' + result.hint);
        if (!pppReadOk || !pppWriteOk) {
          await showError('Koneksi OK tapi akses PPP gagal:\n\n' + lines.join('\n'));
        } else {
          await showSuccess('✅ Semua test berhasil!\n\n' + lines.join('\n'));
        }
      } else {
        const detail = result.results?.map((r: any) => `Port ${r.port}: ❌ ${r.error}`).join('\n') || '';
        await showError(`❌ Gagal konek ke ${result.host}\n\n${detail}\n\n${result.hint || ''}`);
      }
    } catch { await showError('Gagal test koneksi'); }
    finally { setTestingConnection(false); }
  };

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
            <button
              onClick={handleSyncAllMikrotik}
              disabled={profiles.length === 0 || routers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-purple-500/30 rounded hover:bg-purple-500/10 text-purple-400 transition-colors disabled:opacity-40"
            >
              <Wifi className="h-3 w-3" />Sync Semua ke MikroTik
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
            <table className="w-full min-w-[900px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nama Paket</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Group RADIUS</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kecepatan</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Harga</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pelanggan</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">RADIUS</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8 opacity-30" />
                        <p className="text-xs">Belum ada paket PPPoE</p>
                        <button onClick={() => { resetForm(); setEditingProfile(null); setIsDialogOpen(true); }} className="text-xs text-primary hover:underline">+ Buat Paket Pertama</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-xs text-foreground">{profile.name}</p>
                        {profile.description && <p className="text-[10px] text-muted-foreground truncate max-w-[160px] mt-0.5">{profile.description}</p>}
                        <p className="text-[9px] text-muted-foreground mt-0.5">{profile.validityValue} {profile.validityUnit === 'MONTHS' ? 'Bulan' : 'Hari'}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#bc13fe]/10 text-[#bc13fe] border border-[#bc13fe]/30">{profile.groupName}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-foreground">↓ {profile.downloadSpeed} Mbps</span>
                          <span className="text-xs text-muted-foreground">↑ {profile.uploadSpeed} Mbps</span>
                        </div>
                        {profile.rateLimit && profile.rateLimit.includes(' ') && (
                          <p className="text-[9px] text-muted-foreground mt-0.5 font-mono truncate max-w-[120px]">{profile.rateLimit}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5 text-[11px]">
                          {profile.hpp != null && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Modal</span>
                              <span className="text-muted-foreground">Rp {profile.hpp.toLocaleString('id-ID')}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Jual</span>
                            <span className="font-semibold text-foreground">Rp {profile.price.toLocaleString('id-ID')}</span>
                          </div>
                          {profile.hpp != null && (
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Fee</span>
                              <span className="text-green-400">Rp {(profile.price - profile.hpp).toLocaleString('id-ID')}</span>
                            </div>
                          )}
                          {profile.ppnActive && (
                            <>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">PPN</span>
                                <span className="text-yellow-400">{profile.ppnRate ?? 11}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">Final</span>
                                <span className="font-bold text-orange-400">Rp {Math.round(profile.price * (1 + (profile.ppnRate ?? 11) / 100)).toLocaleString('id-ID')}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-sm font-semibold text-foreground">{profile.userCount ?? 0}</span>
                        <p className="text-[9px] text-muted-foreground">pelanggan</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {profile.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Aktif</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-muted text-muted-foreground border border-border"><XCircle className="h-2.5 w-2.5 mr-1" />Nonaktif</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {profile.syncedToRadius ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Sync</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"><XCircle className="h-2.5 w-2.5 mr-1" />Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end items-center gap-0.5">
                          <button
                            title="Sync ke FreeRADIUS"
                            onClick={() => handleSyncRadius(profile)}
                            disabled={syncingRadiusId === profile.id}
                            className="p-1.5 text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors disabled:opacity-40"
                          >{syncingRadiusId === profile.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}</button>
                          <button
                            title="Lihat Detail"
                            onClick={() => setDetailProfile(profile)}
                            className="p-1.5 text-muted-foreground hover:text-[#00f7ff] hover:bg-[#00f7ff]/10 rounded transition-colors"
                          ><Eye className="h-3.5 w-3.5" /></button>
                          <button
                            title="Edit"
                            onClick={() => handleEdit(profile)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                          ><Pencil className="h-3.5 w-3.5" /></button>
                          <button
                            title="Hapus"
                            onClick={() => setDeleteProfileId(profile.id)}
                            className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                          ><Trash2 className="h-3.5 w-3.5" /></button>
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
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoGroup = getAutoGroupName(name);
                    setFormData(prev => ({
                      ...prev,
                      name,
                      groupName: isAutoFilledField(prev.groupName, prev.name, getAutoGroupName)
                        ? autoGroup
                        : prev.groupName,
                    }));
                  }}
                  placeholder="Contoh: Paket 10 Mbps"
                  required
                  className={fieldErrors['name'] ? 'border-[#ff4466]' : ''}
                />
              </div>

              {/* Group RADIUS */}
              <div>
                <ModalLabel required>{t('pppoe.radiusGroup')}</ModalLabel>
                <ModalInput
                  type="text"
                  value={formData.groupName}
                  onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                  placeholder="Default mengikuti nama paket"
                  className={`font-mono ${fieldErrors['groupName'] ? 'border-[#ff4466]' : ''}`}
                />
                <p className="text-[9px] text-muted-foreground mt-1">
                  {formData.groupName && formData.groupName === getAutoGroupName(formData.name)
                    ? <span>Auto-generate · <button type="button" className="text-primary hover:underline" onClick={() => setFormData(prev => ({...prev, groupName: ''}))}>Edit untuk kustomisasi</button></span>
                    : 'Dipakai sebagai Group RADIUS dan otomatis jadi nama PPP Profile MikroTik'
                  }
                </p>
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
                {(formData.price && formData.hpp) || (formData.price && formData.ppnActive) ? (
                  <p className="text-[10px] text-green-400 mt-1">
                    {formData.hpp && formData.price && parseInt(formData.price) > 0 && parseInt(formData.hpp) > 0 && (
                      <span>Fee reseller: Rp {(parseInt(formData.price) - parseInt(formData.hpp)).toLocaleString('id-ID')}</span>
                    )}
                    {formData.hpp && formData.price && parseInt(formData.price) > 0 && parseInt(formData.hpp) > 0 && formData.ppnActive && ' · '}
                    {formData.ppnActive && formData.price && parseInt(formData.price) > 0 && (
                      <span>Harga + PPN {formData.ppnRate || 11}%: Rp {Math.round(parseInt(formData.price) * (1 + (parseInt(formData.ppnRate) || 11) / 100)).toLocaleString('id-ID')}</span>
                    )}
                  </p>
                ) : null}
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
              <ModalButton type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />{editingProfile ? 'Menyimpan...' : 'Menyimpan...'}</> : (editingProfile ? 'Simpan Perubahan' : 'Simpan Paket')}
              </ModalButton>
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

        {/* Detail Modal */}
        <SimpleModal isOpen={!!detailProfile} onClose={() => setDetailProfile(null)} size="md">
          {detailProfile && (
            <>
              <ModalHeader>
                <div className="flex items-start justify-between w-full">
                  <div>
                    <ModalTitle className="text-lg">{detailProfile.name}</ModalTitle>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-[#bc13fe]/20 text-[#bc13fe] border border-[#bc13fe]/30">{detailProfile.groupName}</span>
                      <span className="text-[10px] text-muted-foreground">{detailProfile.validityValue} {detailProfile.validityUnit === 'MONTHS' ? 'MONTHS' : 'DAYS'}</span>
                      {detailProfile.isActive
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Aktif</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-muted text-muted-foreground border border-border"><XCircle className="h-2.5 w-2.5 mr-0.5" />Nonaktif</span>
                      }
                    </div>
                  </div>
                </div>
              </ModalHeader>
              <ModalBody className="space-y-4">
                {detailProfile.description && (
                  <p className="text-xs text-muted-foreground">{detailProfile.description}</p>
                )}

                {/* Kecepatan */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Kecepatan</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 border border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Download</p>
                      <p className="text-base font-bold text-foreground">{detailProfile.downloadSpeed} Mbps</p>
                      <p className="text-[9px] text-muted-foreground">{(detailProfile.downloadSpeed * 1024).toLocaleString('id-ID')} Kbps</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 border border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Upload</p>
                      <p className="text-base font-bold text-foreground">{detailProfile.uploadSpeed} Mbps</p>
                      <p className="text-[9px] text-muted-foreground">{(detailProfile.uploadSpeed * 1024).toLocaleString('id-ID')} Kbps</p>
                    </div>
                  </div>
                  {detailProfile.rateLimit && (
                    <p className="text-[10px] text-muted-foreground mt-2 font-mono bg-muted/30 px-2 py-1 rounded">Rate Limit: {detailProfile.rateLimit}</p>
                  )}
                </div>

                {/* Harga */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Harga</p>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {detailProfile.hpp != null && (
                      <div className="flex justify-between items-center px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Harga Modal</span>
                        <span className="text-foreground">Rp {detailProfile.hpp.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Harga Jual</span>
                      <span className="font-semibold text-foreground">Rp {detailProfile.price.toLocaleString('id-ID')}</span>
                    </div>
                    {detailProfile.hpp != null && (
                      <div className="flex justify-between items-center px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Fee Reseller</span>
                        <span className="text-green-400">Rp {(detailProfile.price - detailProfile.hpp).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {detailProfile.ppnActive && (
                      <>
                        <div className="flex justify-between items-center px-3 py-2 text-xs">
                          <span className="text-muted-foreground">PPN</span>
                          <span className="text-yellow-400">{detailProfile.ppnRate ?? 11}%</span>
                        </div>
                        <div className="flex justify-between items-center px-3 py-2 text-xs">
                          <span className="text-muted-foreground">Harga Final (incl. PPN)</span>
                          <span className="font-bold text-[#00f7ff]">Rp {Math.round(detailProfile.price * (1 + (detailProfile.ppnRate ?? 11) / 100)).toLocaleString('id-ID')}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Status & Pengaturan */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Pengaturan</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {detailProfile.sharedUser
                        ? <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-[#00f7ff]" />}
                      <span className="text-muted-foreground">Shared User</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {detailProfile.syncedToRadius
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                        : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-muted-foreground">RADIUS Synced</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{detailProfile.userCount ?? 0} Pelanggan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{detailProfile.validityValue} {detailProfile.validityUnit === 'MONTHS' ? 'Bulan' : 'Hari'}</span>
                    </div>
                  </div>
                </div>

                {/* Sync Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => { handleSyncRadius(detailProfile); setDetailProfile(null); }}
                    disabled={syncingRadiusId === detailProfile.id}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                  >
                    <Radio className="h-3.5 w-3.5" />Sync FreeRADIUS
                  </button>
                  <button
                    onClick={() => { setDetailProfile(null); handleSyncMikrotik(detailProfile); }}
                    disabled={syncingMikrotikId === detailProfile.id}
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                  >
                    <Wifi className="h-3.5 w-3.5" />Sync MikroTik
                  </button>
                </div>
              </ModalBody>
              <ModalFooter>
                <ModalButton variant="secondary" onClick={() => setDetailProfile(null)}>Tutup</ModalButton>
                <ModalButton variant="primary" onClick={() => { setDetailProfile(null); handleEdit(detailProfile); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Paket
                </ModalButton>
              </ModalFooter>
            </>
          )}
        </SimpleModal>

        <SimpleModal isOpen={!!syncMikrotikTarget || isSyncAllMode} onClose={closeSyncMikrotikModal} size="md">
          <ModalHeader>
            <h2 className="text-base font-bold text-foreground">
              {isSyncAllMode ? 'Sync Semua Paket ke MikroTik' : 'Sync ke MikroTik'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSyncAllMode
                ? <span>Sync <span className="font-semibold text-purple-400">{profiles.length} paket</span> ke semua router yang dipilih · Setiap paket menggunakan pengaturan pool-nya masing-masing</span>
                : <span>Sync paket <span className="font-semibold text-purple-400">{syncMikrotikTarget?.name}</span> · Group RADIUS: <span className="font-mono">{syncMikrotikTarget?.groupName}</span> · Akan disync ke semua router yang dipilih</span>
              }
            </p>
          </ModalHeader>
          <ModalBody>
            {/* Router checkboxes */}
            {routers.length === 0
              ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Tidak ada router aktif yang tersedia.
                </div>
              )
              : (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">Pilih Router / NAS</span>
                    <button
                      type="button"
                      className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                      onClick={() => setSelectedRouterIds(
                        selectedRouterIds.length === routers.length ? [] : routers.map(r => r.id)
                      )}
                    >
                      {selectedRouterIds.length === routers.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    </button>
                  </div>
                  {routers.map(r => (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedRouterIds.includes(r.id)
                          ? 'border-purple-500/60 bg-purple-500/10'
                          : 'border-border hover:border-purple-500/30 hover:bg-purple-500/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRouterIds.includes(r.id)}
                        onChange={() => setSelectedRouterIds(prev =>
                          prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                        )}
                        className="mt-0.5 accent-purple-500"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{r.name || r.shortname}</div>
                        <div className="text-xs text-muted-foreground">{r.ipAddress || r.nasname}</div>
                        {r.description && <div className="text-xs text-muted-foreground/70 mt-0.5">{r.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              )
            }

            <div className="grid grid-cols-1 gap-3 mt-4 border-t border-border pt-4">
              {isSyncAllMode && (
                <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <p className="text-xs text-purple-300">
                    <span className="font-semibold">Mode Sync Semua:</span> Kosongkan field di bawah agar setiap paket menggunakan pengaturan pool-nya masing-masing. Isi jika ingin override ke semua paket.
                  </p>
                </div>
              )}
              <div>
                <ModalLabel>Nama Pool</ModalLabel>
                <ModalInput
                  type="text"
                  value={syncIpPoolName}
                  onChange={(e) => setSyncIpPoolName(e.target.value)}
                  placeholder="contoh: pppoe-pool"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nama IP pool di MikroTik (<code>/ip pool</code>). Jika belum ada, isi juga kolom IP Range di bawah.
                </p>
              </div>
              <div>
                <ModalLabel>IP Range Pool (jika pool belum ada di MikroTik)</ModalLabel>
                <ModalInput
                  type="text"
                  value={syncPoolRanges}
                  onChange={(e) => setSyncPoolRanges(e.target.value)}
                  placeholder="contoh: 192.168.10.100-192.168.10.200"
                  disabled={!syncIpPoolName.trim()}
                />
                <p className="text-xs text-[#ffd84d] mt-1">
                  Kosongkan jika pool sudah ada. Diisi → pool akan dibuat otomatis sebelum PPP profile.
                </p>
              </div>
              <div>
                <ModalLabel>IP Lokal PPP (opsional)</ModalLabel>
                <ModalInput
                  type="text"
                  value={syncLocalAddress}
                  onChange={(e) => setSyncLocalAddress(e.target.value)}
                  placeholder="contoh: 10.10.10.1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Jika diisi akan diset sebagai `local-address` pada PPP profile.
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButton variant="secondary" onClick={closeSyncMikrotikModal}>Tutup</ModalButton>
            {!isSyncAllMode && (
              <ModalButton
                variant="secondary"
                onClick={handleTestConnection}
                disabled={selectedRouterIds.length === 0 || testingConnection}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5${testingConnection ? ' animate-spin' : ''}`} />Test Koneksi
              </ModalButton>
            )}
            <ModalButton
              variant="primary"
              onClick={handleConfirmSyncMikrotik}
              disabled={selectedRouterIds.length === 0 || (isSyncAllMode ? syncingAll : syncingMikrotikId === syncMikrotikTarget?.id)}
            >
              {(isSyncAllMode ? syncingAll : syncingMikrotikId === syncMikrotikTarget?.id)
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Menyinkronkan...</>
                : <><Wifi className="h-3.5 w-3.5 mr-1.5" />{isSyncAllMode ? `Sync ${profiles.length} Paket ke ${selectedRouterIds.length} Router` : `Sync ke ${selectedRouterIds.length} Router`}</>
              }
            </ModalButton>
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
