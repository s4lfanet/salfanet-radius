'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface Alert {
  id: string;
  oltId: string | null;
  onuId: string | null;
  alertType: string;
  severity: string;
  message: string;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  olt: { id: string; name: string; ipAddress: string } | null;
  onu: {
    id: string; serialNumber: string | null; macAddress: string | null;
    frame: number; slot: number; port: number; onuId: number;
    customer: { username: string; name: string; phone: string } | null;
  } | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'destructive',
  warning:  'secondary',
  info:     'outline',
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  olt_offline:      'OLT Offline',
  olt_high_temp:    'High Temperature',
  onu_offline:      'ONU Offline',
  low_signal:       'Low Signal',
  high_errors:      'High Errors',
  dying_gasp:       'Dying Gasp',
  unauthorized_onu: 'Unauthorized ONU',
};

export default function OLTAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [typeFilter, setTypeFilter] = useState('all');
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (resolvedFilter !== 'all') params.set('resolved', resolvedFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/olt/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch alerts', e);
    } finally {
      setLoading(false);
    }
  }, [resolvedFilter, severityFilter, typeFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleResolve = async (alertId: string) => {
    setResolving(alertId);
    try {
      const res = await fetch(`/api/olt/alerts/${alertId}`, { method: 'PUT' });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? { ...a, isResolved: true, resolvedAt: new Date().toISOString() }
              : a
          )
        );
      }
    } catch (e) {
      console.error('Failed to resolve alert', e);
    } finally {
      setResolving(null);
    }
  };

  const unresolvedCount = alerts.filter((a) => !a.isResolved).length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.isResolved).length;

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
          <h1 className="text-3xl font-bold">OLT Alerts</h1>
          <p className="text-gray-500">
            {unresolvedCount} unresolved alerts
            {criticalCount > 0 && <span className="text-red-600 font-semibold"> — {criticalCount} critical</span>}
          </p>
        </div>
        <Button onClick={fetchAlerts} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alerts</SelectItem>
                <SelectItem value="false">Unresolved</SelectItem>
                <SelectItem value="true">Resolved</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alert Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="olt_offline">OLT Offline</SelectItem>
                <SelectItem value="olt_high_temp">High Temperature</SelectItem>
                <SelectItem value="onu_offline">ONU Offline</SelectItem>
                <SelectItem value="low_signal">Low Signal</SelectItem>
                <SelectItem value="dying_gasp">Dying Gasp</SelectItem>
                <SelectItem value="unauthorized_onu">Unauthorized ONU</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Alert List */}
      <div className="space-y-3">
        {alerts.map((alert) => (
          <Card key={alert.id} className={`${alert.severity === 'critical' && !alert.isResolved ? 'border-red-300' : ''}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-1">
                    {alert.isResolved
                      ? <CheckCircle className="h-5 w-5 text-green-500" />
                      : alert.severity === 'critical'
                        ? <AlertCircle className="h-5 w-5 text-red-500" />
                        : <AlertCircle className="h-5 w-5 text-orange-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType}
                      </span>
                      <Badge variant={SEVERITY_COLOR[alert.severity] as any}>
                        {alert.severity}
                      </Badge>
                      {alert.isResolved && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          Resolved
                        </Badge>
                      )}
                    </div>

                    <p className="text-gray-700 mt-1">{alert.message}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                      {alert.olt && (
                        <span className="flex items-center gap-1">
                          <Wifi className="h-3 w-3" />
                          {alert.olt.name} ({alert.olt.ipAddress})
                        </span>
                      )}
                      {alert.onu && (
                        <span>
                          ONU: {alert.onu.serialNumber ?? `${alert.onu.frame}/${alert.onu.slot}/${alert.onu.port}:${alert.onu.onuId}`}
                          {alert.onu.customer && (
                            <span className="ml-1 text-blue-600">({alert.onu.customer.name})</span>
                          )}
                        </span>
                      )}
                      <span>{new Date(alert.createdAt).toLocaleString('id-ID')}</span>
                      {alert.resolvedAt && (
                        <span>Resolved: {new Date(alert.resolvedAt).toLocaleString('id-ID')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {!alert.isResolved && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolving === alert.id}
                  >
                    {resolving === alert.id
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <CheckCircle className="h-4 w-4 mr-1" />}
                    Resolve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {alerts.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-48">
              <CheckCircle className="h-12 w-12 text-green-400 mb-3" />
              <p className="text-gray-500">No alerts found</p>
              <p className="text-sm text-gray-400">All systems are operating normally</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
