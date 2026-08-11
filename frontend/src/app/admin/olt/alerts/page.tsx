'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, RefreshCw, Wifi, ArrowLeft, ShieldCheck } from 'lucide-react';

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

const ALERT_TYPE_LABEL: Record<string, string> = {
  olt_offline:      'OLT Offline',
  olt_high_temp:    'Suhu Tinggi',
  onu_offline:      'ONU Offline',
  low_signal:       'Signal Lemah',
  high_errors:      'Error Tinggi',
  dying_gasp:       'Dying Gasp',
  unauthorized_onu: 'ONU Tidak Sah',
};

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}d lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  return new Date(dateStr).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function OLTAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [typeFilter, setTypeFilter] = useState('all');
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolvingAll, setResolvingAll] = useState(false);

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

  const handleResolveAll = async () => {
    const unresolved = alerts.filter((a) => !a.isResolved);
    if (!unresolved.length) return;
    setResolvingAll(true);
    await Promise.allSettled(
      unresolved.map((a) => fetch(`/api/olt/alerts/${a.id}`, { method: 'PUT' }))
    );
    setAlerts((prev) =>
      prev.map((a) => ({ ...a, isResolved: true, resolvedAt: new Date().toISOString() }))
    );
    setResolvingAll(false);
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

  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.isResolved).length;
  const resolvedCount = alerts.filter((a) => a.isResolved).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/olt/monitoring">
            <button className="inline-flex items-center px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
              <ArrowLeft className="h-3 w-3 mr-1" />
              Monitoring
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              OLT Alerts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {unresolvedCount > 0
                ? <>{unresolvedCount} alert aktif{criticalCount > 0 && <span className="text-red-600 font-semibold"> — {criticalCount} critical</span>}</>
                : 'Semua alert sudah diselesaikan'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unresolvedCount > 1 && (
            <button
              onClick={handleResolveAll}
              disabled={resolvingAll}
              className="inline-flex items-center px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-60"
            >
              <ShieldCheck className={`h-3 w-3 mr-1 ${resolvingAll ? 'animate-pulse' : ''}`} />
              Selesaikan Semua ({unresolvedCount})
            </button>
          )}
          <button
            onClick={fetchAlerts}
            className="inline-flex items-center px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-300"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`rounded-lg border p-3 ${
          criticalCount > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Critical</p>
          <p className={`text-2xl font-bold ${criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>{criticalCount}</p>
          <p className="text-[10px] text-slate-400">Aktif</p>
        </div>
        <div className={`rounded-lg border p-3 ${
          warningCount > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Warning</p>
          <p className={`text-2xl font-bold ${warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>{warningCount}</p>
          <p className="text-[10px] text-slate-400">Aktif</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Total</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{alerts.length}</p>
          <p className="text-[10px] text-slate-400">Semua waktu</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">Resolved</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resolvedCount}</p>
          <p className="text-[10px] text-slate-400">Selesai</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={resolvedFilter}
            onChange={(e) => setResolvedFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Alert</option>
            <option value="false">Belum Selesai</option>
            <option value="true">Sudah Selesai</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-12 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Tidak ada alert</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Semua sistem berjalan normal</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const borderAccent = alert.isResolved
              ? 'border-l-slate-300 dark:border-l-slate-700'
              : alert.severity === 'critical'
                ? 'border-l-red-500'
                : alert.severity === 'warning'
                  ? 'border-l-amber-400'
                  : 'border-l-blue-400';

            return (
              <div
                key={alert.id}
                className={`bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 border-l-4 ${borderAccent} p-3 ${alert.isResolved ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="mt-0.5 flex-shrink-0">
                      {alert.isResolved
                        ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                        : alert.severity === 'critical'
                          ? <AlertCircle className="h-4 w-4 text-red-500" />
                          : <AlertCircle className="h-4 w-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase ${
                          alert.severity === 'critical'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : alert.severity === 'warning'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}>
                          {alert.severity}
                        </span>
                        {alert.isResolved && (
                          <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                            ✓ Selesai
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">{alert.message}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {alert.olt && (
                          <span className="flex items-center gap-0.5">
                            <Wifi className="h-2.5 w-2.5" />
                            <Link href={`/admin/olt/${alert.olt.id}`} className="hover:text-teal-600 dark:hover:text-teal-400">
                              {alert.olt.name}
                            </Link>
                            <span className="font-mono">({alert.olt.ipAddress})</span>
                          </span>
                        )}
                        {alert.onu && (
                          <span>
                            ONU: {alert.onu.serialNumber ?? `${alert.onu.frame}/${alert.onu.slot}/${alert.onu.port}:${alert.onu.onuId}`}
                            {alert.onu.customer && (
                              <span className="ml-1 text-blue-600 dark:text-blue-400 font-medium">({alert.onu.customer.name})</span>
                            )}
                          </span>
                        )}
                        <span title={new Date(alert.createdAt).toLocaleString('id-ID')}>{relativeTime(alert.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {!alert.isResolved && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      disabled={resolving === alert.id || resolvingAll}
                      className="inline-flex items-center px-2 py-1 text-[10px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-700 rounded text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 disabled:opacity-50 flex-shrink-0 transition-colors"
                    >
                      {resolving === alert.id
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : <><CheckCircle className="h-3 w-3 mr-1" />Selesai</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
