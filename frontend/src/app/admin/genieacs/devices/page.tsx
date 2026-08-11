'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { Server, RefreshCw, Wifi, WifiOff, Search, Loader2, Power, Trash2, Eye, Settings2, CheckCircle, XCircle, RotateCcw, X, Globe, Network, Activity, Smartphone, Monitor, Radio, Edit, Save, Lock, Signal, Thermometer, Info, Shield, List, Copy, ChevronDown, ChevronRight, Zap, Code2, Square, CheckSquare } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
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

interface WANConnection {
  wanDeviceIndex: number;
  wanConnectionDeviceIndex: number;
  connectionIndex: number;
  connectionType: 'PPPoE' | 'IP' | 'Unknown';
  path: string;
  name: string;
  enable: boolean;
  connectionStatus: string;
  externalIPAddress: string;
  username: string;
  password: string;
  macAddress: string;
  dnsServers: string;
  vlanId: string;
  serviceList: string;
}

interface WLANConfig {
  index: number;
  ssid: string;
  enabled: boolean;
  channel: string;
  standard: string;
  security: string;
  password: string;
  band: string;
  totalAssociations: number;
}

interface ConnectedHost {
  hostName: string;
  ipAddress: string;
  macAddress: string;
  interfaceType: string;
  active: boolean;
  layer2Interface: string;
  ssidIndex: number;
  rssi?: number;
  mode?: string;
  ssidName?: string;
}

interface DeviceDetail {
  _id: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  oui: string;
  pppoeUsername: string;
  pppoeIP: string;
  tr069IP: string;
  rxPower: string;
  txPower: string;
  ponMode: string;
  uptime: string;
  status: string;
  lastInform: string | null;
  macAddress: string;
  softwareVersion: string;
  hardwareVersion: string;
  temp: string;
  voltage: string;
  biasCurrent: string;
  lanIP: string;
  lanSubnet: string;
  dhcpEnabled: string;
  dhcpStart: string;
  dhcpEnd: string;
  dns1: string;
  memoryFree: string;
  memoryTotal: string;
  cpuUsage: string;
  wlanConfigs: WLANConfig[];
  wanConnections: WANConnection[];
  connectedDevices: ConnectedHost[];
  totalConnected: number;
  isDualBand: boolean;
  tags: string[];
}

