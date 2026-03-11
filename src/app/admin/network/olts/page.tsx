'use client';

import { useState, useEffect, useRef } from 'react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus, Pencil, Trash2, Server, MapPin, Map, X, RefreshCcw, Router as RouterIcon,
  Activity, Box, Network, Upload, Download, Eye, ExternalLink, AlertTriangle,
} from 'lucide-react';
import MapPicker from '@/components/MapPicker';
import Link from 'next/link';

interface OLT {
  id: string;
  name: string;
  ipAddress: string;
  vendor?: string;
  model?: string;
  username?: string;
  password?: string;
  snmpCommunity?: string;
  snmp_community?: string;
  sshEnabled?: boolean;
  telnetEnabled?: boolean;
  latitude: number;
  longitude: number;
  status: string;
  followRoad: boolean;
  createdAt: string;
  model_profile?: {
    id: string;
    vendor: string;
    model: string;
  };
  network_olt_routers?: Array<{
    id: string;
    priority: number;
    isActive: boolean;
    nas: {
      id: string;
      name: string;
      nasname: string;
      ipAddress: string;
    };
  }>;
  _count: {
    odps: number;
    odcs?: number;
    olt_onu_status?: number;
  };
  onu_stats?: {
    online: number;
    offline: number;
    los: number;
    dying_gasp: number;
    unconfig: number;
  };
}

interface Router {
  id: string;
  name: string;
  nasname: string;
  ipAddress: string;
}

interface OLTStatus {
  id: string;
  online: boolean;
  details?: {
    telnet: boolean;
    ssh: boolean;
    http: boolean;
    icmp: boolean;
  };
}

interface OLTProfile {
  id: string;
  vendor: string;
  model: string;
  poller_type?: string;
  is_active?: boolean;
}

