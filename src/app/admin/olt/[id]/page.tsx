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
  Power, Download, CheckCircle, Signal,
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
// OLT Physical Port Diagram helpers
// ─────────────────────────────────────────────────────────────────────────────
interface PortGroupDef {
  type: 'uplink' | 'gpon' | 'epon';
  label: string;
  portType: string;
  slot: number;
  portCount: number;
}
interface OLTTemplateDef {
  displayName: string;
  chassis: string;
  groups: PortGroupDef[];
}

function getOLTTemplate(vendor: string | null, model: string | null): OLTTemplateDef {
  const v = (vendor ?? '').toLowerCase();
  const m = (model ?? '').toUpperCase();

  if (v === 'zte') {
    if (m.includes('C320')) return {
      displayName: 'ZTE C320', chassis: '1U Compact GPON OLT',
      groups: [
        { type: 'uplink', label: 'Uplink (10GE XFP)', portType: '10GE', slot: 0, portCount: 2 },
        { type: 'gpon', label: 'GPON Card 1 (Slot 1)', portType: 'GPON', slot: 1, portCount: 8 },
        { type: 'gpon', label: 'GPON Card 2 (Slot 2)', portType: 'GPON', slot: 2, portCount: 8 },
      ],
    };
    if (m.includes('C300')) return {
      displayName: 'ZTE C300', chassis: '7U Chassis GPON OLT',
      groups: [
        { type: 'uplink', label: 'Uplink HUVB (10GE)', portType: '10GE', slot: 0, portCount: 4 },
        ...Array.from({ length: 4 }, (_, i) => ({ type: 'gpon' as const, label: `GPON Slot ${i + 1}`, portType: 'GPON', slot: i + 1, portCount: 16 })),
      ],
    };
    if (m.includes('C350')) return {
      displayName: 'ZTE C350', chassis: '14U Chassis GPON OLT',
      groups: [
        { type: 'uplink', label: 'Uplink HUVB (100GE)', portType: '100GE', slot: 0, portCount: 8 },
        ...Array.from({ length: 8 }, (_, i) => ({ type: 'gpon' as const, label: `GPON Slot ${i + 1}`, portType: 'GPON', slot: i + 1, portCount: 16 })),
      ],
    };
    // Generic ZTE
    return {
      displayName: `ZTE ${model ?? 'OLT'}`, chassis: 'ZTE GPON OLT',
      groups: [
        { type: 'uplink', label: 'Uplink (GE/10GE)', portType: 'GE/10GE', slot: 0, portCount: 2 },
        { type: 'gpon', label: 'GPON Slot 1', portType: 'GPON', slot: 1, portCount: 8 },
      ],
    };
  }

  if (v === 'huawei') {
    if (m.includes('MA5608T')) return {
      displayName: 'Huawei MA5608T', chassis: '2U Compact GPON OLT',
      groups: [
        { type: 'uplink', label: 'GE/10GE Uplink (GICF)', portType: 'GE/10GE SFP+', slot: -1, portCount: 2 },
        { type: 'gpon', label: 'H802GPFD (Slot 0)', portType: 'GPON', slot: 0, portCount: 8 },
      ],
    };
    if (m.includes('MA5683T') || m.includes('MA5680T')) return {
      displayName: `Huawei ${m}`, chassis: '7U Chassis GPON OLT',
      groups: [
        { type: 'uplink', label: 'SCUN Uplink (10GE)', portType: '10GE', slot: -1, portCount: 4 },
        ...Array.from({ length: 4 }, (_, i) => ({ type: 'gpon' as const, label: `GPFD Slot ${i}`, portType: 'GPON', slot: i, portCount: 8 })),
      ],
    };
    return {
      displayName: `Huawei ${model ?? 'OLT'}`, chassis: 'Huawei GPON OLT',
      groups: [
        { type: 'uplink', label: 'Uplink (GE/10GE)', portType: 'GE/10GE', slot: -1, portCount: 2 },
        { type: 'gpon', label: 'GPON Slot 0', portType: 'GPON', slot: 0, portCount: 8 },
      ],
    };
  }

  if (v === 'fiberhome') {
    if (m.includes('AN5516')) return {
      displayName: `FiberHome ${m}`, chassis: 'FiberHome Chassis GPON OLT',
      groups: [
        { type: 'uplink', label: 'GE Uplink', portType: 'GE/10GE', slot: -1, portCount: 4 },
        ...Array.from({ length: 4 }, (_, i) => ({ type: 'gpon' as const, label: `GPON Slot ${i + 1}`, portType: 'GPON', slot: i + 1, portCount: 8 })),
      ],
    };
  }

  if (v === 'hioso') {
    const isGpon = m.includes('8040') || m.includes('8080') || m.includes('GPON');
    return {
      displayName: `Hioso ${model ?? 'OLT'}`, chassis: isGpon ? 'Hioso/C-Data GPON OLT' : 'Hioso/C-Data EPON OLT',
      groups: [
        { type: 'uplink', label: 'GE Uplink', portType: 'GE', slot: -1, portCount: 2 },
        { type: isGpon ? 'gpon' : 'epon', label: `${isGpon ? 'GPON' : 'EPON'} Ports (Slot 1)`, portType: isGpon ? 'GPON' : 'EPON', slot: 1, portCount: 4 },
      ],
    };
  }

  if (v === 'bdcom') {
    return {
      displayName: `BDCOM ${model ?? 'OLT'}`, chassis: 'BDCOM PON OLT',
      groups: [
        { type: 'uplink', label: 'GE/10GE Uplink', portType: 'GE/10GE', slot: -1, portCount: 2 },
        { type: 'epon', label: 'EPON/GPON Ports', portType: 'PON', slot: 1, portCount: m.includes('P3310C') ? 8 : 16 },
      ],
    };
  }

  if (v === 'raisecom') {
    return {
      displayName: `Raisecom ${model ?? 'OLT'}`, chassis: 'Raisecom GPON OLT',
      groups: [
        { type: 'uplink', label: 'GE/10GE Uplink', portType: 'GE/10GE', slot: -1, portCount: 4 },
        { type: 'gpon', label: 'GPON Slots', portType: 'GPON', slot: 1, portCount: 8 },
      ],
    };
  }

  // Generic / unknown — show uplink + one PON group
  return {
    displayName: `${vendor ?? 'Unknown'} ${model ?? 'OLT'}`, chassis: 'Generic OLT',
    groups: [
      { type: 'uplink', label: 'Uplink', portType: 'GE/10GE', slot: -1, portCount: 2 },
      { type: 'gpon', label: 'PON Ports', portType: 'GPON/EPON', slot: 1, portCount: 8 },
    ],
  };
}

