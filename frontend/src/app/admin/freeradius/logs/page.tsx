'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    Terminal, Pause, Play, Download, Trash2,
    Search, Filter, Activity
} from 'lucide-react';

export default function RadiusLogsPage() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(true);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const logEndRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            const response = await fetch('/api/freeradius/logs?lines=100');
            const data = await response.json();

            if (response.ok && data.success) {
                setLogs(data.logs.split('\n').filter(Boolean));
                setLoading(false);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        }
    };

    useEffect(() => {
        fetchLogs(); // Initial fetch

        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(fetchLogs, 3000); // Poll every 3 seconds
        }

        return () => clearInterval(interval);
    }, [isPlaying]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (isPlaying && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isPlaying]);

    const filteredLogs = logs.filter(log =>
        log.toLowerCase().includes(search.toLowerCase())
    );

    const getLogColor = (log: string) => {
        if (log.includes('Error')) return 'text-red-400';
        if (log.includes('Warning')) return 'text-amber-400';
        if (log.includes('Access-Accept')) return 'text-green-400';
        if (log.includes('Access-Reject')) return 'text-red-400';
        if (log.includes('Info')) return 'text-blue-400';
        if (log.includes('Debug')) return 'text-gray-500';
        return 'text-gray-300';
    };

    const downloadLogs = () => {
        const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `radius-logs-${new Date().toISOString()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Activity className="w-6 h-6 text-primary" />
                        {t('radius.logsTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('radius.logsSubtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
                    <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`p-2 rounded-md transition-colors ${isPlaying
                                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                            }`}
                        title={isPlaying ? t('radius.paused') : t('radius.live')}
                    >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <div className="h-4 w-px bg-border mx-1" />

                    <button
                        onClick={() => setLogs([])}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted rounded-md transition-colors"
                        title={t('radius.clearView')}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                        onClick={downloadLogs}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        title={t('radius.downloadLogs')}
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 bg-card rounded-xl border border-border flex flex-col overflow-hidden shadow-sm">
                {/* Search Bar */}
                <div className="p-3 border-b border-border bg-muted/20 flex items-center gap-3">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('radius.searchLogs')}
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                        <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        {isPlaying ? t('radius.live') : t('radius.paused')}
                    </div>
                </div>

                {/* Log Viewer */}
                <div className="flex-1 bg-[#1e1e1e] overflow-y-auto p-4 font-mono text-xs custom-scrollbar">
                    {loading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Activity className="w-8 h-8 mb-4 animate-pulse" />
                            <p>Connecting to log stream...</p>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Search className="w-8 h-8 mb-4 opacity-50" />
                            <p>No logs found matching "{search}"</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredLogs.map((log, index) => (
                                <div key={index} className={`break-all hover:bg-white/5 px-2 py-0.5 rounded ${getLogColor(log)}`}>
                                    <span className="opacity-50 select-none mr-3 text-[10px] w-8 inline-block text-right">{index + 1}</span>
                                    {log}
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
