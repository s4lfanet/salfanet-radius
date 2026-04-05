'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    Archive, RefreshCw, Play, CheckCircle, XCircle,
    Loader2, Terminal, GitBranch, Clock,
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

export default function FreeRADIUSBackupPage() {
    const { t } = useTranslation();
    const { addToast, confirm } = useToast();

    const [running, setRunning] = useState(false);
    const [log, setLog] = useState('');
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);
    const logRef = useRef<HTMLPreElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLog = async () => {
        try {
            const res = await fetch('/api/admin/system/freeradius-backup');
            const data = await res.json();
            if (res.ok && data.log !== undefined) {
                setLog(data.log);
                // Auto-scroll to bottom
                requestAnimationFrame(() => {
                    if (logRef.current) {
                        logRef.current.scrollTop = logRef.current.scrollHeight;
                    }
                });
            }
        } catch { /* ignore */ }
    };

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setPolling(false);
        setRunning(false);
    };

    const startPolling = () => {
        setPolling(true);
        // Poll every 1.5s for 90s max, then stop
        let ticks = 0;
        pollRef.current = setInterval(async () => {
            ticks++;
            await fetchLog();
            if (ticks >= 60) stopPolling(); // 60 × 1.5s = 90s
        }, 1500);
    };

    useEffect(() => {
        // Load last log on mount
        fetchLog();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const handleBackup = async () => {
        if (!await confirm({
            title: 'Backup Config ke GitHub?',
            message: 'Script akan menarik config yang sedang berjalan di VPS (/etc/freeradius/3.0/) lalu commit & push ke GitHub. Lanjutkan?',
            confirmText: 'Jalankan Backup',
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
            setLastRun(new Date().toLocaleString('id-ID'));
            startPolling();
            addToast({ type: 'info', title: 'Berjalan', description: 'Backup dimulai — log akan muncul di bawah', duration: 3000 });
        } catch (e: any) {
            addToast({ type: 'error', title: 'Error', description: e.message });
            setRunning(false);
        }
    };

    const isDone = log.includes('Backup complete') || log.includes('already in sync') || log.includes('Error') || log.includes('not found');
    const isSuccess = log.includes('Backup complete') || log.includes('already in sync');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Archive className="w-6 h-6 text-primary" />
                        Backup Config ke GitHub
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Tarik config FreeRADIUS yang sedang berjalan di VPS dan simpan ke repository GitHub
                    </p>
                </div>
                <button
                    onClick={handleBackup}
                    disabled={running || polling}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {running || polling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Play className="w-4 h-4" />
                    )}
                    {running || polling ? 'Menjalankan...' : 'Jalankan Backup'}
                </button>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Terminal className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Script</p>
                        <p className="text-sm font-mono font-medium text-foreground">backup-freeradius-to-git.sh</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <GitBranch className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Sumber</p>
                        <p className="text-sm font-mono font-medium text-foreground">/etc/freeradius/3.0/</p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                        <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Terakhir dijalankan</p>
                        <p className="text-sm font-medium text-foreground">{lastRun || '—'}</p>
                    </div>
                </div>
            </div>

            {/* Files that will be synced */}
            <div className="bg-card rounded-xl border border-border p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Archive className="w-4 h-4 text-primary" />
                    File yang akan di-sync
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {[
                        'clients.conf',
                        'clients.d/nas-from-db.conf',
                        'mods-available/sql',
                        'mods-available/rest',
                        'mods-available/mschap',
                        'mods-enabled/sql',
                        'mods-enabled/rest',
                        'policy.d/filter',
                        'sites-available/default',
                        'sites-available/coa',
                        'sites-enabled/default',
                    ].map(file => (
                        <div key={file} className="flex items-center gap-2 text-xs font-mono text-muted-foreground py-1 px-2 bg-muted/30 rounded">
                            <span className="text-primary">→</span>
                            {file}
                        </div>
                    ))}
                </div>
            </div>

            {/* Log Output */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-primary" />
                        Output Log
                        {polling && <span className="text-xs text-amber-500 animate-pulse font-normal">● live</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                        {isDone && (
                            isSuccess
                                ? <span className="flex items-center gap-1 text-xs text-green-500 font-medium"><CheckCircle className="w-3.5 h-3.5" /> Selesai</span>
                                : <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle className="w-3.5 h-3.5" /> Gagal</span>
                        )}
                        <button
                            onClick={fetchLog}
                            disabled={polling}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                            title="Refresh log"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <pre
                    ref={logRef}
                    className="p-4 text-xs font-mono text-foreground bg-background/50 min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-relaxed custom-scrollbar"
                >
                    {log || <span className="text-muted-foreground italic">Belum ada output. Klik &quot;Jalankan Backup&quot; untuk memulai.</span>}
                </pre>
            </div>
        </div>
    );
}
