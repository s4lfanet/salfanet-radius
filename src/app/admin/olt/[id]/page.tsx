'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Eye, UserPlus,
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
  MCUD1:   { label: 'MCUD1',   color: '#2563eb', portRows: 0, portCols: 0 },
  MCUD:    { label: 'MCUD',    color: '#2563eb', portRows: 0, portCols: 0 },
  GTGQ:    { label: 'GTGQ',    color: '#15803d', portRows: 4, portCols: 4 },  // 16-port GPON
  GTGH:    { label: 'GTGH',    color: '#15803d', portRows: 2, portCols: 4 },  // 8-port GPON
  GTGO:    { label: 'GTGO',    color: '#15803d', portRows: 1, portCols: 4 },  // 4-port GPON
  GTGHG:   { label: 'GTGHG',   color: '#16a34a', portRows: 4, portCols: 4 },  // 16-port GPON (ZTE C320)
  'SMXA-B':{ label: 'SMXA-B',  color: '#1d4ed8', portRows: 2, portCols: 3 },  // 5-port uplink (3 GE + 2 10GE)
  'SMXA-A':{ label: 'SMXA-A',  color: '#1d4ed8', portRows: 1, portCols: 2 },  // 2x 10GE uplink
  SMXA:    { label: 'SMXA',    color: '#1d4ed8', portRows: 1, portCols: 4 },  // generic SMXA uplink
  GICF:    { label: 'GICF',    color: '#1e40af', portRows: 2, portCols: 2 },  // 4-port uplink
  GISF:    { label: 'GISF',    color: '#1e40af', portRows: 1, portCols: 4 },
  empty:   { label: 'EMPTY',   color: '#374151', portRows: 0, portCols: 0 },
};

interface ApiChassisSlot {
  index: number;
  label: string;
  type: string;
  present: boolean;
  cardType: string;
  hardVer?: string;
  softVer?: string;
  cardStatus?: string;
  portCount: number;
  ports: Array<{ port: number; iface?: string; onuCount: number; onlineCount: number; hasOnus: boolean }>;
  uplinkIfaces?: string[];
  description?: string;
}

