'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    Server, RefreshCw, Play, Square, RotateCcw, Activity,
    Cpu, HardDrive, Clock, CheckCircle, XCircle, AlertTriangle,
    Zap, Loader2, Terminal
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

interface RadiusStatus {
    running: boolean;
    pid: number | null;
    uptime: string;
    cpu: number;
    memory: number;
    memoryMB: number;
    version: string;
    startTime: string;
    activeConnections: number;
    totalAuthRequests: number;
    totalAcctRequests: number;
    lastRestart: string;
}

export default function FreeRADIUSStatusPage() {
    const { t } = useTranslation();
    const { addToast, confirm } = useToast();
    const [status, setStatus] = useState<RadiusStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch('/api/freeradius/status');
            const data = await response.json();
            if (response.ok && data.success) {
                setStatus(data.status);
            }
        } catch (error) {
            console.error('Error fetching RADIUS status:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); // Auto-refresh every 10 seconds
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchStatus();
    };

    const handleAction = async (action: 'start' | 'stop' | 'restart') => {
        const actionMessages = {
            start: { title: `${t('radius.startService')}?`, confirmText: t('radius.startService'), successText: t('radius.success') },
            stop: { title: `${t('radius.stopService')}?`, confirmText: t('radius.stopService'), successText: t('radius.success') },
            restart: { title: `${t('radius.restartService')}?`, confirmText: t('radius.restartService'), successText: t('radius.success') },
        };

        const msg = actionMessages[action];

        if (!await confirm({
            title: msg.title,
            message: action === 'stop' ? t('radius.warningStop') : t('radius.warningRestart'),
            confirmText: msg.confirmText,
            cancelText: t('common.cancel'),
            variant: action === 'stop' ? 'danger' : 'warning',
        })) return;
        setActionLoading(action);
            try {
                const response = await fetch(`/api/freeradius/${action}`, { method: 'POST' });
                const data = await response.json();

                if (response.ok && data.success) {
                    addToast({ type: 'success', title: t('common.success'), description: msg.successText || data.message, duration: 2000 });
                    setTimeout(fetchStatus, 2000);
                } else {
                    throw new Error(data.error || 'Action failed');
                }
            } catch (error: any) {
                addToast({ type: 'error', title: t('common.error'), description: error.message || 'Failed to execute action' });
            } finally {
                setActionLoading(null);
            }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Server className="w-6 h-6 text-primary" />
                        {t('radius.statusTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('radius.statusSubtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary border border-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        {t('common.refresh')}
                    </button>
                </div>
            </div>

            {/* Status Card */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-6">
                    {/* Service Status */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-xl ${status?.running ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                {status?.running ? (
                                    <CheckCircle className="w-10 h-10 text-green-500" />
                                ) : (
                                    <XCircle className="w-10 h-10 text-red-500" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">
                                    {status?.running ? t('radius.running') : t('radius.stopped')}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {status?.running ? `${t('radius.pid')}: ${status.pid}` : t('radius.serviceStatus')}
                                </p>
                                {status?.version && (
                                    <p className="text-xs text-primary mt-1">Version: {status.version}</p>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            {status?.running ? (
                                <>
                                    <button
                                        onClick={() => handleAction('restart')}
                                        disabled={actionLoading !== null}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-600 border border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {actionLoading === 'restart' ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RotateCcw className="w-4 h-4" />
                                        )}
                                        {t('radius.restartService')}
                                    </button>
                                    <button
                                        onClick={() => handleAction('stop')}
                                        disabled={actionLoading !== null}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {actionLoading === 'stop' ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                        {t('radius.stopService')}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => handleAction('start')}
                                    disabled={actionLoading !== null}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 border border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {actionLoading === 'start' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    {t('radius.startService')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stats Grid */}
                    {status?.running && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Uptime */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-4 h-4 text-primary" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase">{t('radius.uptime')}</span>
                                </div>
                                <p className="text-lg font-bold text-foreground">{status.uptime || 'N/A'}</p>
                            </div>

                            {/* CPU */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Cpu className="w-4 h-4 text-blue-500" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase">{t('radius.cpuUsage')}</span>
                                </div>
                                <p className="text-lg font-bold text-foreground">{status.cpu?.toFixed(1) || '0'}%</p>
                                <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${status.cpu > 80 ? 'bg-red-500' : status.cpu > 50 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(status.cpu || 0, 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Memory */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <HardDrive className="w-4 h-4 text-purple-500" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase">{t('radius.memoryUsage')}</span>
                                </div>
                                <p className="text-lg font-bold text-foreground">{status.memoryMB?.toFixed(0) || '0'} MB</p>
                                <p className="text-xs text-muted-foreground">{status.memory?.toFixed(1) || '0'}% of system</p>
                            </div>

                            {/* Active Connections */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity className="w-4 h-4 text-green-500" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase">{t('radius.activeConnections')}</span>
                                </div>
                                <p className="text-lg font-bold text-foreground">{status.activeConnections || 0}</p>
                                <p className="text-xs text-muted-foreground">connections</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Request Stats */}
                {status?.running && (
                    <div className="border-t border-border p-6">
                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            {t('radius.requestStats')}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <span className="text-sm text-muted-foreground">{t('radius.authRequests')}</span>
                                <span className="text-sm font-bold text-foreground">{status.totalAuthRequests?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                <span className="text-sm text-muted-foreground">{t('radius.acctRequests')}</span>
                                <span className="text-sm font-bold text-foreground">{status.totalAcctRequests?.toLocaleString() || 0}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Start Time Info */}
                {status?.startTime && (
                    <div className="border-t border-border px-6 py-4 bg-muted/20">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{t('radius.started')}:</span>
                            <span className="text-foreground font-mono">{formatWIB(status.startTime)}</span>
                        </div>
                        {status.lastRestart && (
                            <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-muted-foreground">{t('radius.lastRestart')}:</span>
                                <span className="text-foreground font-mono">{formatWIB(status.lastRestart)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Debug Mode Section */}
            <div className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold text-foreground">{t('radius.debugMode')}</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">radiusd -X</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    {t('radius.debugDesc')}
                </p>
                <button
                    onClick={() => setShowDebugInfo(!showDebugInfo)}                    
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-foreground rounded-lg transition-colors">
                    <Terminal className="w-4 h-4" />
                    {t('radius.runDebug')}
                </button>
                {showDebugInfo && (
                  <div className="mt-3 p-3 bg-gray-800 border border-gray-600 rounded text-sm">
                    <p className="mb-2 text-gray-400 text-xs">Debug mode feature coming soon. For now, run manually on your server:</p>
                    <code className="block bg-gray-900 px-3 py-2 rounded text-green-400 text-xs">systemctl stop freeradius &amp;&amp; freeradius -X</code>
                  </div>
                )}
            </div>
        </div>
    );
}
