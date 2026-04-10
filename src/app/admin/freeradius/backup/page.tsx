'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import {
    Archive, RefreshCw, Play, CheckCircle, XCircle,
    Loader2, Terminal, HardDrive, Clock, Download, RotateCcw,
    Upload, Server,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface BackupFile {
    name: string;
    size: number;
    createdAt: string;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function FreeRADIUSBackupPage() {
    const { addToast, confirm } = useToast();

    const [running, setRunning] = useState(false);
    const [log, setLog] = useState('');
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [polling, setPolling] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [restoreLog, setRestoreLog] = useState<{ file: string; log: string; ok: boolean } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const fileInputId = useId();
    const logRef = useRef<HTMLPreElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/system/freeradius-backup');
            const data = await res.json();
            if (res.ok) {
                if (data.log !== undefined) setLog(data.log);
                if (data.backups) setBackups(data.backups);
                requestAnimationFrame(() => {
                    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
                });
            }
        } catch { /* ignore */ }
    }, []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setPolling(false);
        setRunning(false);
        fetchData(); // final refresh to get new backup in list
    }, [fetchData]);

    const startPolling = useCallback(() => {
        setPolling(true);
        let ticks = 0;
        pollRef.current = setInterval(async () => {
            ticks++;
            await fetchData();
            const logEl = logRef.current?.textContent || '';
            const done = logEl.includes('BACKUP_FILE:') || logEl.includes('not found') || logEl.includes('ERROR');
            if (done || ticks >= 60) stopPolling();
        }, 1500);
    }, [fetchData, stopPolling]);

    useEffect(() => {
        fetchData();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchData]);

    const handleBackup = async () => {
        if (!await confirm({
            title: 'Buat Backup Config?',
            message: 'Config FreeRADIUS (/etc/freeradius/3.0/) akan disimpan sebagai arsip tar.gz di VPS. Backup tidak dikirim ke GitHub.',
            confirmText: 'Buat Backup',
            cancelText: 'Batal',
            variant: 'warning',
        })) return;

        setRunning(true);
        setLog('');
        try {
            const res = await fetch('/api/admin/system/freeradius-backup', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                addToast({ type: 'error', title: 'Gagal', description: data.error || 'Tidak dapat memulai backup' });
                setRunning(false);
                return;
            }
            startPolling();
            addToast({ type: 'info', title: 'Backup dimulai', description: 'Log tampil di bawah...', duration: 2000 });
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', description: e.message });
            setRunning(false);
        }
    };

    const handleDownload = (file: string) => {
        window.location.href = `/api/admin/system/freeradius-backup/download?file=${encodeURIComponent(file)}`;
    };

    const handleRestore = async (file: string) => {
        if (!await confirm({
            title: `Restore dari ${file}?`,
            message: 'Config FreeRADIUS yang sedang berjalan akan ditimpa oleh backup ini dan FreeRADIUS akan di-reload. Lanjutkan?',
            confirmText: 'Restore',
            cancelText: 'Batal',
            variant: 'danger',
        })) return;

        setRestoring(file);
        setRestoreLog(null);
        try {
            const res = await fetch('/api/admin/system/freeradius-backup/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file }),
            });
            const data = await res.json();
            setRestoreLog({ file, log: data.log || data.error || '—', ok: res.ok && data.success });
            if (res.ok && data.success) {
                addToast({ type: 'success', title: 'Restore berhasil', description: `${data.restored} file dipulihkan`, duration: 4000 });
            } else {
                addToast({ type: 'error', title: 'Restore gagal', description: data.error || 'Lihat log di bawah' });
            }
        } catch (e: any) {
            setRestoreLog({ file, log: e.message, ok: false });
            addToast({ type: 'error', title: 'Error', description: e.message });
        } finally {
            setRestoring(null);
        }
    };

    const handleUploadRestore = async () => {
        if (!uploadFile) return;
        if (!await confirm({
            title: 'Upload & Restore dari VPS lain?',
            message: `File "${uploadFile.name}" akan diupload ke VPS ini lalu langsung di-restore ke /etc/freeradius/3.0/. FreeRADIUS akan di-reload. Lanjutkan?`,
            confirmText: 'Upload & Restore',
            cancelText: 'Batal',
            variant: 'danger',
        })) return;

        setUploading(true);
        setRestoreLog(null);
        try {
            // Step 1: upload
            const form = new FormData();
            form.append('file', uploadFile);
            const upRes = await fetch('/api/admin/system/freeradius-backup/upload', {
                method: 'POST',
                body: form,
            });
            const upData = await upRes.json();
            if (!upRes.ok) {
                addToast({ type: 'error', title: 'Upload gagal', description: upData.error });
                return;
            }
            const savedAs: string = upData.savedAs;
            addToast({ type: 'info', title: 'Upload selesai', description: `Disimpan sebagai ${savedAs}`, duration: 2000 });

            // Step 2: restore
            const restRes = await fetch('/api/admin/system/freeradius-backup/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: savedAs }),
            });
            const restData = await restRes.json();
            setRestoreLog({ file: savedAs, log: restData.log || restData.error || '—', ok: restRes.ok && restData.success });
            if (restRes.ok && restData.success) {
                addToast({ type: 'success', title: 'Restore berhasil', description: `${restData.restored} file dipulihkan`, duration: 4000 });
                setUploadFile(null);
                fetchData();
            } else {
                addToast({ type: 'error', title: 'Restore gagal', description: restData.error || 'Lihat log di bawah' });
            }
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', description: e.message });
        } finally {
            setUploading(false);
        }
    };

    const isDone = log.includes('BACKUP_FILE:') || log.includes('not found') || log.includes('ERROR') || log.includes('✘');
    const isSuccess = log.includes('BACKUP_FILE:');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Archive className="w-6 h-6 text-primary" />
                        Backup & Restore FreeRADIUS
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Backup config yang berjalan di VPS ke arsip lokal — bisa di-restore atau didownload
                    </p>
                </div>
                <button
                    onClick={handleBackup}
                    disabled={running || polling}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                >
                    {running || polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {running || polling ? 'Membuat backup...' : 'Buat Backup'}
                </button>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg"><Terminal className="w-5 h-5 text-blue-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Sumber</p>
                        <p className="text-xs font-mono font-medium text-foreground">/etc/freeradius/3.0/</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg"><HardDrive className="w-5 h-5 text-purple-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Disimpan di</p>
                        <p className="text-xs font-mono font-medium text-foreground">backups/freeradius/</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg"><Clock className="w-5 h-5 text-amber-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Total backup</p>
                        <p className="text-sm font-bold text-foreground">{backups.length} file</p>
                    </div>
                </div>
            </div>

            {/* Backup List */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Archive className="w-4 h-4 text-primary" />
                        Daftar Backup ({backups.length})
                    </h2>
                    <button onClick={fetchData} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Perbarui Data">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>

                {backups.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        Belum ada backup. Klik &quot;Buat Backup&quot; untuk memulai.
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {backups.map(b => (
                            <div key={b.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Archive className="w-4 h-4 text-primary flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-mono text-foreground truncate">{b.name}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(b.createdAt)} · {formatBytes(b.size)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-7 sm:ml-0">
                                    <button
                                        onClick={() => handleDownload(b.name)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Download
                                    </button>
                                    <button
                                        onClick={() => handleRestore(b.name)}
                                        disabled={restoring === b.name}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {restoring === b.name
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <RotateCcw className="w-3.5 h-3.5" />
                                        }
                                        Restore
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Restore Result */}
            {restoreLog && (
                <div className={`bg-card rounded-xl border overflow-hidden ${restoreLog.ok ? 'border-green-500/30' : 'border-red-500/30'}`}>
                    <div className={`px-4 py-3 border-b flex items-center gap-2 ${restoreLog.ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                        {restoreLog.ok
                            ? <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm font-semibold text-green-600">Restore Berhasil</span></>
                            : <><XCircle className="w-4 h-4 text-red-500" /><span className="text-sm font-semibold text-red-600">Restore Gagal</span></>
                        }
                        <span className="text-xs text-muted-foreground ml-auto font-mono">{restoreLog.file}</span>
                    </div>
                    <pre className="p-4 text-xs font-mono text-foreground bg-background/50 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed custom-scrollbar">
                        {restoreLog.log}
                    </pre>
                </div>
            )}

            {/* Restore from other VPS — Upload section */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                    <Server className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Restore dari VPS lain</h2>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Upload file backup <span className="font-mono bg-muted px-1 rounded">.tar.gz</span> yang didownload dari instalasi Salfanet RADIUS lain, lalu langsung restore ke VPS ini.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <label
                            htmlFor={fileInputId}
                            className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                        >
                            <Upload className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm text-muted-foreground truncate">
                                {uploadFile ? uploadFile.name : 'Pilih file backup (.tar.gz)…'}
                            </span>
                        </label>
                        <input
                            id={fileInputId}
                            type="file"
                            accept=".tar.gz,application/gzip,application/x-gzip"
                            className="hidden"
                            onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                            disabled={uploading}
                        />
                        <button
                            onClick={handleUploadRestore}
                            disabled={!uploadFile || uploading}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        >
                            {uploading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <RotateCcw className="w-4 h-4" />
                            }
                            {uploading ? 'Memproses…' : 'Upload & Restore'}
                        </button>
                    </div>
                    {uploadFile && (
                        <p className="text-xs text-muted-foreground">
                            Ukuran: {formatBytes(uploadFile.size)}
                            {uploadFile.size > 10 * 1024 * 1024 && (
                                <span className="ml-2 text-red-500 font-medium">⚠ Melebihi batas 10MB</span>
                            )}
                        </p>
                    )}
                </div>
            </div>

            {/* Backup Log */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-primary" />
                        Log Backup
                        {polling && <span className="text-xs text-amber-500 animate-pulse font-normal">● live</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                        {isDone && (
                            isSuccess
                                ? <span className="flex items-center gap-1 text-xs text-green-500 font-medium"><CheckCircle className="w-3.5 h-3.5" /> Selesai</span>
                                : log ? <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle className="w-3.5 h-3.5" /> Gagal</span> : null
                        )}
                        <button onClick={fetchData} disabled={polling} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50" title="Perbarui Data">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <pre
                    ref={logRef}
                    className="p-4 text-xs font-mono text-foreground bg-background/50 min-h-[120px] max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed custom-scrollbar"
                >
                    {log || <span className="text-muted-foreground italic">Belum ada log. Klik &quot;Buat Backup&quot; untuk memulai.</span>}
                </pre>
            </div>
        </div>
    );
}
