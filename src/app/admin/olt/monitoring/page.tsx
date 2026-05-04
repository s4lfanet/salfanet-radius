'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Server, RefreshCw, AlertCircle, Activity, WifiOff, Wifi,
  Thermometer, Clock, Search, Settings,
} from 'lucide-react';

interface OLT {
  id: string;
  name: string;
  ipAddress: string;
  vendor: string | null;
  model: string | null;
  isOnline: boolean;
  temperature: number | null;
  uptime: bigint | number | null;
  totalOnu: number;
  onlineOnu: number;
  offlineOnu: number;
  lastPollAt: string | null;
  monitoringEnabled: boolean;
  unresolvedAlerts: number;
}

export default function OLTMonitoringPage() {
  const [olts, setOlts] = useState<OLT[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOLTs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/olt/monitoring?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOlts(data.olts ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch OLTs', e);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchOLTs();
    const interval = setInterval(fetchOLTs, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchOLTs]);

  const handleManualPoll = async (oltId: string) => {
    setPolling(oltId);
    try {
      await fetch('/api/olt/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId }),
      });
      await fetchOLTs();
    } catch (e) {
      console.error('Poll failed', e);
    } finally {
      setPolling(null);
    }
  };

  const formatUptime = (seconds: bigint | number | null) => {
    if (!seconds) return 'N/A';
    const secs = typeof seconds === 'bigint' ? Number(seconds) : seconds;
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    return `${days}d ${hours}h`;
  };

  const onlineCount = olts.filter((o) => o.isOnline).length;
  const totalAlerts = olts.reduce((s, o) => s + (o.unresolvedAlerts || 0), 0);
  const totalOnuOffline = olts.reduce((s, o) => s + (o.offlineOnu || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">OLT Monitoring</h1>
          <p className="text-gray-500">Real-time monitoring of all OLT devices</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchOLTs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/admin/olt/alerts">
            <Button variant={totalAlerts > 0 ? 'destructive' : 'outline'} size="sm">
              <AlertCircle className="h-4 w-4 mr-2" />
              Alerts ({totalAlerts})
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total OLTs</CardTitle>
            <Server className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{olts.length}</div>
            <p className="text-xs text-gray-500">{onlineCount} online</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalAlerts}</div>
            <p className="text-xs text-gray-500">Unresolved issues</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total ONUs</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {olts.reduce((s, o) => s + (o.totalOnu || 0), 0)}
            </div>
            <p className="text-xs text-gray-500">
              {olts.reduce((s, o) => s + (o.onlineOnu || 0), 0)} online
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offline ONUs</CardTitle>
            <WifiOff className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalOnuOffline}</div>
            <p className="text-xs text-gray-500">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online Only</SelectItem>
                <SelectItem value="offline">Offline Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* OLT Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {olts.map((olt) => (
          <Card key={olt.id} className={`hover:shadow-lg transition-shadow ${!olt.isOnline ? 'border-red-200' : ''}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {olt.isOnline
                      ? <Wifi className="h-5 w-5 text-green-500" />
                      : <WifiOff className="h-5 w-5 text-red-500" />}
                    {olt.name}
                  </CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">{olt.ipAddress}</CardDescription>
                </div>
                <div className="flex gap-1">
                  {olt.unresolvedAlerts > 0 && (
                    <Badge variant="destructive">{olt.unresolvedAlerts}</Badge>
                  )}
                  {!olt.monitoringEnabled && (
                    <Badge variant="secondary">Monitoring Off</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Vendor:</span>
                  <div className="font-medium capitalize">{olt.vendor ?? 'N/A'}</div>
                </div>
                <div>
                  <span className="text-gray-500">Model:</span>
                  <div className="font-medium">{olt.model ?? 'N/A'}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Thermometer className="h-3 w-3 text-gray-500" />
                  <span className="text-gray-500">Temp:</span>
                  <div className={`font-medium ml-1 ${olt.temperature !== null && olt.temperature > 60 ? 'text-red-600' : ''}`}>
                    {olt.temperature !== null ? `${olt.temperature}°C` : 'N/A'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-gray-500" />
                  <span className="text-gray-500">Uptime:</span>
                  <div className="font-medium ml-1">{formatUptime(olt.uptime)}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <div className="flex gap-4">
                  <span>
                    <span className="text-green-600 font-bold">{olt.onlineOnu}</span>
                    <span className="text-gray-500"> on</span>
                  </span>
                  <span>
                    <span className="text-red-600 font-bold">{olt.offlineOnu}</span>
                    <span className="text-gray-500"> off</span>
                  </span>
                  <span className="text-gray-400">/ {olt.totalOnu} total</span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Link href={`/admin/olt/${olt.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    Details
                  </Button>
                </Link>
                <Link href={`/admin/network/olts`}>
                  <Button variant="outline" size="sm" title="OLT Settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                {olt.monitoringEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleManualPoll(olt.id)}
                    disabled={polling === olt.id}
                    title="Manual Poll"
                  >
                    <RefreshCw className={`h-4 w-4 ${polling === olt.id ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>

              {olt.lastPollAt && (
                <div className="text-xs text-gray-400 text-center">
                  Last poll: {new Date(olt.lastPollAt).toLocaleString('id-ID')}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {olts.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <Server className="h-16 w-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No OLTs found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add OLT devices from Network → OLT menu, then enable monitoring'}
            </p>
            <Link href="/admin/network/olts" className="mt-4">
              <Button variant="outline" size="sm">Go to OLT Management</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
