'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Server, ArrowLeft, RefreshCw, Loader2, Wifi, WifiOff, Settings, Network,
  User, Key, Globe, Activity, Thermometer, Clock, Radio, Eye, EyeOff,
  ChevronDown, ChevronRight, RotateCcw, Power
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

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
  ponMode: string;
  uptime: string;
  status: string;
  lastInform: string | null;
  macAddress: string;
  softwareVersion: string;
  hardwareVersion: string;
  ssid: string;
  temp: string;
  userConnected: string;
  tags: string[];
  // Raw parameters for detailed view
  parameters?: Record<string, unknown>;
}

interface TabProps {
  label: string;
  value: string;
  icon: React.ReactNode;
}

export default function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);
  const router = useRouter();
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    deviceInfo: true,
    connection: true,
    optical: true,
    wifi: true,
  });

  const tabs: TabProps[] = [
    { label: t('genieacsDevice.tabs.summary'), value: 'summary', icon: <Server className="w-3 h-3" /> },
    { label: t('genieacsDevice.tabs.wan'), value: 'wan', icon: <Globe className="w-3 h-3" /> },
    { label: t('genieacsDevice.tabs.lan'), value: 'lan', icon: <Network className="w-3 h-3" /> },
    { label: t('genieacsDevice.tabs.wlan'), value: 'wlan', icon: <Wifi className="w-3 h-3" /> },
    { label: t('genieacsDevice.tabs.user'), value: 'user', icon: <User className="w-3 h-3" /> },
    { label: t('genieacsDevice.tabs.tr069'), value: 'tr069', icon: <Settings className="w-3 h-3" /> },
  ];

  useEffect(() => {
    if (deviceId) fetchDeviceDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const fetchDeviceDetail = async () => {
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/detail`);
      const data = await response.json();
      if (response.ok && data.device) {
        setDevice(data.device);
      } else {
        addToast({ type: 'error', title: t('genieacsDevice.dialogs.error'), description: data.error || t('genieacsDevice.deviceNotFound') });
      }
    } catch (error) {
      console.error('Error:', error);
      addToast({ type: 'error', title: t('genieacsDevice.dialogs.error'), description: t('common.failedLoadData') });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDeviceDetail();
    setRefreshing(false);
  };

  const handleRefreshParameters = async () => {
    if (!await confirm({
      title: t('genieacsDevice.dialogs.refreshTitle'),
      message: t('genieacsDevice.dialogs.refreshConfirm').replace('{serialNumber}', device?.serialNumber || ''),
      confirmText: t('genieacsDevice.dialogs.yesRefresh'),
      cancelText: t('genieacsDevice.dialogs.cancel'),
      variant: 'info',
    })) return;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/refresh`, { method: 'POST' });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({ type: 'success', title: t('genieacsDevice.dialogs.success'), description: t('genieacsDevice.dialogs.refreshSent'), duration: 2000 });
        setTimeout(() => handleRefresh(), 3000);
      } else {
        throw new Error(data.error || t('common.failed'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('genieacsDevice.dialogs.refreshFailed');
      addToast({ type: 'error', title: t('genieacsDevice.dialogs.error'), description: msg });
    } finally {
      setRefreshing(false);
    }
  };

  const handleReboot = async () => {
    if (!await confirm({
      title: t('genieacsDevice.dialogs.rebootTitle'),
      message: t('genieacsDevice.dialogs.rebootConfirm'),
      confirmText: t('genieacsDevice.dialogs.yesReboot'),
      cancelText: t('genieacsDevice.dialogs.cancel'),
      variant: 'danger',
    })) return;
    try {
      const response = await fetch(`/api/settings/genieacs/devices/${encodeURIComponent(deviceId)}/reboot`, { method: 'POST' });
      if (response.ok) {
        addToast({ type: 'success', title: t('genieacsDevice.dialogs.success'), description: t('genieacsDevice.dialogs.rebootSent'), duration: 2000 });
      }
    } catch {
      addToast({ type: 'error', title: t('genieacsDevice.dialogs.error'), description: t('genieacsDevice.dialogs.rebootFailed') });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="text-center py-8">
        <Server className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t('genieacsDevice.deviceNotFound')}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 text-xs text-primary border border-primary rounded-lg">
          {t('genieacsDevice.back')}
        </button>
      </div>
    );
  }

  const InfoRow = ({ label, value, highlight = false }: { label: string; value: string | null | undefined; highlight?: boolean }) => (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-medium ${highlight ? 'text-primary' : 'text-foreground'}`}>
        {value || '-'}
      </span>
    </div>
  );

  const SectionHeader = ({ title, section, icon }: { title: string; section: string; icon: React.ReactNode }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between p-2 bg-muted rounded-lg mb-2"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      {expandedSections[section] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-violet-500 rounded-lg p-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} className="p-1 hover:bg-white/10 rounded">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold">{t('genieacsDevice.deviceDetail')}</h1>
              <p className="text-[11px] text-violet-100">{device.serialNumber} - {device.model}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${device.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}>
              {device.status}
            </span>
            <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 hover:bg-white/10 rounded">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRefreshParameters}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg"
        >
          <RotateCcw className="w-3 h-3" />
          {t('genieacsDevice.refreshParameters')}
        </button>
        <button
          onClick={handleReboot}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg"
        >
          <Power className="w-3 h-3" />
          {t('genieacsDevice.reboot')}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab.value
                ? 'text-primary border-b-2 border-primary bg-primary/10 dark:bg-primary/20'
                : 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {activeTab === 'summary' && (
            <div className="space-y-3">
              {/* Device Info Section */}
              <SectionHeader title={t('genieacsDevice.sections.deviceInfo')} section="deviceInfo" icon={<Server className="w-3.5 h-3.5 text-blue-600" />} />
              {expandedSections.deviceInfo && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <InfoRow label={t('genieacsDevice.labels.serialNumber')} value={device.serialNumber} />
                  <InfoRow label={t('genieacsDevice.labels.productClass')} value={device.model} />
                  <InfoRow label={t('genieacsDevice.labels.oui')} value={device.oui} />
                  <InfoRow label={t('genieacsDevice.labels.manufacturer')} value={device.manufacturer} />
                  <InfoRow label={t('genieacsDevice.labels.hardwareVersion')} value={device.hardwareVersion} />
                  <InfoRow label={t('genieacsDevice.labels.softwareVersion')} value={device.softwareVersion} />
                  <InfoRow label={t('genieacsDevice.labels.macAddress')} value={device.macAddress} />
                  <InfoRow label={t('genieacsDevice.labels.lastInform')} value={device.lastInform ? formatWIB(device.lastInform, 'dd/MM/yyyy HH:mm') : '-'} />
                </div>
              )}

              {/* Connection Section */}
              <SectionHeader title={t('genieacsDevice.sections.connectionInfo')} section="connection" icon={<Globe className="w-3.5 h-3.5 text-green-600" />} />
              {expandedSections.connection && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <InfoRow label={t('genieacsDevice.labels.pppoeUsername')} value={device.pppoeUsername} highlight />
                  <InfoRow label={t('genieacsDevice.labels.pppoeIP')} value={device.pppoeIP} highlight />
                  <InfoRow label={t('genieacsDevice.labels.tr069IP')} value={device.tr069IP} />
                  <InfoRow label={t('genieacsDevice.labels.uptime')} value={device.uptime} />
                  <InfoRow label={t('genieacsDevice.labels.status')} value={device.status} />
                </div>
              )}

              {/* Optical Section */}
              <SectionHeader title={t('genieacsDevice.sections.opticalInfo')} section="optical" icon={<Activity className="w-3.5 h-3.5 text-purple-600" />} />
              {expandedSections.optical && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <InfoRow label={t('genieacsDevice.labels.ponMode')} value={device.ponMode} />
                  <div className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-[11px] text-gray-500">{t('genieacsDevice.labels.rxPower')}</span>
                    <span className={`text-[11px] font-medium ${device.rxPower && device.rxPower !== '-'
                      ? parseFloat(device.rxPower) > -25 ? 'text-green-600' : parseFloat(device.rxPower) > -28 ? 'text-orange-600' : 'text-red-600'
                      : 'text-gray-800'
                      }`}>
                      {device.rxPower && device.rxPower !== '-' ? `${device.rxPower} dBm` : '-'}
                    </span>
                  </div>
                  <InfoRow label={t('genieacsDevice.labels.temperature')} value={device.temp && device.temp !== '-' ? `${device.temp}°C` : '-'} />
                </div>
              )}

              {/* WiFi Section */}
              <SectionHeader title={t('genieacsDevice.sections.wifiInfo')} section="wifi" icon={<Wifi className="w-3.5 h-3.5 text-info" />} />
              {expandedSections.wifi && (
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <InfoRow label={t('genieacsDevice.labels.ssid')} value={device.ssid} />
                  <InfoRow label={t('genieacsDevice.labels.connectedDevices')} value={device.userConnected} />
                </div>
              )}

              {/* Tags */}
              {device.tags && device.tags.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-gray-500 mb-1">{t('genieacsDevice.labels.tags')}</p>
                  <div className="flex flex-wrap gap-1">
                    {device.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'wan' && (
            <div className="text-center py-8 text-gray-500">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacsDevice.comingSoon.wan')}</p>
              <p className="text-[10px] mt-1">{t('genieacsDevice.comingSoon.message')}</p>
            </div>
          )}

          {activeTab === 'lan' && (
            <div className="text-center py-8 text-gray-500">
              <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacsDevice.comingSoon.lan')}</p>
              <p className="text-[10px] mt-1">{t('genieacsDevice.comingSoon.message')}</p>
            </div>
          )}

          {activeTab === 'wlan' && (
            <div className="text-center py-8 text-gray-500">
              <Wifi className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacsDevice.comingSoon.wlan')}</p>
              <p className="text-[10px] mt-1">{t('genieacsDevice.comingSoon.message')}</p>
            </div>
          )}

          {activeTab === 'user' && (
            <div className="text-center py-8 text-gray-500">
              <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacsDevice.comingSoon.user')}</p>
              <p className="text-[10px] mt-1">{t('genieacsDevice.comingSoon.message')}</p>
            </div>
          )}

          {activeTab === 'tr069' && (
            <div className="text-center py-8 text-gray-500">
              <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacsDevice.comingSoon.tr069')}</p>
              <p className="text-[10px] mt-1">{t('genieacsDevice.comingSoon.message')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
