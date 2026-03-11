'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { showError } from '@/lib/sweetalert';
import {
  RefreshCcw, Route, Link2, AlertTriangle, ChevronRight, MapPin, Cable, Box, GitBranch, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PathTracerTool, TraceResultDisplay, ImpactAnalysisPanel } from '@/components/network/FiberTracing';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NetworkNode {
  id: string;
  type: 'OLT' | 'JOINT_CLOSURE' | 'ODC' | 'ODP';
  name: string;
  code: string;
}

interface PathNode { type: string; id: string; name: string; order: number; coordinates: { lat: string; lng: string } | null; distance?: number; }
interface PathSummary { totalNodes: number; totalDistance: number; estimatedLoss: number; status: string; redundancy: string; }
interface LogicalTraceResult { success: boolean; path: PathNode[]; summary: PathSummary; alternatives?: any[]; }

interface FiberTracePoint {
  type: 'core' | 'splice' | 'device';
  data: {
    id: string; coreNumber?: number; colorCode?: string; colorHex?: string; tubeNumber?: number;
    cableCode?: string; cableName?: string; spliceType?: string; deviceType?: string;
    deviceId?: string; deviceName?: string; locationDescription?: string; insertionLoss?: number;
  };
}
interface FiberTraceResult { success: boolean; path: FiberTracePoint[]; totalLength?: number; totalLoss?: number; coreCount: number; spliceCount: number; }

// ─── Tab types ────────────────────────────────────────────────────────────────
type TabId = 'logical' | 'physical';

// ─── Logical Trace Tab ────────────────────────────────────────────────────────
function LogicalTraceTab() {
  const { t } = useTranslation();
  const [nodes, setNodes] = React.useState<NetworkNode[]>([]);
  const [traceResult, setTraceResult] = React.useState<LogicalTraceResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const [oltsRes, jcsRes, odcsRes, odpsRes] = await Promise.all([
          fetch('/api/network/olts'), fetch('/api/network/joint-closures'),
          fetch('/api/network/odcs'), fetch('/api/network/odps'),
        ]);
        const [olts, jcs, odcs, odps] = await Promise.all([oltsRes.json(), jcsRes.json(), odcsRes.json(), odpsRes.json()]);
        const allNodes: NetworkNode[] = [
          ...(olts.data || []).map((n: any) => ({ ...n, type: 'OLT' as const })),
          ...(jcs.data || []).map((n: any) => ({ ...n, type: 'JOINT_CLOSURE' as const })),
          ...(odcs.odcs || []).map((n: any) => ({ ...n, type: 'ODC' as const })),
          ...(odps.odps || odps.data || []).map((n: any) => ({ ...n, type: 'ODP' as const })),
        ];
        setNodes(allNodes);
      } catch { /* silent */ }
    })();
  }, []);

  const handleTrace = async (fromId: string, toId: string) => {
    setIsLoading(true); setError(null); setTraceResult(null);
    try {
      const res = await fetch(`/api/network/fiber-paths/trace?from=${fromId}&to=${toId}`);
      const data = await res.json();
      if (data.success) setTraceResult(data);
      else setError(data.error || t('network.tracing.noPathFound'));
    } catch (err: any) { setError(err.message || 'Failed to trace path'); }
    finally { setIsLoading(false); }
  };

  const getImpactAnalysis = () => {
    if (!traceResult) return null;
    const affectedNodes = traceResult.path.slice(1).map(node => ({
      id: node.id, type: node.type, name: node.name, code: nodes.find(n => n.id === node.id)?.code || '',
      customersCount: node.type === 'ODP' ? Math.floor(Math.random() * 8) + 1 : undefined,
    }));
    const totalCustomers = affectedNodes.reduce((s, n) => s + (n.customersCount || 0), 0);
    return { affectedNodes, totalCustomers, estimatedDowntime: 120, estimatedRevenueLoss: totalCustomers * 50000, alternatives: traceResult.alternatives || [] };
  };

  const impactData = getImpactAnalysis();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <PathTracerTool nodes={nodes} onTrace={handleTrace} isLoading={isLoading} onClear={() => { setTraceResult(null); setError(null); }} />
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>
        <div>
          {traceResult ? (
            <TraceResultDisplay path={traceResult.path} summary={traceResult.summary} onNodeClick={() => {}} />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center border border-gray-200 dark:border-gray-700">
              <GitBranch className="w-20 h-20 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-300 mb-2">{t('network.tracing.selectNodeToStart')}</h3>
              <p className="text-sm text-gray-500">{t('network.tracing.selectNodeDescription')}</p>
            </div>
          )}
        </div>
      </div>
      {traceResult && impactData && (
        <ImpactAnalysisPanel
          affectedNodes={impactData.affectedNodes} totalCustomers={impactData.totalCustomers}
          estimatedDowntime={impactData.estimatedDowntime} estimatedRevenueLoss={impactData.estimatedRevenueLoss}
          alternatives={impactData.alternatives} onActivateAlternative={() => {}}
        />
      )}
    </div>
  );
}

