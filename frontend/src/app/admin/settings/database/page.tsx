'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Shield,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { showSuccess, showError, showConfirm } from '@/lib/sweetalert';
import { usePermissions } from '@/hooks/usePermissions';
import { formatWIB } from '@/lib/timezone';
import { useTranslation } from '@/hooks/useTranslation';

interface BackupHistory {
  id: string;
  filename: string;
  filesize: number;
  type: 'auto' | 'manual';
  status: 'success' | 'failed';
  method: string;
  createdAt: string;
  error?: string;
}

interface DatabaseHealth {
  status: 'healthy' | 'warning' | 'error';
  size: string;
  tables: number;
  connections: string;
  lastBackup: string | null;
  uptime: string;
}



export default function DatabaseSettingsPage() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [dbHealth, setDbHealth] = useState<DatabaseHealth | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (hasPermission('settings.view')) {
      loadData();
    }
  }, [hasPermission]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load backup history
      const historyRes = await fetch('/api/backup/history');
      const historyData = await historyRes.json();
      if (historyData.success) {
        setBackupHistory(historyData.history);
      }

      // Load DB health
      const healthRes = await fetch('/api/backup/health');
      const healthData = await healthRes.json();
      if (healthData.success) {
        setDbHealth(healthData.health);
      }


    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNow = async () => {
    const confirmed = await showConfirm(t('settings.createBackupConfirm'));
    if (!confirmed) return;

    setBacking(true);
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        await showSuccess(t('settings.backupCreated'));
        loadData();
        
        // Download file
        if (data.downloadUrl) {
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.download = data.filename;
          link.click();
        }
      } else {
        await showError(data.error || t('settings.backupFailed'));
      }
    } catch (error) {
      await showError(t('settings.createBackupFailed') + ': ' + error);
    } finally {
      setBacking(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      await showError(t('settings.selectBackupFileFirst'));
      return;
    }

    const confirmed = await showConfirm(
      t('settings.restoreDoubleConfirm')
    );
    if (!confirmed) return;

    const doubleConfirm = await showConfirm(
      'Last confirmation: Type YES to proceed with database restore.',
      'Final Confirmation'
    );
    if (!doubleConfirm) return;

    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);

      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.success) {
        await showSuccess(t('settings.restorePageReload'));
        setTimeout(() => window.location.reload(), 2000);
      } else {
        await showError(data.error || t('settings.restoreFailed'));
      }
    } catch (error) {
      await showError(t('settings.failedRestore') + ': ' + error);
    } finally {
      setRestoring(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === backupHistory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(backupHistory.map(b => b.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await showConfirm(
      `Hapus ${selectedIds.size} backup yang dipilih? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/backup/delete/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) successCount++; else failCount++;
      } catch {
        failCount++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (failCount === 0) {
      await showSuccess(`${successCount} backup berhasil dihapus.`);
    } else {
      await showError(`${successCount} berhasil, ${failCount} gagal dihapus.`);
    }
    loadData();
  };

  const handleDeleteBackup = async (id: string, filename: string) => {
    const confirmed = await showConfirm(`${t('settings.deleteBackupConfirm')}: ${filename}?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/backup/delete/${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        await showSuccess(t('settings.backupDeleted'));
        loadData();
      } else {
        await showError(data.error || t('settings.deleteFailed'));
      }
    } catch (error) {
      await showError(t('settings.deleteBackupFailed') + ': ' + error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Permission check
  const canView = hasPermission('settings.view');
  const canEdit = hasPermission('settings.edit');

  if (!permLoading && !canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className="absolute top-0 left-1/4 w-96 h-96 bg-[#bc13fe]/20 rounded-full blur-3xl"></div><div className="absolute top-1/3 right-1/4 w-96 h-96 bg-[#00f7ff]/20 rounded-full blur-3xl"></div><div className="absolute bottom-0 left-1/2 w-96 h-96 bg-[#ff44cc]/20 rounded-full blur-3xl"></div><div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(188,19,254,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(188,19,254,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div></div>
        <div className="relative z-10 text-center">
          <Shield className="w-16 h-16 text-[#ff3366] drop-shadow-[0_0_20px_rgba(255,51,102,0.6)] mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] mb-2">
            Access Denied
          </h2>
          <p className="text-muted-foreground">
            You don't have permission to view database settings.
          </p>
        </div>
      </div>
    );
  }

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
      <div className="relative z-10 space-y-6">
        {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-[#00f7ff] dark:via-white dark:to-[#ff44cc] dark:drop-shadow-[0_0_30px_rgba(0,247,255,0.5)]">
          <Database className="w-6 h-6 text-[#00f7ff] inline mr-2" />
          Database Management
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Backup, restore, and monitor your database
        </p>
      </div>

      {/* Database Health Status */}
      {dbHealth && (
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Database Health
            </h2>
            <div className="flex items-center gap-2">
              {dbHealth.status === 'healthy' && (
                <span className="flex items-center gap-1 text-success dark:text-success">
                  <CheckCircle className="w-5 h-5" />
                  Healthy
                </span>
              )}
              {dbHealth.status === 'warning' && (
                <span className="flex items-center gap-1 text-warning dark:text-warning">
                  <AlertCircle className="w-5 h-5" />
                  Warning
                </span>
              )}
              {dbHealth.status === 'error' && (
                <span className="flex items-center gap-1 text-destructive dark:text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  Error
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('settings.databaseSize')}</p>
              <p className="text-lg font-semibold text-foreground">{dbHealth.size}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('settings.tablesLabel')}</p>
              <p className="text-lg font-semibold text-foreground">{dbHealth.tables}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('settings.connectionsLabel')}</p>
              <p className="text-lg font-semibold text-foreground">{dbHealth.connections}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('settings.lastBackup')}</p>
              <p className="text-lg font-semibold text-foreground">
                {dbHealth.lastBackup ? formatWIB(dbHealth.lastBackup, 'dd/MM HH:mm') : 'Never'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('settings.uptimeLabel')}</p>
              <p className="text-lg font-semibold text-foreground">{dbHealth.uptime}</p>
            </div>
            <div>
              <button
                onClick={loadData}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center justify-center gap-2 text-muted-foreground"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup & Restore */}
      <div className="space-y-6">
          {/* Manual Backup/Restore */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Backup Card */}
            <div className="bg-card rounded-lg border border-border shadow-sm p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Create Backup
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Download a complete backup of your database as SQL file
              </p>
              <button
                onClick={handleBackupNow}
                disabled={backing || !canEdit}
                className="w-full px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2 font-medium"
              >
                {backing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Backup Now
                  </>
                )}
              </button>
            </div>

            {/* Restore Card */}
            <div className="bg-card rounded-lg border border-border shadow-sm p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Restore Database
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload file backup untuk restore database. Mendukung file <span className="font-semibold text-foreground">.sql</span> maupun <span className="font-semibold text-foreground">.sql.gz</span> (hasil backup otomatis Telegram).
              </p>
              <input
                type="file"
                accept=".sql,.gz,.sql.gz"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                className="block w-full text-sm mb-3 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 dark:file:bg-gray-700 dark:file:text-violet-200"
                disabled={!canEdit}
              />
              {restoreFile && (
                <p className="text-xs text-muted-foreground mb-3">
                  File dipilih: <span className="font-medium text-foreground">{restoreFile.name}</span> ({(restoreFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
              <button
                onClick={handleRestore}
                disabled={!restoreFile || restoring || !canEdit}
                className="w-full px-4 py-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50 text-white rounded-lg transition flex items-center justify-center gap-2 font-medium"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Restore Database
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Backup History */}
          <div className="bg-card rounded-lg border border-border shadow-sm">
            <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Backup History
              </h3>
              {canEdit && selectedIds.size > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{selectedIds.size} dipilih</span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-destructive hover:bg-destructive/90 text-white rounded-lg transition disabled:opacity-50"
                  >
                    {bulkDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Hapus {selectedIds.size} Terpilih
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3 p-4">
              {canEdit && backupHistory.length > 0 && (
                <div className="flex items-center gap-2 pb-1">
                  <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
                    {selectedIds.size === backupHistory.length ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {selectedIds.size === backupHistory.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                </div>
              )}
              {backupHistory.length === 0 ? (
                <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3 text-center text-sm text-muted-foreground">
                  No backup history yet
                </div>
              ) : (
                backupHistory.map((backup) => (
                  <div key={backup.id} className={`bg-card/80 backdrop-blur-xl rounded-xl border p-3 transition ${
                    selectedIds.has(backup.id) ? 'border-primary/50 bg-primary/5' : 'border-[#bc13fe]/20'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <button onClick={() => toggleSelect(backup.id)} className="text-muted-foreground hover:text-primary transition">
                            {selectedIds.has(backup.id) ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            backup.type === 'auto'
                              ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-violet-200'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {backup.type}
                        </span>
                      </div>
                      {backup.status === 'success' ? (
                        <span className="flex items-center gap-1 text-success dark:text-success text-xs">
                          <CheckCircle className="w-3 h-3" />
                          Success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive dark:text-destructive text-xs">
                          <AlertCircle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span className="text-foreground">{formatWIB(backup.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Filename</span>
                        <span className="text-foreground font-mono text-xs truncate max-w-[180px]">{backup.filename}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Size</span>
                        <span className="text-foreground">{formatFileSize(backup.filesize)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border">
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = `/api/backup/download/${backup.id}`;
                          link.download = backup.filename;
                          link.click();
                        }}
                        className="text-primary hover:text-primary/80 dark:text-violet-200 dark:hover:text-violet-100 text-xs flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteBackup(backup.id, backup.filename)}
                          className="text-destructive hover:text-destructive dark:hover:text-red-300 text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    {canEdit && (
                      <th className="px-4 py-3 w-10">
                        <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-primary transition">
                          {selectedIds.size === backupHistory.length && backupHistory.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Filename
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backupHistory.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                        No backup history yet
                      </td>
                    </tr>
                  ) : (
                    backupHistory.map((backup) => (
                      <tr key={backup.id} className={`transition ${
                        selectedIds.has(backup.id) ? 'bg-primary/5' : 'hover:bg-muted/50'
                      }`}>
                        {canEdit && (
                          <td className="px-4 py-4">
                            <button onClick={() => toggleSelect(backup.id)} className="text-muted-foreground hover:text-primary transition">
                              {selectedIds.has(backup.id) ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        )}
                        <td className="px-6 py-4 text-sm text-foreground">
                          {formatWIB(backup.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-foreground">
                          {backup.filename}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">
                          {formatFileSize(backup.filesize)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              backup.type === 'auto'
                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-violet-200'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {backup.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {backup.status === 'success' ? (
                            <span className="flex items-center gap-1 text-success dark:text-success">
                              <CheckCircle className="w-4 h-4" />
                              Success
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-destructive dark:text-destructive">
                              <AlertCircle className="w-4 h-4" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = `/api/backup/download/${backup.id}`;
                                link.download = backup.filename;
                                link.click();
                              }}
                              className="text-primary hover:text-primary/80 dark:text-violet-200 dark:hover:text-violet-100"
                              title="Unduh Backup"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteBackup(backup.id, backup.filename)}
                                className="text-destructive hover:text-destructive dark:hover:text-red-300"
                                title="Hapus Backup"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </div>
  </div>
  );
}
