'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { Server, Search, RefreshCw, Loader2, Wifi, WifiOff, Eye, X, Power, Pencil, Check } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatWIB } from '@/lib/timezone';

interface GenieACSDevice {
  _id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  pppoeUsername: string;
  pppoeIP: string;
  tr069IP: string;
  rxPower: string;
  ponMode: string;
  uptime: string;
  status: string;
  lastInform: string | null;
}

interface DeviceDetail {
  _id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  pppoeUsername: string;
  pppoeIP: string;
  tr069IP: string;
  rxPower: string;
  txPower: string;
  ponMode: string;
  pppoeStatus: string;
  pppoeGateway: string;
  pppoeDNS: string;
  uptime: string;
  status: string;
  lastInform: string | null;
  macAddress: string;
  softwareVersion: string;
  hardwareVersion: string;
  lanIP: string;
  totalConnected: number;
  connectedDevices: { hostName: string; ipAddress: string; macAddress: string; interfaceType: string; active: boolean }[];
  wlanConfigs: { index: number; ssid: string; enabled: boolean; band: string; totalAssociations: number }[];
}

interface WifiEditState {
  deviceId: string;
  index: number;
  ssid: string;
  wifiPassword: string;
}

export default function TechnicianGenieACSPage() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const [devices, setDevices] = useState<GenieACSDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [detailDevice, setDetailDevice] = useState<DeviceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rebootingId, setRebootingId] = useState<string | null>(null);
  const [wifiEdit, setWifiEdit] = useState<WifiEditState | null>(null);
  const [savingWifi, setSavingWifi] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
  const PAGE_SIZE = 20;

  const fetchDevices = useCallback(async () => {
    try {
      const [devRes, settRes] = await Promise.all([
        fetch('/api/technician/genieacs/devices'),
        fetch('/api/technician/genieacs')
      ]);
      if (settRes.ok) {
        const d = await settRes.json();
        setIsConfigured(!!d?.settings?.host);
      }
      if (devRes.ok) {
        const d = await devRes.json();
        setDevices(d.devices || []);
      }
    } catch {
      addToast({ type: 'error', title: t('techPortal.failedLoadDevices') });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleViewDetail = async (deviceId: string) => {
    setLoadingDetail(true);
    setDetailDevice(null);
    try {
      const res = await fetch(`/api/technician/genieacs/devices/${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        setDetailDevice(data.device || data);
      }
    } catch {
      addToast({ type: 'error', title: t('techPortal.failedLoadDetail') });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleReboot = async (deviceId: string) => {
    if (!confirm(t('techPortal.rebootConfirm'))) return;
    setRebootingId(deviceId);
    try {
      const res = await fetch(`/api/technician/genieacs/devices/${encodeURIComponent(deviceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reboot' }),
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: t('techPortal.rebootSuccess') });
      } else {
        addToast({ type: 'error', title: t('techPortal.rebootFailed'), description: data.error });
      }
    } catch {
      addToast({ type: 'error', title: t('techPortal.rebootFailed') });
    } finally {
      setRebootingId(null);
    }
  };

  const handleSaveWifi = async () => {
    if (!wifiEdit) return;
    setSavingWifi(true);
    try {
      const res = await fetch(`/api/technician/genieacs/devices/${encodeURIComponent(wifiEdit.deviceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setWifi',
          wifiIndex: wifiEdit.index,
          ssid: wifiEdit.ssid,
          wifiPassword: wifiEdit.wifiPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast({ type: 'success', title: t('techPortal.wifiSaved') });
        setWifiEdit(null);
        // Refresh detail
        if (detailDevice) handleViewDetail(detailDevice._id);
      } else {
        addToast({ type: 'error', title: t('techPortal.wifiFailed'), description: data.error });
      }
    } catch {
      addToast({ type: 'error', title: t('techPortal.wifiFailed') });
    } finally {
      setSavingWifi(false);
    }
  };

  const manufacturers = Array.from(new Set(devices.map(d => d.manufacturer).filter(m => m && m !== '-')));

  const filtered = devices.filter(d => {
    const matchSearch = !search ||
      d.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
      d.pppoeUsername?.toLowerCase().includes(search.toLowerCase()) ||
      d.model?.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    const matchManufacturer = filterManufacturer === 'all' || d.manufacturer === filterManufacturer;
    return matchSearch && matchStatus && matchManufacturer;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  const handleFilterChange = (status: 'all' | 'online' | 'offline', manufacturer?: string) => {
    if (manufacturer !== undefined) setFilterManufacturer(manufacturer);
    else setFilterStatus(status);
    setCurrentPage(1);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return formatWIB(d, 'dd/MM/yyyy HH:mm');
  };

  if (!isConfigured && !loading) {
    return (
      <div className="p-4 lg:p-6 text-center py-20 text-slate-500 dark:text-[#e0d0ff]/50">
        <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">{t('techPortal.genieacsNotConfigured')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Server className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('techPortal.genieacs')}</h1>
            <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{filtered.length} / {devices.length} {t('techPortal.devices')}</p>
          </div>
        </div>
        <button onClick={fetchDevices} title="Perbarui Data" className="p-2 bg-slate-100 dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/10 transition">
          <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-[#e0d0ff] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder={t('techPortal.searchDevice')} className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-[#00f7ff]/30 transition" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl p-1">
          {(['all', 'online', 'offline'] as const).map(s => (
            <button
              key={s}
              onClick={() => handleFilterChange(s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${filterStatus === s ? 'bg-blue-500 text-white shadow' : 'text-slate-500 dark:text-[#e0d0ff]/60 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10'}`}
            >
              {s === 'all' ? 'Semua' : s === 'online' ? 'Online' : 'Offline'}
              {s !== 'all' && (
                <span className="ml-1 opacity-70">({devices.filter(d => d.status === s).length})</span>
              )}
            </button>
          ))}
        </div>
        {manufacturers.length > 0 && (
          <select
            value={filterManufacturer}
            onChange={e => handleFilterChange('all', e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl text-xs text-slate-700 dark:text-[#e0d0ff]/80 focus:outline-none focus:ring-2 focus:ring-[#00f7ff]/30"
          >
            <option value="all">Semua Merk</option>
            {manufacturers.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-[#e0d0ff]/50">
          <Server className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('techPortal.noData')}</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-auto bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#bc13fe]/20 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">S/N</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.manufacturer')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.model')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">PPPoE User</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">IP</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">RX Power</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70">{t('techPortal.status')}</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 dark:text-[#e0d0ff]/70"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((d) => (
                  <tr key={d._id} className="border-b border-slate-100 dark:border-[#bc13fe]/10 hover:bg-slate-50 dark:hover:bg-[#bc13fe]/5 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-white">{d.serialNumber}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{d.manufacturer}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{d.model}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#e0d0ff]/80">{d.pppoeUsername || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-[#e0d0ff]/80">{d.pppoeIP || d.tr069IP || '-'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`font-mono ${parseFloat(d.rxPower) > -25 ? 'text-green-600 dark:text-green-400' : parseFloat(d.rxPower) > -28 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                        {d.rxPower || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${d.status === 'online' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                        {d.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {d.status === 'online' ? t('techPortal.online') : t('techPortal.offline')}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <button
                        onClick={() => handleViewDetail(d._id)}
                        title={t('techPortal.details')}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10 rounded-lg transition"
                      >
                        <Eye className="w-4 h-4 text-slate-500 dark:text-[#e0d0ff]/60" />
                      </button>
                      <button
                        onClick={() => handleReboot(d._id)}
                        disabled={rebootingId === d._id}
                        title={t('techPortal.reboot')}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition disabled:opacity-50"
                      >
                        {rebootingId === d._id
                          ? <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                          : <Power className="w-4 h-4 text-red-500" />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {paginated.map((d) => (
              <div key={d._id} className="bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="cursor-pointer" onClick={() => handleViewDetail(d._id)}>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{d.model || d.serialNumber}</p>
                    <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{d.manufacturer}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${d.status === 'online' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                      {d.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {d.status === 'online' ? t('techPortal.online') : t('techPortal.offline')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">PPPoE: </span>
                    <span className="text-slate-700 dark:text-[#e0d0ff]/80">{d.pppoeUsername || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-[#e0d0ff]/50">S/N: </span>
                    <span className="font-mono text-slate-700 dark:text-[#e0d0ff]/80">{d.serialNumber?.slice(0, 12)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-[#bc13fe]/10">
                  <span className="text-slate-500 dark:text-[#e0d0ff]/60">{d.pppoeIP || d.tr069IP || '-'}</span>
                  <span className={`font-mono ${parseFloat(d.rxPower) > -25 ? 'text-green-500' : parseFloat(d.rxPower) > -28 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {d.rxPower ? `RX: ${d.rxPower}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-[#bc13fe]/10">
                  <button
                    onClick={() => handleViewDetail(d._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-[#bc13fe]/10 text-slate-700 dark:text-[#e0d0ff] border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl hover:bg-slate-200 dark:hover:bg-[#bc13fe]/20 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t('techPortal.details')}
                  </button>
                  <button
                    onClick={() => handleReboot(d._id)}
                    disabled={rebootingId === d._id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
                  >
                    {rebootingId === d._id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Power className="w-3.5 h-3.5" />
                    }
                    {rebootingId === d._id ? t('techPortal.rebooting') : t('techPortal.reboot')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/50">
                Halaman {safeCurrentPage} dari {totalPages} &bull; {filtered.length} perangkat
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10 transition"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page = i + 1;
                  if (totalPages > 5) {
                    const start = Math.max(1, Math.min(safeCurrentPage - 2, totalPages - 4));
                    page = start + i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 text-xs font-bold rounded-xl transition ${page === safeCurrentPage ? 'bg-blue-500 text-white shadow' : 'bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 text-slate-600 dark:text-[#e0d0ff]/70 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10'}`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-[#1a0f35]/80 border border-slate-200 dark:border-[#bc13fe]/20 rounded-xl disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10 transition"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {(detailDevice || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { setDetailDevice(null); setLoadingDetail(false); setWifiEdit(null); }}>
          <div className="bg-white dark:bg-[#1a0f35] border border-slate-200 dark:border-[#bc13fe]/30 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {loadingDetail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#00f7ff]" />
              </div>
            ) : detailDevice ? (
              <>
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#bc13fe]/20">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">{detailDevice.model}</h2>
                    <p className="text-xs text-slate-500 dark:text-[#e0d0ff]/60">{detailDevice.serialNumber}</p>
                  </div>
                  <button onClick={() => { setDetailDevice(null); setWifiEdit(null); }} className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#bc13fe]/10 rounded-lg transition">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {/* Device Actions */}
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-[#e0d0ff]/80 mb-2">{t('techPortal.deviceActions')}</p>
                    <button
                      onClick={() => handleReboot(detailDevice._id)}
                      disabled={rebootingId === detailDevice._id}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-50"
                    >
                      {rebootingId === detailDevice._id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Power className="w-4 h-4" />
                      }
                      {rebootingId === detailDevice._id ? t('techPortal.rebooting') : t('techPortal.reboot')}
                    </button>
                  </div>

                  {/* Device Info */}
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-[#e0d0ff]/80 mb-2">{t('techPortal.deviceInfo')}</p>
                    {/* PPPoE Section */}
                    <div className="bg-slate-50 dark:bg-[#0a0520]/50 rounded-xl p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-700 dark:text-[#e0d0ff]/80">{t('techPortal.pppoeInfo')}</p>
                        {detailDevice.pppoeStatus !== '-' && (
                          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            detailDevice.pppoeStatus.toLowerCase().includes('connected') && !detailDevice.pppoeStatus.toLowerCase().includes('disconnected')
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              detailDevice.pppoeStatus.toLowerCase().includes('connected') && !detailDevice.pppoeStatus.toLowerCase().includes('disconnected')
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`} />
                            {detailDevice.pppoeStatus}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.username')}</p>
                          <p className="font-medium text-slate-900 dark:text-white break-all">{detailDevice.pppoeUsername || '-'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.pppoeIp')}</p>
                          <p className="font-medium text-slate-900 dark:text-white break-all">{detailDevice.pppoeIP || '-'}</p>
                        </div>
                        {detailDevice.pppoeGateway !== '-' && (
                          <div>
                            <p className="text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.pppoeGateway')}</p>
                            <p className="font-medium text-slate-900 dark:text-white break-all">{detailDevice.pppoeGateway}</p>
                          </div>
                        )}
                        {detailDevice.pppoeDNS !== '-' && (
                          <div className="col-span-2">
                            <p className="text-slate-500 dark:text-[#e0d0ff]/50">{t('techPortal.pppoeDns')}</p>
                            <p className="font-medium text-slate-900 dark:text-white break-all">{detailDevice.pppoeDNS}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {[
                        [t('techPortal.manufacturer'), detailDevice.manufacturer],
                        [t('techPortal.model'), detailDevice.model],
                        ['TR-069 IP', detailDevice.tr069IP],
                        ['MAC', detailDevice.macAddress],
                        ['RX Power', detailDevice.rxPower],
                        ['TX Power', detailDevice.txPower],
                        ['PON Mode', detailDevice.ponMode],
                        [t('techPortal.uptime') || 'Uptime', detailDevice.uptime],
                        ['Software', detailDevice.softwareVersion],
                        ['Hardware', detailDevice.hardwareVersion],
                        ['LAN IP', detailDevice.lanIP],
                        [t('techPortal.lastInform'), formatDate(detailDevice.lastInform)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="text-slate-500 dark:text-[#e0d0ff]/50">{label}</p>
                          <p className="font-medium text-slate-900 dark:text-white break-all">{value || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* WiFi */}
                  {detailDevice.wlanConfigs?.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-[#bc13fe]/20 pt-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-[#e0d0ff]/80 mb-2">WiFi</p>
                      <div className="space-y-3">
                        {detailDevice.wlanConfigs.map(w => (
                          <div key={w.index} className="bg-slate-50 dark:bg-[#0a0520]/50 rounded-xl px-3 py-2 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">{w.ssid}</p>
                                <p className="text-slate-500 dark:text-[#e0d0ff]/50">{w.band} - {w.totalAssociations} {t('techPortal.online').toLowerCase()}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${w.enabled ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                                  {w.enabled ? 'ON' : 'OFF'}
                                </span>
                                <button
                                  onClick={() => setWifiEdit(
                                    wifiEdit?.deviceId === detailDevice._id && wifiEdit?.index === w.index
                                      ? null
                                      : { deviceId: detailDevice._id, index: w.index, ssid: w.ssid, wifiPassword: '' }
                                  )}
                                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg transition"
                                  title={t('techPortal.editWifi')}
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-500" />
                                </button>
                              </div>
                            </div>

                            {/* WiFi Edit Form */}
                            {wifiEdit?.deviceId === detailDevice._id && wifiEdit?.index === w.index && (
                              <div className="border-t border-slate-200 dark:border-[#bc13fe]/20 pt-2 space-y-2">
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 dark:text-[#e0d0ff]/60">{t('techPortal.wifiSsid')}</label>
                                  <input
                                    value={wifiEdit.ssid}
                                    onChange={e => setWifiEdit({ ...wifiEdit, ssid: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-lg text-slate-900 dark:text-white focus:ring-1 focus:ring-[#00f7ff]/40 outline-none"
                                    placeholder="SSID"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-slate-500 dark:text-[#e0d0ff]/60">{t('techPortal.wifiPassword')}</label>
                                  <input
                                    type="password"
                                    value={wifiEdit.wifiPassword}
                                    onChange={e => setWifiEdit({ ...wifiEdit, wifiPassword: e.target.value })}
                                    className="mt-1 w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#0a0520] border border-slate-200 dark:border-[#bc13fe]/30 rounded-lg text-slate-900 dark:text-white focus:ring-1 focus:ring-[#00f7ff]/40 outline-none"
                                    placeholder="password"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={() => setWifiEdit(null)}
                                    className="flex-1 py-1.5 text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 transition"
                                  >
                                    {t('techPortal.cancel')}
                                  </button>
                                  <button
                                    onClick={handleSaveWifi}
                                    disabled={savingWifi || (!wifiEdit.ssid && !wifiEdit.wifiPassword)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition disabled:opacity-50"
                                  >
                                    {savingWifi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    {savingWifi ? t('techPortal.savingWifi') : t('techPortal.save')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connected Devices */}
                  {detailDevice.connectedDevices?.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-[#bc13fe]/20 pt-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-[#e0d0ff]/80 mb-2">{t('techPortal.connectedDevices')} ({detailDevice.totalConnected})</p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {detailDevice.connectedDevices.map((h, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-[#0a0520]/50 rounded-lg px-3 py-1.5 text-xs">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">{h.hostName || 'Unknown'}</p>
                              <p className="text-slate-500 dark:text-[#e0d0ff]/50">{h.ipAddress} - {h.macAddress}</p>
                            </div>
                            <span className="text-[10px] text-slate-400">{h.interfaceType}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
