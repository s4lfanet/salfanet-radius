'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ListTodo, RefreshCw, Loader2, Trash2, CheckCircle, XCircle, Clock, Search, AlertCircle, X, Activity } from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';
import { formatWIB } from '@/lib/timezone';

interface GenieACSTask {
  _id: string;
  name: string;
  device: string;
  timestamp: string;
  status: string;
  retries: number;
  fault?: {
    code: string;
    message: string;
  };
}

export default function GenieACSTasksPage() {
  const { t } = useTranslation();
  const { addToast, confirm } = useToast();
  const [tasks, setTasks] = useState<GenieACSTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/genieacs/tasks');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh every 10 seconds if there are pending tasks
  useEffect(() => {
    if (!autoRefresh) return;
    
    const hasPending = tasks.some(t => !t.fault && t.status !== 'done');
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchTasks();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [tasks, autoRefresh, fetchTasks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (await confirm({
      title: t('common.deleteTask'),
      message: t('genieacs.taskWillBeDeleted'),
      confirmText: t('common.yesDelete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    })) {
      try {
        const response = await fetch(`/api/genieacs/tasks/${encodeURIComponent(taskId)}`, { 
          method: 'DELETE' 
        });
        if (response.ok) {
          setTasks(tasks.filter(t => t._id !== taskId));
          addToast({ type: 'success', title: t('common.success'), description: t('common.taskDeleted'), duration: 2000 });
        } else {
          throw new Error(t('genieacs.failedDeleteTask'));
        }
      } catch (error) {
        addToast({ type: 'error', title: t('common.error'), description: t('genieacs.failedDeleteTask') });
      }
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/genieacs/tasks/${encodeURIComponent(taskId)}/retry`, { 
        method: 'POST' 
      });
      if (response.ok) {
        addToast({ type: 'success', title: t('common.success'), description: t('genieacs.taskWillBeRetried'), duration: 2000 });
        handleRefresh();
      } else {
        throw new Error(t('genieacs.failedRetryTask'));
      }
    } catch (error) {
      addToast({ type: 'error', title: t('common.error'), description: t('genieacs.failedRetryTask') });
    }
  };

  const getStatusBadge = (task: GenieACSTask) => {
    // Check for fault first
    if (task.fault) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/20 text-destructive dark:bg-red-900/30 dark:text-destructive rounded">
          <XCircle className="w-3 h-3" />
          {t('genieacs.fault')}
        </span>
      );
    }
    
    // GenieACS task status logic:
    // - No status field or empty = pending (waiting for device)
    // - status = 'done' = completed
    const status = task.status || '';
    
    if (status === 'done') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success dark:bg-green-900/30 dark:text-success rounded">
          <CheckCircle className="w-3 h-3" />
          {t('genieacs.done')}
        </span>
      );
    }
    
    // Default to pending - task is waiting for device connection
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-warning/20 text-warning dark:bg-yellow-900/30 dark:text-warning rounded">
        <Clock className="w-3 h-3" />
        {t('genieacs.pending')}
      </span>
    );
  };

  const getTaskNameLabel = (name: string) => {
    switch (name) {
      case 'setParameterValues':
        return t('genieacs.setParameterValues');
      case 'getParameterValues':
        return t('genieacs.getParameterValues');
      case 'refreshObject':
        return t('genieacs.refreshObject');
      case 'reboot':
        return t('common.reboot');
      case 'factoryReset':
        return t('genieacs.factoryReset');
      case 'download':
        return t('common.download');
      default:
        return name;
    }
  };

  // Helper to check if task is pending (no status or status !== 'done')
  const isPending = (task: GenieACSTask) => !task.fault && task.status !== 'done';
  const isDone = (task: GenieACSTask) => !task.fault && task.status === 'done';

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.device?.toLowerCase().includes(search.toLowerCase()) ||
      task.name?.toLowerCase().includes(search.toLowerCase()) ||
      task._id?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'pending' && isPending(task)) ||
      (statusFilter === 'done' && isDone(task)) ||
      (statusFilter === 'fault' && task.fault);
    
    return matchesSearch && matchesStatus;
  });

  const pendingCount = tasks.filter(t => isPending(t)).length;
  const faultCount = tasks.filter(t => t.fault).length;
  const doneCount = tasks.filter(t => isDone(t)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <Loader2 className="w-12 h-12 animate-spin text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)] relative z-10" />
      </div>
    );
  }

  return (
    <div className="bg-background relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
      <div className="relative z-10 max-w-6xl mx-auto space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)] flex items-center gap-2">
          <ListTodo className="w-6 h-6 text-brand-500 dark:text-[#00f7ff] dark:drop-shadow-[0_0_20px_rgba(0,247,255,0.6)]" />
          {t('genieacs.tasksTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('genieacs.tasksSubtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
          className={`bg-card rounded-lg border p-2 transition-all ${
            statusFilter === 'pending' ? 'border-yellow-500 ring-1 ring-yellow-500' : 'border-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-warning/20 dark:bg-yellow-900/30 flex items-center justify-center">
              <Clock className="w-3 h-3 text-warning" />
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground">{t('genieacs.pending')}</p>
              <p className="text-sm font-semibold text-warning">{pendingCount}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'fault' ? 'all' : 'fault')}
          className={`bg-card rounded-lg border p-2 transition-all ${
            statusFilter === 'fault' ? 'border-destructive ring-1 ring-red-500' : 'border-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-destructive/20 dark:bg-red-900/30 flex items-center justify-center">
              <XCircle className="w-3 h-3 text-destructive" />
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground">{t('genieacs.fault')}</p>
              <p className="text-sm font-semibold text-destructive">{faultCount}</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'done' ? 'all' : 'done')}
          className={`bg-card rounded-lg border p-2 transition-all ${
            statusFilter === 'done' ? 'border-success ring-1 ring-green-500' : 'border-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-success/20 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-success" />
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground">{t('genieacs.done')}</p>
              <p className="text-sm font-semibold text-success">{doneCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Tasks Table */}
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
                placeholder={t('genieacs.searchTask')}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded-lg bg-background focus:ring-1 focus:ring-primary"
              />
            </div>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-muted rounded-lg"
              >
                <X className="w-3 h-3" />
                {t('genieacs.clearFilter')}
              </button>
            )}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                autoRefresh
                  ? 'text-primary border-primary bg-primary/10 dark:bg-primary/20'
                  : 'text-muted-foreground border-border hover:bg-muted'
              }`}
              title={autoRefresh ? t('genieacs.autoRefreshActive') : t('genieacs.autoRefreshInactive')}
            >
              <Activity className="w-3 h-3" />
              {t('genieacs.auto')}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </button>
          </div>
          {pendingCount > 0 && autoRefresh && (
            <p className="text-[10px] text-primary mt-2">
              ⏱️ {t('genieacs.autoRefreshInfo')}
            </p>
          )}
        </div>

        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3 p-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">{t('genieacs.noTasks')}</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div key={task._id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{getTaskNameLabel(task.name)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5" title={task.device}>{task.device}</p>
                  </div>
                  <div className="ml-2 flex-shrink-0">{getStatusBadge(task)}</div>
                </div>
                {task.fault && (
                  <p className="text-[10px] text-destructive mb-2 truncate" title={task.fault.message}>
                    {task.fault.message}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('genieacs.taskId')}</p>
                    <p className="font-mono text-[10px] text-foreground truncate">{task._id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('genieacs.timestamp')}</p>
                    <p className="text-foreground text-[10px]">
                      {formatWIB(task.timestamp, 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">{t('genieacs.retries')}</p>
                    <p className="text-foreground text-sm">{task.retries || 0}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  {task.fault && (
                    <button
                      onClick={() => handleRetryTask(task._id)}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title={t('genieacs.retryTask')}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteTask(task._id)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title={t('genieacs.deleteTask')}
                  >
                    <Trash2 className="w-4 h-4" />
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
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('genieacs.taskId')}</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('genieacs.device')}</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('genieacs.taskName')}</th>
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('genieacs.timestamp')}</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('genieacs.retries')}</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('common.status')}</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">{t('genieacs.noTasks')}</p>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task._id} className="border-b border-border hover:bg-muted">
                    <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate">
                      {task._id}
                    </td>
                    <td className="py-2 px-3 max-w-[200px]">
                      <p className="text-foreground truncate" title={task.device}>
                        {task.device}
                      </p>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {getTaskNameLabel(task.name)}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                      {formatWIB(task.timestamp, 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">
                      {task.retries || 0}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {getStatusBadge(task)}
                      {task.fault && (
                        <p className="text-[9px] text-destructive mt-0.5 max-w-[150px] truncate" title={task.fault.message}>
                          {task.fault.message}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex justify-center gap-1">
                        {task.fault && (
                          <button
                            onClick={() => handleRetryTask(task._id)}
                            className="p-1.5 text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded transition-colors"
                            title={t('genieacs.retryTask')}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTask(task._id)}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                          title={t('genieacs.deleteTask')}
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

      {/* Warning for pending tasks */}
      {pendingCount > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-xs text-warning">
              <p className="font-medium mb-1">{t('genieacs.tasksPending').replace('{count}', String(pendingCount))}</p>
              <ul className="space-y-0.5 text-[11px]">
                <li>• {t('genieacs.taskWillExecute')}</li>
                <li>• {t('genieacs.informInterval')}</li>
                <li>• {t('genieacs.alternative1')}</li>
                <li>• {t('genieacs.alternative2')}</li>
                <li className="text-muted-foreground">• {t('genieacs.connectionRequestNote')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-primary">
            <p className="font-medium mb-1">{t('genieacs.aboutTasks')}</p>
            <ul className="space-y-0.5 text-[11px]">
              <li>• {t('genieacs.taskDescription')}</li>
              <li>• {t('genieacs.pendingTaskExec')}</li>
              <li>• {t('genieacs.useForceSyncTip')}</li>
              <li>• {t('genieacs.faultTaskRetry')}</li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}



