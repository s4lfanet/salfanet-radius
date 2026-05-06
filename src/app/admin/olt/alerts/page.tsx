'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Wifi } from 'lucide-react';

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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            OLT Alerts
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {unresolvedCount} alert belum selesai
            {criticalCount > 0 && <span className="text-red-600 font-semibold"> — {criticalCount} critical</span>}
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-medium">Total Alert</p>
          <p className="text-xl font-bold text-gray-800 dark:text-gray-200">{alerts.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-medium">Critical</p>
          <p className="text-xl font-bold text-red-600">{criticalCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-medium">Warning</p>
          <p className="text-xl font-bold text-yellow-600">
            {alerts.filter((a) => a.severity === 'warning' && !a.isResolved).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <p className="text-[10px] text-gray-500 uppercase font-medium">Resolved</p>
          <p className="text-xl font-bold text-green-600">{alerts.filter((a) => a.isResolved).length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Alert</option>
            <option value="false">Belum Selesai</option>
            <option value="true">Sudah Selesai</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Tipe</option>
            <option value="olt_offline">OLT Offline</option>
            <option value="olt_high_temp">Suhu Tinggi</option>
            <option value="onu_offline">ONU Offline</option>
            <option value="low_signal">Signal Lemah</option>
            <option value="dying_gasp">Dying Gasp</option>
            <option value="unauthorized_onu">ONU Tidak Sah</option>
          </select>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tidak ada alert</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Semua sistem berjalan normal</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white dark:bg-gray-900 rounded-lg border p-3 ${
                alert.severity === 'critical' && !alert.isResolved
                  ? 'border-red-300 dark:border-red-800'
                  : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <div className="mt-0.5 flex-shrink-0">
                    {alert.isResolved
                      ? <CheckCircle className="h-4 w-4 text-green-500" />
                      : alert.severity === 'critical'
                        ? <AlertCircle className="h-4 w-4 text-red-500" />
                        : <AlertCircle className="h-4 w-4 text-orange-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : alert.severity === 'warning'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {alert.severity}
                      </span>
                      {alert.isResolved && (
                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Selesai
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300">{alert.message}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {alert.olt && (
                        <span className="flex items-center gap-0.5">
                          <Wifi className="h-2.5 w-2.5" />
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
                        <span>Selesai: {new Date(alert.resolvedAt).toLocaleString('id-ID')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {!alert.isResolved && (
                  <button
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolving === alert.id}
                    className="inline-flex items-center px-2 py-1 text-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 flex-shrink-0"
                  >
                    {resolving === alert.id
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <><CheckCircle className="h-3 w-3 mr-1" />Selesai</>}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