export default function GenieACSDevicesPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [devices, setDevices] = useState<GenieACSDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);

  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Parameter Browser Modal
  const [showParamBrowser, setShowParamBrowser] = useState(false);
  const [paramBrowserData, setParamBrowserData] = useState<{path:string;value:string;type:string;writable:boolean}[]>([]);
  const [loadingParams, setLoadingParams] = useState(false);
  const [paramSearch, setParamSearch] = useState('');
  const [paramExpandedPrefixes, setParamExpandedPrefixes] = useState<Set<string>>(new Set(['InternetGatewayDevice', 'Device', 'VirtualParameters']));
  const [paramSelected, setParamSelected] = useState<Set<string>>(new Set());
  const [showGenModal, setShowGenModal] = useState(false);
  const [genTarget, setGenTarget] = useState<'vp' | 'provision'>('vp');
  const [genScript, setGenScript] = useState('');
  const [genName, setGenName] = useState('');
  const [genSaving, setGenSaving] = useState(false);

  // Edit/Add WiFi Modal
  const [showEditWifiModal, setShowEditWifiModal] = useState(false);
  const [wifiModalMode, setWifiModalMode] = useState<'edit' | 'add'>('edit');
  const [editWifiData, setEditWifiData] = useState({
    deviceId: '',
    wlanIndex: 1,
    ssid: '',
    password: '',
    enabled: true,
    securityMode: 'WPA2-PSK',
    band: '2.4GHz',
    channel: '',
  });
  const [savingWifi, setSavingWifi] = useState(false);

  // WAN Config state
  const [showWanModal, setShowWanModal] = useState(false);
  const [wanModalMode, setWanModalMode] = useState<'edit' | 'add'>('edit');
  const [editWanData, setEditWanData] = useState<{
    connectionPath: string;
    connectionType: string;
    name: string;
    username: string;
    password: string;
    enable: boolean;
    natEnabled: boolean;
    currentIP: string;
    vlanId: string;
    vlanPriority: string;
    serviceList: string;
    wanDeviceIndex: number;
    wanConnectionDeviceIndex: number;
  }>({ connectionPath: '', connectionType: 'PPPoE', name: '', username: '', password: '', enable: true, natEnabled: true, currentIP: '', vlanId: '', vlanPriority: '0', serviceList: 'INTERNET', wanDeviceIndex: 1, wanConnectionDeviceIndex: 1 });
  const [savingWan, setSavingWan] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const [devicesRes, settingsRes] = await Promise.all([
        fetch('/api/settings/genieacs/devices'),
        fetch('/api/settings/genieacs')
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setIsConfigured(!!data?.settings?.host);
      }

      if (devicesRes.ok) {
        const data = await devicesRes.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  };

  const handleReboot = async (deviceId: string) => {
    if (!await confirm({
      title: t('genieacs.rebootDevice'),
      message: t('genieacs.rebootWarning'),
      confirmText: t('genieacs.yesReboot'),
      cancelText: t('common.cancel'),
      variant: 'warning',
    })) return;
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/reboot`, { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.rebootSent'), duration: 3000 });
      } else {
        throw new Error(data.error || t('genieacs.failedSendCommand'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedSendCommand');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    }
  };

  // Force connection request to execute pending tasks
  const handleForceSync = async (deviceId: string) => {
    try {
      const response = await fetch(`/api/genieacs/devices/${encodeURIComponent(deviceId)}/connection-request`, {
        method: 'POST'
      });
      const data = await response.json();

      if (response.ok && data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.connectionRequestSent'), duration: 3000 });
        setTimeout(() => handleRefresh(), 3000);
      } else {
        throw new Error(data.error || t('genieacs.failedSyncDevice'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedSyncDevice');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (!await confirm({
      title: t('genieacs.deleteDevice'),
      message: t('genieacs.deleteDeviceWarning'),
      confirmText: t('common.yesDelete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
      if (response.ok) {
        setDevices(devices.filter(d => d._id !== deviceId));
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.deviceDeleted'), duration: 2000 });
      } else {
        throw new Error(t('genieacs.failedDeleteDevice'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedDeleteDevice');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    }
  };

  const handleRefreshParameters = async (deviceId: string, serialNumber: string) => {
    if (!await confirm({
      title: t('genieacs.refreshParameters'),
      message: t('genieacs.refreshParametersConfirm').replace('{serial}', serialNumber),
      confirmText: t('common.yesRefresh'),
      cancelText: t('common.cancel'),
      variant: 'info',
    })) return;
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/refresh`, { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.refreshTaskSent'), duration: 2000 });
        setTimeout(() => handleRefresh(), 2000);
      } else {
        throw new Error(data.error || t('genieacs.failedSendTask'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedSendRefresh');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    }
  };

  const handleViewDetail = async (deviceId: string) => {
    setLoadingDetail(true);
    setShowDetailModal(true);
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/detail`);
      const data = await response.json();
      if (response.ok && data.success && data.device) {
        setSelectedDevice(data.device);
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || t('genieacs.failedGetDetail') });
        setShowDetailModal(false);
      }
    } catch (error) {
      console.error('Error fetching device detail:', error);
      addToast({ type: 'error', title: t('common.error'), description: t('genieacs.failedGetDetail') });
      setShowDetailModal(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedDevice(null);
  };

  const handleBrowseParameters = async (deviceId: string) => {
    setLoadingParams(true);
    setShowParamBrowser(true);
    setParamSearch('');
    setParamBrowserData([]);
    try {
      const res = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/parameters`);
      const data = await res.json();
      if (data.success) {
        setParamBrowserData(data.parameters);
      } else {
        addToast({ type: 'error', title: t('common.error'), description: data.error || 'Failed to load parameters' });
        setShowParamBrowser(false);
      }
    } catch {
      addToast({ type: 'error', title: t('common.error'), description: 'Failed to load parameters' });
      setShowParamBrowser(false);
    } finally {
      setLoadingParams(false);
    }
  };

  // Open Edit WiFi Modal
  const openEditWifiModal = (deviceId: string, wlan?: WLANConfig) => {
    setWifiModalMode('edit');
    setEditWifiData({
      deviceId,
      wlanIndex: wlan?.index || 1,
      ssid: wlan?.ssid || '',
      password: '',  // Always start empty for security
      enabled: wlan?.enabled ?? true,
      securityMode: wlan?.security && !wlan.security.toLowerCase().includes('none') ? wlan.security : 'WPA2-PSK',
      band: wlan?.band || '2.4GHz',
      channel: wlan?.channel !== '-' ? (wlan?.channel || '') : '',
    });
    setShowEditWifiModal(true);
  };

  const openAddWifiModal = (deviceId: string) => {
    setWifiModalMode('add');
    setEditWifiData({
      deviceId,
      wlanIndex: 1,
      ssid: '',
      password: '',
      enabled: true,
      securityMode: 'WPA2-PSK',
      band: '2.4GHz',
      channel: '',
    });
    setShowEditWifiModal(true);
  };

  const closeEditWifiModal = () => {
    setShowEditWifiModal(false);
    setEditWifiData({
      deviceId: '',
      wlanIndex: 1,
      ssid: '',
      password: '',
      enabled: true,
      securityMode: 'WPA2-PSK',
      band: '2.4GHz',
      channel: '',
    });
  };

  // Handle WLAN Index Change - Load data untuk WLAN yang dipilih
  const handleWlanIndexChange = (newIndex: number) => {
    const wlan = selectedDevice?.wlanConfigs?.find(w => w.index === newIndex);
    if (wlan) {
      setEditWifiData({
        ...editWifiData,
        wlanIndex: newIndex,
        ssid: wlan.ssid || '',
        password: '', // Always clear password for security
        enabled: wlan.enabled ?? true,
        securityMode: wlan.security && !wlan.security.toLowerCase().includes('none') ? wlan.security : 'WPA2-PSK',
        band: wlan.band || '2.4GHz',
      });
    } else {
      // Fallback jika data WLAN tidak ditemukan
      setEditWifiData({
        ...editWifiData,
        wlanIndex: newIndex,
        ssid: '',
        password: '',
        enabled: true
      });
    }
  };

  // Save WiFi Config
  const handleSaveWifi = async () => {
    // Validation
    if (!editWifiData.ssid || editWifiData.ssid.length < 1 || editWifiData.ssid.length > 32) {
      addToast({ type: 'warning', title: t('genieacs.validationTitle'), description: t('genieacs.ssidLength') });
      return;
    }

    const trimmedPassword = (editWifiData.password || '').trim();
    const isOpen = editWifiData.securityMode === 'None';

    // Password validation for secured networks
    if (!isOpen) {
      if (wifiModalMode === 'add' && trimmedPassword.length < 8) {
        addToast({ type: 'warning', title: 'Password diperlukan', description: 'Password WiFi harus minimal 8 karakter untuk jaringan terenkripsi' });
        return;
      }
      if (trimmedPassword.length > 0 && trimmedPassword.length < 8) {
        addToast({ type: 'warning', title: t('genieacs.passwordValidation'), description: `${t('genieacs.passwordLength')} (${t('genieacs.currentPasswordLength').replace('{length}', String(trimmedPassword.length))})` });
        return;
      }
    }

    if (!await confirm({
      title: wifiModalMode === 'add' ? 'Add New SSID' : t('genieacs.updateWifiConfig'),
      message: wifiModalMode === 'add'
        ? `SSID: ${editWifiData.ssid} | Band: ${editWifiData.band} | Security: ${editWifiData.securityMode}`
        : `SSID: ${editWifiData.ssid} | WLAN Index: ${editWifiData.wlanIndex}`,
      confirmText: t('common.yesUpdate'),
      cancelText: t('common.cancel'),
      variant: 'info',
    })) return;

    setSavingWifi(true);
    try {
      const isAddMode = wifiModalMode === 'add';
      const response = await fetch(`/api/genieacs/devices/${encodeURIComponent(editWifiData.deviceId)}/wifi`, {
        method: isAddMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAddMode ? {
          ssid: editWifiData.ssid,
          password: trimmedPassword.length > 0 ? trimmedPassword : undefined,
          enabled: editWifiData.enabled,
          securityMode: editWifiData.securityMode,
          band: editWifiData.band,
          channel: editWifiData.channel ? parseInt(editWifiData.channel) : undefined,
        } : {
          wlanIndex: editWifiData.wlanIndex,
          ssid: editWifiData.ssid,
          password: trimmedPassword.length > 0 ? trimmedPassword : undefined,
          enabled: editWifiData.enabled,
          securityMode: editWifiData.securityMode,
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const isExecuted = data.taskStatus && data.taskStatus !== 'pending';
        addToast({
          type: isExecuted ? 'success' : 'info',
          title: isExecuted ? t('common.success') : t('genieacs.taskSent'),
          description: data.message || t('genieacs.wifiConfigSent'),
          duration: isExecuted ? 3000 : 5000,
        });
        if (!isExecuted && !isAddMode) {
          setTimeout(() => { window.location.href = '/admin/genieacs/tasks'; }, 3000);
        }
        closeEditWifiModal();
        if (selectedDevice) {
          setTimeout(() => handleViewDetail(selectedDevice._id), isExecuted ? 3000 : 5000);
        }
      } else {
        throw new Error(data.error || 'Gagal update WiFi config');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacs.failedUpdateWifi');
      addToast({ type: 'error', title: t('common.error'), description: msg });
    } finally {
      setSavingWifi(false);
    }
  };

  const openEditWanModal = (wan: WANConnection) => {
    setWanModalMode('edit');
    setEditWanData({
      connectionPath: wan.path,
      connectionType: wan.connectionType,
      name: wan.name,
      username: wan.username !== '-' ? wan.username : '',
      password: '',
      enable: wan.enable,
      natEnabled: true,
      currentIP: wan.externalIPAddress,
      vlanId: wan.vlanId !== '-' ? wan.vlanId : '',
      vlanPriority: '0',
      serviceList: wan.serviceList !== '-' ? wan.serviceList : 'INTERNET',
      wanDeviceIndex: wan.wanDeviceIndex,
      wanConnectionDeviceIndex: wan.wanConnectionDeviceIndex,
    });
    setShowWanModal(true);
  };

  const openAddWanModal = () => {
    setWanModalMode('add');
    setEditWanData({ connectionPath: '', connectionType: 'PPPoE', name: '', username: '', password: '', enable: true, natEnabled: true, currentIP: '', vlanId: '', vlanPriority: '0', serviceList: 'INTERNET', wanDeviceIndex: 1, wanConnectionDeviceIndex: 1 });
    setShowWanModal(true);
  };

  const handleSaveWan = async () => {
    if (!selectedDevice) return;
    if (!await confirm({
      title: wanModalMode === 'add' ? 'Add WAN Connection' : 'Update WAN Configuration',
      message: wanModalMode === 'add' ? `Type: ${editWanData.connectionType} | VLAN: ${editWanData.vlanId || 'untagged'} | Service: ${editWanData.serviceList}` : `Connection: ${editWanData.name}`,
      confirmText: t('common.yesUpdate'),
      cancelText: t('common.cancel'),
      variant: 'info',
    })) return;

    setSavingWan(true);
    try {
      if (wanModalMode === 'add') {
        const body: Record<string, unknown> = {
          wanDeviceIndex: editWanData.wanDeviceIndex,
          wanConnectionDeviceIndex: editWanData.wanConnectionDeviceIndex,
          connectionType: editWanData.connectionType,
          name: editWanData.name,
          enable: editWanData.enable,
          natEnabled: editWanData.natEnabled,
          serviceList: editWanData.serviceList,
        };
        if (editWanData.vlanId) { body.vlanId = editWanData.vlanId; body.vlanPriority = editWanData.vlanPriority; }
        if (editWanData.connectionType === 'PPPoE') { body.username = editWanData.username; body.password = editWanData.password; }
        const res = await fetch(`/api/genieacs/devices/${encodeURIComponent(selectedDevice._id)}/wan`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          addToast({ type: 'success', title: 'WAN Added', description: data.message || 'WAN connection added', duration: 4000 });
          setShowWanModal(false);
          setTimeout(() => handleViewDetail(selectedDevice._id), 3000);
        } else { throw new Error(data.error || 'Failed to add WAN'); }
      } else {
        const body: Record<string, unknown> = {
          connectionPath: editWanData.connectionPath,
          connectionType: editWanData.connectionType,
          enable: editWanData.enable,
          natEnabled: editWanData.natEnabled,
          vlanId: editWanData.vlanId,
          vlanPriority: editWanData.vlanPriority,
          serviceList: editWanData.serviceList,
        };
        if (editWanData.connectionType === 'PPPoE') { if (editWanData.username) body.username = editWanData.username; if (editWanData.password) body.password = editWanData.password; }
        const res = await fetch(`/api/genieacs/devices/${encodeURIComponent(selectedDevice._id)}/wan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          addToast({ type: 'success', title: t('common.success'), description: data.message || 'WAN config updated', duration: 4000 });
          setShowWanModal(false);
          setTimeout(() => handleViewDetail(selectedDevice._id), 3000);
        } else { throw new Error(data.error || 'Failed to update WAN'); }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update WAN config';
      addToast({ type: 'error', title: t('common.error'), description: msg });
    } finally {
      setSavingWan(false);
    }
  };

  const handleDeleteWan = async (wan: WANConnection) => {
    if (!selectedDevice) return;
    if (!await confirm({
      title: 'Delete WAN Connection',
      message: `Delete: ${wan.name}? This action cannot be undone.`,
      confirmText: 'Yes, Delete',
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) return;
    try {
      const res = await fetch(`/api/genieacs/devices/${encodeURIComponent(selectedDevice._id)}/wan`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionPath: wan.path }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast({ type: 'success', title: 'WAN Deleted', description: data.message, duration: 3000 });
        setTimeout(() => handleViewDetail(selectedDevice._id), 2000);
      } else { throw new Error(data.error || 'Failed to delete WAN'); }
    } catch (error: unknown) {
      addToast({ type: 'error', title: t('common.error'), description: error instanceof Error ? error.message : 'Failed to delete WAN' });
    }
  };

  const InfoRow = ({ label, value, highlight = false }: { label: string; value: string | null | undefined; highlight?: boolean }) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-medium ${highlight ? 'text-primary' : 'text-foreground'}`}>
        {value || '-'}
      </span>
    </div>
  );

  const filteredDevices = devices.filter(d =>
    d.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
    d.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
    d.model?.toLowerCase().includes(search.toLowerCase()) ||
    d.pppoeUsername?.toLowerCase().includes(search.toLowerCase()) ||
    d.pppoeIP?.toLowerCase().includes(search.toLowerCase()) ||
    d.tr069IP?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = devices.filter(d => d.status === 'Online').length;
  const offlineCount = devices.filter(d => d.status === 'Offline').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="bg-background relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
          <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>
        <div className="relative z-10 space-y-6">
          <div className="space-y-4">
            {/* Header */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-3">
                <Server className="w-6 h-6 text-[#00f7ff]" />
                <div>
                  <span>{t('genieacs.devicesTitle')}</span>
                </div>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('genieacs.devicesSubtitle')}</p>
            </div>

            {/* Not Configured */}
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-warning/20 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <Info className="w-8 h-8 text-warning" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">{t('genieacs.notConfigured')}</h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-4">
                {t('genieacs.configureFirst')}
              </p>
              <Link
                href="/admin/settings/genieacs"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                {t('genieacs.openSettings')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div>
        <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      </div>
      <div className="relative z-10 space-y-6">
        <div className="space-y-3">
          {/* Header */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
              <Server className="w-6 h-6 text-[#00f7ff]" />
              <div>
                <span>{t('genieacs.devicesTitle')}</span>
              </div>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('common.manageCpe')}</p>
            <div className="mt-2">
              <Link
                href="/admin/settings/genieacs"
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-white/20 hover:bg-white/30 rounded transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                {t('genieacs.settings')}
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/20 dark:bg-blue-900/30 flex items-center justify-center">
                  <Server className="w-3 h-3 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('common.total')}</p>
                  <p className="text-sm font-semibold">{devices.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-success/20 dark:bg-green-900/30 flex items-center justify-center">
                  <Wifi className="w-3 h-3 text-success" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('common.online')}</p>
                  <p className="text-sm font-semibold text-success">{onlineCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-destructive/20 dark:bg-red-900/30 flex items-center justify-center">
                  <WifiOff className="w-3 h-3 text-destructive" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('common.offline')}</p>
                  <p className="text-sm font-semibold text-destructive">{offlineCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Devices Table */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Search & Actions */}
            <div className="p-3 border-b border-border">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('genieacs.searchDevices')}
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded-lg bg-card focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                  {t('common.refresh')}
                </button>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3 p-3">
              {filteredDevices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">{t('genieacs.noDevices')}</p>
                </div>
              ) : (
                filteredDevices.map((device) => (
                  <div key={device._id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{device.serialNumber || '-'}</p>
                        <p className="text-[10px] text-muted-foreground">{device.manufacturer || '-'} &middot; {device.model || '-'}</p>
                      </div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ml-2 ${
                        device.status === 'Online'
                          ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success'
                          : 'bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive'
                      }`}>
                        {device.status === 'Online' ? t('common.online') : t('common.offline')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-2">
                      <div>
                        <span className="text-muted-foreground">{t('genieacs.ipTr069')}</span>
                        <p className="font-mono text-[10px] text-muted-foreground">{device.tr069IP || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">PPPoE</span>
                        <p className="text-primary text-xs">{device.pppoeUsername || '-'}</p>
                        {device.pppoeIP && device.pppoeIP !== '-' && (
                          <p className="text-[10px] text-muted-foreground">{device.pppoeIP}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('genieacs.ponMode')}</span>
                        <p>
                          {device.ponMode && device.ponMode !== '-' ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-info/10 text-info rounded">{device.ponMode}</span>
                          ) : <span className="text-xs">-</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('genieacs.rxPower')}</span>
                        <p>
                          {device.rxPower && device.rxPower !== '-' ? (
                            <span className={`font-medium text-xs ${parseFloat(device.rxPower) > -25 ? 'text-success' : parseFloat(device.rxPower) > -28 ? 'text-warning' : 'text-destructive'}`}>
                              {device.rxPower} dBm
                            </span>
                          ) : <span className="text-xs">-</span>}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">{t('common.uptime')}</span>
                        <p className="text-xs text-muted-foreground">{device.uptime || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleViewDetail(device._id)}
                        className="flex-1 p-2 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t('common.details')}
                      </button>
                      <button
                        onClick={() => handleRefreshParameters(device._id, device.serialNumber)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Refresh Parameter"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleReboot(device._id)}
                        className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                        title="Reboot Device"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(device._id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Hapus Device"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('genieacs.serialNumber')}</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('common.model')}</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('genieacs.ipTr069')}</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">PPPoE</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('genieacs.ponMode')}</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('genieacs.rxPower')}</th>
                    <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('common.uptime')}</th>
                    <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('common.status')}</th>
                    <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase whitespace-nowrap">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">
                        <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{t('genieacs.noDevices')}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{t('genieacs.devicesWillAppear')}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => (
                      <tr key={device._id} className="border-b border-border hover:bg-muted/50/50">
                        <td className="py-2 px-2">
                          <div>
                            <p className="font-medium text-foreground">{device.serialNumber || '-'}</p>
                            <p className="text-[10px] text-muted-foreground">{device.manufacturer || '-'}</p>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground dark:text-muted-foreground whitespace-nowrap">{device.model || '-'}</td>
                        <td className="py-2 px-2 font-mono text-[10px] text-muted-foreground dark:text-muted-foreground whitespace-nowrap">{device.tr069IP || '-'}</td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div>
                            <p className="text-primary dark:text-primary">{device.pppoeUsername || '-'}</p>
                            {device.pppoeIP && device.pppoeIP !== '-' && (
                              <p className="text-[10px] text-muted-foreground">{device.pppoeIP}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          {device.ponMode && device.ponMode !== '-' ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-info/10 text-info rounded">
                              {device.ponMode}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          {device.rxPower && device.rxPower !== '-' ? (
                            <span className={`font-medium ${parseFloat(device.rxPower) > -25 ? 'text-success' : parseFloat(device.rxPower) > -28 ? 'text-warning' : 'text-destructive'}`}>
                              {device.rxPower} dBm
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground dark:text-muted-foreground whitespace-nowrap">{device.uptime || '-'}</td>
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${device.status === 'Online'
                            ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success'
                            : 'bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive'
                            }`}>
                            {device.status === 'Online' ? t('common.online') : t('common.offline')}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => handleViewDetail(device._id)}
                              className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"
                              title={t('common.details')}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRefreshParameters(device._id, device.serialNumber)}
                              className="p-1.5 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded transition-colors"
                              title={t('genieacs.refreshParameters')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleReboot(device._id)}
                              className="p-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors"
                              title={t('common.reboot')}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(device._id)}
                              className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Device Detail Modal */}
          {showDetailModal && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden mx-4">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-primary to-violet-500 p-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    <div>
                      <h2 className="text-sm font-semibold">{t('genieacs.deviceDetail')}</h2>
                      {selectedDevice && (
                        <p className="text-[10px] text-violet-200">{selectedDevice.serialNumber} - {selectedDevice.model}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDevice && (
                      <>
                        {selectedDevice.isDualBand && (
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent/100">
                            {t('genieacs.dualBand')}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${selectedDevice.status === 'Online' ? 'bg-success/100' : 'bg-destructive/100'}`}>
                          {selectedDevice.status === 'Online' ? t('common.online') : t('common.offline')}
                        </span>
                      </>
                    )}
                    <button onClick={closeDetailModal} className="p-1 hover:bg-white/10 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : selectedDevice ? (
                    <div className="space-y-4">
                      {/* Quick Actions */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleForceSync(selectedDevice._id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-blue-600 hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {t('genieacs.forceSync')}
                        </button>
                        <button
                          onClick={() => handleRefreshParameters(selectedDevice._id, selectedDevice.serialNumber)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t('genieacs.refreshParameters')}
                        </button>
                        <button
                          onClick={() => handleReboot(selectedDevice._id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                        >
                          <Power className="w-3 h-3" />
                          {t('common.reboot')}
                        </button>
                        {selectedDevice.wlanConfigs && selectedDevice.wlanConfigs.length > 0 && (
                          <button
                            onClick={() => openEditWifiModal(selectedDevice._id, selectedDevice.wlanConfigs[0])}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                          >
                            <Edit className="w-3 h-3" />
                            {t('genieacs.editWifi')}
                          </button>
                        )}
                        <button
                          onClick={() => selectedDevice && openAddWifiModal(selectedDevice._id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 border border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-lg transition-colors"
                        >
                          <Wifi className="w-3 h-3" />
                          Add SSID
                        </button>
                        <button
                          onClick={() => handleBrowseParameters(selectedDevice._id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                        >
                          <List className="w-3 h-3" />
                          Browse All Parameters
                        </button>
                        <button
                          onClick={openAddWanModal}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 border border-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                        >
                          <Globe className="w-3 h-3" />
                          Add WAN
                        </button>
                      </div>

                      {/* Main Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Device Information */}
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center gap-2 p-2 bg-muted border-b border-border">
                            <Server className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-semibold text-foreground">{t('genieacs.deviceInformation')}</span>
                          </div>
                          <div className="p-3">
                            <InfoRow label={t('genieacs.serialNumber')} value={selectedDevice.serialNumber} />
                            <InfoRow label={t('genieacs.productClass')} value={selectedDevice.model} />
                            <InfoRow label={t('genieacs.oui')} value={selectedDevice.oui} />
                            <InfoRow label={t('genieacs.manufacturer')} value={selectedDevice.manufacturer} />
                            <InfoRow label={t('genieacs.hardwareVersion')} value={selectedDevice.hardwareVersion} />
                            <InfoRow label={t('genieacs.softwareVersion')} value={selectedDevice.softwareVersion} />
                            <InfoRow label={t('genieacs.macAddress')} value={selectedDevice.macAddress} />
                          </div>
                        </div>

                        {/* Connection Info */}
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center gap-2 p-2 bg-muted border-b border-border">
                            <Globe className="w-3.5 h-3.5 text-success" />
                            <span className="text-xs font-semibold text-foreground">{t('genieacs.connectionInfo')}</span>
                          </div>
                          <div className="p-3">
                            <InfoRow label={t('genieacs.pppoeUsername')} value={selectedDevice.pppoeUsername} highlight />
                            <InfoRow label={t('genieacs.pppoeIp')} value={selectedDevice.pppoeIP} highlight />
                            <InfoRow label={t('genieacs.tr069Ip')} value={selectedDevice.tr069IP} />
                            <InfoRow label={t('common.uptime')} value={selectedDevice.uptime} />
                            <InfoRow label={t('genieacs.lastInform')} value={selectedDevice.lastInform ? formatWIB(selectedDevice.lastInform, 'dd/MM/yyyy HH:mm') : '-'} />
                            <InfoRow label={t('genieacs.dns')} value={selectedDevice.dns1} />
                          </div>
                        </div>

                        {/* Optical Info */}
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center gap-2 p-2 bg-muted border-b border-border">
                            <Activity className="w-3.5 h-3.5 text-accent" />
                            <span className="text-xs font-semibold text-foreground">{t('genieacs.opticalInfo')}</span>
                          </div>
                          <div className="p-3">
                            <InfoRow label={t('genieacs.ponMode')} value={selectedDevice.ponMode} />
                            <div className="flex justify-between py-1.5 border-b border-border">
                              <span className="text-[11px] text-muted-foreground">{t('genieacs.rxPower')}</span>
                              <span className={`text-[11px] font-medium ${selectedDevice.rxPower && selectedDevice.rxPower !== '-'
                                ? parseFloat(selectedDevice.rxPower) > -25 ? 'text-success' : parseFloat(selectedDevice.rxPower) > -28 ? 'text-warning' : 'text-destructive'
                                : 'text-foreground'
                                }`}>
                                {selectedDevice.rxPower && selectedDevice.rxPower !== '-' ? `${selectedDevice.rxPower} dBm` : '-'}
                              </span>
                            </div>
                            <InfoRow label={t('genieacs.txPower')} value={selectedDevice.txPower && selectedDevice.txPower !== '-' ? `${selectedDevice.txPower} dBm` : '-'} />
                            <InfoRow label={t('genieacs.temperature')} value={selectedDevice.temp && selectedDevice.temp !== '-' ? `${selectedDevice.temp}°C` : '-'} />
                            <InfoRow label={t('genieacs.voltage')} value={selectedDevice.voltage && selectedDevice.voltage !== '-' ? `${selectedDevice.voltage} V` : '-'} />
                          </div>
                        </div>

                        {/* LAN Info */}
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center gap-2 p-2 bg-muted border-b border-border">
                            <Network className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-semibold text-foreground">{t('genieacs.lanInfo')}</span>
                          </div>
                          <div className="p-3">
                            <InfoRow label={t('genieacs.lanIp')} value={selectedDevice.lanIP} />
                            <InfoRow label={t('genieacs.subnetMask')} value={selectedDevice.lanSubnet} />
                            <InfoRow label={t('genieacs.dhcpEnabled')} value={selectedDevice.dhcpEnabled === 'true' || selectedDevice.dhcpEnabled === '1' ? t('common.yes') : selectedDevice.dhcpEnabled === 'false' || selectedDevice.dhcpEnabled === '0' ? t('common.no') : '-'} />
                            <InfoRow label={t('genieacs.dhcpRange')} value={selectedDevice.dhcpStart && selectedDevice.dhcpEnd && selectedDevice.dhcpStart !== '-' ? `${selectedDevice.dhcpStart} - ${selectedDevice.dhcpEnd}` : '-'} />
                          </div>
                        </div>
                      </div>

                      {/* WiFi SSIDs */}
                      {selectedDevice.wlanConfigs && selectedDevice.wlanConfigs.length > 0 && (
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center justify-between p-2 bg-muted border-b border-border">
                            <div className="flex items-center gap-2">
                              <Radio className="w-3.5 h-3.5 text-info" />
                              <span className="text-xs font-semibold text-foreground">{t('genieacs.wifiNetworks')} ({selectedDevice.wlanConfigs.length})</span>
                              <span className="text-[10px] text-muted-foreground">{selectedDevice.totalConnected} {t('genieacs.devicesConnected')}</span>
                            </div>
                            <button
                              onClick={() => openAddWifiModal(selectedDevice._id)}
                              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300 border border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded transition-colors"
                            >
                              + Add SSID
                            </button>
                          </div>
                          <div className="p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {selectedDevice.wlanConfigs.map((wlan, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${wlan.enabled ? 'bg-success/20 dark:bg-green-900/30' : 'bg-muted'}`}>
                                      <Wifi className={`w-3 h-3 ${wlan.enabled ? 'text-success' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-foreground">{wlan.ssid || '-'}</p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {wlan.band} • Ch {wlan.channel !== '-' ? wlan.channel : t('common.auto')} • {wlan.security || t('common.open')}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${wlan.enabled ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success' : 'bg-gray-200 text-muted-foreground dark:bg-inputdark:text-muted-foreground'}`}>
                                        {wlan.enabled ? t('common.on') : t('common.off')}
                                      </span>
                                      {wlan.totalAssociations > 0 && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{wlan.totalAssociations} {t('genieacs.connected')}</p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => openEditWifiModal(selectedDevice._id, wlan)}
                                      className="p-1 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded transition-colors"
                                      title={t('genieacs.editWifi')}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* WAN Connections */}
                      {selectedDevice.wanConnections && selectedDevice.wanConnections.length > 0 && (
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center justify-between p-2 bg-muted border-b border-border">
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-success" />
                              <span className="text-xs font-semibold text-foreground">WAN Connections ({selectedDevice.wanConnections.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">{selectedDevice.wanConnections.filter(w => w.enable).length} enabled</span>
                              <button onClick={openAddWanModal} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300 border border-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors">
                                + Add WAN
                              </button>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            {selectedDevice.wanConnections.map((wan, idx) => (
                              <div key={idx} className="p-2 bg-muted rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${wan.enable && wan.connectionStatus === 'Connected' ? 'bg-success/20 dark:bg-green-900/30' : wan.enable ? 'bg-warning/20' : 'bg-muted'}`}>
                                      <Globe className={`w-3 h-3 ${wan.enable && wan.connectionStatus === 'Connected' ? 'text-success' : wan.enable ? 'text-warning' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-xs font-medium text-foreground">{wan.name}</p>
                                        <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${wan.connectionType === 'PPPoE' ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'}`}>{wan.connectionType}</span>
                                        {wan.serviceList && wan.serviceList !== '-' && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-orange-500/20 text-orange-400">{wan.serviceList}</span>}
                                        {wan.vlanId && wan.vlanId !== '-' && <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-cyan-500/20 text-cyan-400">VLAN {wan.vlanId}</span>}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {wan.username && wan.username !== '-' ? `User: ${wan.username}` : ''}
                                        {wan.externalIPAddress && wan.externalIPAddress !== '-' ? (wan.username && wan.username !== '-' ? ` • ` : '') + `IP: ${wan.externalIPAddress}` : ''}
                                        {wan.connectionStatus && wan.connectionStatus !== '-' ? ` • ${wan.connectionStatus}` : ''}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground font-mono break-all mt-0.5 opacity-60">{wan.path}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${wan.enable ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success' : 'bg-gray-200 text-muted-foreground dark:bg-input dark:text-muted-foreground'}`}>
                                      {wan.enable ? 'Enabled' : 'Disabled'}
                                    </span>
                                    <button onClick={() => openEditWanModal(wan)} className="p-1 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded transition-colors" title="Edit WAN">
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => handleDeleteWan(wan)} className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors" title="Delete WAN">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Connected Devices */}
                      {selectedDevice.connectedDevices && selectedDevice.connectedDevices.length > 0 && (
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="flex items-center justify-between p-2 bg-muted border-b border-border">
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs font-semibold text-foreground">{t('genieacs.connectedDevices')} ({selectedDevice.connectedDevices.length})</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{selectedDevice.connectedDevices.filter(d => d.active).length} {t('common.online').toLowerCase()}</span>
                          </div>
                          <div className="p-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('genieacs.deviceName')}</th>
                                    <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('genieacs.ipAddress')}</th>
                                    <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('genieacs.macAddress')}</th>
                                    <th className="text-left py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('genieacs.interface')}</th>
                                    <th className="text-center py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('genieacs.signal')}</th>
                                    <th className="text-center py-1.5 px-2 text-[10px] font-semibold text-muted-foreground">{t('common.status')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedDevice.connectedDevices.map((host, idx) => {
                                    const isWifi = host.ssidIndex > 0 || host.ssidName;
                                    return (
                                      <tr key={idx} className="border-b border-border last:border-0">
                                        <td className="py-1.5 px-2">
                                          <div className="flex items-center gap-1.5">
                                            {isWifi ? (
                                              <Wifi className="w-3 h-3 text-info" />
                                            ) : (
                                              <Monitor className="w-3 h-3 text-primary" />
                                            )}
                                            <span className="text-foreground">{host.hostName !== '-' ? host.hostName : t('common.unknown')}</span>
                                          </div>
                                        </td>
                                        <td className="py-1.5 px-2 text-muted-foreground dark:text-muted-foreground">{host.ipAddress}</td>
                                        <td className="py-1.5 px-2 font-mono text-[10px] text-muted-foreground dark:text-muted-foreground">{host.macAddress}</td>
                                        <td className="py-1.5 px-2 text-muted-foreground dark:text-muted-foreground">
                                          {host.ssidName || (isWifi ? `${t('common.wifi')} ${host.ssidIndex}` : t('common.lan'))}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          {host.rssi ? (
                                            <span className={`font-medium ${host.rssi >= -50 ? 'text-success' : host.rssi >= -70 ? 'text-warning' : 'text-destructive'}`}>
                                              {host.rssi} dBm
                                            </span>
                                          ) : '-'}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${host.active ? 'bg-success/20 text-success dark:bg-green-900/30 dark:text-success' : 'bg-gray-200 text-muted-foreground dark:bg-inputdark:text-muted-foreground'}`}>
                                            {host.active ? t('common.online') : t('common.offline')}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">{t('genieacs.deviceNotFound')}</p>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="border-t border-border p-3 flex justify-end">
                  <button
                    onClick={closeDetailModal}
                    className="px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Edit / Add WiFi Modal */}
          <SimpleModal isOpen={showEditWifiModal} onClose={closeEditWifiModal} size="md">
            <ModalHeader>
              <ModalTitle className="flex items-center gap-2"><Wifi className="w-4 h-4" />{wifiModalMode === 'add' ? 'Add New SSID' : t('genieacs.editWifiConfiguration')}</ModalTitle>
              <ModalDescription>{wifiModalMode === 'add' ? 'Create a new wireless network on this device' : t('genieacs.configureWlan')}</ModalDescription>
            </ModalHeader>
            <ModalBody className="space-y-3">
              {/* Edit mode: WLAN index selector */}
              {wifiModalMode === 'edit' && (
                <div>
                  <ModalLabel>{t('genieacs.wlanIndex')}</ModalLabel>
                  <ModalSelect value={editWifiData.wlanIndex} onChange={(e) => handleWlanIndexChange(parseInt(e.target.value))}>
                    {selectedDevice?.wlanConfigs?.map((wlan) => (<option key={wlan.index} value={wlan.index} className="dark:bg-[#0a0520]">WLAN {wlan.index} — {wlan.ssid || t('genieacs.noSsid')} ({wlan.band})</option>)) || (<><option value={1} className="dark:bg-[#0a0520]">WLAN 1 (2.4GHz)</option><option value={2} className="dark:bg-[#0a0520]">WLAN 2 (5GHz)</option></>)}
                  </ModalSelect>
                </div>
              )}
              {/* Add mode: band + channel */}
              {wifiModalMode === 'add' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ModalLabel>Band</ModalLabel>
                    <ModalSelect value={editWifiData.band} onChange={(e) => setEditWifiData({ ...editWifiData, band: e.target.value })}>
                      <option value="2.4GHz">2.4 GHz</option>
                      <option value="5GHz">5 GHz</option>
                    </ModalSelect>
                  </div>
                  <div>
                    <ModalLabel>Channel <span className="text-muted-foreground">(0 = auto)</span></ModalLabel>
                    <ModalInput type="number" min={0} max={165} value={editWifiData.channel} onChange={(e) => setEditWifiData({ ...editWifiData, channel: e.target.value })} placeholder="0 (auto)" />
                  </div>
                </div>
              )}
              {/* SSID Name */}
              <div>
                <ModalLabel required>{t('genieacs.ssidName')}</ModalLabel>
                <ModalInput type="text" value={editWifiData.ssid} onChange={(e) => setEditWifiData({ ...editWifiData, ssid: e.target.value })} maxLength={32} placeholder={t('genieacs.wifiName')} autoComplete="off" />
                <p className="text-[10px] text-muted-foreground mt-1">1–32 {t('common.characters')}</p>
              </div>
              {/* Security Mode */}
              <div>
                <ModalLabel>Security / Encryption</ModalLabel>
                <ModalSelect value={editWifiData.securityMode} onChange={(e) => setEditWifiData({ ...editWifiData, securityMode: e.target.value })}>
                  <option value="None">None (Open — no password)</option>
                  <option value="WPA-PSK">WPA-PSK (WPA / TKIP)</option>
                  <option value="WPA2-PSK">WPA2-PSK (WPA2 / AES) — Recommended</option>
                  <option value="WPA-WPA2-PSK">WPA/WPA2-PSK Mixed (TKIP+AES)</option>
                </ModalSelect>
              </div>
              {/* Password — only if not open */}
              {editWifiData.securityMode !== 'None' && (
                <div>
                  <ModalLabel>{t('genieacs.wifiPassword')}{wifiModalMode === 'edit' ? ' (kosong = tidak diubah)' : ''}</ModalLabel>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <ModalInput type="text" value={editWifiData.password} onChange={(e) => setEditWifiData({ ...editWifiData, password: e.target.value })} maxLength={63} placeholder={wifiModalMode === 'add' ? 'Min. 8 karakter' : t('genieacs.passwordPlaceholder')} autoComplete="off" className="pl-10" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">8–63 karakter{wifiModalMode === 'edit' ? ' · kosongkan jika tidak ingin mengubah' : ''}</p>
                </div>
              )}
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg">
                <div>
                  <p className="text-xs font-medium text-foreground">{t('genieacs.wifiStatus')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('genieacs.enableDisableWifi')}</p>
                </div>
                <button type="button" onClick={() => setEditWifiData({ ...editWifiData, enabled: !editWifiData.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editWifiData.enabled ? 'bg-success' : 'bg-muted-foreground/30'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editWifiData.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButton type="button" variant="secondary" onClick={closeEditWifiModal}>{t('common.cancel')}</ModalButton>
              <ModalButton type="button" variant="primary" onClick={handleSaveWifi} disabled={savingWifi}>
                {savingWifi ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                {wifiModalMode === 'add' ? 'Add SSID' : t('common.save')}
              </ModalButton>
            </ModalFooter>
          </SimpleModal>

      {/* WAN Add / Edit Modal */}
      <SimpleModal isOpen={showWanModal} onClose={() => setShowWanModal(false)} size="md">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2"><Globe className="w-4 h-4" />{wanModalMode === 'add' ? 'Add WAN Connection' : 'Edit WAN Connection'}</ModalTitle>
          <ModalDescription>{wanModalMode === 'edit' ? `${editWanData.name} • ${editWanData.connectionType}` : 'Create new WAN connection on device'}</ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-3">
          {/* Add mode only */}
          {wanModalMode === 'add' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel>Connection Type</ModalLabel>
                  <ModalSelect value={editWanData.connectionType} onChange={(e) => setEditWanData({ ...editWanData, connectionType: e.target.value })}>
                    <option value="PPPoE">PPPoE</option>
                    <option value="IP">IP (DHCP)</option>
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel>Connection Name</ModalLabel>
                  <ModalInput type="text" value={editWanData.name} onChange={(e) => setEditWanData({ ...editWanData, name: e.target.value })} placeholder="e.g. INTERNET" autoComplete="off" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModalLabel>WAN Device (Port)</ModalLabel>
                  <ModalSelect value={editWanData.wanDeviceIndex} onChange={(e) => setEditWanData({ ...editWanData, wanDeviceIndex: parseInt(e.target.value) })}>
                    <option value={1}>WANDevice.1</option>
                    <option value={2}>WANDevice.2</option>
                  </ModalSelect>
                </div>
                <div>
                  <ModalLabel>Connection Device (Binding)</ModalLabel>
                  <ModalSelect value={editWanData.wanConnectionDeviceIndex} onChange={(e) => setEditWanData({ ...editWanData, wanConnectionDeviceIndex: parseInt(e.target.value) })}>
                    {[1,2,3,4,5,6,7,8].map(i => <option key={i} value={i}>WANConnectionDevice.{i}</option>)}
                  </ModalSelect>
                </div>
              </div>
            </>
          )}
          {/* Edit mode: show current IP */}
          {wanModalMode === 'edit' && editWanData.currentIP && editWanData.currentIP !== '-' && (
            <div className="p-2 bg-muted rounded-lg text-xs text-muted-foreground">
              Current IP: <span className="text-foreground font-medium">{editWanData.currentIP}</span>
            </div>
          )}
          {/* PPPoE credentials */}
          {editWanData.connectionType === 'PPPoE' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ModalLabel>{wanModalMode === 'edit' ? 'PPPoE Username' : 'Username'}</ModalLabel>
                <ModalInput type="text" value={editWanData.username} onChange={(e) => setEditWanData({ ...editWanData, username: e.target.value })} placeholder="user@isp.com" autoComplete="off" />
              </div>
              <div>
                <ModalLabel>{wanModalMode === 'edit' ? 'Password (leave empty=no change)' : 'Password'}</ModalLabel>
                <ModalInput type="text" value={editWanData.password} onChange={(e) => setEditWanData({ ...editWanData, password: e.target.value })} placeholder={wanModalMode === 'edit' ? 'Leave empty to keep' : 'password'} autoComplete="off" />
              </div>
            </div>
          )}
          {/* VLAN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <ModalLabel>VLAN ID <span className="text-muted-foreground">(0 = untagged)</span></ModalLabel>
              <ModalInput type="number" min={0} max={4094} value={editWanData.vlanId} onChange={(e) => setEditWanData({ ...editWanData, vlanId: e.target.value })} placeholder="e.g. 100" />
            </div>
            <div>
              <ModalLabel>VLAN Priority <span className="text-muted-foreground">(0–7)</span></ModalLabel>
              <ModalSelect value={editWanData.vlanPriority} onChange={(e) => setEditWanData({ ...editWanData, vlanPriority: e.target.value })}>
                {[0,1,2,3,4,5,6,7].map(p => <option key={p} value={p}>{p}{p === 0 ? ' (default)' : p === 6 ? ' (high)' : p === 7 ? ' (highest)' : ''}</option>)}
              </ModalSelect>
            </div>
          </div>
          {/* Service List */}
          <div>
            <ModalLabel>Service Type</ModalLabel>
            <ModalSelect value={editWanData.serviceList} onChange={(e) => setEditWanData({ ...editWanData, serviceList: e.target.value })}>
              <option value="INTERNET">INTERNET</option>
              <option value="TR069">TR069</option>
              <option value="VOIP">VOIP</option>
              <option value="IPTV">IPTV</option>
              <option value="INTERNET_TR069">INTERNET,TR069</option>
              <option value="OTHER">OTHER</option>
            </ModalSelect>
            <p className="text-[10px] text-muted-foreground mt-1">Sets X_HW_ServiceList on device (Huawei/ZTE compatible)</p>
          </div>
          {/* Enable + NAT toggles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg">
              <div>
                <p className="text-xs font-medium text-foreground">WAN Enable</p>
                <p className="text-[10px] text-muted-foreground">Aktifkan koneksi</p>
              </div>
              <button type="button" onClick={() => setEditWanData({ ...editWanData, enable: !editWanData.enable })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editWanData.enable ? 'bg-success' : 'bg-muted-foreground/30'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editWanData.enable ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-lg">
              <div>
                <p className="text-xs font-medium text-foreground">NAT Enable</p>
                <p className="text-[10px] text-muted-foreground">Network Address Translation</p>
              </div>
              <button type="button" onClick={() => setEditWanData({ ...editWanData, natEnabled: !editWanData.natEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editWanData.natEnabled ? 'bg-success' : 'bg-muted-foreground/30'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editWanData.natEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          {/* TR-069 path reference */}
          {wanModalMode === 'edit' && (
            <div className="p-2 bg-muted/50 rounded text-[10px] text-muted-foreground font-mono break-all">Path: {editWanData.connectionPath}</div>
          )}
          {/* Port binding info */}
          {wanModalMode === 'add' && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-[10px] text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Port Binding Info</p>
              <p>WANDevice = antarmuka WAN fisik (1=ETH/xDSL, 2=2nd WAN).</p>
              <p>WANConnectionDevice = GEM port / sub-interface (1–8). Tiap VLAN/LAN port mapping pakai index berbeda.</p>
              <p>Untuk dual-stack: buat 2 koneksi dengan WanConnDev berbeda dan VLAN berbeda.</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <ModalButton type="button" variant="secondary" onClick={() => setShowWanModal(false)}>{t('common.cancel')}</ModalButton>
          <ModalButton type="button" variant="primary" onClick={handleSaveWan} disabled={savingWan}>
            {savingWan ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            {wanModalMode === 'add' ? 'Add WAN' : t('common.save')}
          </ModalButton>
        </ModalFooter>
      </SimpleModal>

      {/* Parameter Browser Modal */}
      {showParamBrowser && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden mx-4 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-400 p-3 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4" />
                <div>
                  <h2 className="text-sm font-semibold">Browse All Parameters</h2>
                  <p className="text-[10px] text-teal-100">
                    {loadingParams ? 'Loading...' : `${paramBrowserData.length} parameters · ${paramSelected.size} selected`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {paramSelected.size > 0 && (
                  <>
                    <button
                      onClick={() => {
                        const sel = paramBrowserData.filter(p => paramSelected.has(p.path));
                        const lines = ['// Auto-generated VP script', `// ${sel.length} parameter(s) selected`, ''];
                        if (sel.length === 1) {
                          lines.push(`const val = declare("${sel[0].path}", { value: 1 });`);
                          lines.push('return val.value[0];');
                        } else {
                          lines.push('const name = args[0].name;');
                          for (const p of sel) {
                            lines.push(`if (name === "${p.path}") { const v = declare("${p.path}", { value: 1 }); return v.value[0]; }`);
                          }
                          lines.push('return undefined;');
                        }
                        setGenScript(lines.join('\n'));
                        setGenTarget('vp');
                        setGenName(`vp-${selectedDevice?._id?.slice(0,8) ?? 'device'}`);
                        setShowGenModal(true);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-purple-600 hover:bg-purple-700 text-white rounded"
                    >
                      <Zap className="w-3 h-3" />
                      Generate VP
                    </button>
                    <button
                      onClick={() => {
                        const sel = paramBrowserData.filter(p => paramSelected.has(p.path));
                        const lines = ['// Auto-generated provision script', `// ${sel.length} parameter(s) selected`, ''];
                        for (const p of sel) {
                          const val = typeof p.value === 'string' ? JSON.stringify(p.value) : String(p.value ?? 'null');
                          if (p.writable) {
                            lines.push(`declare("${p.path}", { value: [${val}] });`);
                          } else {
                            lines.push(`// read-only: declare("${p.path}", { value: 1 });`);
                          }
                        }
                        setGenScript(lines.join('\n'));
                        setGenTarget('provision');
                        setGenName(`provision-${selectedDevice?._id?.slice(0,8) ?? 'device'}`);
                        setShowGenModal(true);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded"
                    >
                      <Code2 className="w-3 h-3" />
                      Generate Provision
                    </button>
                  </>
                )}
                <button onClick={() => { setShowParamBrowser(false); setParamSelected(new Set()); }} className="p-1 hover:bg-white/10 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search + select actions */}
            <div className="p-3 border-b border-border shrink-0 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search parameter path or value..."
                  value={paramSearch}
                  onChange={e => setParamSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <button
                onClick={() => {
                  const visible = paramSearch
                    ? paramBrowserData.filter(p => p.path.toLowerCase().includes(paramSearch.toLowerCase()) || p.value.toLowerCase().includes(paramSearch.toLowerCase()))
                    : paramBrowserData;
                  const allSelected = visible.every(p => paramSelected.has(p.path));
                  setParamSelected(prev => {
                    const next = new Set(prev);
                    if (allSelected) visible.forEach(p => next.delete(p.path));
                    else visible.forEach(p => next.add(p.path));
                    return next;
                  });
                }}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded-lg hover:bg-muted whitespace-nowrap"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Select All
              </button>
              {paramSelected.size > 0 && (
                <button
                  onClick={() => setParamSelected(new Set())}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border rounded-lg hover:bg-muted whitespace-nowrap text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {loadingParams ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
              ) : (() => {
                const filtered = paramSearch
                  ? paramBrowserData.filter(p =>
                      p.path.toLowerCase().includes(paramSearch.toLowerCase()) ||
                      p.value.toLowerCase().includes(paramSearch.toLowerCase())
                    )
                  : paramBrowserData;

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      <List className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">No parameters found</p>
                    </div>
                  );
                }

                return (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <input
                            type="checkbox"
                            className="rounded w-3 h-3"
                            checked={filtered.length > 0 && filtered.every(p => paramSelected.has(p.path))}
                            onChange={() => {
                              const allSel = filtered.every(p => paramSelected.has(p.path));
                              setParamSelected(prev => {
                                const next = new Set(prev);
                                if (allSel) filtered.forEach(p => next.delete(p.path));
                                else filtered.forEach(p => next.add(p.path));
                                return next;
                              });
                            }}
                          />
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Parameter Path</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Value</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground w-20">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((p, i) => (
                        <tr
                          key={i}
                          className={`hover:bg-muted/50 group cursor-pointer ${paramSelected.has(p.path) ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}
                          onClick={() => setParamSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(p.path)) next.delete(p.path); else next.add(p.path);
                            return next;
                          })}
                        >
                          <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded w-3 h-3"
                              checked={paramSelected.has(p.path)}
                              onChange={() => setParamSelected(prev => {
                                const next = new Set(prev);
                                if (next.has(p.path)) next.delete(p.path); else next.add(p.path);
                                return next;
                              })}
                            />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[10px] text-primary break-all">
                            <div className="flex items-center gap-1">
                              <span>{p.path}</span>
                              {p.writable && (
                                <span className="shrink-0 px-1 py-0.5 rounded text-[9px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">W</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-foreground break-all">
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <span className="flex-1">{p.value || <span className="text-muted-foreground italic">empty</span>}</span>
                              {p.value && (
                                <button
                                  onClick={() => { navigator.clipboard.writeText(p.value); }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-primary transition-opacity shrink-0"
                                  title="Copy value"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-center text-muted-foreground">
                            <span className="px-1 py-0.5 bg-muted rounded text-[9px]">
                              {p.type.replace('xsd:', '')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Generate Script Modal */}
      {showGenModal && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-sm">
                  {genTarget === 'vp' ? 'Generate Virtual Parameter Script' : 'Generate Provision Script'}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Script akan disimpan ke Prisma dan otomatis sync ke GenieACS
                </p>
              </div>
              <button onClick={() => setShowGenModal(false)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nama / ID</label>
                <input
                  value={genName}
                  onChange={e => setGenName(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                  placeholder={genTarget === 'vp' ? 'contoh: uptime' : 'contoh: provision-default'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Script</label>
                <textarea
                  value={genScript}
                  onChange={e => setGenScript(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="w-full font-mono text-[11px] border border-border rounded-md p-3 bg-slate-50 dark:bg-slate-800/80 dark:text-green-300 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setShowGenModal(false)}
                className="px-3 py-2 text-sm border border-border rounded-md hover:bg-muted"
              >
                Batal
              </button>
              <button
                disabled={genSaving || !genName.trim()}
                onClick={async () => {
                  if (!genName.trim()) return;
                  setGenSaving(true);
                  try {
                    const endpoint = genTarget === 'vp'
                      ? '/api/genieacs/virtual-parameters'
                      : '/api/genieacs/provisions';
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ _id: genName.trim(), script: genScript }),
                    });
                    const json = await res.json();
                    if (!json.success) throw new Error(json.error ?? 'Gagal menyimpan');
                    addToast({ type: 'success', title: 'Tersimpan', description: `${genTarget === 'vp' ? 'VP' : 'Provision'} "${genName}" disimpan & sync ke GenieACS`, duration: 3000 });
                    setShowGenModal(false);
                  } catch (e) {
                    addToast({ type: 'error', title: 'Error', description: (e as Error).message });
                  } finally {
                    setGenSaving(false);
                  }
                }}
                className="px-4 py-2 text-sm rounded-md text-white flex items-center gap-2 disabled:opacity-60 bg-purple-600 hover:bg-purple-700"
              >
                {genSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan & Sync ke GenieACS
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
\n    </div>
      </div >
    </div >
  );
}