function OLTPortDiagram({ olt }: { olt: OLTDetail }) {
  const template = getOLTTemplate(olt.vendor, olt.model);

  // Build per-port statistics from ONU data
  const portStats: Record<string, { total: number; online: number; rxPowers: number[] }> = {};
  for (const onu of olt.onuStatuses) {
    const key = `${onu.slot}/${onu.port}`;
    if (!portStats[key]) portStats[key] = { total: 0, online: 0, rxPowers: [] };
    portStats[key].total++;
    if (onu.status === 'online') portStats[key].online++;
    if (onu.rxPower !== null) portStats[key].rxPowers.push(onu.rxPower);
  }

  // Returns color class for a GPON port (0-based portIndex)
  const getPortStyle = (group: PortGroupDef, portIndex: number) => {
    if (group.type === 'uplink') {
      return { bg: 'bg-blue-700', border: 'border-blue-500', text: 'text-white', dot: 'bg-blue-400', label: `UP ${portIndex + 1}` };
    }
    const key = `${group.slot}/${portIndex}`;  // DB stores port 0-based for ZTE
    const s = portStats[key];
    if (!s || s.total === 0) {
      return { bg: 'bg-gray-800', border: 'border-gray-600', text: 'text-gray-500', dot: 'bg-gray-700', label: `${portIndex}` };
    }
    if (s.online === s.total) {
      return { bg: 'bg-green-800', border: 'border-green-500', text: 'text-white', dot: 'bg-green-400', label: `${s.total}` };
    }
    if (s.online === 0) {
      return { bg: 'bg-red-900', border: 'border-red-600', text: 'text-white', dot: 'bg-red-500', label: `${s.total}` };
    }
    return { bg: 'bg-orange-900', border: 'border-orange-500', text: 'text-white', dot: 'bg-orange-400', label: `${s.online}/${s.total}` };
  };

  const getPortTitle = (group: PortGroupDef, portIndex: number): string => {
    if (group.type === 'uplink') return `${group.portType} Uplink Port ${portIndex + 1}`;
    const s = portStats[`${group.slot}/${portIndex}`];
    if (!s) return `Port 0/${group.slot}/${portIndex}\n(kosong — tidak ada ONU)`;
    const avgRx = s.rxPowers.length > 0 ? (s.rxPowers.reduce((a, b) => a + b, 0) / s.rxPowers.length).toFixed(1) : null;
    return `Port 0/${group.slot}/${portIndex}\nONU: ${s.online} online / ${s.total} total${avgRx ? `\nAvg RX: ${avgRx} dBm` : ''}`;
  };

  return (
    <div className="space-y-4">
      {/* ── Real Front-Panel Style Chassis ── */}
      <div className="bg-[#1a1a1a] rounded-lg overflow-hidden border border-[#3a3a3a] shadow-2xl select-none">

        {/* Top bezel with model + LEDs */}
        <div className="flex items-center justify-between px-5 py-1.5 bg-[#111] border-b border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            {/* Status LEDs */}
            <div className="flex items-center gap-2">
              {[
                { label: 'PWR', on: olt.isOnline, color: 'bg-green-500', pulse: false },
                { label: 'SYS', on: olt.isOnline, color: 'bg-green-500', pulse: true },
                { label: 'ALM', on: (olt.alerts?.length ?? 0) > 0, color: 'bg-red-500', pulse: true },
              ].map((led) => (
                <div key={led.label} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`w-2 h-2 rounded-full shadow-md ${led.on ? `${led.color} ${led.pulse ? 'animate-pulse' : ''} shadow-current` : 'bg-gray-700'}`}
                    style={led.on ? { boxShadow: `0 0 6px 1px currentColor` } : {}}
                  />
                  <span className="text-[7px] font-mono text-gray-500 tracking-widest">{led.label}</span>
                </div>
              ))}
            </div>
            <div className="w-px h-6 bg-[#333]" />
            <span className="text-[11px] font-bold text-gray-300 tracking-wider font-mono">{template.displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500 font-mono">{olt.ipAddress}</span>
            {/* Console/MGMT dummy port */}
            <div className="flex items-center gap-1">
              <div className="w-5 h-3.5 bg-[#222] border border-[#444] rounded-sm flex items-center justify-center">
                <span className="text-[6px] text-gray-600">CON</span>
              </div>
              <div className="w-5 h-3.5 bg-[#222] border border-[#444] rounded-sm flex items-center justify-center">
                <span className="text-[6px] text-gray-600">MGT</span>
              </div>
            </div>
          </div>
        </div>

        {/* Port panels */}
        <div className="p-3 space-y-2.5">
          {template.groups.map((group) => (
            <div key={`${group.slot}-${group.label}`} className="bg-[#111] rounded border border-[#2c2c2c] px-3 py-2.5">
              {/* Card label */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[9px] font-bold uppercase tracking-widest font-mono ${group.type === 'uplink' ? 'text-blue-400' : 'text-green-500'}`}>
                  {group.label}
                </span>
                <span className="text-[8px] text-gray-600 font-mono">{group.portType} × {group.portCount}</span>
              </div>

              {/* Port row — SFP/GPON port style */}
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: group.portCount }, (_, i) => {
                  const style = getPortStyle(group, i);
                  const isUplink = group.type === 'uplink';
                  return (
                    <div
                      key={i}
                      title={getPortTitle(group, i)}
                      className={`relative flex flex-col items-center justify-between rounded cursor-default transition-transform hover:scale-110 hover:z-10
                        ${isUplink ? 'w-12 h-14' : 'w-10 h-12'}
                        border-2 ${style.bg} ${style.border}`}
                    >
                      {/* SFP slot hole (visual) */}
                      <div className={`mt-1 ${isUplink ? 'w-7 h-4' : 'w-6 h-3'} rounded-sm bg-black border border-[#333] flex items-center justify-center`}>
                        {/* Fiber indicator dot */}
                        <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      </div>
                      {/* Port label + ONU count */}
                      <div className="mb-0.5 text-center">
                        <div className={`text-[8px] font-mono font-bold leading-none ${style.text}`}>{style.label}</div>
                        <div className={`text-[6px] font-mono leading-none ${style.text} opacity-50`}>{i}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom info strip */}
        <div className="flex items-center justify-between px-5 py-1 bg-[#0d0d0d] border-t border-[#222]">
          <div className="flex items-center gap-4">
            {[
              { color: 'bg-blue-700 border-blue-500', label: 'Uplink' },
              { color: 'bg-green-800 border-green-500', label: 'Semua Online' },
              { color: 'bg-orange-900 border-orange-500', label: 'Sebagian Offline' },
              { color: 'bg-red-900 border-red-600', label: 'Semua Offline' },
              { color: 'bg-gray-800 border-gray-600', label: 'Kosong' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded border ${item.color}`} />
                <span className="text-[8px] text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
          <span className="text-[8px] text-gray-600 font-mono">{template.chassis}</span>
        </div>
      </div>

      {/* Per-port detail table */}
      {Object.keys(portStats).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Detail Per Port PON</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(portStats)
              .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
              .map(([portKey, s]) => {
                const pct = s.total > 0 ? (s.online / s.total) * 100 : 0;
                const avgRx = s.rxPowers.length > 0 ? (s.rxPowers.reduce((a, b) => a + b, 0) / s.rxPowers.length).toFixed(1) : null;
                return (
                  <div key={portKey} className="border border-gray-100 dark:border-gray-800 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">0/{portKey}</span>
                      <span className={`text-[10px] font-bold ${pct === 100 ? 'text-green-600' : pct === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                        {s.online}/{s.total}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-1">
                      <div
                        className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : pct === 0 ? 'bg-red-500' : 'bg-orange-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400">
                      <span>{s.total} ONU</span>
                      {avgRx && <span>RX {avgRx} dBm</span>}
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
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Signal</th>
                  <th className="pb-2 pr-4">RX Power</th>
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
                        <span className={`font-medium capitalize ${getStatusColor(onu.status)}`}>
                          {onu.status.replace('_', ' ')}
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
                        {confirmReboot === onu.id ? (
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
                    <td colSpan={9} className="py-8 text-center text-gray-400">
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

        {/* Port Map Tab */}
        <TabsContent value="portmap">
          <OLTPortDiagram olt={olt} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
