'use client';

import { useEffect, useState } from 'react';
import { MapPin, Router } from 'lucide-react';
import { apiAdmin } from '@/lib/api';

export interface ScopeValue {
  areaId: string;
  routerId: string;
}

type Option = { id: string; name: string };

/** Query string for the collector list APIs, e.g. "&areaId=..&routerId=..". */
export function scopeQuery(v: ScopeValue): string {
  const p = new URLSearchParams();
  if (v.areaId) p.set('areaId', v.areaId);
  if (v.routerId) p.set('routerId', v.routerId);
  const s = p.toString();
  return s ? `&${s}` : '';
}

/**
 * Area and Router/NAS filter for the collector's lists. The choices are the
 * areas and routers among this collector's own customers; a select appears
 * only when there is more than one to choose from.
 */
export function ScopeFilter({ value, onChange }: { value: ScopeValue; onChange: (v: ScopeValue) => void }) {
  const [areas, setAreas] = useState<Option[]>([]);
  const [routers, setRouters] = useState<Option[]>([]);

  useEffect(() => {
    apiAdmin<{ filters?: { areas: Option[]; routers: Option[] } }>('/api/collector/auth/session')
      .then((d) => {
        setAreas(d.filters?.areas ?? []);
        setRouters(d.filters?.routers ?? []);
      })
      .catch(() => {});
  }, []);

  if (areas.length < 2 && routers.length < 2) return null;

  const select = 'w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {areas.length > 1 && (
        <div className="relative">
          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select aria-label="Filter area" value={value.areaId} onChange={(e) => onChange({ ...value, areaId: e.target.value })} className={select}>
            <option value="">Semua area</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      {routers.length > 1 && (
        <div className="relative">
          <Router className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select aria-label="Filter router" value={value.routerId} onChange={(e) => onChange({ ...value, routerId: e.target.value })} className={select}>
            <option value="">Semua router/NAS</option>
            {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
