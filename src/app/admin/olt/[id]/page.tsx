'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Server, RefreshCw, AlertCircle, Wifi, WifiOff,
  Thermometer, Clock, Activity, ArrowLeft, Save, TestTube,
  Power, Download, CheckCircle, Signal, Plus, X, Cpu, Zap,
} from 'lucide-react';

interface ONU {
  id: string;
  frame: number;
  slot: number;
  port: number;
  onuId: number;
  serialNumber: string | null;
  macAddress: string | null;
  status: string;
  description: string | null;
  rxPower: number | null;
  txPower: number | null;
  temperature: number | null;
  distance: number | null;
  lastSeenAt: string | null;
  customer: { id: string; username: string; name: string; phone: string } | null;
}

interface OLTDetail {
  id: string;
  name: string;
  ipAddress: string;
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  isOnline: boolean;
  temperature: number | null;
  uptime: number | null;
  totalOnu: number;
  onlineOnu: number;
  offlineOnu: number;
  lastPollAt: string | null;
  monitoringEnabled: boolean;
  snmpEnabled: boolean;
  snmpCommunity: string;
  snmpPort: number;
  sshEnabled: boolean;
  sshPort: number;
  telnetEnabled: boolean;
  telnetPort: number;
  username: string | null;
  pollingInterval: number;
  onuStatuses: ONU[];
  alerts: any[];
  performanceMetrics: any[];
  monitoringLogs: any[];
  routers: { id: string; routerId: string; router: { id: string; name: string; ipAddress: string } }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ZTE C320 Realistic Chassis Diagram
// ─────────────────────────────────────────────────────────────────────────────

/** Card type visual metadata */
const CARD_META: Record<string, { label: string; color: string; portRows: number; portCols: number }> = {
  MCUD1:  { label: 'MCUD1',  color: '#2563eb', portRows: 0, portCols: 0 },
  MCUD:   { label: 'MCUD',   color: '#2563eb', portRows: 0, portCols: 0 },
  GTGQ:   { label: 'GTGQ',   color: '#15803d', portRows: 4, portCols: 4 },  // 16-port GPON
  GTGH:   { label: 'GTGH',   color: '#15803d', portRows: 2, portCols: 4 },  // 8-port GPON
  GTGO:   { label: 'GTGO',   color: '#15803d', portRows: 1, portCols: 4 },  // 4-port GPON
  GICF:   { label: 'GICF',   color: '#1e40af', portRows: 2, portCols: 2 },  // 4-port uplink
  GISF:   { label: 'GISF',   color: '#1e40af', portRows: 1, portCols: 4 },
  empty:  { label: 'EMPTY',  color: '#374151', portRows: 0, portCols: 0 },
};

/** ZTE C320 18-slot chassis definition (0=MCU-A … 17=MCU-B) */
const ZTE_C320_SLOTS = [
  { index: 0,  label: 'MCU-A', type: 'mcud',    fixedCard: 'MCUD1' },
  ...Array.from({ length: 14 }, (_, i) => ({
    index: i + 1, label: `${i + 1}`, type: 'service', fixedCard: null,
  })),
  { index: 15, label: 'UPL-A', type: 'uplink',  fixedCard: 'GICF' },
  { index: 16, label: 'UPL-B', type: 'uplink',  fixedCard: 'GICF' },
  { index: 17, label: 'MCU-B', type: 'mcud',    fixedCard: 'MCUD1' },
];

interface ChassisSlot {
  index: number;
  label: string;
  type: string;
  present: boolean;
  cardType: string;
  portCount: number;
  ports: Array<{ port: number; onuCount: number; onlineCount: number }>;
}

function ZTEChassisView({ olt }: { olt: OLTDetail }) {
  // ── Port stats from ONU list ───────────────────────────────────────────────
  const portStats: Record<string, { total: number; online: number; unregistered: number; rxPowers: number[] }> = {};
  const maxPortPerSlot: Record<number, number> = {};

  for (const onu of olt.onuStatuses) {
    const key = `${onu.slot}/${onu.port}`;
    if (!portStats[key]) portStats[key] = { total: 0, online: 0, unregistered: 0, rxPowers: [] };
    portStats[key].total++;
    if (onu.status === 'online') portStats[key].online++;
    if (onu.status === 'auth_failed') portStats[key].unregistered++;
    if (onu.rxPower !== null) portStats[key].rxPowers.push(onu.rxPower);
    if (maxPortPerSlot[onu.slot] === undefined || onu.port > maxPortPerSlot[onu.slot])
      maxPortPerSlot[onu.slot] = onu.port;
  }

  // ── Slot layout ────────────────────────────────────────────────────────────
  const slots: ChassisSlot[] = ZTE_C320_SLOTS.map(def => {
    if (def.type === 'mcud') {
      const present = def.index === 0 ? true : olt.isOnline;
      return { index: def.index, label: def.label, type: def.type, present, cardType: 'MCUD1', portCount: 0, ports: [] };
    }
    if (def.type === 'uplink') {
      const present = def.index === 15;
      const portCount = 4;
      return { index: def.index, label: def.label, type: def.type, present, cardType: 'GICF', portCount, ports: [] };
    }
    const maxPort = maxPortPerSlot[def.index] ?? -1;
    if (maxPort < 0)
      return { index: def.index, label: def.label, type: 'service', present: false, cardType: 'empty', portCount: 0, ports: [] };
    const portCount = Math.max(maxPort + 1, 16);
    const cardType = portCount <= 4 ? 'GTGO' : portCount <= 8 ? 'GTGH' : 'GTGQ';
    return { index: def.index, label: def.label, type: 'service', present: true, cardType, portCount, ports: [] };
  });

  // Only show MCU-A, active service slots (plus at least slot 1), uplink 15-16, MCU-B
  const activeServiceSlots = slots.filter(s => s.type === 'service' && s.present);
  const emptyServiceSlots  = slots.filter(s => s.type === 'service' && !s.present);
  // Always show at least slot 1 empty when no service cards discovered
  const serviceToShow = activeServiceSlots.length > 0
    ? [...activeServiceSlots, ...emptyServiceSlots.slice(0, Math.max(0, 2 - activeServiceSlots.length))]
    : [slots[1]];
  serviceToShow.sort((a, b) => a.index - b.index);

  const visibleSlots: ChassisSlot[] = [
    slots[0],            // MCU-A
    ...serviceToShow,    // active + a few empty service slots
    slots[15],           // UPL-A
    slots[16],           // UPL-B
    slots[17],           // MCU-B
  ];

  const activeCardsCount = slots.filter(s => s.present).length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatUptime = (secs: number | null) => {
    if (!secs) return 'N/A';
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const portColor = (slotIdx: number, portIdx: number): { bg: string; border: string; dot: string } => {
    const s = portStats[`${slotIdx}/${portIdx}`];
    if (!s || s.total === 0) return { bg: '#1e293b', border: '#334155', dot: '#475569' };
    if (s.online === s.total)  return { bg: '#14532d', border: '#16a34a', dot: '#4ade80' };
    if (s.online === 0)        return { bg: '#450a0a', border: '#dc2626', dot: '#f87171' };
    return { bg: '#431407', border: '#ea580c', dot: '#fb923c' };
  };

  const portTooltip = (slotIdx: number, portIdx: number) => {
    const s = portStats[`${slotIdx}/${portIdx}`];
    const avgRx = s && s.rxPowers.length > 0
      ? (s.rxPowers.reduce((a, b) => a + b, 0) / s.rxPowers.length).toFixed(1) : null;
    return s
      ? `PON 0/${slotIdx}/${portIdx}\n${s.online}/${s.total} online${avgRx ? `\nAvg RX: ${avgRx} dBm` : ''}`
      : `PON 0/${slotIdx}/${portIdx}\n(No ONU)`;
  };

  // ── Render each slot row ───────────────────────────────────────────────────
  const renderSlotRow = (slot: ChassisSlot) => {
    const isMcu    = slot.type === 'mcud';
    const isUplink = slot.type === 'uplink';
    const isActive = slot.present;

    const rowBg     = isActive ? (isMcu || isUplink ? '#0c1a2e' : '#0a1a0a') : '#0d1117';
    const rowBorder = isActive ? (isMcu || isUplink ? '#1d4ed8'  : '#15803d') : '#1e293b';
    const labelColor = isMcu || isUplink ? '#60a5fa' : '#4ade80';

    return (
      <div key={slot.index} className="flex items-center gap-0 rounded overflow-hidden select-none"
        style={{ background: rowBg, border: `1px solid ${rowBorder}`, minHeight: 40 }}>

        {/* Left accent bar */}
        <div style={{ width: 4, alignSelf: 'stretch', background: isActive ? rowBorder : '#1e293b' }} />

        {/* Card label */}
        <div className="flex items-center justify-start px-3" style={{ minWidth: 88 }}>
          {isActive ? (
            <span className="text-xs font-bold font-mono tracking-wider" style={{ color: labelColor }}>
              {slot.cardType}
            </span>
          ) : (
            <span className="text-xs text-gray-600 font-mono">—</span>
          )}
        </div>

        {/* Port area */}
        <div className="flex-1 py-2 pr-3">
          {!isActive ? (
            <span className="text-xs text-gray-700 tracking-widest">EMPTY</span>
          ) : isMcu ? (
            <div className="flex items-center gap-1.5">
              {['CON', 'MGT', 'AUX'].map(p => (
                <div key={p} className="px-2 py-0.5 rounded border border-blue-700 bg-blue-950/60 flex items-center justify-center">
                  <span className="text-[9px] font-mono text-blue-300">{p}</span>
                </div>
              ))}
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-1" />
            </div>
          ) : isUplink ? (
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-sm border flex items-center justify-center"
                  style={{ background: i < 2 ? '#1e3a8a' : '#1e293b', borderColor: i < 2 ? '#3b82f6' : '#334155' }}
                  title={`Uplink SFP+ port ${i + 1}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${i < 2 ? 'bg-blue-300' : 'bg-slate-600'}`} />
                </div>
              ))}
              <span className="ml-2 text-[9px] text-blue-400 font-mono">10GE SFP+</span>
            </div>
          ) : (
            /* GPON service card port grid */
            <div className="flex flex-wrap gap-0.5">
              {Array.from({ length: slot.portCount }, (_, i) => {
                const c = portColor(slot.index, i);
                const s = portStats[`${slot.index}/${i}`];
                return (
                  <div key={i}
                    className="w-6 h-6 rounded-sm border flex items-center justify-center cursor-default transition-all hover:brightness-150 hover:scale-110 hover:z-10 relative"
                    style={{ background: c.bg, borderColor: c.border }}
                    title={portTooltip(slot.index, i)}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
                    {s && s.unregistered > 0 && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400 border border-yellow-600" title="Unregistered ONU" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Slot number */}
        <div className="px-3 text-right" style={{ minWidth: 36 }}>
          <span className="text-xs text-gray-500 font-mono">{slot.index}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Main rack panel ── */}
      <div className="rounded-xl overflow-hidden shadow-xl" style={{ background: '#0d1117', border: '1px solid #30363d' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #21262d' }}>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-green-400" />
            <span className="font-semibold text-sm text-white">ZTE C320 Rack Diagram</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-mono">{olt.ipAddress}</span>
            <div className="flex items-center gap-1.5">
              {[
                { label: 'PWR', on: true, color: '#22c55e' },
                { label: 'SYS', on: olt.isOnline, color: '#22c55e' },
                { label: 'ALM', on: olt.alerts.length > 0, color: '#ef4444' },
              ].map(led => (
                <div key={led.label} className="flex items-center gap-1">
                  <div className={led.on ? 'animate-pulse' : ''}
                    style={{ width: 8, height: 8, borderRadius: '50%', background: led.on ? led.color : '#374151', boxShadow: led.on ? `0 0 5px ${led.color}` : 'none' }} />
                  <span style={{ fontSize: 8, color: '#6b7280', fontFamily: 'monospace' }}>{led.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row — 6 cards */}
        <div className="grid grid-cols-6" style={{ borderBottom: '1px solid #21262d' }}>
          {[
            { Icon: Clock,       label: 'UPTIME',       value: formatUptime(olt.uptime),                         accent: '#3b82f6' },
            { Icon: Thermometer, label: 'CHASSIS TEMP', value: olt.temperature ? `${olt.temperature}°C` : 'N/A', accent: '#22c55e' },
            { Icon: Activity,    label: 'AVG CPU',      value: 'N/A',                                            accent: '#22c55e' },
            { Icon: Server,      label: 'AVG MEMORY',   value: 'N/A',                                            accent: '#a855f7' },
            { Icon: Cpu,         label: 'ACTIVE CARDS', value: String(activeCardsCount),                         accent: '#3b82f6' },
            { Icon: Zap,         label: 'FAN STATUS',   value: olt.isOnline ? '2/2 OK' : 'N/A',                 accent: '#06b6d4' },
          ].map(({ Icon, label, value, accent }, i) => (
            <div key={i} className="p-3" style={{ background: '#161b22', borderRight: i < 5 ? '1px solid #21262d' : 'none', borderLeft: `3px solid ${accent}` }}>
              <div className="flex items-center gap-1 mb-1">
                <Icon className="h-3 w-3" style={{ color: accent }} />
                <span className="text-[8px] font-bold tracking-widest" style={{ color: accent }}>{label}</span>
              </div>
              <div className="text-sm font-bold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* Rack diagram body */}
        <div className="p-4 flex gap-3">

          {/* FAN column */}
          <div className="flex flex-col items-center justify-between py-3 px-2 rounded select-none"
            style={{ minWidth: 56, background: '#161b22', border: '1px solid #21262d' }}>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-cyan-400" />
              <span className="text-[9px] text-gray-400 font-mono font-bold">FAN</span>
            </div>
            <div className="flex flex-col items-center gap-4 my-2">
              {[1, 2].map(n => (
                <div key={n} className="flex flex-col items-center gap-1">
                  {/* Fan ring */}
                  <div className="relative w-9 h-9 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #16a34a' }} />
                    {/* Spinning blade */}
                    <div className="animate-spin" style={{ animationDuration: '2.5s' }}>
                      <svg width="20" height="20" viewBox="0 0 20 20">
                        <path d="M10 4 Q14 8 10 10 Q14 12 10 16 Q6 12 10 10 Q6 8 10 4Z" fill="#22c55e" opacity="0.8" />
                        <path d="M4 10 Q8 6 10 10 Q8 14 4 10 Q8 14 10 10 Q8 6 4 10 Q8 14 16 10 Q12 14 10 10 Q12 6 16 10Z" fill="#16a34a" opacity="0.5" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-[8px] text-green-400 font-mono">{n}</span>
                </div>
              ))}
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-green-400 font-mono">{olt.isOnline ? '2/2' : '0/2'}</div>
              <div className="text-[8px] text-gray-500">Active</div>
            </div>
          </div>

          {/* Slot rows */}
          <div className="flex-1 flex flex-col gap-1.5">
            {visibleSlots.map(slot => renderSlotRow(slot))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-4 py-2.5" style={{ background: '#0a0f14', borderTop: '1px solid #21262d' }}>
          {[
            { bg: '#14532d', border: '#16a34a', dot: '#4ade80', label: 'Online' },
            { bg: '#1e293b', border: '#334155', dot: '#475569', label: 'Disabled' },
            { bg: '#431407', border: '#ea580c', dot: '#fb923c', label: 'Admin UP / Port DOWN' },
            { bg: '#450a0a', border: '#dc2626', dot: '#f87171', label: 'LOS ONU' },
            { bg: '#713f12', border: '#ca8a04', dot: '#facc15', label: 'Unregistered' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm border flex items-center justify-center"
                style={{ background: item.bg, borderColor: item.border }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: item.dot }} />
              </div>
              <span className="text-[9px] text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Per-port detail table ── */}
      {Object.keys(portStats).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Detail Per Port PON</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {Object.entries(portStats)
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([portKey, s]) => {
                const pct = s.total > 0 ? (s.online / s.total) * 100 : 0;
                const avgRx = s.rxPowers.length > 0 ? (s.rxPowers.reduce((a, b) => a + b, 0) / s.rxPowers.length).toFixed(1) : null;
                return (
                  <div key={portKey} className="border border-gray-100 dark:border-gray-800 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">0/{portKey}</span>
                      <span className={`text-[10px] font-bold ${pct === 100 ? 'text-green-600' : pct === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                        {s.online}/{s.total}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-1">
                      <div
                        className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : pct === 0 ? 'bg-red-500' : 'bg-orange-400'}`}
                        style={{ width: `${Math.max(pct, s.total > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400">
                      <span>{s.total} ONU{s.unregistered > 0 ? ` · ${s.unregistered} unreg` : ''}</span>
                      {avgRx && <span>{avgRx} dBm</span>}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONU Registration Modal
// ─────────────────────────────────────────────────────────────────────────────

const ZTE_ONU_TYPES = [
  { value: 'All',       label: 'All (Auto-detect)' },
  { value: 'ZTE-F609',  label: 'ZTE-F609 (Router ONU)' },
  { value: 'ZTE-F660',  label: 'ZTE-F660 (Router ONU)' },
  { value: 'ZTE-F673',  label: 'ZTE-F673 (Router ONU)' },
  { value: 'ZTE-F600W', label: 'ZTE-F600W (Compact ONU)' },
  { value: 'ZTE-F612W', label: 'ZTE-F612W (WiFi ONU)' },
  { value: 'CZTE',      label: 'CZTE (Generic ZTE)' },
  { value: 'ZTEF680',   label: 'ZTEF680 (Enterprise ONU)' },
];

const ZTE_TCONT_PROFILES = [
  { value: '1G',   label: '1 Gbps' },
  { value: '100M', label: '100 Mbps' },
  { value: '50M',  label: '50 Mbps' },
  { value: '20M',  label: '20 Mbps' },
  { value: '10M',  label: '10 Mbps' },
  { value: 'FTTH-1G', label: 'FTTH-1G (if defined)' },
];

interface RegisterModalProps {
  oltId: string;
  onu: ONU;
  onClose: () => void;
  onSuccess: () => void;
}

function ONURegisterModal({ oltId, onu, onClose, onSuccess }: RegisterModalProps) {
  const [onuType, setOnuType] = useState('All');
  const [vlan, setVlan] = useState(100);
  const [tcontProfile, setTcontProfile] = useState('1G');
  const [description, setDescription] = useState('');
  const [onuId, setOnuId] = useState(onu.onuId ?? 1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/olt/${oltId}/onus/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame: onu.frame,
          slot:  onu.slot,
          port:  onu.port,
          onuId,
          serialNumber: onu.serialNumber,
          onuType,
          vlan,
          tcontProfile,
          description: description || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ ok: true, msg: data.message });
        setTimeout(() => { onSuccess(); onClose(); }, 1500);
      } else {
        setResult({ ok: false, msg: data.error ?? 'Registration failed' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 bg-green-50 dark:bg-green-950">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-600" /> Register ONU
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              PON 0/{onu.frame}/{onu.slot}/{onu.port} · ONU ID {onuId}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Serial number (read-only) */}
          <div>
            <Label className="text-xs text-gray-500">Serial Number (OLT detected)</Label>
            <div className="mt-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md font-mono text-sm text-gray-700 dark:text-gray-300">
              {onu.serialNumber ?? <span className="text-yellow-600">Unknown (unregistered ONU — no serial via SNMP)</span>}
            </div>
          </div>

          {/* ONU ID */}
          <div>
            <Label className="text-xs text-gray-500">ONU ID (1-128)</Label>
            <Input
              type="number" min={1} max={128}
              value={onuId}
              onChange={e => setOnuId(parseInt(e.target.value) || 1)}
              className="mt-1 font-mono"
            />
          </div>

          {/* ONU Type */}
          <div>
            <Label className="text-xs text-gray-500">ONU Type</Label>
            <Select value={onuType} onValueChange={setOnuType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZTE_ONU_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* VLAN */}
          <div>
            <Label className="text-xs text-gray-500">Service VLAN</Label>
            <Input
              type="number" min={1} max={4094}
              value={vlan}
              onChange={e => setVlan(parseInt(e.target.value) || 100)}
              className="mt-1 font-mono"
            />
          </div>

          {/* TCONT Profile */}
          <div>
            <Label className="text-xs text-gray-500">TCONT Profile (bandwidth)</Label>
            <Select value={tcontProfile} onValueChange={setTcontProfile}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZTE_TCONT_PROFILES.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs text-gray-500">Description / Customer Name (optional)</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. customer-name"
              className="mt-1"
            />
          </div>

          {/* Telnet command preview */}
          <div className="bg-gray-900 rounded-md p-3 text-xs font-mono text-green-400 space-y-0.5">
            <div className="text-gray-500 mb-1">Command preview:</div>
            <div>configure terminal</div>
            <div>interface gpon-olt_{onu.frame}/{onu.slot}/{onu.port + 1}</div>
            <div>  onu {onuId} type All sn {onu.serialNumber ?? '???'}</div>
            {description && <div>  onu {onuId} description {description}</div>}
            <div>exit</div>
            <div>interface gpon-onu_{onu.frame}/{onu.slot}/{onu.port + 1}:{onuId}</div>
            <div>  tcont 1 profile {tcontProfile}</div>
            <div>  gemport 1 tcont 1</div>
            <div>  service-port 1 vport 1 user-vlan {vlan} vlan {vlan}</div>
            <div>exit; end</div>
          </div>

          {/* Result */}
          {result && (
            <div className={`px-3 py-2 rounded-md text-sm ${result.ok ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
              {result.ok ? '✓ ' : '✗ '}{result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t dark:border-gray-800">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !onu.serialNumber}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" /> Registering…</> : <><Plus className="h-3 w-3 mr-1" /> Register ONU</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OLTDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [olt, setOlt] = useState<OLTDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [onuStatusFilter, setOnuStatusFilter] = useState('all');

  // Metrics & charts
  const [metrics, setMetrics] = useState<any[]>([]);
  const [metricsHours, setMetricsHours] = useState(24);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Batch reboot
  const [selectedOnus, setSelectedOnus] = useState<Set<string>>(new Set());
  const [rebootingOnu, setRebootingOnu] = useState<string | null>(null);
  const [confirmReboot, setConfirmReboot] = useState<string | null>(null);
  const [batchRebooting, setBatchRebooting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number; total: number;
    results: { serialNumber: string; success: boolean; error?: string }[];
  } | null>(null);

  // ONU registration
  const [registeringOnu, setRegisteringOnu] = useState<ONU | null>(null);

  // Settings state
  const [settings, setSettings] = useState({
    vendor: 'huawei',
    model: '',
    firmwareVersion: '',
    monitoringEnabled: false,
    snmpEnabled: true,
    snmpCommunity: 'public',
    snmpPort: 161,
    sshEnabled: false,
    sshPort: 22,
    telnetEnabled: false,
    telnetPort: 23,
    username: '',
    password: '',
    pollingInterval: 300,
    routerIds: [] as string[],
  });
  const [routerList, setRouterList] = useState<{ id: string; name: string; ipAddress: string }[]>([]);

  const fetchOLT = useCallback(async () => {
    try {
      const res = await fetch(`/api/olt/${id}`);
      if (res.ok) {
        const data = await res.json();
        const o = data.olt;
        setOlt(o);
        setSettings({
          vendor: o.vendor ?? 'huawei',
          model: o.model ?? '',
          firmwareVersion: o.firmwareVersion ?? '',
          monitoringEnabled: o.monitoringEnabled,
          snmpEnabled: o.snmpEnabled,
          snmpCommunity: o.snmpCommunity,
          snmpPort: o.snmpPort,
          sshEnabled: o.sshEnabled,
          sshPort: o.sshPort,
          telnetEnabled: o.telnetEnabled,
          telnetPort: o.telnetPort,
          username: o.username ?? '',
          password: '',
          pollingInterval: o.pollingInterval,
          routerIds: (o.routers ?? []).map((r: any) => r.routerId),
        });
      } else {
        router.push('/admin/olt/monitoring');
      }
    } catch (e) {
      console.error('Failed to fetch OLT', e);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchOLT(); }, [fetchOLT]);

  // Fetch available routers for assignment
  useEffect(() => {
    fetch('/api/network/routers')
      .then((r) => r.json())
      .then((data) => setRouterList(data.routers ?? []))
      .catch(() => {});
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/olt/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        await fetchOLT();
      }
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (protocol: string) => {
    setTesting(protocol);
    try {
      const res = await fetch('/api/olt/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId: id, protocol }),
      });
      const data = await res.json();
      alert(data.message || (data.success ? 'Connection successful' : 'Connection failed'));
    } catch (e) {
      alert('Test failed');
    } finally {
      setTesting(null);
    }
  };

  const handleManualPoll = async () => {
    setPolling(true);
    try {
      const res = await fetch('/api/olt/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oltId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Poll failed: ${data.error ?? 'Unknown error'}`);
      } else {
        await fetchOLT();
      }
    } catch (e) {
      console.error('Poll failed', e);
      alert('Poll failed — check network connection');
    } finally {
      setPolling(false);
    }
  };

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch(`/api/olt/metrics?oltId=${id}&hours=${metricsHours}`);
      if (res.ok) {
        const data = await res.json();
        // Map recordedAt → timestamp for recharts dataKey
        setMetrics((data.metrics ?? []).map((m: any) => ({ ...m, timestamp: m.recordedAt })));
      }
    } catch (e) {
      console.error('Failed to fetch metrics', e);
    } finally {
      setMetricsLoading(false);
    }
  }, [id, metricsHours]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const handleRebootOnu = async (onuId: string) => {
    setRebootingOnu(onuId);
    try {
      const res = await fetch(`/api/olt/${id}/onus/${onuId}/reboot`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Reboot failed');
      } else {
        setConfirmReboot(null);
      }
    } catch (e) {
      alert('Reboot request failed');
    } finally {
      setRebootingOnu(null);
    }
  };

  const handleBatchReboot = async () => {
    if (selectedOnus.size === 0) return;
    setBatchRebooting(true);
    const ids = Array.from(selectedOnus);
    setBatchProgress({ current: 0, total: ids.length, results: [] });
    const results: { serialNumber: string; success: boolean; error?: string }[] = [];
    for (let i = 0; i < ids.length; i++) {
      const onuId = ids[i];
      const onu = olt?.onuStatuses.find((o) => o.id === onuId);
      try {
        const res = await fetch(`/api/olt/${id}/onus/${onuId}/reboot`, { method: 'POST' });
        const data = await res.json();
        results.push({ serialNumber: onu?.serialNumber ?? onuId, success: res.ok, error: !res.ok ? data.error : undefined });
      } catch (e: any) {
        results.push({ serialNumber: onu?.serialNumber ?? onuId, success: false, error: e.message });
      }
      setBatchProgress({ current: i + 1, total: ids.length, results: [...results] });
    }
    setBatchRebooting(false);
    setSelectedOnus(new Set());
  };

  const handleExportCSV = () => {
    if (!olt) return;
    const rows = [
      ['Location', 'Serial Number', 'MAC', 'Status', 'RX Power (dBm)', 'Distance (m)', 'Customer', 'Username', 'Last Seen'],
      ...olt.onuStatuses.map((o) => [
        `${o.frame}/${o.slot}/${o.port}:${o.onuId}`,
        o.serialNumber ?? '',
        o.macAddress ?? '',
        o.status,
        o.rxPower?.toString() ?? '',
        o.distance?.toString() ?? '',
        o.customer?.name ?? '',
        o.customer?.username ?? '',
        o.lastSeenAt ? new Date(o.lastSeenAt).toLocaleString('id-ID') : '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onu-list-${olt.name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectOnu = (onuId: string) => {
    setSelectedOnus((prev) => {
      const next = new Set(prev);
      if (next.has(onuId)) next.delete(onuId); else next.add(onuId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const onus = filteredOnus;
    if (selectedOnus.size === onus.length) {
      setSelectedOnus(new Set());
    } else {
      setSelectedOnus(new Set(onus.map((o) => o.id)));
    }
  };

  const getSignalQuality = (rxPower: number | null) => {
    if (rxPower === null) return { label: 'N/A', color: 'text-gray-400' };
    if (rxPower >= -20) return { label: 'Excellent', color: 'text-green-600' };
    if (rxPower >= -25) return { label: 'Good', color: 'text-blue-600' };
    if (rxPower >= -27) return { label: 'Fair', color: 'text-yellow-600' };
    return { label: 'Poor', color: 'text-red-600' };
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':       return 'text-green-600';
      case 'dying_gasp':   return 'text-red-600';
      case 'los':          return 'text-orange-600';
      case 'auth_failed':  return 'text-yellow-600';
      default:             return 'text-gray-500';
    }
  };

  const filteredOnus = (olt?.onuStatuses ?? []).filter((o) =>
    onuStatusFilter === 'all' || o.status === onuStatusFilter
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!olt) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/olt/monitoring">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {olt.isOnline
                ? <Wifi className="h-5 w-5 text-green-500" />
                : <WifiOff className="h-5 w-5 text-red-500" />}
              {olt.name}
            </h1>
            <p className="text-gray-500 font-mono text-xs">{olt.ipAddress}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
          {olt.monitoringEnabled && (
            <Button onClick={handleManualPoll} variant="outline" size="sm" disabled={polling}>
              <RefreshCw className={`h-4 w-4 mr-2 ${polling ? 'animate-spin' : ''}`} />
              {polling ? 'Polling…' : 'Poll Now'}
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Status</div>
            <div className={`font-bold text-lg ${olt.isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {olt.isOnline ? 'Online' : 'Offline'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Thermometer className="h-3 w-3" /> Temperature</div>
            <div className={`font-bold text-lg ${olt.temperature !== null && olt.temperature > 60 ? 'text-red-600' : ''}`}>
              {olt.temperature !== null ? `${olt.temperature}°C` : 'N/A'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Uptime</div>
            <div className="font-bold text-lg">{formatUptime(olt.uptime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500 flex items-center gap-1"><Activity className="h-3 w-3" /> ONUs</div>
            <div className="font-bold text-lg">
              <span className="text-green-600">{olt.onlineOnu}</span>
              <span className="text-gray-400">/{olt.totalOnu}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="onus">
        <TabsList>
          <TabsTrigger value="onus">ONU List ({olt.totalOnu})</TabsTrigger>
          <TabsTrigger value="portmap">Port Map</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {olt.alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{olt.alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* ONU List Tab */}
        <TabsContent value="onus" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={onuStatusFilter} onValueChange={setOnuStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ONUs</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="dying_gasp">Dying Gasp</SelectItem>
                <SelectItem value="los">LOS</SelectItem>
                <SelectItem value="auth_failed">Unregistered</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500 self-center">{filteredOnus.length} ONUs</span>
            {selectedOnus.size > 0 && (
              <>
                <span className="text-sm font-medium text-blue-600">{selectedOnus.size} selected</span>
                <Button
                  onClick={handleBatchReboot}
                  disabled={batchRebooting}
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Power className="w-3 h-3 mr-1" />
                  {batchRebooting ? 'Rebooting...' : `Reboot ${selectedOnus.size} ONUs`}
                </Button>
              </>
            )}
          </div>

          {/* Batch Progress */}
          {batchProgress && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Processing batch reboot...</span>
                <span className="text-sm text-blue-700">{batchProgress.current} / {batchProgress.total}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              {batchProgress.results.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto space-y-0.5">
                  {batchProgress.results.map((r, i) => (
                    <div key={i} className={`text-xs py-0.5 ${r.success ? 'text-green-700' : 'text-red-700'}`}>
                      {r.success ? '✓' : '✗'} {r.serialNumber}{r.error && `: ${r.error}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedOnus.size === filteredOnus.length && filteredOnus.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </th>
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2 pr-4">Serial / MAC</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Signal</th>
                  <th className="pb-2 pr-4">RX Power</th>
                  <th className="pb-2 pr-4">Distance</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Last Seen</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOnus.map((onu) => {
                  const signalQuality = getSignalQuality(onu.rxPower);
                  return (
                    <tr key={onu.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedOnus.has(onu.id)}
                          onChange={() => handleSelectOnu(onu.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {onu.frame}/{onu.slot}/{onu.port}:{onu.onuId}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-mono text-xs">{onu.serialNumber ?? onu.macAddress ?? 'N/A'}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="text-xs text-gray-700 dark:text-gray-300">{onu.description ?? <span className="text-gray-400">—</span>}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`font-medium ${getStatusColor(onu.status)}`}>
                          {onu.status === 'auth_failed' ? 'Unregistered' : onu.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${signalQuality.color}`}>
                          <Signal className="w-3 h-3" />
                          {signalQuality.label}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {onu.rxPower !== null ? (
                          <span className={onu.rxPower < -27 ? 'text-red-600' : 'text-green-600'}>
                            {onu.rxPower.toFixed(2)} dBm
                          </span>
                        ) : 'N/A'}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {onu.distance !== null ? (
                          <span className="font-mono">{onu.distance} m</span>
                        ) : <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {onu.customer ? (
                          <div>
                            <div className="font-medium">{onu.customer.name}</div>
                            <div className="text-gray-500 text-xs">{onu.customer.username}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500">
                        {onu.lastSeenAt ? new Date(onu.lastSeenAt).toLocaleString('id-ID') : 'N/A'}
                      </td>
                      <td className="py-2">
                        {onu.status === 'auth_failed' ? (
                          /* Unregistered ONU — show Register button */
                          <button
                            onClick={() => setRegisteringOnu(onu)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            <Plus className="w-3 h-3" />
                            Register
                          </button>
                        ) : confirmReboot === onu.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleRebootOnu(onu.id)}
                              disabled={rebootingOnu === onu.id}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {rebootingOnu === onu.id ? 'Rebooting...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmReboot(null)}
                              className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmReboot(onu.id)}
                            disabled={rebootingOnu !== null || batchRebooting}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                          >
                            <Power className="w-3 h-3" />
                            Reboot
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredOnus.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-400">
                      No ONUs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Performance Metrics</h2>
            <div className="flex items-center gap-2">
              {metricsLoading && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
              <select
                value={metricsHours}
                onChange={(e) => setMetricsHours(Number(e.target.value))}
                className="px-2 py-1 text-xs border rounded dark:bg-gray-800 dark:text-gray-200"
              >
                <option value={6}>Last 6 hours</option>
                <option value={12}>Last 12 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
              </select>
            </div>
          </div>
          {metrics.length === 0 && !metricsLoading ? (
            <div className="text-center py-12 text-gray-400">
              <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No metrics data yet</p>
              <p className="text-xs">Enable monitoring and wait for polling</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* CPU & Memory */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">CPU &amp; Memory Usage (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip labelFormatter={(l) => new Date(l).toLocaleString('id-ID')} />
                      <Legend />
                      <Line type="monotone" dataKey="cpuUsage" stroke="#3b82f6" name="CPU" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="memoryUsage" stroke="#10b981" name="Memory" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Temperature */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Temperature (°C)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip labelFormatter={(l) => new Date(l).toLocaleString('id-ID')} />
                      <Legend />
                      <Area type="monotone" dataKey="temperature" stroke="#f59e0b" fill="#fbbf24" name="Temperature" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* ONU Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">ONU Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip labelFormatter={(l) => new Date(l).toLocaleString('id-ID')} />
                      <Legend />
                      <Area type="monotone" dataKey="onlineOnu" stackId="1" stroke="#10b981" fill="#34d399" name="Online" />
                      <Area type="monotone" dataKey="offlineOnu" stackId="1" stroke="#ef4444" fill="#f87171" name="Offline" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Network Traffic */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Network Traffic (TX/RX)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} fontSize={11} />
                      <YAxis tickFormatter={(v) => formatBytes(v)} fontSize={11} />
                      <Tooltip
                        labelFormatter={(l) => new Date(l).toLocaleString('id-ID')}
                        formatter={(v: any) => formatBytes(v)}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="txBytes" stroke="#8b5cf6" fill="#c4b5fd" name="TX" />
                      <Area type="monotone" dataKey="rxBytes" stroke="#06b6d4" fill="#67e8f9" name="RX" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-3">
          {olt.alerts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-gray-400">No active alerts</CardContent>
            </Card>
          ) : (
            olt.alerts.map((alert: any) => (
              <Card key={alert.id} className={alert.severity === 'critical' ? 'border-red-300' : ''}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`h-5 w-5 mt-0.5 ${alert.severity === 'critical' ? 'text-red-500' : 'text-orange-500'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alert.alertType.replace(/_/g, ' ')}</span>
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-gray-600 text-sm mt-1">{alert.message}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        {new Date(alert.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Settings</CardTitle>
              <CardDescription>Configure SNMP, SSH, Telnet and polling parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* General */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Vendor</Label>
                  <Select
                    value={settings.vendor}
                    onValueChange={(v) => setSettings((s) => ({ ...s, vendor: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="huawei">Huawei</SelectItem>
                      <SelectItem value="zte">ZTE</SelectItem>
                      <SelectItem value="fiberhome">FiberHome</SelectItem>
                      <SelectItem value="hioso">Hioso / C-Data</SelectItem>
                      <SelectItem value="bdcom">BDCOM</SelectItem>
                      <SelectItem value="raisecom">Raisecom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                    placeholder="e.g. C320"
                  />
                </div>
                <div>
                  <Label>Firmware Version</Label>
                  <Input
                    value={settings.firmwareVersion}
                    onChange={(e) => setSettings((s) => ({ ...s, firmwareVersion: e.target.value }))}
                    placeholder="e.g. V2.1.0 atau V2.2.0"
                  />
                </div>
                <div>
                  <Label>Polling Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={settings.pollingInterval}
                    onChange={(e) => setSettings((s) => ({ ...s, pollingInterval: parseInt(e.target.value) || 300 }))}
                    min={60}
                    max={3600}
                  />
                </div>
              </div>

              {/* Router / NAS */}
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="font-semibold">Router / NAS</Label>
                <p className="text-xs text-gray-500">Pilih router yang terhubung ke OLT ini. Digunakan untuk isolasi dan routing.</p>
                {routerList.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Tidak ada router. Tambahkan dulu di menu Router.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {routerList.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={settings.routerIds.includes(r.id)}
                          onChange={(e) => {
                            setSettings((s) => ({
                              ...s,
                              routerIds: e.target.checked
                                ? [...s.routerIds, r.id]
                                : s.routerIds.filter((rid) => rid !== r.id),
                            }));
                          }}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div>
                          <div className="text-sm font-medium">{r.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{r.ipAddress}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={settings.monitoringEnabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, monitoringEnabled: v }))}
                />
                <Label>Enable Monitoring</Label>
              </div>

              {/* SNMP */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.snmpEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, snmpEnabled: v }))}
                  />
                  <Label className="font-semibold">SNMP</Label>
                </div>
                {settings.snmpEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Community String</Label>
                      <Input
                        value={settings.snmpCommunity}
                        onChange={(e) => setSettings((s) => ({ ...s, snmpCommunity: e.target.value }))}
                        placeholder="public"
                      />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.snmpPort}
                        onChange={(e) => setSettings((s) => ({ ...s, snmpPort: parseInt(e.target.value) || 161 }))}
                      />
                    </div>
                  </div>
                )}
                {settings.snmpEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('snmp')}
                    disabled={testing === 'snmp'}
                  >
                    {testing === 'snmp' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test SNMP
                  </Button>
                )}
              </div>

              {/* SSH */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.sshEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, sshEnabled: v }))}
                  />
                  <Label className="font-semibold">SSH</Label>
                </div>
                {settings.sshEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.sshPort}
                        onChange={(e) => setSettings((s) => ({ ...s, sshPort: parseInt(e.target.value) || 22 }))}
                      />
                    </div>
                    <div>
                      <Label>Username</Label>
                      <Input
                        value={settings.username}
                        onChange={(e) => setSettings((s) => ({ ...s, username: e.target.value }))}
                        placeholder="admin"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={settings.password}
                        onChange={(e) => setSettings((s) => ({ ...s, password: e.target.value }))}
                        placeholder="Leave blank to keep existing"
                      />
                    </div>
                  </div>
                )}
                {settings.sshEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('ssh')}
                    disabled={testing === 'ssh'}
                  >
                    {testing === 'ssh' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test SSH
                  </Button>
                )}
              </div>

              {/* Telnet */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={settings.telnetEnabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, telnetEnabled: v }))}
                  />
                  <Label className="font-semibold">Telnet</Label>
                </div>
                {settings.telnetEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={settings.telnetPort}
                        onChange={(e) => setSettings((s) => ({ ...s, telnetPort: parseInt(e.target.value) || 23 }))}
                      />
                    </div>
                    {!settings.sshEnabled && (
                      <>
                        <div>
                          <Label>Username</Label>
                          <Input
                            value={settings.username}
                            onChange={(e) => setSettings((s) => ({ ...s, username: e.target.value }))}
                            placeholder="admin"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label>Password</Label>
                          <Input
                            type="password"
                            value={settings.password}
                            onChange={(e) => setSettings((s) => ({ ...s, password: e.target.value }))}
                            placeholder="Leave blank to keep existing"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {settings.telnetEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection('telnet')}
                    disabled={testing === 'telnet'}
                  >
                    {testing === 'telnet' ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <TestTube className="h-4 w-4 mr-1" />}
                    Test Telnet
                  </Button>
                )}
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {olt.monitoringLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <div className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      log.severity === 'error' ? 'bg-red-100 text-red-700' :
                      log.severity === 'warning' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {log.logType}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                ))}
                {olt.monitoringLogs.length === 0 && (
                  <p className="text-center text-gray-400 py-8">No logs yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Port Map Tab — Realistic ZTE C320 Chassis Diagram */}
        <TabsContent value="portmap">
          <ZTEChassisView olt={olt} />
        </TabsContent>
      </Tabs>

      {/* ONU Registration Modal */}
      {registeringOnu && (
        <ONURegisterModal
          oltId={id}
          onu={registeringOnu}
          onClose={() => setRegisteringOnu(null)}
          onSuccess={() => { setRegisteringOnu(null); fetchOLT(); }}
        />
      )}
    </div>
  );
}
