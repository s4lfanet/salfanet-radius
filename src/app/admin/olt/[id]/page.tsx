'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Server, RefreshCw, AlertCircle, Wifi, WifiOff,
  Thermometer, Clock, Activity, ArrowLeft, Save, TestTube,
} from 'lucide-react';

interface ONU {
  id: string;
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  serialNumber: string | null;
  macAddress: string | null;
  status: string;
  rxPower: number | null;
  txPower: number | null;
  temperature: number | null;
  distance: number | null;
  lastSeenAt: string | null;
  customer: { id: string; username: string; name: string; phone: string } | null;
}

interface OLTDetail {
  id: string;
  name: string;
  ipAddress: string;
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  isOnline: boolean;
  temperature: number | null;
  uptime: number | null;
  totalOnu: number;
  onlineOnu: number;
  offlineOnu: number;
  lastPollAt: string | null;
  monitoringEnabled: boolean;
  snmpEnabled: boolean;
  snmpCommunity: string;
  snmpPort: number;
  sshEnabled: boolean;
  sshPort: number;
  telnetEnabled: boolean;
  telnetPort: number;
  username: string | null;
  pollingInterval: number;
  onuStatuses: ONU[];
  alerts: any[];
  performanceMetrics: any[];
  monitoringLogs: any[];
}

