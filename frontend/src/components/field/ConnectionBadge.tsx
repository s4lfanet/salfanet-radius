import { AlertTriangle, Wifi, WifiOff, HelpCircle } from 'lucide-react';

export type ConnectionState = 'online' | 'offline' | 'unknown';

const STATE_STYLE: Record<ConnectionState, { cls: string; label: string }> = {
  online: { cls: 'bg-green-500/10 text-green-600 dark:text-green-400', label: 'Online' },
  offline: { cls: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Offline' },
  unknown: { cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: 'Tidak diketahui' },
};

/** Online / Offline / Tidak diketahui — same wording on every technician page. */
export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const s = STATE_STYLE[state];
  const Icon = state === 'online' ? Wifi : state === 'offline' ? WifiOff : HelpCircle;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${s.cls}`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

/** Where an online session was seen: RADIUS accounting or the router itself. */
export function SourceBadge({ source }: { source?: 'radius' | 'mikrotik' | null }) {
  if (!source) return null;
  const radius = source === 'radius';
  return (
    <span
      title={radius ? 'Terdeteksi dari RADIUS (accounting)' : 'Terdeteksi langsung dari router MikroTik (mode lokal)'}
      className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${radius ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'}`}
    >
      {radius ? 'RADIUS' : 'Lokal'}
    </span>
  );
}

/** Shown when some routers could not be queried, so their customers are "tidak diketahui". */
export function UnreachableNotice({ routers }: { routers?: Array<{ id: string; name: string }> }) {
  if (!routers || routers.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Router tidak dapat dihubungi: <b>{routers.map((r) => r.name).join(', ')}</b>. Status pelanggan di router tersebut
        tidak bisa dipastikan (ditandai &quot;Tidak diketahui&quot;), bukan offline.
      </p>
    </div>
  );
}
