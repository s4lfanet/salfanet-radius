'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Server } from 'lucide-react';
import { apiAdmin } from '@/lib/api';
import { formatWIB } from '@/lib/timezone';
import { PonOptical } from './PonOptical';

interface PonPort {
  slot: number;
  port: number;
  label: string;
  total: number;
  online: number;
  offline: number;
  los: number;
  dyingGasp: number;
  unconfigured: number;
  averageRx: number | null;
}

interface Uplink {
  index: number;
  name: string;
  adminUp: boolean | null;
  operUp: boolean | null;
}

interface RackData {
  brand: string;
  model: string | null;
  multiSlot: boolean;
  ponPorts: PonPort[];
  uplinks: Uplink[];
  uplinksRead: boolean;
}

interface RackOnu {
  id: string;
  slot: number;
  port: number;
  onuId: number;
  serialNumber: string | null;
  macAddress: string | null;
  onuType?: string | null;
  status: string;
  description: string | null;
  rxPower: number | null;
  distance: number | null;
}

interface RackOlt {
  id: string;
  ipAddress: string;
  vendor: string | null;
  temperature: number | null;
  lastPollAt: string | null;
  onuStatuses: RackOnu[];
}

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  los: 'LOS',
  dying_gasp: 'Dying gasp',
  auth_failed: 'Belum terdaftar',
};

const TONES = {
  good: 'border-green-600/60 bg-green-50 dark:bg-green-950/40',
  partial: 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/40',
  down: 'border-red-600/60 bg-red-50 dark:bg-red-950/40',
  idle: 'border-border bg-muted/40',
};

const DOTS = {
  good: 'bg-green-500',
  partial: 'bg-amber-500',
  down: 'bg-red-500',
  idle: 'bg-slate-400 dark:bg-slate-600',
};

function portTone(port: PonPort): keyof typeof TONES {
  if (port.total === 0) return 'idle';
  if (port.online === port.total) return 'good';
  return port.online === 0 ? 'down' : 'partial';
}

function uplinkState(uplink: Uplink): { text: string; tone: keyof typeof TONES } {
  if (uplink.operUp === null) return { text: 'Tidak terbaca', tone: 'idle' };
  if (uplink.adminUp === false) return { text: 'Nonaktif', tone: 'idle' };
  return uplink.operUp ? { text: 'Up', tone: 'good' } : { text: 'Down', tone: 'partial' };
}

function portSummary(port: PonPort): string {
  const parts = [
    port.los > 0 ? `${port.los} LOS` : null,
    port.dyingGasp > 0 ? `${port.dyingGasp} dying gasp` : null,
    port.offline > 0 ? `${port.offline} offline` : null,
    port.unconfigured > 0 ? `${port.unconfigured} belum terdaftar` : null,
  ].filter(Boolean);
  return parts.join(', ');
}

/** Port map for brands without a ZTE chassis: PON ports with their ONUs, and the uplinks. */
export function StandaloneRack({ olt }: { olt: RackOlt }) {
  const [rack, setRack] = useState<RackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    apiAdmin<{ success?: boolean; rack?: RackData }>(`/api/olt/${olt.id}/rack`)
      .then((response) => {
        if (response.success && response.rack) setRack(response.rack);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [olt.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!rack) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {loading && 'Memuat peta port...'}
        {!loading && failed && (
          <>
            Peta port tidak bisa dimuat.{' '}
            <button type="button" onClick={load} className="underline">
              Coba lagi
            </button>
          </>
        )}
      </div>
    );
  }

  const keyOf = (port: PonPort) => `${port.slot}/${port.port}`;
  const selectedPort = rack.ponPorts.find((port) => keyOf(port) === selected) ?? null;
  const portOnus = selectedPort
    ? olt.onuStatuses
        .filter((onu) => onu.port === selectedPort.port && (!rack.multiSlot || onu.slot === selectedPort.slot))
        .sort((a, b) => a.onuId - b.onuId)
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-semibold text-foreground">
                {rack.brand} {rack.model ?? ''}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {rack.ponPorts.length} PON, {rack.uplinks.length} uplink
              {olt.temperature !== null ? `, ${olt.temperature}°C` : ''}
              {olt.lastPollAt ? `. Data ONU: ${formatWIB(olt.lastPollAt, 'HH:mm')}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{olt.ipAddress}</span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Port PON</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {rack.ponPorts.map((port) => {
                const tone = portTone(port);
                const active = keyOf(port) === selected;
                return (
                  <button
                    key={keyOf(port)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(active ? null : keyOf(port))}
                    title={portSummary(port) || undefined}
                    className={`min-h-14 rounded-md border px-2.5 py-2 text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TONES[tone]} ${active ? 'ring-2 ring-ring' : ''}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[tone]}`} />
                      <span className="truncate font-mono text-xs font-semibold text-foreground">{port.label}</span>
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                      {port.total === 0 ? 'Tanpa ONU' : `${port.online}/${port.total} online`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Uplink</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {rack.uplinks.map((uplink) => {
                const state = uplinkState(uplink);
                return (
                  <div key={uplink.index} className={`rounded-md border px-2.5 py-2 ${TONES[state.tone]}`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[state.tone]}`} />
                      <span className="truncate font-mono text-xs font-semibold text-foreground">{uplink.name}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{state.text}</span>
                  </div>
                );
              })}
            </div>
            {!rack.uplinksRead && (
              <p className="mt-2 text-xs text-muted-foreground">
                OLT tidak menjawab tabel interface lewat SNMP, jadi nama dan status uplink di atas bukan data asli.
              </p>
            )}
          </section>
        </div>
      </div>

      {selectedPort && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {selectedPort.label}: {selectedPort.online} dari {selectedPort.total} ONU online
          </h3>
          {(portSummary(selectedPort) || selectedPort.averageRx !== null) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[portSummary(selectedPort), selectedPort.averageRx !== null ? `rata-rata Rx ${selectedPort.averageRx} dBm` : ''].filter(Boolean).join('. ')}
            </p>
          )}
          {olt.vendor?.toLowerCase() === 'hioso' && <PonOptical oltId={olt.id} slot={selectedPort.slot} port={selectedPort.port} />}
          {portOnus.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Tidak ada ONU di port ini.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">ONU</th>
                    <th className="py-1.5 pr-3 font-medium">Nama</th>
                    <th className="py-1.5 pr-3 font-medium">Serial / MAC</th>
                    <th className="py-1.5 pr-3 font-medium">Tipe</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Rx (dBm)</th>
                    <th className="py-1.5 text-right font-medium">Jarak (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {portOnus.map((onu) => (
                    <tr key={onu.id} className="border-b border-border/60 last:border-0">
                      <td className="py-1.5 pr-3 font-mono tabular-nums">{onu.onuId}</td>
                      <td className="max-w-[12rem] truncate py-1.5 pr-3">{onu.description || <span className="text-yellow-600 dark:text-yellow-400">N/A</span>}</td>
                      <td className="py-1.5 pr-3 font-mono">{onu.serialNumber || onu.macAddress || '-'}</td>
                      <td className="py-1.5 pr-3">{onu.onuType || '-'}</td>
                      <td className="py-1.5 pr-3">{STATUS_LABEL[onu.status] ?? onu.status}</td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{onu.rxPower ?? '-'}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{onu.distance ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