export default function OLTDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [olt, setOlt] = useState<OLTDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [onuStatusFilter, setOnuStatusFilter] = useState('all');

  // Settings state
  const [settings, setSettings] = useState({
    vendor: 'huawei',
    model: '',
    monitoringEnabled: false,
    snmpEnabled: true,
    snmpCommunity: 'public',
    snmpPort: 161,
    sshEnabled: false,
    sshPort: 22,
    telnetEnabled: false,
    telnetPort: 23,
    username: '',
    password: '',
    pollingInterval: 300,
  });

  const fetchOLT = useCallback(async () => {
    try {
      const res = await fetch(`/api/olt/${id}`);
      if (res.ok) {
        const data = await res.json();
        const o = data.olt;
        setOlt(o);
        setSettings({
          vendor: o.vendor ?? 'huawei',
          model: o.model ?? '',
          monitoringEnabled: o.monitoringEnabled,
          snmpEnabled: o.snmpEnabled,
          snmpCommunity: o.snmpCommunity,
          snmpPort: o.snmpPort,
          sshEnabled: o.sshEnabled,
          sshPort: o.sshPort,
          telnetEnabled: o.telnetEnabled,
          telnetPort: o.telnetPort,
          username: o.username ?? '',
          password: '',
          pollingInterval: o.pollingInterval,
        });
      } else {
        router.push('/admin/olt/monitoring');
      }
    } catch (e) {
      console.error('Failed to fetch OLT', e);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchOLT(); }, [fetchOLT]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/olt/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        await fetchOLT();
      }
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (protocol: string) => {
    setTesting(protocol);
    try {
      const res = await fetch('/api/olt/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId: id, protocol }),
      });
      const data = await res.json();
      alert(data.message || (data.success ? 'Connection successful' : 'Connection failed'));
    } catch (e) {
      alert('Test failed');
    } finally {
      setTesting(null);
    }
  };

  const handleManualPoll = async () => {
    try {
      await fetch('/api/olt/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId: id }),
      });
      await fetchOLT();
    } catch (e) {
      console.error('Poll failed', e);
    }
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':     return 'text-green-600';
      case 'dying_gasp': return 'text-red-600';
      case 'los':        return 'text-orange-600';
      default:           return 'text-gray-500';
    }
  };

  const filteredOnus = (olt?.onuStatuses ?? []).filter((o) =>
    onuStatusFilter === 'all' || o.status === onuStatusFilter
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!olt) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/olt/monitoring">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {olt.isOnline
                ? <Wifi className="h-6 w-6 text-green-500" />
                : <WifiOff className="h-6 w-6 text-red-500" />}
              {olt.name}
            </h1>
            <p className="text-gray-500 font-mono text-sm">{olt.ipAddress}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {olt.monitoringEnabled && (
            <Button onClick={handleManualPoll} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Poll Now
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Status</div>
            <div className={`font-bold text-lg ${olt.isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {olt.isOnline ? 'Online' : 'Offline'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Thermometer className="h-3 w-3" /> Temperature</div>
            <div className={`font-bold text-lg ${olt.temperature !== null && olt.temperature > 60 ? 'text-red-600' : ''}`}>
              {olt.temperature !== null ? `${olt.temperature}°C` : 'N/A'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Uptime</div>
            <div className="font-bold text-lg">{formatUptime(olt.uptime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Activity className="h-3 w-3" /> ONUs</div>
            <div className="font-bold text-lg">
              <span className="text-green-600">{olt.onlineOnu}</span>
              <span className="text-gray-400">/{olt.totalOnu}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="onus">
        <TabsList>
          <TabsTrigger value="onus">ONU List ({olt.totalOnu})</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {olt.alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{olt.alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* ONU List Tab */}
        <TabsContent value="onus" className="space-y-4">
          <div className="flex gap-4">
            <Select value={onuStatusFilter} onValueChange={setOnuStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ONUs</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="dying_gasp">Dying Gasp</SelectItem>
                <SelectItem value="los">LOS</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 self-center">{filteredOnus.length} ONUs</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2 pr-4">Serial / MAC</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">RX Power</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredOnus.map((onu) => (
                  <tr key={onu.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {onu.frame}/{onu.slot}/{onu.port}:{onu.onuId}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="font-mono text-xs">{onu.serialNumber ?? onu.macAddress ?? 'N/A'}</div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`font-medium capitalize ${getStatusColor(onu.status)}`}>
                        {onu.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {onu.rxPower !== null ? (
                        <span className={onu.rxPower < -27 ? 'text-red-600' : 'text-green-600'}>
                          {onu.rxPower.toFixed(2)} dBm
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td className="py-2 pr-4">
                      {onu.customer ? (
                        <div>
                          <div className="font-medium">{onu.customer.name}</div>
                          <div className="text-gray-500 text-xs">{onu.customer.username}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-gray-500">
                      {onu.lastSeenAt ? new Date(onu.lastSeenAt).toLocaleString('id-ID') : 'N/A'}
                    </td>
                  </tr>
                ))}
                {filteredOnus.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No ONUs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-3">
          {olt.alerts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-gray-400">No active alerts</CardContent>
            </Card>
          ) : (
            olt.alerts.map((alert: any) => (
              <Card key={alert.id} className={alert.severity === 'critical' ? 'border-red-300' : ''}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`h-5 w-5 mt-0.5 ${alert.severity === 'critical' ? 'text-red-500' : 'text-orange-500'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alert.alertType.replace(/_/g, ' ')}</span>
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-gray-600 text-sm mt-1">{alert.message}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {new Date(alert.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Settings</CardTitle>
              <CardDescription>Configure SNMP, SSH, Telnet and polling parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* General */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Vendor</Label>
                  <Select
                    value={settings.vendor}
                    onValueChange={(v) => setSettings((s) => ({ ...s, vendor: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="huawei">Huawei</SelectItem>
                      <SelectItem value="zte">ZTE</SelectItem>
                      <SelectItem value="fiberhome">FiberHome</SelectItem>
                      <SelectItem value="bdcom">BDCOM</SelectItem>
                      <SelectItem value="raisecom">Raisecom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                    placeholder="e.g. MA5608T"
                  />
                </div>
                <div>
                  <Label>Polling Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={settings.pollingInterval}
                    onChange={(e) => setSettings((s) => ({ ...s, pollingInterval: parseInt(e.target.value) || 300 }))}
                    min={60}
                    max={3600}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={settings.monitoringEnabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, monitoringEnabled: v }))}
                />
                <Label>Enable Monitoring</Label>
              </div>

              {/* SNMP */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.snmpEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, snmpEnabled: v }))}
                  />
                  <Label className="font-semibold">SNMP</Label>
                </div>
                {settings.snmpEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Community String</Label>
                      <Input
                        value={settings.snmpCommunity}
                        onChange={(e) => setSettings((s) => ({ ...s, snmpCommunity: e.target.value }))}
                        placeholder="public"
                      />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.snmpPort}
                        onChange={(e) => setSettings((s) => ({ ...s, snmpPort: parseInt(e.target.value) || 161 }))}
                      />
                    </div>
                  </div>
                )}
                {settings.snmpEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('snmp')}
                    disabled={testing === 'snmp'}
                  >
                    {testing === 'snmp' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test SNMP
                  </Button>
                )}
              </div>

              {/* SSH */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.sshEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, sshEnabled: v }))}
                  />
                  <Label className="font-semibold">SSH</Label>
                </div>
                {settings.sshEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.sshPort}
                        onChange={(e) => setSettings((s) => ({ ...s, sshPort: parseInt(e.target.value) || 22 }))}
                      />
                    </div>
                    <div>
                      <Label>Username</Label>
                      <Input
                        value={settings.username}
                        onChange={(e) => setSettings((s) => ({ ...s, username: e.target.value }))}
                        placeholder="admin"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={settings.password}
                        onChange={(e) => setSettings((s) => ({ ...s, password: e.target.value }))}
                        placeholder="Leave blank to keep existing"
                      />
                    </div>
                  </div>
                )}
                {settings.sshEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('ssh')}
                    disabled={testing === 'ssh'}
                  >
                    {testing === 'ssh' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test SSH
                  </Button>
                )}
              </div>

              {/* Telnet */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.telnetEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, telnetEnabled: v }))}
                  />
                  <Label className="font-semibold">Telnet</Label>
                </div>
                {settings.telnetEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.telnetPort}
                        onChange={(e) => setSettings((s) => ({ ...s, telnetPort: parseInt(e.target.value) || 23 }))}
                      />
                    </div>
                  </div>
                )}
                {settings.telnetEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('telnet')}
                    disabled={testing === 'telnet'}
                  >
                    {testing === 'telnet' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test Telnet
                  </Button>
                )}
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {olt.monitoringLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <div className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      log.severity === 'error' ? 'bg-red-100 text-red-700' :
                      log.severity === 'warning' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {log.logType}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))}
                {olt.monitoringLogs.length === 0 && (
                  <p className="text-center text-gray-400 py-8">No logs yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