// ─── Physical Trace Tab ───────────────────────────────────────────────────────
function PhysicalTraceTab() {
  const [loading, setLoading] = useState(false);
  const [traceResult, setTraceResult] = useState<FiberTraceResult | null>(null);
  const [searchType, setSearchType] = useState<'core' | 'device'>('device');
  const [coreId, setCoreId] = useState('');
  const [deviceType, setDeviceType] = useState('ODP');
  const [deviceId, setDeviceId] = useState('');

  const performTrace = async () => {
    if (searchType === 'core' && !coreId) { showError('Please enter a core ID'); return; }
    if (searchType === 'device' && !deviceId) { showError('Please enter a device ID'); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchType === 'core') params.append('coreId', coreId);
      else { params.append('deviceType', deviceType); params.append('deviceId', deviceId); }
      const res = await fetch(`/api/network/trace?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trace fiber path');
      setTraceResult(data);
      if (!data.path?.length) showError('No fiber path found');
    } catch (error: unknown) {
      showError((error as Error).message || 'Failed to trace fiber path');
      setTraceResult(null);
    } finally { setLoading(false); }
  };

  const getPointColor = (type: string, colorHex?: string) => {
    if (colorHex) return colorHex;
    return type === 'core' ? '#3B82F6' : type === 'splice' ? '#F59E0B' : '#10B981';
  };

  const renderTracePoint = (point: FiberTracePoint, index: number, isLast: boolean) => (
    <div key={index} className="relative">
      {!isLast && <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-300 dark:bg-gray-600" />}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center border-2 shrink-0"
          style={{ borderColor: getPointColor(point.type, point.data.colorHex), backgroundColor: point.type === 'splice' ? '#FEF3C7' : '#F3F4F6' }}>
          {point.type === 'core' && point.data.colorHex
            ? <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: point.data.colorHex }} />
            : point.type === 'splice' ? <Link2 className="h-4 w-4" /> : <Box className="h-4 w-4" />}
        </div>
        <div className="flex-1 pb-8">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={point.type === 'core' ? 'bg-blue-50 text-blue-700 border-blue-200' : point.type === 'splice' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}>
              {point.type.toUpperCase()}
            </Badge>
            {point.data.spliceType && <Badge variant="outline">{point.data.spliceType}</Badge>}
            {point.data.deviceType && <Badge variant="outline">{point.data.deviceType}</Badge>}
          </div>
          <div className="text-sm space-y-1">
            {point.type === 'core' && (<><p className="font-medium">{point.data.cableCode} - Tube {point.data.tubeNumber}, Core {point.data.coreNumber}</p><p className="text-gray-500">Color: <span style={{ color: point.data.colorHex }}>{point.data.colorCode}</span></p>{point.data.cableName && <p className="text-gray-400 text-xs">{point.data.cableName}</p>}</>)}
            {point.type === 'splice' && (<><p className="font-medium">Splice Point ({point.data.spliceType})</p>{point.data.insertionLoss !== undefined && <p className="text-gray-500">Loss: {point.data.insertionLoss} dB</p>}{point.data.locationDescription && <p className="text-gray-400 text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />{point.data.locationDescription}</p>}</>)}
            {point.type === 'device' && (<><p className="font-medium">{point.data.deviceType}: {point.data.deviceName || point.data.deviceId}</p>{point.data.locationDescription && <p className="text-gray-400 text-xs flex items-center gap-1"><MapPin className="h-3 w-3" />{point.data.locationDescription}</p>}</>)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trace Fiber Path</CardTitle>
          <CardDescription>Enter a core ID or device to trace the complete physical fiber path</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Search By</Label>
            <Select value={searchType} onValueChange={(v: 'core' | 'device') => setSearchType(v)}>
              <SelectTrigger className="w-full md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="device">Device</SelectItem>
                <SelectItem value="core">Core ID</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {searchType === 'core' ? (
            <div>
              <Label>Core ID</Label>
              <div className="flex gap-2">
                <Input value={coreId} onChange={e => setCoreId(e.target.value)} placeholder="Enter core ID (UUID)" className="flex-1" />
                <Button onClick={performTrace} disabled={loading}>
                  {loading && <RefreshCcw className="h-4 w-4 animate-spin mr-2" />}
                  <Route className="h-4 w-4 mr-2" />Trace
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Device Type</Label>
                <Select value={deviceType} onValueChange={setDeviceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ODP','OTB','ODC','JOINT_CLOSURE','OLT','CUSTOMER'].map(t => <SelectItem key={t} value={t}>{t === 'JOINT_CLOSURE' ? 'Joint Closure' : t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Device ID</Label><Input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="Enter device ID" /></div>
              <div className="flex items-end">
                <Button onClick={performTrace} disabled={loading} className="w-full">
                  {loading && <RefreshCcw className="h-4 w-4 animate-spin mr-2" />}
                  <Route className="h-4 w-4 mr-2" />Trace
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {traceResult && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['Cores in Path', traceResult.coreCount, 'text-blue-600'], ['Splice Points', traceResult.spliceCount, 'text-yellow-600'], ['Total Length (m)', traceResult.totalLength ? traceResult.totalLength.toFixed(2) : '-', 'text-green-600'], ['Total Loss (dB)', traceResult.totalLoss ? traceResult.totalLoss.toFixed(2) : '-', 'text-red-600']].map(([label, value, cls]) => (
              <Card key={label as string}><CardContent className="pt-6 text-center"><p className={`text-3xl font-bold ${cls}`}>{value}</p><p className="text-sm text-gray-500">{label}</p></CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" />Fiber Path</CardTitle><CardDescription>Total points: {traceResult.path.length}</CardDescription></CardHeader>
            <CardContent>
              {traceResult.path.length === 0
                ? <div className="text-center py-8"><AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" /><p className="text-gray-500">No fiber path found</p></div>
                : <div className="pl-2">{traceResult.path.map((p, i) => renderTracePoint(p, i, i === traceResult.path.length - 1))}</div>}
            </CardContent>
          </Card>
          {traceResult.path.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Path Overview</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-max py-4">
                    {traceResult.path.map((p, i) => (
                      <div key={i} className="flex items-center">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0" style={{ borderColor: getPointColor(p.type, p.data.colorHex), backgroundColor: p.data.colorHex || '#F3F4F6' }} title={p.type === 'core' ? `${p.data.cableCode} T${p.data.tubeNumber}-C${p.data.coreNumber}` : p.type === 'splice' ? `Splice (${p.data.spliceType})` : `${p.data.deviceType}: ${p.data.deviceName}`}>
                          {p.type === 'splice' ? <Link2 className="h-4 w-4 text-yellow-600" /> : p.type === 'device' ? <Box className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        {i < traceResult.path.length - 1 && <ChevronRight className="h-4 w-4 text-gray-400 mx-1" />}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-500" /><span className="text-sm text-gray-600">Fiber Core</span></div>
                  <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-yellow-600" /><span className="text-sm text-gray-600">Splice Point</span></div>
                  <div className="flex items-center gap-2"><Box className="h-4 w-4 text-green-600" /><span className="text-sm text-gray-600">Device</span></div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!traceResult && !loading && (
        <Card className="bg-gray-50 dark:bg-gray-900 border-dashed">
          <CardContent className="py-12 text-center">
            <Route className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">How to Trace Fiber Paths</h3>
            <p className="text-gray-500 max-w-md mx-auto">Select a search type, enter the core ID or device details, and click Trace to visualize the complete fiber path.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              {[['By Core ID', 'Trace from a specific fiber core', Cable, 'text-blue-500'], ['By Device', 'Trace from ODP, OTB, or customer', Box, 'text-green-500'], ['View Splices', 'See all splice points in path', Link2, 'text-yellow-500']].map(([title, desc, Icon, cls]) => (
                <div key={title as string} className="p-4 bg-white dark:bg-gray-800 rounded-lg border">
                  {React.createElement(Icon as any, { className: `h-8 w-8 ${cls} mx-auto mb-2` })}
                  <p className="text-sm font-medium">{title as string}</p>
                  <p className="text-xs text-gray-500">{desc as string}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TracePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('logical');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Network Trace</h1>
          <p className="text-gray-500 dark:text-gray-400">Logical path tracing and physical fiber tracing</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1 mb-6 w-fit">
          <button
            onClick={() => setActiveTab('logical')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'logical' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
          >
            <GitBranch className="h-4 w-4" />
            Logical Path
          </button>
          <button
            onClick={() => setActiveTab('physical')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'physical' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}
          >
            <Zap className="h-4 w-4" />
            Physical Fiber
          </button>
        </div>

        {activeTab === 'logical' ? <LogicalTraceTab /> : <PhysicalTraceTab />}
      </div>
    </div>
  );
}
