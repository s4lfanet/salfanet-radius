'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/hooks/useTranslation';
import {
    Database, Plus, Trash2, Search, Edit2, Check, X,
    Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface RadCheckItem {
    id: number;
    username: string;
    attribute: string;
    op: string;
    value: string;
}

export default function RadCheckPage() {
    const { t } = useTranslation();
    const { addToast, confirm } = useToast();
    const [items, setItems] = useState<RadCheckItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [mockMode, setMockMode] = useState(false);

    // New Item State
    const [showAdd, setShowAdd] = useState(false);
    const [newItem, setNewItem] = useState({
        username: '',
        attribute: 'Cleartext-Password',
        op: ':=',
        value: ''
    });

    const fetchItems = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/freeradius/radcheck?page=${page}&limit=10&search=${search}`);
            const data = await response.json();

            if (response.ok && data.success) {
                setItems(data.data);
                setTotalPages(Math.ceil((data.total || 0) / 10));
                if (data.error && data.error.includes('mock')) {
                    setMockMode(true);
                }
            }
        } catch (error) {
            console.error('Error fetching radcheck:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search]);

    const handleDelete = async (id: number) => {
        if (await confirm({
            title: t('radius.deleteConfirm'),
            message: t('radius.deleteWarning'),
            confirmText: t('common.yes'),
            cancelText: t('common.cancel'),
            variant: 'danger',
        })) {
            try {
                const res = await fetch(`/api/freeradius/radcheck?id=${id}`, { method: 'DELETE' });
                if (res.ok) {
                    addToast({ type: 'success', title: 'Deleted!', description: 'Item has been deleted.' });
                    fetchItems();
                } else {
                    throw new Error('Failed to delete');
                }
            } catch (err) {
                addToast({ type: 'error', title: 'Error', description: 'Failed to delete item' });
            }
        }
    };

    const handleAdd = async () => {
        if (!newItem.username || !newItem.value) {
            addToast({ type: 'error', title: 'Error', description: t('radius.requiredFields') });
            return;
        }

        try {
            const res = await fetch('/api/freeradius/radcheck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });

            if (res.ok) {
                addToast({ type: 'success', title: t('common.success'), description: t('radius.createSuccess') });
                setShowAdd(false);
                setNewItem({ username: '', attribute: 'Cleartext-Password', op: ':=', value: '' });
                fetchItems();
            } else {
                throw new Error('Failed to create');
            }
        } catch (err) {
            addToast({ type: 'error', title: 'Error', description: 'Failed to create item' });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Database className="w-6 h-6 text-primary" />
                        {t('radius.radCheckTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('radius.radCheckSubtitle')}
                    </p>
                    {mockMode && (
                        <span className="text-xs text-amber-500 font-medium">{t('radius.mockMode')}</span>
                    )}
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    {t('radius.addAttribute')}
                </button>
            </div>

            {/* Main Card */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Search */}
                <div className="p-4 border-b border-border bg-muted/20">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('radius.searchUser')}
                            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden space-y-3 p-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">{t('radius.noRecords')}</div>
                    ) : (
                        items.map((item) => (
                            <div key={item.id} className="bg-card/80 backdrop-blur-xl rounded-xl border border-[#bc13fe]/20 p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-foreground">{item.username}</span>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                        title="Hapus"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 text-xs">
                                    <div>
                                        <span className="text-muted-foreground">ID</span>
                                        <p className="font-mono text-xs">{item.id}</p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">{t('radius.op')}</span>
                                        <p className="font-mono text-xs text-primary">{item.op}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-muted-foreground">Attribute</span>
                                        <p className="font-mono text-xs text-muted-foreground">{item.attribute}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-muted-foreground">{t('radius.value')}</span>
                                        <p className="font-mono text-xs bg-muted/20 px-1.5 py-0.5 rounded">{item.value}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop Table */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-6 py-3">ID</th>
                                <th className="px-6 py-3">{t('radius.username')}</th>
                                <th className="px-6 py-3">Attribute</th>
                                <th className="px-6 py-3">{t('radius.op')}</th>
                                <th className="px-6 py-3">{t('radius.value')}</th>
                                <th className="px-6 py-3 text-right">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        {t('common.loading')}
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                        {t('radius.noRecords')}
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="bg-card hover:bg-muted/50 border-b border-border last:border-0 transition-colors">
                                        <td className="px-6 py-3 font-mono text-xs">{item.id}</td>
                                        <td className="px-6 py-3 font-medium text-foreground">{item.username}</td>
                                        <td className="px-6 py-3 text-muted-foreground font-mono text-xs">{item.attribute}</td>
                                        <td className="px-6 py-3 font-mono text-xs text-primary">{item.op}</td>
                                        <td className="px-6 py-3 font-mono text-xs bg-muted/20">{item.value}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-border flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        {t('common.page')} {page} {t('common.of')} {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 border border-border rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 border border-border rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Add Item Modal/Panel - Simplified inline for now */}
            {showAdd && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2.5 sm:p-4">
                    <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-xl p-6">
                        <h3 className="text-lg font-bold mb-4">{t('radius.addAttribute')}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('radius.username')}</label>
                                <input
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                    value={newItem.username}
                                    onChange={e => setNewItem({ ...newItem, username: e.target.value })}
                                    placeholder="e.g., user1"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium block mb-1">Attribute</label>
                                    <input
                                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                        value={newItem.attribute}
                                        onChange={e => setNewItem({ ...newItem, attribute: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium block mb-1">{t('radius.op')}</label>
                                    <select
                                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                        value={newItem.op}
                                        onChange={e => setNewItem({ ...newItem, op: e.target.value })}
                                    >
                                        <option value=":=">:=</option>
                                        <option value="=">=</option>
                                        <option value="==">==</option>
                                        <option value="+=">+=</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('radius.value')}</label>
                                <input
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                    value={newItem.value}
                                    onChange={e => setNewItem({ ...newItem, value: e.target.value })}
                                    placeholder="e.g., password123"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg">{t('common.cancel')}</button>
                            <button onClick={handleAdd} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg">{t('common.save')}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
