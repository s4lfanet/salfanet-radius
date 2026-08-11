'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    FileText, Save, RotateCcw, CheckCircle, AlertTriangle,
    Loader2, Settings, Folder, ChevronRight, ChevronDown,
    FileCode, Terminal
} from 'lucide-react';
import { showConfirm } from '@/lib/sweetalert';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface FileItem {
    name: string;
    path: string;
    type: 'file' | 'link';
}

interface ConfigGroup {
    id: string;
    name: string;
    files: FileItem[];
}

export default function RadiusConfigPage() {
    const { t } = useTranslation();
    const { addToast, confirm } = useToast();
    const [groups, setGroups] = useState<ConfigGroup[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [loadingFile, setLoadingFile] = useState(false);
    const [loadingList, setLoadingList] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        'main': true,
        'sites-enabled': true
    });

    // Fetch directory listing
    const fetchConfigList = async () => {
        try {
            const response = await fetch('/api/freeradius/config/list');
            const data = await response.json();
            if (response.ok && data.success) {
                setGroups(data.groups);
                // Select first file by default if none selected
                if (!selectedFile && data.groups.length > 0 && data.groups[0].files.length > 0) {
                    setSelectedFile(data.groups[0].files[0].path);
                }
            }
        } catch (error) {
            console.error('Failed to load config list:', error);
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        fetchConfigList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch file content
    const fetchFileContent = async (filename: string) => {
        setLoadingFile(true);
        try {
            const response = await fetch('/api/freeradius/config/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setContent(data.content);
                setOriginalContent(data.content);
            } else {
                throw new Error(data.error || 'Failed to load file');
            }
        } catch (error: any) {
            addToast({ type: 'error', title: t('common.error'), description: error.message });
            setContent('');
        } finally {
            setLoadingFile(false);
        }
    };

    useEffect(() => {
        if (selectedFile) {
            fetchFileContent(selectedFile);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const handleSave = async () => {
        if (!selectedFile) return;

        if (!await confirm({
            title: t('radius.saveChanges'),
            message: t('radius.saveConfirm', { file: selectedFile }),
            confirmText: t('radius.saveChanges'),
            cancelText: t('common.cancel'),
            variant: 'warning',
        })) return;
        setSaving(true);
        try {
            const response = await fetch('/api/freeradius/config/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: selectedFile,
                    content
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setOriginalContent(content);
                addToast({ type: 'success', title: t('common.success'), description: t('radius.saveSuccess'), duration: 2000 });

                // Ask to restart service
                if (await confirm({
                    title: t('radius.restartPrompt'),
                    message: t('radius.restartDesc'),
                    confirmText: t('radius.restartService'),
                    cancelText: t('common.cancel'),
                    variant: 'info',
                })) {
                    const restartRes = await fetch('/api/freeradius/restart', { method: 'POST' });
                    const restartData = await restartRes.json();
                    if (restartRes.ok && restartData.success) {
                        addToast({ type: 'success', title: 'Success', description: t('radius.success') });
                    } else {
                        addToast({ type: 'error', title: 'Error', description: restartData.error || 'Failed to restart' });
                    }
                }
            } else {
                throw new Error(data.error || 'Failed to save');
            }
        } catch (error: any) {
            addToast({ type: 'error', title: t('common.error'), description: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (content !== originalContent) {
            if (await confirm({
                title: t('radius.confirmAction'),
                message: t('radius.unsavedChanges'),
                confirmText: t('radius.clearView'),
                cancelText: t('common.cancel'),
                variant: 'warning',
            })) {
                setContent(originalContent);
            }
        }
    };

    const hasChanges = content !== originalContent;

    return (
        <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                    <Settings className="w-6 h-6 text-primary" />
                    {t('radius.configTitle')}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {t('radius.configSubtitle')}
                </p>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Sidebar: File Explorer */}
                <div className="w-64 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-border bg-muted/20 font-medium text-sm flex items-center gap-2">
                        <Folder className="w-4 h-4 text-primary" />
                        {t('radius.configExplorer')}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {loadingList ? (
                            <div className="flex justify-center p-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : groups.map(group => (
                            <div key={group.id} className="space-y-0.5">
                                <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                                >
                                    {expandedGroups[group.id] ? (
                                        <ChevronDown className="w-3 h-3" />
                                    ) : (
                                        <ChevronRight className="w-3 h-3" />
                                    )}
                                    <Folder className={`w-3.5 h-3.5 ${expandedGroups[group.id] ? 'text-blue-400' : 'text-gray-400'}`} />
                                    {group.name}
                                </button>

                                {expandedGroups[group.id] && (
                                    <div className="ml-2 pl-2 border-l border-border space-y-0.5">
                                        {group.files.length === 0 ? (
                                            <div className="px-2 py-1 text-[10px] text-muted-foreground italic">
                                                Empty
                                            </div>
                                        ) : (
                                            group.files.map(file => (
                                                <button
                                                    key={file.path}
                                                    onClick={async () => {
                                                        if (selectedFile !== file.path) {
                                                            // Prompt if unsaved changes? For now just switch
                                                            if (hasChanges) {
                                                                const confirmed = await showConfirm(t('radius.unsavedChanges'));
                                                                if (!confirmed) return;
                                                            }
                                                            setSelectedFile(file.path);
                                                        }
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors text-left truncate ${selectedFile === file.path
                                                            ? 'bg-primary/10 text-primary border border-primary/20'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                                                        }`}
                                                >
                                                    <FileCode className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{file.name}</span>
                                                    {file.type === 'link' && (
                                                        <span className="ml-auto text-[9px] px-1 bg-muted rounded text-muted-foreground">link</span>
                                                    )}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Editor Area */}
                <div className="flex-1 bg-card rounded-xl border border-border flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-3 border-b border-border flex items-center justify-between bg-muted/20">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary" />
                                {selectedFile || t('radius.selectFile')}
                            </span>
                            {loadingFile && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleReset}
                                disabled={!hasChanges || loadingFile || saving}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                                title="Revert Changes"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!hasChanges || loadingFile || saving || !selectedFile}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50 ${hasChanges
                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_10px_rgba(0,255,255,0.3)]'
                                        : 'bg-muted text-muted-foreground'
                                    }`}
                            >
                                {saving ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Save className="w-3 h-3" />
                                )}
                                {t('radius.saveChanges')}
                            </button>
                        </div>
                    </div>

                    {/* Editor */}
                    <div className="flex-1 relative bg-muted/50 dark:bg-[#1e1e1e] font-mono text-sm group">
                        {!selectedFile ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                <Settings className="w-12 h-12 mb-4 opacity-20" />
                                <p>{t('radius.selectFileDesc')}</p>
                            </div>
                        ) : loadingFile ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full h-full p-4 bg-transparent text-foreground resize-none focus:outline-none leading-relaxed custom-scrollbar font-mono"
                                spellCheck={false}
                                autoCorrect="off"
                            />
                        )}
                    </div>

                    {/* Footer Status */}
                    <div className="px-3 py-1.5 border-t border-border bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                            {hasChanges ? (
                                <span className="text-amber-500 flex items-center gap-1 font-bold">
                                    <AlertTriangle className="w-3 h-3" /> {t('radius.unsavedChanges')}
                                </span>
                            ) : (
                                <span className="text-green-500 flex items-center gap-1 font-bold">
                                    <CheckCircle className="w-3 h-3" /> {t('radius.synced')}
                                </span>
                            )}
                        </div>
                        <div>
                            {selectedFile && `${content.length} chars | ${content.split('\n').length} lines`}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
