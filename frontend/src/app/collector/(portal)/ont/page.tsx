'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiAdmin } from '@/lib/api/client';
import { Unplug, Activity } from 'lucide-react';

export default function CollectorOntPage() {
  const [removals, setRemovals] = useState<any[]>([]);
  const [meta, setMeta] = useState({ thisMonth: 0, lastMonth: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiAdmin<{ removals: any[]; thisMonth: number; lastMonth: number }>('/api/collector/ont-removals');
      setRemovals(res.removals || []);
      setMeta({ thisMonth: res.thisMonth || 0, lastMonth: res.lastMonth || 0 });
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData() }, [loadData]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Riwayat Cabut ONT</h2>
          <p className="text-sm text-muted-foreground mt-1">Rekap pencabutan perangkat yang kamu lakukan</p>
        </div>
        <button onClick={loadData} className="px-4 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent flex items-center gap-2">
          <Activity className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600">
            <Unplug className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Bulan Ini</div>
            <div className="text-2xl font-bold text-red-600">{meta.thisMonth}</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Unplug className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Bulan Lalu</div>
            <div className="text-2xl font-bold text-foreground">{meta.lastMonth}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Memuat...</div>
      ) : removals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <Unplug className="w-10 h-10 mx-auto mb-3 opacity-20" />
          Belum ada riwayat pencabutan ONT.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left p-3 font-medium text-muted-foreground">Pelanggan</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kontak</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Alamat</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Paket</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wilayah</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Catatan</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {removals.map((r, i) => (
                <tr key={r.id} className={`border-b border-border ${i % 2 === 0 ? '' : 'bg-accent/10'}`}>
                  <td className="p-3">
                    <div className="font-medium text-foreground">{r.fullname}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.customerId || r.username}</div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.phone || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate" title={r.address}>{r.address || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.profileName || '—'}</td>
                  <td className="p-3 text-muted-foreground">{r.areaName || '—'}</td>
                  <td className="p-3 text-muted-foreground">{r.notes || '—'}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">
                    {new Date(r.removedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