export default function OLTsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [olts, setOlts] = useState<OLT[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [oltProfiles, setOltProfiles] = useState<OLTProfile[]>([]);
  const [oltStatusMap, setOltStatusMap] = useState<Record<string, OLTStatus>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOlt, setEditingOlt] = useState<OLT | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<any>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    ipAddress: '',
    vendor: 'huawei',
    model: '',
    username: '',
    password: '',
    snmpCommunity: 'public',
    sshEnabled: true,
    telnetEnabled: false,
    latitude: '',
    longitude: '',
    status: 'active',
    followRoad: false,
    routerIds: [] as string[],
  });

  useEffect(() => {
    loadData();
    // Auto-refresh status setiap 30 detik
    const interval = setInterval(() => {
      checkOLTsStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh saat olts berubah
  useEffect(() => {
    if (olts.length > 0) {
      checkOLTsStatus();
    }
  }, [olts.length]);

  const loadData = async () => {
    try {
      const [oltsRes, routersRes, profilesRes] = await Promise.all([
        fetch('/api/network/olts'),
        fetch('/api/network/routers'),
        fetch('/api/admin/olt/model-profiles'),
      ]);
      const [oltsData, routersData, profilesData] = await Promise.all([oltsRes.json(), routersRes.json(), profilesRes.json()]);
      const loadedOlts = oltsData.olts || [];
      setOlts(loadedOlts);
      setRouters(routersData.routers || []);
      setOltProfiles(profilesData.profiles || []);
      
      // Check OLT status
      if (loadedOlts.length > 0) {
        checkOLTsStatus(loadedOlts);
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkOLTsStatus = async (oltList?: OLT[]) => {
    const oltsToCheck = oltList || olts;
    if (oltsToCheck.length === 0) return;
    
    try {
      const oltIds = oltsToCheck.map((o) => o.id);
      const response = await fetch('/api/network/olts/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltIds }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setOltStatusMap(data.statusMap || {});
      }
    } catch (error) {
      console.error('Check OLT status error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      ipAddress: '',
      vendor: '',
      model: '',
      username: '',
      password: '',
      snmpCommunity: '',
      sshEnabled: true,
      telnetEnabled: false,
      latitude: '',
      longitude: '',
      status: 'active',
      followRoad: false,
      routerIds: [],
    });
    setConnectionTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!formData.ipAddress) {
      showError('Error', 'Please enter IP Address first');
      return;
    }

    setTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const response = await fetch('/api/admin/olt/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipAddress: formData.ipAddress,
          vendor: formData.vendor,
          username: formData.username,
          password: formData.password,
          sshEnabled: formData.sshEnabled,
          telnetEnabled: formData.telnetEnabled,
          oltId: editingOlt?.id, // Include oltId if editing existing OLT
        }),
      });

      const result = await response.json();
      setConnectionTestResult(result);

      if (result.success) {
        showSuccess(
          'Connection Test Successful!',
          result.results.tests.map((test: any) => 
            `${test.method}: ${test.success ? '✓' : '✗'} ${test.message} (${test.time}ms)`
          ).join('\n')
        );
        // Refresh OLTs to update is_online status
        if (editingOlt) {
          loadData();
        }
      } else {
        showError(
          'Connection Test Failed',
          result.results.tests.map((test: any) => 
            `${test.method}: ${test.success ? '✓' : '✗'} ${test.message} (${test.time}ms)`
          ).join('\n')
        );
      }
    } catch (error) {
      console.error('Connection test error:', error);
      showError('Error', 'Failed to test connection');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleEdit = (olt: OLT) => {
    setEditingOlt(olt);
    // Use snmp_community (snake_case from DB) if snmpCommunity is not present
    const community = olt.snmpCommunity || olt.snmp_community || '';
    setFormData({
      name: olt.name,
      ipAddress: olt.ipAddress,
      vendor: olt.vendor || '',
      model: olt.model || '',
      username: olt.username || '',
      password: olt.password || '',
      snmpCommunity: community,
      sshEnabled: olt.sshEnabled !== undefined ? olt.sshEnabled : true,
      telnetEnabled: olt.telnetEnabled !== undefined ? olt.telnetEnabled : false,
      latitude: olt.latitude.toString(),
      longitude: olt.longitude.toString(),
      status: olt.status,
      followRoad: olt.followRoad,
      routerIds: olt.network_olt_routers?.map(r => r.nas?.id).filter(Boolean) || [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingOlt ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        ...(editingOlt && { id: editingOlt.id }),
      };
      
      const res = await fetch('/api/network/olts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const result = await res.json();
      if (result.success) {
        await showSuccess(editingOlt ? t('common.updated') : t('common.created'));
        setIsDialogOpen(false);
        setEditingOlt(null);
        resetForm();
        loadData();
      } else {
        await showError(result.error || t('common.saveError'));
      }
    } catch (error) {
      console.error('Submit error:', error);
      await showError(t('common.saveError'));
    }
  };

  const handleDelete = async (olt: OLT) => {
    const confirmed = await showConfirm(
      'Delete OLT',
      `Are you sure you want to delete "${olt.name}"? This will also delete all associated ODCs and ODPs.`
    );
    if (!confirmed) return;
    
    try {
      const res = await fetch('/api/network/olts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: olt.id }),
      });
      
      const result = await res.json();
      if (result.success) {
        await showSuccess(t('common.deleted'));
        loadData();
      } else {
        await showError(result.error || t('common.deleteError'));
      }
    } catch (error) {
      await showError(t('common.deleteError'));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/network/olts/template');
      if (!response.ok) throw new Error('Failed to download template');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OLT_Import_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      await showError(t('common.error'));
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/network/olts/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        let message = `Import completed!\n\n`;
        message += `Total rows: ${result.total}\n`;
        message += `Imported: ${result.imported}\n`;
        message += `Failed: ${result.failed}`;

        if (result.failed > 0) {
          message += `\n\nErrors:\n`;
          result.results.errors.slice(0, 5).forEach((err: any) => {
            message += `Row ${err.row}: ${err.error}\n`;
          });
          if (result.results.errors.length > 5) {
            message += `... and ${result.results.errors.length - 5} more errors`;
          }
        }

        await showSuccess(message);
        loadData();
        setIsImportDialogOpen(false);
      } else {
        await showError(result.error || t('common.importError'));
      }
    } catch (error) {
      await showError(t('common.importError'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleRouter = (routerId: string) => {
    setFormData(prev => ({
      ...prev,
      routerIds: prev.routerIds.includes(routerId)
        ? prev.routerIds.filter(id => id !== routerId)
        : [...prev.routerIds, routerId],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCcw className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Server className="h-5 w-5 text-teal-600" />
            {t('olt.title')}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('olt.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsImportDialogOpen(true)}
            className="inline-flex items-center px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
          >
            <Upload className="h-3 w-3 mr-1" />
            {t('olt.import')}
          </button>
          <button
            onClick={() => { resetForm(); setEditingOlt(null); setIsDialogOpen(true); }}
            className="inline-flex items-center px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t('olt.add')}
          </button>
        </div>
      </div>

      {/* Overall Network Stats Card */}{/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('common.total')} {t('nav.olt')}</p>
              <p className="text-xl font-bold text-teal-600">{olts.length}</p>
            </div>
            <Server className="h-6 w-6 text-teal-600" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('common.active')}</p>
              <p className="text-xl font-bold text-green-600">
                {olts.filter(o => o.status === 'active').length}
              </p>
            </div>
            <Activity className="h-6 w-6 text-green-600" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase">{t('common.total')} {t('nav.odp')}</p>
              <p className="text-xl font-bold text-blue-600">
                {olts.reduce((sum, o) => sum + (o._count?.odps || 0), 0)}
              </p>
            </div>
            <Box className="h-5 w-5 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Table - Desktop View */}
      <div className="hidden md:block bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-3 py-2 border-b dark:border-gray-800">
          <span className="text-xs font-medium">{t('nav.olt')} {t('common.list')}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t('common.name')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">{t('network.ipAddress')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden lg:table-cell">Username</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden lg:table-cell">Password</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden md:table-cell">Community</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden xl:table-cell">{t('common.location')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden xl:table-cell">{t('olt.followRoad')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden lg:table-cell">{t('nav.routers')}</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden xl:table-cell">Model Profile</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">ONUs</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">ONU Status</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden sm:table-cell">ODC</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase hidden sm:table-cell">{t('nav.odp')}</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {olts.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-3 py-8 text-center text-gray-500 text-xs">
                    {t('common.noData')}. {t('common.clickAdd')} "{t('olt.add')}".
                  </td>
                </tr>
              ) : (
                olts.map((olt) => {
                  const status = oltStatusMap[olt.id];
                  return (
                    <tr key={olt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-teal-600" />
                        <span className="text-xs font-medium">{olt.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                      {olt.ipAddress}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {olt.username || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">
                        {olt.password ? '••••••••' : '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {olt.snmp_community || 'public'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {status ? (
                        <div className="flex flex-col gap-1">
                          {status.online ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 inline-flex items-center gap-1">
                              🟢 Online
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 inline-flex items-center gap-1">
                              🔴 Offline
                            </span>
                          )}
                          {status.details && (
                            <div className="flex gap-1 flex-wrap">
                              {status.details.telnet && (
                                <span className="text-[9px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded" title="Telnet accessible">
                                  TEL
                                </span>
                              )}
                              {status.details.ssh && (
                                <span className="text-[9px] px-1 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded" title="SSH accessible">
                                  SSH
                                </span>
                              )}
                              {status.details.http && (
                                <span className="text-[9px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded" title="HTTP accessible">
                                  HTTP
                                </span>
                              )}
                              {status.details.icmp && (
                                <span className="text-[9px] px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded" title="ICMP ping">
                                  PING
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">⚪ Checking</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell">
                      <a
                        href={`https://www.google.com/maps?q=${olt.latitude},${olt.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <MapPin className="h-3 w-3" />
                        {olt.latitude.toFixed(6)}, {olt.longitude.toFixed(6)}
                      </a>
                    </td>
                    <td className="px-3 py-2 hidden xl:table-cell">
                      {olt.followRoad ? (
                        <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 rounded font-medium">✓ Yes</span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-800 rounded">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {olt.network_olt_routers?.map((r, idx) => (
                          <span
                            key={r.id}
                            className={`px-1.5 py-0.5 text-[9px] rounded ${
                              idx === 0
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                            }`}
                          >
                            {r.nas?.name || 'Unknown'}
                          </span>
                        ))}
                        {(!olt.network_olt_routers || olt.network_olt_routers.length === 0) && (
                          <span className="text-[10px] text-gray-400">No router</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {olt.model_profile ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                            {olt.model_profile.vendor}
                          </span>
                          <span className="text-[9px] text-gray-500 dark:text-gray-400">
                            {olt.model_profile.model}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">No profile</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 rounded font-medium">
                        {olt._count?.olt_onu_status || 0} ONUs
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {olt.onu_stats ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex gap-1 flex-wrap">
                            {olt.onu_stats.online > 0 && (
                              <Link
                                href={`/admin/network/onus?olt_id=${olt.id}&filter=online`}
                                className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                title="View online ONUs"
                              >
                                🟢 {olt.onu_stats.online} Online
                              </Link>
                            )}
                            {olt.onu_stats.dying_gasp > 0 && (
                              <Link
                                href={`/admin/network/onus?olt_id=${olt.id}&filter=dying_gasp`}
                                className="text-[9px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                title="View dying gasp ONUs"
                              >
                                ⚠️ {olt.onu_stats.dying_gasp} Dying Gasp
                              </Link>
                            )}
                            {olt.onu_stats.los > 0 && (
                              <Link
                                href={`/admin/network/onus?olt_id=${olt.id}&filter=los`}
                                className="text-[9px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                title="View LOS ONUs"
                              >
                                📡 {olt.onu_stats.los} LOS
                              </Link>
                            )}
                            {olt.onu_stats.unconfig > 0 && (
                              <Link
                                href={`/admin/network/onus?olt_id=${olt.id}&filter=unconfig`}
                                className="text-[9px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                title="View unconfigured ONUs"
                              >
                                🔧 {olt.onu_stats.unconfig} Unconfig
                              </Link>
                            )}
                            {olt.onu_stats.offline > 0 && (
                              <Link
                                href={`/admin/network/onus?olt_id=${olt.id}&filter=offline`}
                                className="text-[9px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                title="View offline ONUs"
                              >
                                🔴 {olt.onu_stats.offline} Offline
                              </Link>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 rounded">
                        {olt._count?.odcs || 0} ODC
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 rounded">
                        {olt._count?.odps || 0} ODPs
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/admin/network/olt/${olt.id}`}
                          className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title={t('olt.monitoring.title')}
                        >
                          <Eye className="h-3 w-3" />
                        </Link>
                        <button
                          onClick={() => handleEdit(olt)}
                          className="p-1 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(olt)}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {olts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-8 text-center">
            <p className="text-gray-500 text-xs">{t('common.noData')}. {t('common.clickAdd')} "{t('olt.add')}".</p>
          </div>
        ) : (
          olts.map((olt) => (
            <div key={olt.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1">
                  <Server className="h-4 w-4 text-teal-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">{olt.name}</h3>
                    <p className="text-[10px] font-mono text-gray-500 truncate">{olt.ipAddress}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {oltStatusMap[olt.id] ? (
                    oltStatusMap[olt.id].online ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">🟢</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">🔴</span>
                    )
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">⚪</span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 text-[9px] rounded font-medium ${
                      olt.status === 'active'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30'
                    }`}
                  >
                    {olt.status}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="text-[9px] text-gray-400 uppercase mb-0.5">{t('common.location')}</div>
                  <a
                    href={`https://www.google.com/maps?q=${olt.latitude},${olt.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                  >
                    <MapPin className="h-2.5 w-2.5" />
                    <span className="truncate">{olt.latitude.toFixed(4)}, {olt.longitude.toFixed(4)}</span>
                  </a>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase mb-0.5">ONUs</div>
                  <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 rounded inline-block">
                    {olt._count?.olt_onu_status || 0}
                  </span>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase mb-0.5">ODC</div>
                  <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 rounded inline-block">
                    {olt._count?.odcs || 0}
                  </span>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase mb-0.5">{t('nav.odp')}</div>
                  <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 rounded inline-block">
                    {olt._count?.odps || 0}
                  </span>
                </div>
              </div>

              {/* Credentials */}
              {(olt.username || olt.password || olt.snmpCommunity || olt.snmp_community) && (
                <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="text-[9px] text-gray-400 uppercase mb-1">Credentials</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {olt.username && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Username:</span>
                        <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{olt.username}</span>
                      </div>
                    )}
                    {olt.password && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Password:</span>
                        <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">••••••</span>
                      </div>
                    )}
                    {(olt.snmpCommunity || olt.snmp_community) && (
                      <div className="col-span-2">
                        <span className="text-gray-500 dark:text-gray-400">SNMP:</span>
                        <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{olt.snmpCommunity || olt.snmp_community}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Model Profile */}
              <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                <div className="text-[9px] text-gray-400 uppercase mb-1">Model Profile</div>
                {olt.model_profile ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                      {olt.model_profile.vendor}
                    </span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                      {olt.model_profile.model}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-400">No profile</span>
                )}
              </div>

              {/* ONU Status - Clickable badges */}
              {olt.onu_stats && (olt.onu_stats.online > 0 || olt.onu_stats.dying_gasp > 0 || olt.onu_stats.los > 0 || olt.onu_stats.unconfig > 0 || olt.onu_stats.offline > 0) && (
                <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="text-[9px] text-gray-400 uppercase mb-1">ONU Status</div>
                  <div className="flex flex-wrap gap-1">
                    {olt.onu_stats.online > 0 && (
                      <Link
                        href={`/admin/network/onus?olt_id=${olt.id}&filter=online`}
                        className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors cursor-pointer"
                        title="View online ONUs"
                      >
                        🟢 {olt.onu_stats.online} Online
                      </Link>
                    )}
                    {olt.onu_stats.dying_gasp > 0 && (
                      <Link
                        href={`/admin/network/onus?olt_id=${olt.id}&filter=dying_gasp`}
                        className="text-[9px] px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer"
                        title="View dying gasp ONUs"
                      >
                        ⚠️ {olt.onu_stats.dying_gasp} Dying Gasp
                      </Link>
                    )}
                    {olt.onu_stats.los > 0 && (
                      <Link
                        href={`/admin/network/onus?olt_id=${olt.id}&filter=los`}
                        className="text-[9px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors cursor-pointer"
                        title="View LOS ONUs"
                      >
                        📡 {olt.onu_stats.los} LOS
                      </Link>
                    )}
                    {olt.onu_stats.unconfig > 0 && (
                      <Link
                        href={`/admin/network/onus?olt_id=${olt.id}&filter=unconfig`}
                        className="text-[9px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
                        title="View unconfigured ONUs"
                      >
                        🔧 {olt.onu_stats.unconfig} Unconfig
                      </Link>
                    )}
                    {olt.onu_stats.offline > 0 && (
                      <Link
                        href={`/admin/network/onus?olt_id=${olt.id}&filter=all`}
                        className="text-[9px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
                        title="View all ONUs"
                      >
                        🔴 {olt.onu_stats.offline} Offline
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Routers */}
              {olt.network_olt_routers && olt.network_olt_routers.length > 0 && (
                <div className="mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="text-[9px] text-gray-400 uppercase mb-1">{t('nav.routers')}</div>
                  <div className="flex flex-wrap gap-1">
                    {olt.network_olt_routers.map((r, idx) => (
                      <span
                        key={r.id}
                        className={`px-1.5 py-0.5 text-[9px] rounded ${
                          idx === 0
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                        }`}
                      >
                        {r.nas?.name || 'Unknown'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-1">
                <Link
                  href={`/admin/network/olt/${olt.id}`}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                  title={t('olt.monitoring.title')}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={() => handleEdit(olt)}
                  className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(olt)}
                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{editingOlt ? t('olt.edit') : t('olt.add')}</h2>
                <p className="text-[10px] text-gray-500">{t('olt.subtitle')}</p>
              </div>
              <button
                onClick={() => { setIsDialogOpen(false); setEditingOlt(null); resetForm(); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('olt.name')} *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="OLT-01"
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('network.ipAddress')} *</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    required
                    placeholder="192.168.1.1"
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('olt.vendor')} *</label>
                  <select
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value, model: '' })}
                    required
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  >
                    <option value="">-- Select Vendor --</option>
                    {[...new Set(oltProfiles.map(p => p.vendor))].sort().map(vendor => (
                      <option key={vendor} value={vendor}>{vendor}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('olt.model')} *</label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    required
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                    disabled={!formData.vendor}
                  >
                    <option value="">-- Select Model --</option>
                    {oltProfiles
                      .filter(p => p.vendor.toLowerCase() === formData.vendor.toLowerCase())
                      .map(p => (
                        <option key={p.id} value={p.model}>{p.model}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {/* Model Profile Helper */}
              {(() => {
                const hasProfiles = oltProfiles.length > 0;
                const matchedProfile = formData.vendor && formData.model
                  ? oltProfiles.find(p => p.vendor.toLowerCase() === formData.vendor.toLowerCase() && p.model.toLowerCase() === formData.model.toLowerCase())
                  : null;
                const vendorModels = formData.vendor
                  ? oltProfiles.filter(p => p.vendor.toLowerCase() === formData.vendor.toLowerCase())
                  : [];

                if (!hasProfiles) {
                  return (
                    <div className="col-span-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">Belum ada Model Profile</p>
                          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                            Buat model profile terlebih dahulu agar OLT dapat dimonitor dengan benar.
                          </p>
                          <Link
                            href="/admin/olt/model-profiles-new/new"
                            target="_blank"
                            className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Buat Model Profile
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (formData.vendor && vendorModels.length === 0) {
                  return (
                    <div className="col-span-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">
                            Vendor "{formData.vendor}" belum memiliki model profile
                          </p>
                          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                            OLT tetap bisa dibuat, namun monitoring tidak akan berjalan optimal tanpa profile.
                          </p>
                          <Link
                            href="/admin/olt/model-profiles-new/new"
                            target="_blank"
                            className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Buat Model Profile untuk {formData.vendor}
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (matchedProfile) {
                  return (
                    <div className="col-span-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="text-[10px] text-green-700 dark:text-green-300">
                            Model profile ditemukan: <strong>{matchedProfile.vendor} {matchedProfile.model}</strong>
                            {matchedProfile.poller_type && (
                              <span className="ml-1 px-1 py-0.5 bg-green-100 dark:bg-green-900/40 rounded text-[9px] uppercase">
                                {matchedProfile.poller_type}
                              </span>
                            )}
                          </span>
                        </div>
                        <Link
                          href={`/admin/olt/model-profiles-new/${matchedProfile.id}`}
                          target="_blank"
                          className="text-[10px] text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-2.5 w-2.5" />
                          Lihat
                        </Link>
                      </div>
                    </div>
                  );
                }

                return null;
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('network.username')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="admin"
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1">{t('network.password')}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1">{t('olt.snmpCommunity')}</label>
                <input
                  type="text"
                  value={formData.snmpCommunity}
                  onChange={(e) => setFormData({ ...formData, snmpCommunity: e.target.value })}
                  placeholder="public"
                  className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.sshEnabled}
                      onChange={(e) => setFormData({ ...formData, sshEnabled: e.target.checked })}
                      className="w-3 h-3 rounded"
                    />
                    <span className="text-xs">{t('olt.sshEnabled')}</span>
                  </label>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.telnetEnabled}
                      onChange={(e) => setFormData({ ...formData, telnetEnabled: e.target.checked })}
                      className="w-3 h-3 rounded"
                    />
                    <span className="text-xs">{t('olt.telnetEnabled')}</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-medium">{t('common.location')} (GPS) *</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="inline-flex items-center px-2 py-0.5 text-[10px] bg-teal-600 text-white rounded"
                    >
                      <Map className="h-2.5 w-2.5 mr-1" />
                      {t('common.openMap')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          showError(t('common.gpsNotAvailable'));
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          (p) => {
                            setFormData({
                              ...formData,
                              latitude: p.coords.latitude.toFixed(6),
                              longitude: p.coords.longitude.toFixed(6),
                            });
                            showSuccess(t('common.gpsSuccess'));
                          },
                          (err) => {
                            console.error('GPS Error:', err);
                            if (err.code === 1) {
                              showError(t('common.gpsPermissionDenied'));
                            } else if (err.code === 2) {
                              showError(t('common.gpsNotAvailable'));
                            } else if (err.code === 3) {
                              showError(t('common.gpsTimeout'));
                            } else {
                              showError(t('common.gpsFailed'));
                            }
                          },
                          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                        );
                      }}
                      className="inline-flex items-center px-2 py-0.5 text-[10px] bg-green-600 text-white rounded"
                    >
                      <MapPin className="h-2.5 w-2.5 mr-1" />
                      {t('common.autoGPS')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    required
                    placeholder={t('olt.latitude')}
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    required
                    placeholder={t('olt.longitude')}
                    className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1">{t('common.status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border dark:border-gray-700 rounded dark:bg-gray-800"
                >
                  <option value="active">{t('common.active')}</option>
                  <option value="inactive">{t('common.inactive')}</option>
                  <option value="maintenance">{t('common.maintenance')}</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1">
                  {t('olt.uploadRouters')}
                </label>
                <div className="border dark:border-gray-700 rounded p-2 max-h-32 overflow-y-auto space-y-1">
                  {routers.length === 0 ? (
                    <p className="text-[10px] text-gray-400">No routers available</p>
                  ) : (
                    routers.map((router) => (
                      <label
                        key={router.id}
                        className="flex items-center gap-2 p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.routerIds.includes(router.id)}
                          onChange={() => toggleRouter(router.id)}
                          className="w-3 h-3 rounded"
                        />
                        <RouterIcon className="h-3 w-3 text-gray-500" />
                        <span className="text-xs">{router.name}</span>
                        <span className="text-[10px] text-gray-400">({router.ipAddress})</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-[9px] text-gray-500 mt-1">
                  First selected = Primary uplink
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followRoad"
                  checked={formData.followRoad}
                  onChange={(e) => setFormData({ ...formData, followRoad: e.target.checked })}
                  className="w-3 h-3 rounded"
                />
                <label htmlFor="followRoad" className="text-xs">
                  Follow road path on map
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-800">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !formData.ipAddress}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {testingConnection ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                      </svg>
                      Test Connection
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsDialogOpen(false); setEditingOlt(null); resetForm(); }}
                  className="px-3 py-1.5 text-xs border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded"
                >
                  {editingOlt ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map Picker */}
      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={(lat, lng) => {
          setFormData({
            ...formData,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
          });
        }}
        initialLat={formData.latitude ? parseFloat(formData.latitude) : undefined}
        initialLng={formData.longitude ? parseFloat(formData.longitude) : undefined}
      />

      {/* Import Dialog */}
      {isImportDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md border border-gray-200 dark:border-gray-800">
            <div className="p-4 border-b dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Import OLT from Excel</h2>
              <button
                onClick={() => setIsImportDialogOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Download template Excel terlebih dahulu, lalu isi data OLT sesuai format yang sudah ditentukan.
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download Template Excel
                </button>
              </div>

              <div className="border-t dark:border-gray-800 pt-4">
                <label className="block text-xs font-medium mb-2">Upload Excel File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  disabled={importing}
                  className="w-full text-xs border dark:border-gray-700 rounded p-2 dark:bg-gray-800"
                />
                {importing && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                    <span>Importing...</span>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <p className="text-[10px] text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                  ⚠️ Important Notes:
                </p>
                <ul className="text-[10px] text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>Type must be: huawei, zte, fiberhome, nokia, or other</li>
                  <li>IP address must be unique and valid format</li>
                  <li>Coordinates are optional (latitude: -90 to 90, longitude: -180 to 180)</li>
                  <li>Duplicate OLT names or IPs will be skipped</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