// ── Uplink Port Detail Modal ─────────────────────────────────────────────────
function UplinkPortModal({ oltId, port, onClose }: { oltId: string; port: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'status' | 'vlan' | 'config' | 'optical'>('status');
  const [tabData, setTabData] = useState<{ raw: string; parsed: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newVlanId, setNewVlanId] = useState('');
  const [vlanMode, setVlanMode] = useState<'tag' | 'access'>('tag');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchTab = useCallback(async (tab: string) => {
    setLoading(true); setError(null); setTabData(null);
    try {
      const res = await fetch(`/api/olt/${oltId}/uplink?port=${encodeURIComponent(port)}&tab=${tab}`);
      const json = await res.json();
      if (json.success) setTabData(json.data);
      else setError(json.error ?? 'Failed to load');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [oltId, port]);

  useEffect(() => { fetchTab(activeTab); }, [activeTab, fetchTab]);

  const doAction = async (action: string, extra: Record<string, any> = {}) => {
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`/api/olt/${oltId}/uplink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port, action, ...extra }),
      });
      const json = await res.json();
      setActionMsg(json.success ? '✓ Success' : `Error: ${json.error}`);
      if (json.success) fetchTab(activeTab);
    } catch (e: any) { setActionMsg(`Error: ${e.message}`); }
    finally { setActionLoading(false); }
  };

  const parsed = tabData?.parsed ?? {};
  const raw = tabData?.raw ?? '';

  const renderStatus = () => {
    const linkStatus = parsed['Link Status'] ?? '—';
    const isUp = linkStatus.toLowerCase() === 'up';
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: isUp ? '#052e16' : '#450a0a', border: `1px solid ${isUp ? '#16a34a' : '#dc2626'}` }}>
          <div className={`w-3 h-3 rounded-full ${isUp ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <div>
            <div className={`text-sm font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>Link: {linkStatus}</div>
            <div className="text-xs text-gray-400">Admin: {parsed['Admin Status'] ?? '—'} · {parsed['Speed'] ?? '—'}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['Speed','Duplex','Flow Control','Physical Type','MTU','MAC'] as const).map(k => parsed[k] ? (
            <div key={k} className="p-2 rounded-lg bg-gray-900 border border-gray-700">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">{k}</div>
              <div className="text-xs font-mono text-white mt-0.5">{parsed[k]}</div>
            </div>
          ) : null)}
        </div>
        <div className="flex gap-2 pt-2 border-t border-gray-800">
          <button onClick={() => doAction('enable')} disabled={actionLoading} className="px-3 py-1.5 text-xs rounded bg-green-800 hover:bg-green-700 text-white disabled:opacity-50">Enable</button>
          <button onClick={() => doAction('disable')} disabled={actionLoading} className="px-3 py-1.5 text-xs rounded bg-red-900 hover:bg-red-800 text-white disabled:opacity-50">Disable</button>
        </div>
      </div>
    );
  };

  const renderVlan = () => {
    const taggedVlans = (parsed['Tagged Vlan'] ?? '').split(/\s+/).filter(Boolean);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {([['Mode', parsed['Mode'] ?? '—'], ['PVID', parsed['Pvid'] ?? '—'], ['TLS', parsed['TLS'] ?? '—']] as [string,string][]).map(([label, val]) => (
            <div key={label} className="p-2 rounded-lg bg-gray-900 border border-gray-700 text-center">
              <div className="text-[10px] text-gray-400 uppercase">{label}</div>
              <div className="text-sm font-bold text-white mt-0.5">{val}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Tagged VLANs</div>
          <div className="flex flex-wrap gap-1.5 min-h-8">
            {taggedVlans.length > 0 ? taggedVlans.map(v => (
              <div key={v} className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950 border border-blue-700 text-xs font-mono text-blue-300">
                {v}
                <button onClick={() => doAction('removeVlan', { vlanId: v })} disabled={actionLoading} className="ml-1 text-gray-500 hover:text-red-400 font-bold">×</button>
              </div>
            )) : <span className="text-xs text-gray-600 italic">No tagged VLANs configured</span>}
          </div>
        </div>
        <div className="flex gap-2 items-center pt-3 border-t border-gray-800">
          <input value={newVlanId} onChange={e => setNewVlanId(e.target.value.replace(/\D/g, ''))} placeholder="VLAN ID" maxLength={4}
            className="w-20 px-2 py-1 text-xs rounded bg-gray-800 border border-gray-600 text-white" />
          <select value={vlanMode} onChange={e => setVlanMode(e.target.value as 'tag' | 'access')}
            className="px-2 py-1 text-xs rounded bg-gray-800 border border-gray-600 text-white">
            <option value="tag">Tagged (Trunk)</option>
            <option value="access">Access (PVID)</option>
          </select>
          <button onClick={() => { doAction('addVlan', { vlanId: newVlanId, mode: vlanMode }); setNewVlanId(''); }}
            disabled={!newVlanId || actionLoading}
            className="px-3 py-1 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50">Add VLAN</button>
        </div>
      </div>
    );
  };

  const renderConfig = () => (
    <pre className="text-[11px] font-mono text-green-300 bg-gray-950 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap border border-gray-800">
      {raw || '(No configuration data)'}
    </pre>
  );

  const renderOptical = () => {
    const metrics: [string, string, string][] = [
      ['TX Power', parsed['TX Power'] ?? '—', '#22c55e'],
      ['RX Power', parsed['RX Power'] ?? '—', '#3b82f6'],
      ['Temperature', parsed['Temperature'] ?? '—', '#f59e0b'],
      ['Supply Voltage', parsed['Supply Voltage'] ?? '—', '#a855f7'],
      ['TX Bias Current', parsed['TX Bias Current'] ?? '—', '#06b6d4'],
    ];
    const specs: [string, string][] = [
      ['Vendor', parsed['Manufacturer Name'] ?? '—'],
      ['Part No.', parsed['Part Number'] ?? '—'],
      ['Serial No.', parsed['Serial Number'] ?? '—'],
      ['Wavelength (nm)', parsed['Wavelength'] ?? '—'],
      ['Fiber Type', parsed['Fiber Type'] ?? '—'],
      ['Connector', parsed['Connector Type'] ?? '—'],
    ];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map(([label, val, accent]) => (
            <div key={label} className="p-2.5 rounded-lg bg-gray-900 border border-gray-700" style={{ borderLeft: `3px solid ${accent}` }}>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
              <div className="text-base font-bold font-mono text-white mt-0.5">{val}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800 pt-3">
          <div className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Module Specifications</div>
          <div className="grid grid-cols-3 gap-2">
            {specs.map(([label, val]) => (
              <div key={label} className="p-1.5 rounded bg-gray-950 border border-gray-800">
                <div className="text-[9px] text-gray-500 uppercase">{label}</div>
                <div className="text-xs font-mono text-gray-200 mt-0.5 truncate">{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const TABS = ['status', 'vlan', 'config', 'optical'] as const;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-2xl" style={{ background: '#0d1117', border: '1px solid #30363d' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #21262d' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-sm font-bold text-white font-mono">{port}</span>
            <span className="text-xs text-gray-500">Uplink Port</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="flex border-b border-gray-800">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${activeTab === t ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-950/20' : 'text-gray-500 hover:text-gray-300'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-5">
          {loading && <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>}
          {error && <div className="text-red-400 text-sm p-3 bg-red-950/30 rounded-lg border border-red-900">{error}</div>}
          {!loading && !error && tabData && (
            <>
              {activeTab === 'status'  && renderStatus()}
              {activeTab === 'vlan'    && renderVlan()}
              {activeTab === 'config'  && renderConfig()}
              {activeTab === 'optical' && renderOptical()}
            </>
          )}
          {actionMsg && (
            <div className={`mt-3 text-xs p-2 rounded ${actionMsg.startsWith('✓') ? 'bg-green-950/40 text-green-400 border border-green-900' : 'bg-red-950/40 text-red-400 border border-red-900'}`}>
              {actionMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ZTE Chassis View ─────────────────────────────────────────────────────────
function ZTEChassisView({ olt }: { olt: OLTDetail }) {
  const [chassisSlots, setChassisSlots] = useState<ApiChassisSlot[]>([]);
  const [selectedUplinkPort, setSelectedUplinkPort] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/olt/${olt.id}/chassis`)
      .then(r => r.json())
      .then(j => { if (j.success && j.chassis) setChassisSlots(j.chassis); })
      .catch(() => {});
  }, [olt.id]);

  // ── Port stats from ONU list ──────────────────────────────────────────────
  const portStats: Record<string, { total: number; online: number; unregistered: number; rxPowers: number[] }> = {};
  for (const onu of olt.onuStatuses) {
    const key = `${onu.slot}/${onu.port}`;
    if (!portStats[key]) portStats[key] = { total: 0, online: 0, unregistered: 0, rxPowers: [] };
    portStats[key].total++;
    if (onu.status === 'online') portStats[key].online++;
    if (onu.status === 'auth_failed') portStats[key].unregistered++;
    if (onu.rxPower !== null) portStats[key].rxPowers.push(onu.rxPower);
  }

  // ── Build visible slot list ───────────────────────────────────────────────
  let visibleSlots: ApiChassisSlot[];
  if (chassisSlots.length > 0) {
    visibleSlots = chassisSlots.filter(s => s.present || s.type === 'mcud');
  } else {
    // Fallback: derive service slots from ONU statuses
    const maxPortPerSlot: Record<number, number> = {};
    for (const onu of olt.onuStatuses) {
      if (maxPortPerSlot[onu.slot] === undefined || onu.port > maxPortPerSlot[onu.slot])
        maxPortPerSlot[onu.slot] = onu.port;
    }
    const serviceSlots: ApiChassisSlot[] = Object.keys(maxPortPerSlot).map(sk => {
      const slotIdx = parseInt(sk);
      const portCount = Math.max(maxPortPerSlot[slotIdx] + 1, 16);
      const cardType = portCount <= 4 ? 'GTGO' : portCount <= 8 ? 'GTGH' : 'GTGQ';
      return {
        index: slotIdx, label: `${slotIdx}`, type: 'service', present: true, cardType, portCount,
        ports: Array.from({ length: portCount }, (_, i) => ({ port: i, onuCount: 0, onlineCount: 0, hasOnus: false })),
      };
    });
    visibleSlots = [
      { index: 0,  label: 'MCU-A', type: 'mcud',   present: true,          cardType: 'MCUD1', portCount: 0, ports: [] },
      ...serviceSlots,
      { index: 15, label: 'UPL-A', type: 'uplink', present: true,          cardType: 'GICF',  portCount: 4, ports: [] },
      { index: 17, label: 'MCU-B', type: 'mcud',   present: olt.isOnline,  cardType: 'MCUD1', portCount: 0, ports: [] },
    ].sort((a, b) => a.index - b.index);
  }

  const activeCardsCount = visibleSlots.filter(s => s.present).length;

  const formatUptime = (secs: number | null) => {
    if (!secs) return 'N/A';
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const portColor = (slotIdx: number, portIdx: number) => {
    const s = portStats[`${slotIdx}/${portIdx}`];
    if (!s || s.total === 0) return { bg: '#1e293b', border: '#334155', dot: '#475569' };
    if (s.online === s.total)  return { bg: '#14532d', border: '#16a34a', dot: '#4ade80' };
    if (s.online === 0)        return { bg: '#450a0a', border: '#dc2626', dot: '#f87171' };
    return { bg: '#431407', border: '#ea580c', dot: '#fb923c' };
  };

  const portTooltip = (slotIdx: number, portIdx: number) => {
    const s = portStats[`${slotIdx}/${portIdx}`];
    const avgRx = s?.rxPowers.length ? (s.rxPowers.reduce((a, b) => a + b) / s.rxPowers.length).toFixed(1) : null;
    return s ? `PON 0/${slotIdx}/${portIdx}\n${s.online}/${s.total} online${avgRx ? `\nAvg RX: ${avgRx} dBm` : ''}` : `PON 0/${slotIdx}/${portIdx}\n(No ONU)`;
  };

  const renderSlotRow = (slot: ApiChassisSlot) => {
    const isMcu    = slot.type === 'mcud';
    const isUplink = slot.type === 'uplink';
    const isActive = slot.present;
    const isSmxa   = isUplink && slot.cardType.toUpperCase().startsWith('SMXA');
    const rowBg     = isActive ? (isMcu || isUplink ? '#0c1a2e' : '#0a1a0a') : '#0d1117';
    const rowBorder = isActive ? (isMcu || isUplink ? '#1d4ed8'  : '#15803d') : '#1e293b';
    const labelColor = isMcu || isUplink ? '#60a5fa' : '#4ade80';

    return (
      <div key={slot.index} className="flex items-center gap-0 rounded overflow-hidden select-none"
        style={{ background: rowBg, border: `1px solid ${rowBorder}`, minHeight: 40 }}>
        <div style={{ width: 4, alignSelf: 'stretch', background: isActive ? rowBorder : '#1e293b' }} />
        <div className="flex items-center justify-start px-3" style={{ minWidth: 88 }}>
          {isActive ? (
            <span className="text-xs font-bold font-mono tracking-wider" style={{ color: labelColor }}>{slot.cardType}</span>
          ) : (
            <span className="text-xs text-gray-600 font-mono">—</span>
          )}
        </div>
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
          ) : isSmxa ? (
            /* SMXA uplink — render actual interface ports as clickable buttons */
            <div className="flex items-center gap-1 flex-wrap">
              {(slot.uplinkIfaces ?? slot.ports.map((p, i) => p.iface ?? `gei_1/${slot.index}/${i + 1}`)).map(iface => {
                const isXGE = iface.startsWith('xgei');
                const shortLabel = iface.replace(/^(?:x)?gei_1\/\d+\//, () => isXGE ? 'X/' : '/');
                return (
                  <button key={iface}
                    onClick={() => setSelectedUplinkPort(iface)}
                    title={`Click to view ${iface} detail`}
                    className="flex flex-col items-center px-2 py-1 rounded border transition-all hover:brightness-125 hover:scale-105 cursor-pointer"
                    style={{ background: '#1e3a8a', borderColor: '#3b82f6', minWidth: 44 }}>
                    <div className="w-1.5 h-1.5 rounded-full mb-0.5 bg-blue-300" />
                    <span className="text-[8px] font-mono text-blue-200 leading-none whitespace-nowrap">{shortLabel}</span>
                    {isXGE && <span className="text-[7px] text-blue-400">10G</span>}
                  </button>
                );
              })}
              <span className="ml-1 text-[9px] text-blue-400 font-mono">{slot.cardType}</span>
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
        <div className="px-3 text-right" style={{ minWidth: 36 }}>
          <span className="text-xs text-gray-500 font-mono">{slot.index}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {selectedUplinkPort && (
        <UplinkPortModal oltId={olt.id} port={selectedUplinkPort} onClose={() => setSelectedUplinkPort(null)} />
      )}

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

        {/* Stats row */}
        <div className="grid grid-cols-6" style={{ borderBottom: '1px solid #21262d' }}>
          {[
            { Icon: Clock,       label: 'UPTIME',       value: formatUptime(olt.uptime),                         accent: '#3b82f6', title: undefined },
            { Icon: Thermometer, label: 'CHASSIS TEMP', value: olt.temperature ? `${olt.temperature}°C` : '—',  accent: '#22c55e', title: 'ZTE C320 V2.1: temp via SNMP tidak tersedia' },
            { Icon: Activity,    label: 'AVG CPU',      value: '—',                                              accent: '#22c55e', title: 'ZTE C320 V2.1: CPU monitoring tidak tersedia' },
            { Icon: Server,      label: 'AVG MEMORY',   value: '—',                                              accent: '#a855f7', title: 'ZTE C320 V2.1: Memory monitoring tidak tersedia' },
            { Icon: Cpu,         label: 'ACTIVE CARDS', value: String(activeCardsCount),                         accent: '#3b82f6', title: undefined },
            { Icon: Zap,         label: 'FAN STATUS',   value: olt.isOnline ? '2/2 OK' : '—',                   accent: '#06b6d4', title: undefined },
          ].map(({ Icon, label, value, accent, title }, i) => (
            <div key={i} className="p-3" title={title} style={{ background: '#161b22', borderRight: i < 5 ? '1px solid #21262d' : 'none', borderLeft: `3px solid ${accent}` }}>
              <div className="flex items-center gap-1 mb-1">
                <Icon className="h-3 w-3" style={{ color: accent }} />
                <span className="text-[8px] font-bold tracking-widest" style={{ color: accent }}>{label}</span>
              </div>
              <div className={`text-sm font-bold ${value === '—' ? 'text-gray-600' : 'text-white'}`}>{value}</div>
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
                  <div className="relative w-9 h-9 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full" style={{ border: '2px solid #16a34a' }} />
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
// ONU Registration Modal — vendor-aware (ZTE / Huawei / FiberHome)
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
  { value: '1G',      label: '1 Gbps' },
  { value: '100M',    label: '100 Mbps' },
  { value: '50M',     label: '50 Mbps' },
  { value: '20M',     label: '20 Mbps' },
  { value: '10M',     label: '10 Mbps' },
  { value: 'FTTH-1G', label: 'FTTH-1G (if defined)' },
];

const FIBERHOME_ONU_TYPES = [
  { value: 'AN5506-04-FA',  label: 'AN5506-04-FA (4-port GPON ONU)' },
  { value: 'AN5506-04-F',   label: 'AN5506-04-F (4-port GPON ONU)' },
  { value: 'AN5506-02-B',   label: 'AN5506-02-B (2-port ONU)' },
  { value: 'AN5506-01-A',   label: 'AN5506-01-A (1-port ONU)' },
  { value: 'RP2602',        label: 'RP2602 (SFU ONU)' },
  { value: 'GH3-001',       label: 'GH3-001 (Generic FiberHome)' },
  { value: 'default',       label: 'Default (Auto-detect)' },
];

interface RegisterModalProps {
  oltId: string;
  onu: ONU;
  vendor: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ONURegisterModal({ oltId, onu, vendor, onClose, onSuccess }: RegisterModalProps) {
  const v = (vendor ?? 'zte').toLowerCase();
  const isHuawei     = v === 'huawei';
  const isFiberHome  = v === 'fiberhome';
  const isZTE        = !isHuawei && !isFiberHome;

  const [onuType,       setOnuType]       = useState(isZTE ? 'All' : isFiberHome ? 'default' : '');
  const [vlan,          setVlan]          = useState(100);
  const [tcontProfile,  setTcontProfile]  = useState('1G');
  const [description,   setDescription]   = useState('');
  const [onuId,         setOnuId]         = useState(onu.onuId ?? 1);
  // Huawei-specific
  const [lineProfileId, setLineProfileId] = useState(1);
  const [srvProfileId,  setSrvProfileId]  = useState(1);
  // FiberHome-specific
  const [profileName,   setProfileName]   = useState('default');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const ponPort = onu.port + 1;

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
          description: description || undefined,
          // ZTE
          tcontProfile,
          // Huawei
          lineProfileId,
          srvProfileId,
          // FiberHome
          profileName,
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

  // Build command preview per vendor
  const cmdPreview = isHuawei ? [
    'enable',
    'config',
    `interface gpon ${onu.frame}/${onu.slot}`,
    `  ont add ${ponPort} ${onuId} sn-auth ${onu.serialNumber ?? '???'} omci ont-lineprofile-id ${lineProfileId} ont-srvprofile-id ${srvProfileId}${description ? ` desc ${description}` : ''}`,
    'quit',
    `service-port 1 vlan ${vlan} gpon ${onu.frame}/${onu.slot}/${ponPort} ont ${onuId} gemport 0 multi-service user-vlan ${vlan} tag-transform translate`,
    'quit',
  ] : isFiberHome ? [
    'enable',
    'config',
    `interface gpon-olt_${onu.frame}/${onu.slot}/${ponPort}`,
    `  onu add ${onuId} type ${onuType} sn ${onu.serialNumber ?? '???'}`,
    `  onu ${onuId} profile ${profileName}`,
    `  onu ${onuId} vlan ${vlan} mode translate`,
    ...(description ? [`  onu ${onuId} description ${description}`] : []),
    '  commit',
    'exit',
  ] : [
    // ZTE C320 V2.1 — reference: zte_command.py → register_onu_stepbystep()
    'configure terminal',
    `interface gpon-olt_${onu.frame}/${onu.slot}/${ponPort}`,
    `  onu ${onuId} type All sn ${onu.serialNumber ?? '???'}`,
    ...(description ? [`  onu ${onuId} description ${description}`] : []),
    'exit',
    `interface gpon-onu_${onu.frame}/${onu.slot}/${ponPort}:${onuId}`,
    `  tcont 1 profile ${tcontProfile}`,
    '  gemport 1 tcont 1',
    `  service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`,
    'exit',
    'end',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800 bg-green-50 dark:bg-green-950 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-600" /> Register ONU
              <span className="text-xs font-normal text-gray-500 uppercase ml-1">{v}</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              PON {onu.frame}/{onu.slot}/{ponPort} · ONU ID {onuId}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Serial number (read-only) */}
          <div>
            <Label className="text-xs text-gray-500">Serial Number (OLT detected)</Label>
            <div className="mt-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md font-mono text-sm text-gray-700 dark:text-gray-300">
              {onu.serialNumber ?? <span className="text-yellow-600">Unknown — no serial via SNMP (enter manually)</span>}
            </div>
          </div>

          {/* ONU ID */}
          <div>
            <Label className="text-xs text-gray-500">ONU ID (1-128)</Label>
            <Input type="number" min={1} max={128} value={onuId}
              onChange={e => setOnuId(parseInt(e.target.value) || 1)}
              className="mt-1 font-mono caret-gray-900 dark:caret-white" />
          </div>

          {/* VLAN */}
          <div>
            <Label className="text-xs text-gray-500">Service VLAN</Label>
            <Input type="number" min={1} max={4094} value={vlan}
              onChange={e => setVlan(parseInt(e.target.value) || 100)}
              className="mt-1 font-mono caret-gray-900 dark:caret-white" />
          </div>

          {/* ── ZTE-only fields ── */}
          {isZTE && (<>
            <div>
              <Label className="text-xs text-gray-500">ONU Type</Label>
              <Select value={onuType} onValueChange={setOnuType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ZTE_ONU_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">TCONT Profile (bandwidth)</Label>
              <Select value={tcontProfile} onValueChange={setTcontProfile}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ZTE_TCONT_PROFILES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>)}

          {/* ── Huawei-only fields ── */}
          {isHuawei && (<>
            <div>
              <Label className="text-xs text-gray-500">ONT Line Profile ID</Label>
              <Input type="number" min={1} value={lineProfileId}
                onChange={e => setLineProfileId(parseInt(e.target.value) || 1)}
                className="mt-1 font-mono" />
              <p className="text-xs text-gray-400 mt-1">ont-lineprofile-id — defines GEM/TCONT mapping</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">ONT Service Profile ID</Label>
              <Input type="number" min={1} value={srvProfileId}
                onChange={e => setSrvProfileId(parseInt(e.target.value) || 1)}
                className="mt-1 font-mono" />
              <p className="text-xs text-gray-400 mt-1">ont-srvprofile-id — defines port/service config</p>
            </div>
          </>)}

          {/* ── FiberHome-only fields ── */}
          {isFiberHome && (<>
            <div>
              <Label className="text-xs text-gray-500">ONU Type</Label>
              <Select value={onuType} onValueChange={setOnuType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIBERHOME_ONU_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Service Profile Name</Label>
              <Input value={profileName}
                onChange={e => setProfileName(e.target.value || 'default')}
                placeholder="default"
                className="mt-1 font-mono" />
              <p className="text-xs text-gray-400 mt-1">Must match a profile already configured on the OLT</p>
            </div>
          </>)}

          {/* Description */}
          <div>
            <Label className="text-xs text-gray-500">Description / Customer Name (optional)</Label>
            <Input value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. customer-name"
              className="mt-1" />
          </div>

          {/* Command preview */}
          <div className="bg-gray-950 dark:bg-black rounded-md border border-gray-800 p-3 text-xs font-mono text-green-400 space-y-0.5 select-text">
            <div className="text-gray-500 mb-1.5 text-[10px] uppercase tracking-widest">Telnet preview · {v}</div>
            {cmdPreview.map((line, i) => (
              <div key={i} className="leading-5">{line}</div>
            ))}
            <div className="flex items-center gap-0.5 mt-1">
              <span className="text-green-400 opacity-70">#</span>
              <span className="inline-block w-2 h-3.5 bg-green-400 opacity-70 ml-0.5 animate-pulse" />
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`px-3 py-2 rounded-md text-sm ${result.ok
              ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
              {result.ok ? '✓ ' : '✗ '}{result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t dark:border-gray-800 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !onu.serialNumber}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading
              ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" /> Registering…</>
              : <><Plus className="h-3 w-3 mr-1" /> Register ONU</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ONUDetailModal({ oltId, onu, onClose }: { oltId: string; onu: ONU; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/olt/${oltId}/onus/${onu.id}/detail`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load ONU detail');
        setDetail(json);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [oltId, onu.id]);

  const parsed = detail?.telnet?.detail?.parsed ?? {};
  const customer = detail?.onu?.customer;
  const detailItems = [
    ['Interface', detail?.telnet?.interface ?? `${onu.frame}/${onu.slot}/${onu.port}:${onu.onuId}`],
    ['Serial Number', parsed['Serial number'] ?? onu.serialNumber ?? 'N/A'],
    ['Name', parsed.Name ?? onu.description ?? 'N/A'],
    ['Type', parsed.Type ?? 'N/A'],
    ['State', parsed.State ?? onu.status],
    ['Phase', parsed['Phase state'] ?? 'N/A'],
    ['Config', parsed['Config state'] ?? 'N/A'],
    ['Distance', parsed['ONU Distance'] ?? (onu.distance !== null ? `${onu.distance}m` : 'N/A')],
    ['Online Duration', parsed['Online Duration'] ?? 'N/A'],
    ['RX Power', onu.rxPower !== null ? `${onu.rxPower.toFixed(2)} dBm` : 'N/A'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-500" /> Detail ONU
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{detail?.telnet?.interface ?? `${onu.frame}/${onu.slot}/${onu.port}:${onu.onuId}`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          {loading && <div className="py-10 text-center text-gray-400"><RefreshCw className="h-6 w-6 mx-auto animate-spin mb-2" />Loading detail...</div>}
          {error && <div className="px-3 py-2 rounded bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-sm">{error}</div>}
          {!loading && !error && detail && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {detailItems.map(([label, value]) => (
                  <div key={label} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white mt-1 break-words">{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer Assignment</div>
                {customer ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-gray-500">Name:</span> {customer.name}</div>
                    <div><span className="text-gray-500">Username:</span> {customer.username}</div>
                    <div><span className="text-gray-500">Phone:</span> {customer.phone ?? '-'}</div>
                    <div><span className="text-gray-500">Profile:</span> {customer.profile?.name ?? '-'}</div>
                    <div><span className="text-gray-500">Area:</span> {customer.area?.name ?? '-'}</div>
                    <div><span className="text-gray-500">ODP:</span> {customer.odpAssignment?.odp?.name ?? '-'}</div>
                    <div><span className="text-gray-500">ODP Port:</span> {customer.odpAssignment?.portNumber ?? '-'}</div>
                    <div><span className="text-gray-500">Status:</span> {customer.status}</div>
                  </div>
                ) : <div className="text-sm text-gray-400">Belum terhubung ke customer.</div>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <pre className="text-[11px] font-mono bg-gray-950 text-green-300 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">{detail.telnet.detail.raw || 'No detail output'}</pre>
                <pre className="text-[11px] font-mono bg-gray-950 text-blue-300 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">{detail.telnet.config.raw || detail.telnet.optical.raw || 'No config/optical output'}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ONUAssignModal({ oltId, onu, onClose, onSuccess }: { oltId: string; onu: ONU; onClose: () => void; onSuccess: () => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(onu.customer?.id ?? '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(() => {
    setLoading(true);
    fetch(`/api/olt/${oltId}/onus/${onu.id}/assign${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load customers');
        setCustomers(json.customers ?? []);
        if (json.currentCustomer?.id) setSelectedCustomerId(json.currentCustomer.id);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [oltId, onu.id, query]);

  useEffect(() => {
    const t = setTimeout(loadCustomers, 250);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  const save = async (customerId: string | null) => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/olt/${oltId}/onus/${onu.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to assign customer');
      await onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><UserPlus className="h-4 w-4 text-indigo-500" /> Assign Customer</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{onu.serialNumber ?? `${onu.frame}/${onu.slot}/${onu.port}:${onu.onuId}`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Search Customer</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, username, phone, customer ID" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Customer</Label>
            <Select value={selectedCustomerId || 'none'} onValueChange={(v) => setSelectedCustomerId(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={loading ? 'Loading...' : 'Select customer'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>{customer.name} - {customer.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <div className="px-3 py-2 rounded bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-sm">{error}</div>}
        </div>
        <div className="flex justify-between gap-2 px-5 py-4 border-t dark:border-gray-800">
          <Button variant="outline" onClick={() => save(null)} disabled={saving}>Unassign</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => save(selectedCustomerId || null)} disabled={saving || loading}>
              {saving ? <><RefreshCw className="h-3 w-3 mr-2 animate-spin" />Saving...</> : 'Save Assignment'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OLTDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFilter = searchParams.get('filter');
  const [olt, setOlt] = useState<OLTDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [onuStatusFilter, setOnuStatusFilter] = useState(urlFilter ?? 'all');

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
  const [detailOnu, setDetailOnu] = useState<ONU | null>(null);
  const [assigningOnu, setAssigningOnu] = useState<ONU | null>(null);

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
          password: o.password ?? '',
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

  useEffect(() => {
    if (urlFilter) setOnuStatusFilter(urlFilter);
  }, [urlFilter]);

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
    <div className="space-y-5 p-1">
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
              {olt.vendor && (
                <span className="text-xs font-normal bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full uppercase">
                  {olt.vendor}
                </span>
              )}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 font-mono text-xs mt-0.5">
              {olt.ipAddress}
              {olt.model && <span className="ml-2 text-gray-400">· {olt.model}</span>}
              {olt.firmwareVersion && <span className="ml-2 text-gray-400">· {olt.firmwareVersion}</span>}
            </p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={`border-l-4 ${olt.isOnline ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Wifi className="h-3 w-3" /> Status
            </div>
            <div className={`font-bold text-xl ${olt.isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {olt.isOnline ? 'Online' : 'Offline'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {olt.lastPollAt ? `Polled ${new Date(olt.lastPollAt).toLocaleTimeString('id-ID')}` : 'Not polled yet'}
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${olt.temperature !== null && olt.temperature > 60 ? 'border-l-red-500' : 'border-l-amber-500'}`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Thermometer className="h-3 w-3" /> Temperature
            </div>
            <div className={`font-bold text-xl ${olt.temperature !== null && olt.temperature > 60 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
              {olt.temperature !== null ? `${olt.temperature}°C` : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {olt.temperature !== null ? (olt.temperature > 60 ? 'Warning: High temp' : 'Normal') : 'Not available (C320)'}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-3 w-3" /> Uptime
            </div>
            <div className="font-bold text-xl text-gray-900 dark:text-white">{formatUptime(olt.uptime)}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {olt.vendor ?? 'OLT'} {olt.model ?? ''}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
              <Activity className="h-3 w-3" /> ONUs
            </div>
            <div className="font-bold text-xl">
              <span className="text-green-600">{olt.onlineOnu}</span>
              <span className="text-gray-400 text-base">/{olt.totalOnu}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {olt.offlineOnu > 0 ? `${olt.offlineOnu} offline` : 'All online'}
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

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-left text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/60">
                  <th className="py-2.5 pl-3 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedOnus.size === filteredOnus.length && filteredOnus.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </th>
                  <th className="py-2.5 pr-4 font-medium">Location</th>
                  <th className="py-2.5 pr-4 font-medium">Serial / MAC</th>
                  <th className="py-2.5 pr-4 font-medium">Name</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">Signal</th>
                  <th className="py-2.5 pr-4 font-medium">RX Power</th>
                  <th className="py-2.5 pr-4 font-medium">Distance</th>
                  <th className="py-2.5 pr-4 font-medium">Customer</th>
                  <th className="py-2.5 pr-4 font-medium">Last Seen</th>
                  <th className="py-2.5 pr-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOnus.map((onu) => {
                  const signalQuality = getSignalQuality(onu.rxPower);
                  return (
                    <tr key={onu.id} className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-2.5 pl-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedOnus.has(onu.id)}
                          onChange={() => handleSelectOnu(onu.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {onu.frame}/{onu.slot}/{onu.port}:{onu.onuId}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="font-mono text-xs text-gray-900 dark:text-gray-100">
                          {onu.serialNumber ?? onu.macAddress ?? <span className="text-yellow-600 dark:text-yellow-400">N/A</span>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="text-xs text-gray-700 dark:text-gray-300">{onu.description ?? <span className="text-gray-400">—</span>}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          onu.status === 'online' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' :
                          onu.status === 'auth_failed' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400' :
                          onu.status === 'dying_gasp' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
                          onu.status === 'los' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {onu.status === 'auth_failed' ? 'Unregistered' : onu.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${signalQuality.color}`}>
                          <Signal className="w-3 h-3" />
                          {signalQuality.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {onu.rxPower !== null ? (
                          <span className={`font-mono text-xs font-medium ${onu.rxPower < -27 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {onu.rxPower.toFixed(2)} dBm
                          </span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs">
                        {onu.distance !== null ? (
                          <span className="font-mono text-gray-700 dark:text-gray-300">{onu.distance} m</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4">
                        {onu.customer ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900 dark:text-white">{onu.customer.name}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs">{onu.customer.username}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500 dark:text-gray-400">
                        {onu.lastSeenAt ? new Date(onu.lastSeenAt).toLocaleString('id-ID') : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        {onu.status === 'auth_failed' ? (
                          /* Unregistered ONU — show Register button */
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => setDetailOnu(onu)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Detail
                            </button>
                            <button
                              onClick={() => setRegisteringOnu(onu)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              Register
                            </button>
                          </div>
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
                              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => setDetailOnu(onu)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Detail
                            </button>
                            <button
                              onClick={() => setAssigningOnu(onu)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                            >
                              <UserPlus className="w-3 h-3" />
                              Assign
                            </button>
                            <button
                              onClick={() => setConfirmReboot(onu.id)}
                              disabled={rebootingOnu !== null || batchRebooting}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 transition-colors"
                            >
                              <Power className="w-3 h-3" />
                              Reboot
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredOnus.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-gray-400">
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
          vendor={olt?.vendor ?? null}
          onClose={() => setRegisteringOnu(null)}
          onSuccess={() => { setRegisteringOnu(null); fetchOLT(); }}
        />
      )}

      {detailOnu && (
        <ONUDetailModal
          oltId={id}
          onu={detailOnu}
          onClose={() => setDetailOnu(null)}
        />
      )}

      {assigningOnu && (
        <ONUAssignModal
          oltId={id}
          onu={assigningOnu}
          onClose={() => setAssigningOnu(null)}
          onSuccess={fetchOLT}
        />
      )}
    </div>
  );
}
