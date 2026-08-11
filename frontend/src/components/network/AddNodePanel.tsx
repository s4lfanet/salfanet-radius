'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Loader2, MapPin, ChevronLeft, Server, Search, Box, GitBranch, Database, Wifi, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

export type AddNodeType = 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP' | 'OLT';

interface Props {
  lat: number;
  lng: number;
  onClose: () => void;
  onCreated: (newEntity: any) => void;
  initialNodeType?: AddNodeType;
  onTypeChange?: (type: AddNodeType | null) => void;
}

const NODE_TYPES: {
  type: AddNodeType;
  label: string;
  description: string;
  color: string;
  iconBg: string;
  iconColor: string;
  headerBg: string;
}[] = [
  {
    type: 'OLT',
    label: 'OLT',
    description: 'Optical Line Terminal — perangkat inti jaringan fiber optik',
    color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/40',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50',
    iconColor: 'text-purple-600 dark:text-purple-300',
    headerBg: 'bg-purple-600',
  },
  {
    type: 'OTB',
    label: 'OTB',
    description: 'Optical Terminal Box — titik terminasi utama dari OLT',
    color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
    iconColor: 'text-blue-600 dark:text-blue-300',
    headerBg: 'bg-blue-600',
  },
  {
    type: 'JOINT_CLOSURE',
    label: 'Joint Closure',
    description: 'Perangkat sambungan kabel fiber',
    color: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40',
    iconBg: 'bg-violet-100 dark:bg-violet-900/50',
    iconColor: 'text-violet-600 dark:text-violet-300',
    headerBg: 'bg-violet-600',
  },
  {
    type: 'ODC',
    label: 'ODC',
    description: 'Optical Distribution Cabinet — distribusi dari OLT ke ODP',
    color: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-700 hover:bg-cyan-100 dark:hover:bg-cyan-900/40',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/50',
    iconColor: 'text-cyan-600 dark:text-cyan-300',
    headerBg: 'bg-cyan-600',
  },
  {
    type: 'ODP',
    label: 'ODP',
    description: 'Optical Distribution Point — titik distribusi ke pelanggan',
    color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
    headerBg: 'bg-emerald-600',
  },
];

function NodeTypeIcon({ type, className = 'w-5 h-5' }: { type: AddNodeType; className?: string }) {
  if (type === 'OLT') return <Server className={className} />;
  if (type === 'OTB') return <Box className={className} />;
  if (type === 'JOINT_CLOSURE') return <GitBranch className={className} />;
  if (type === 'ODC') return <Database className={className} />;
  return <Wifi className={className} />;
}

// ─── OTB Form ─────────────────────────────────────────────────────────────────
function OTBForm({ lat, lng, olts, cables, onSubmit, loading }: { lat: number; lng: number; olts: any[]; cables: any[]; onSubmit: (d: any) => void; loading: boolean }) {
  const [data, setData] = useState({ name: '', code: '', address: '', oltId: '', cableType: 'SM' });
  const [feederRows, setFeederRows] = useState<Array<{ cableId: string }>>([]);
  const set = (k: string, v: string) => setData(p => ({ ...p, [k]: v }));

  const addFeeder = () => setFeederRows(prev => [...prev, { cableId: '' }]);
  const removeFeeder = (idx: number) => setFeederRows(prev => prev.filter((_, i) => i !== idx));
  const updateFeeder = (idx: number, cableId: string) =>
    setFeederRows(prev => prev.map((r, i) => i === idx ? { cableId } : r));

  // Build port range map: each feeder cable gets a sequential range
  const feederDetails = feederRows.map((row, idx) => {
    const cable = cables.find((c: any) => c.id === row.cableId);
    const cores = cable?.totalCores ?? 0;
    const prevCores = feederRows.slice(0, idx).reduce((sum, r) => {
      const c = cables.find((cb: any) => cb.id === r.cableId);
      return sum + (c?.totalCores ?? 0);
    }, 0);
    return { cable, cores, portFrom: prevCores + 1, portTo: prevCores + cores };
  });

  const totalPorts = feederDetails.reduce((s, f) => s + f.cores, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstCableId = feederRows.find(r => r.cableId)?.cableId;
    onSubmit({
      ...data,
      latitude: lat,
      longitude: lng,
      portCount: totalPorts || undefined,
      hasSplitter: false,
      fiberCount: totalPorts || undefined,
      connections: [],
      incomingCableId: firstCableId || undefined,
      feederCables: feederRows.filter(r => r.cableId).map((r, idx) => ({
        cableId: r.cableId,
        portFrom: feederDetails[idx]?.portFrom,
        portTo: feederDetails[idx]?.portTo,
      })),
    });
  };

  // Cables already used in other rows (prevent duplicate assignment)
  const usedCableIds = new Set(feederRows.map(r => r.cableId).filter(Boolean));

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <FRow label="Nama *"><input required value={data.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="OTB Jl. Sudirman 01" /></FRow>
      <FRow label="Kode *"><input required value={data.code} onChange={e => set('code', e.target.value)} className={INPUT} placeholder="OTB-SDM-01" /></FRow>

      {/* Feeder cables section */}
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300">
            Kabel Feeder {feederRows.length > 0 && `(${feederRows.length} kabel)`}
          </p>
          <button type="button" onClick={addFeeder}
            className="text-[10px] px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors">
            + Tambah Kabel
          </button>
        </div>
        {feederRows.length === 0 ? (
          <p className="text-[10px] text-green-500 dark:text-green-400">
            Klik &quot;+ Tambah Kabel&quot; untuk menambahkan kabel feeder ke OTB ini.
          </p>
        ) : (
          <div className="space-y-2">
            {feederRows.map((row, idx) => {
              const detail = feederDetails[idx];
              return (
                <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                      Feeder {idx + 1}
                    </span>
                    <button type="button" onClick={() => removeFeeder(idx)}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <select value={row.cableId} onChange={e => updateFeeder(idx, e.target.value)}
                    className="w-full text-[11px] px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">— Pilih Kabel —</option>
                    {cables.map((c: any) => (
                      <option key={c.id} value={c.id} disabled={usedCableIds.has(c.id) && c.id !== row.cableId}>
                        {c.name} ({c.tubeCount}T × {c.coresPerTube}C = {c.totalCores} core)
                      </option>
                    ))}
                  </select>
                  {detail?.cable && (
                    <div className="bg-green-50 dark:bg-green-900/30 rounded px-2 py-1 text-[10px] text-green-700 dark:text-green-300 flex items-center justify-between">
                      <span>{detail.cable.totalCores} core</span>
                      <span className="font-semibold">Port {detail.portFrom} – {detail.portTo}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Total port summary */}
        {totalPorts > 0 && (
          <div className="bg-green-100 dark:bg-green-800/40 rounded-lg px-3 py-2 text-xs text-green-800 dark:text-green-200 flex items-center justify-between">
            <span>Total Port OTB</span>
            <span className="font-bold text-sm">{totalPorts} port</span>
          </div>
        )}
      </div>

      <FRow label="OLT (opsional)">
        <select value={data.oltId} onChange={e => set('oltId', e.target.value)} className={INPUT}>
          <option value="">— Tidak dipilih —</option>
          {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </FRow>
      <FRow label="Alamat"><input value={data.address} onChange={e => set('address', e.target.value)} className={INPUT} placeholder="Jl. Contoh No. 1" /></FRow>
      <CoordRow lat={lat} lng={lng} />
      <SubmitBtn loading={loading} />
    </form>
  );
}

// ─── JC Form ──────────────────────────────────────────────────────────────────
function JCForm({ lat, lng, otbs, cables, odcsList, jcsList, onSubmit, loading }: {
  lat: number; lng: number;
  otbs: any[]; cables: any[]; odcsList: any[]; jcsList: any[];
  onSubmit: (d: any) => void; loading: boolean;
}) {
  const [data, setData] = useState({ name: '', code: '', type: 'AERIAL', cableType: 'SM', fiberCount: '48', closureType: 'BRANCHING', address: '' });
  const set = (k: string, v: string) => setData(p => ({ ...p, [k]: v }));

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit({ ...data, latitude: lat, longitude: lng, fiberCount: parseInt(data.fiberCount), connections: [], hasSplitter: false });
      }}
      className="space-y-3"
    >
      <FRow label="Nama *"><input required value={data.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="JC Jl. Gatot 001" /></FRow>
      <FRow label="Kode *"><input required value={data.code} onChange={e => set('code', e.target.value)} className={INPUT} placeholder="JC-GAT-001" /></FRow>

      <FRow label="Tipe Instalasi">
        <select value={data.type} onChange={e => set('type', e.target.value)} className={INPUT}>
          {['AERIAL','UNDERGROUND','WALL_MOUNTED','POLE'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
        </select>
      </FRow>
      <FRow label="Tipe Closure">
        <select value={data.closureType} onChange={e => set('closureType', e.target.value)} className={INPUT}>
          <option value="BRANCHING">BRANCHING — Percabangan (1 input → N output)</option>
          <option value="INLINE">INLINE — Transit lurus (1 input → 1 output)</option>
        </select>
      </FRow>
      <FRow label="Tipe Kabel">
        <select value={data.cableType} onChange={e => set('cableType', e.target.value)} className={INPUT}>
          <option value="SM">Single Mode (SM)</option>
          <option value="MM">Multi Mode (MM)</option>
        </select>
      </FRow>
      <FRow label="Jumlah Core">
        <input type="number" min="1" value={data.fiberCount} onChange={e => set('fiberCount', e.target.value)} className={INPUT} />
      </FRow>
      <FRow label="Alamat"><input value={data.address} onChange={e => set('address', e.target.value)} className={INPUT} placeholder="Jl. Contoh No. 1" /></FRow>
      <CoordRow lat={lat} lng={lng} />

      {/* Info box: connections are done via map draw-line mode */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
        <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mb-1">💡 Koneksi via Draw Line</p>
        <p className="text-[10px] text-amber-600 dark:text-amber-400">
          Setelah node dibuat, gunakan tombol <strong>🔗 Hubungkan</strong> di peta untuk menghubungkan node ini ke OTB/JC lain. 
          Kabel dan core akan otomatis dialokasikan.
        </p>
      </div>

      <SubmitBtn loading={loading} />
    </form>
  );
}

// ─── ODC Form ─────────────────────────────────────────────────────────────────
function ODCForm({ lat, lng, olts, onSubmit, loading }: { lat: number; lng: number; olts: any[]; onSubmit: (d: any) => void; loading: boolean }) {
  const [data, setData] = useState({ name: '', oltId: '', ponPort: '1', portCount: '8' });
  const set = (k: string, v: string) => setData(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...data, latitude: lat, longitude: lng }); }} className="space-y-3">
      <FRow label="Nama *"><input required value={data.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="ODC Cluster A" /></FRow>
      <FRow label="OLT *">
        <select required value={data.oltId} onChange={e => set('oltId', e.target.value)} className={INPUT}>
          <option value="">— Pilih OLT —</option>
          {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </FRow>
      <FRow label="PON Port *"><input required type="number" min="1" max="32" value={data.ponPort} onChange={e => set('ponPort', e.target.value)} className={INPUT} /></FRow>
      <FRow label="Kapasitas Port">
        <select value={data.portCount} onChange={e => set('portCount', e.target.value)} className={INPUT}>
          {[4,8,16,32].map(n => <option key={n} value={n}>{n} port</option>)}
        </select>
      </FRow>
      <CoordRow lat={lat} lng={lng} />
      <SubmitBtn loading={loading} />
    </form>
  );
}

// ─── ODP Form ─────────────────────────────────────────────────────────────────
function ODPForm({ lat, lng, olts, odcs, onSubmit, loading }: { lat: number; lng: number; olts: any[]; odcs: any[]; onSubmit: (d: any) => void; loading: boolean }) {
  const [data, setData] = useState({ name: '', oltId: '', odcId: '', ponPort: '1', portCount: '8', splitterRatio: '1:8' });
  const set = (k: string, v: string) => setData(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...data, latitude: lat, longitude: lng }); }} className="space-y-3">
      <FRow label="Nama *"><input required value={data.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="ODP-A01" /></FRow>
      <FRow label="OLT *">
        <select required value={data.oltId} onChange={e => set('oltId', e.target.value)} className={INPUT}>
          <option value="">— Pilih OLT —</option>
          {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </FRow>
      <FRow label="ODC (opsional)">
        <select value={data.odcId} onChange={e => set('odcId', e.target.value)} className={INPUT}>
          <option value="">— Tidak dipilih —</option>
          {odcs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </FRow>
      <FRow label="PON Port *"><input required type="number" min="1" max="32" value={data.ponPort} onChange={e => set('ponPort', e.target.value)} className={INPUT} /></FRow>
      <FRow label="Kapasitas Port">
        <select value={data.portCount} onChange={e => set('portCount', e.target.value)} className={INPUT}>
          {[4,8,16,32].map(n => <option key={n} value={n}>{n} port</option>)}
        </select>
      </FRow>
      <FRow label="Splitter Ratio">
        <select value={data.splitterRatio} onChange={e => set('splitterRatio', e.target.value)} className={INPUT}>
          {['1:2','1:4','1:8','1:16','1:32','1:64'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </FRow>
      <CoordRow lat={lat} lng={lng} />
      <SubmitBtn loading={loading} />
    </form>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────
const INPUT =
  'w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-colors';

function FRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
function CoordRow({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="flex gap-2 items-center p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
      <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
      <span className="text-xs text-green-700 dark:text-green-300 font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
    </div>
  );
}
function SubmitBtn({ loading, label = 'Tambah Node' }: { loading: boolean; label?: string }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors mt-2">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      {label}
    </button>
  );
}

// ─── OLT Form ─────────────────────────────────────────────────────────────────
function OLTForm({
  lat, lng, olts, onSubmit, onPlace, loading,
}: {
  lat: number; lng: number; olts: any[]; onSubmit: (d: any) => void; onPlace: (olt: any) => void; loading: boolean;
}) {
  const [mode, setMode] = useState<'place' | 'create'>('place');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ name: '', ipAddress: '', vendor: 'huawei', model: '', username: '', password: '' });
  const set = (k: string, v: string) => setData(p => ({ ...p, [k]: v }));

  const filtered = olts.filter(
    o =>
      o.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.ipAddress?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
        <button type="button" onClick={() => setMode('place')}
          className={`flex-1 py-2 transition-colors ${mode === 'place' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
          Tempatkan OLT Ada
        </button>
        <button type="button" onClick={() => setMode('create')}
          className={`flex-1 py-2 transition-colors ${mode === 'create' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
          Buat OLT Baru
        </button>
      </div>

      {mode === 'place' ? (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Pilih OLT dari database untuk ditempatkan pada koordinat ini.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama atau IP..." className={`${INPUT} pl-8`} />
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
                {olts.length === 0 ? 'Belum ada OLT di database' : 'OLT tidak ditemukan'}
              </p>
            ) : (
              filtered.map(olt => (
                <button key={olt.id} type="button" disabled={loading} onClick={() => onPlace(olt)}
                  className="w-full text-left p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors group disabled:opacity-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                      <Server className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate group-hover:text-purple-700 dark:group-hover:text-purple-300">
                        {olt.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{olt.ipAddress}</p>
                    </div>
                    {olt.latitude && olt.longitude ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">sudah ada posisi</span>
                    ) : (
                      <span className="text-xs text-green-600 dark:text-green-400 shrink-0">belum ditempatkan</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <CoordRow lat={lat} lng={lng} />
        </>
      ) : (
        <form onSubmit={e => { e.preventDefault(); onSubmit({ ...data, latitude: lat, longitude: lng }); }} className="space-y-3">
          <FRow label="Nama *">
            <input required value={data.name} onChange={e => set('name', e.target.value)} className={INPUT} placeholder="OLT Senayan" />
          </FRow>
          <FRow label="IP Address *">
            <input required value={data.ipAddress} onChange={e => set('ipAddress', e.target.value)} className={INPUT} placeholder="192.168.1.1" />
          </FRow>
          <FRow label="Vendor">
            <select value={data.vendor} onChange={e => set('vendor', e.target.value)} className={INPUT}>
              {['huawei', 'zte', 'fiberhome', 'nokia', 'other'].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
          </FRow>
          <FRow label="Model">
            <input value={data.model} onChange={e => set('model', e.target.value)} className={INPUT} placeholder="MA5800-X17" />
          </FRow>
          <FRow label="Username SNMP/SSH">
            <input value={data.username} onChange={e => set('username', e.target.value)} className={INPUT} placeholder="admin" />
          </FRow>
          <FRow label="Password SNMP/SSH">
            <input type="password" value={data.password} onChange={e => set('password', e.target.value)} className={INPUT} placeholder="••••••••" />
          </FRow>
          <CoordRow lat={lat} lng={lng} />
          <SubmitBtn loading={loading} label="Buat OLT Baru" />
        </form>
      )}
    </div>
  );
}



// ─── Tube color map (IEC 60794) ──────────────────────────────────────────────
const TUBE_COLORS = ['#4B9CD3','#FF6B35','#5CB85C','#FFD700','#808080','#8B4513','#FF69B4','#1E1E1E','#FFCC00','#DC143C','#00CED1','#9370DB'];
const getTubeColor = (n: number) => TUBE_COLORS[(n - 1) % TUBE_COLORS.length];

// ─── OTB Setup Panel (step after OTB creation) ────────────────────────────────
function OTBSetupPanel({ otbId, jcs, onDone }: {
  otbId: string;
  jcs: any[];
  onDone: () => void;
}) {
  // feederGroups: array of { cableName, portFrom, portTo, tubes[] }
  const [feederGroups, setFeederGroups] = useState<Array<{ cableName: string; portFrom: number; portTo: number; tubes: any[] }>>([]);
  const [existing, setExisting] = useState<any[]>([]);
  const [pendingJC, setPendingJC] = useState<Record<string, string>>({});  // tubeKey → jcId
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    fetch(`/api/network/otbs/${otbId}`)
      .then(r => r.json())
      .then(d => {
        setExisting(d.outputSegments ?? []);

        const feeders: any[] = d.feederCableAssignments ?? [];
        if (feeders.length > 0) {
          // Multiple feeder cables — group tubes per cable
          const groups = feeders.map((f: any) => ({
            cableName: f.cable?.name ?? f.cableId,
            portFrom: f.portFrom ?? 1,
            portTo: f.portTo ?? 0,
            tubes: f.cable?.tubes ?? [],
          }));
          setFeederGroups(groups);
        } else if (d.incomingCable) {
          // Fallback: single incomingCable
          setFeederGroups([{
            cableName: d.incomingCable.name,
            portFrom: 1,
            portTo: d.incomingCable.totalCores ?? d.incomingCable.tubes?.reduce((s: number, t: any) => s + (t.cores?.length ?? 0), 0) ?? 0,
            tubes: d.incomingCable.tubes ?? [],
          }]);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [otbId]);

  const allTubes = feederGroups.flatMap(g => g.tubes);
  const isAssigned = (tubeId: string, tubeNum: number) => existing.some(s => s.fromPort === tubeNum);
  const assignedJCName = (tubeNum: number) => {
    const seg = existing.find(s => s.fromPort === tubeNum);
    return seg ? (seg.toDevice?.name ?? seg.toDeviceId) : null;
  };

  const doAssign = async (tubeNum: number, tubeKey: string) => {
    const jcId = pendingJC[tubeKey];
    if (!jcId) return;
    setSaving(tubeKey);
    try {
      const res = await fetch(`/api/network/otbs/${otbId}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tubeNumber: tubeNum, jcId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal');
      const jcObj = jcs.find(j => j.id === jcId);
      setExisting(prev => [...prev.filter(s => s.fromPort !== tubeNum), { ...data, fromPort: tubeNum, toDevice: jcObj ?? { name: jcId } }]);
      setPendingJC(prev => { const n = { ...prev }; delete n[tubeKey]; return n; });
    } catch (err: any) { alert(err.message); }
    finally { setSaving(null); }
  };

  if (loadingDetail) return <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Memuat data tabung...</div>;

  return (
    <div className="space-y-3">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3 text-xs text-green-700 dark:text-green-300">
        ✓ OTB berhasil dibuat. Tugaskan setiap tabung ke Joint Closure.
      </div>

      {allTubes.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
          Kabel feeder belum dipilih atau tidak memiliki data tabung.
          {' '}Penugasan dapat dilakukan dari halaman Diagram.
        </div>
      ) : (
        <div className="space-y-3">
          {feederGroups.map((group, gIdx) => (
            <div key={gIdx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <p className="text-[11px] font-semibold text-green-700 dark:text-green-300">{group.cableName}</p>
                <p className="text-[10px] text-green-500 dark:text-green-400">Port {group.portFrom} – {group.portTo} · {group.tubes.length} tabung</p>
              </div>
              <div className="p-2 space-y-1.5">
                {group.tubes.map((tube: any) => {
                  const tubeKey = `${gIdx}-${tube.tubeNumber}`;
                  const alreadySet = isAssigned(tube.id, tube.tubeNumber);
                  const jcName = assignedJCName(tube.tubeNumber);
                  const isSaving = saving === tubeKey;
                  return (
                    <div key={tube.id} className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-800">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getTubeColor(tube.tubeNumber) }} />
                        <span className="text-xs font-semibold text-gray-800 dark:text-white">T{tube.tubeNumber} · {tube.colorCode}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{tube.cores?.length ?? 0}C</span>
                      </div>
                      {alreadySet ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-green-600 dark:text-green-400 truncate">✓ → {jcName}</span>
                          <button onClick={() => setExisting(prev => prev.filter(s => s.fromPort !== tube.tubeNumber))} className="text-[10px] text-red-400 hover:text-red-600">Ubah</button>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <select
                            value={pendingJC[tubeKey] ?? ''}
                            onChange={e => setPendingJC(prev => ({ ...prev, [tubeKey]: e.target.value }))}
                            className="flex-1 text-[10px] px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">— Pilih JC —</option>
                            {jcs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                          </select>
                          <button
                            onClick={() => doAssign(tube.tubeNumber, tubeKey)}
                            disabled={isSaving || !pendingJC[tubeKey]}
                            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors"
                          >{isSaving ? '...' : 'Set'}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={onDone} className={`w-full py-2 text-sm text-white rounded-lg transition-colors ${allTubes.length === 0 ? 'bg-gray-500 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
        Selesai
      </button>
    </div>
  );
}

// ─── API URL per type ──────────────────────────────────────────────────────────
function getApiUrl(type: AddNodeType) {
  switch (type) {
    case 'OLT': return '/api/network/olts';
    case 'OTB': return '/api/network/otbs';
    case 'JOINT_CLOSURE': return '/api/network/joint-closures';
    case 'ODC': return '/api/network/odcs';
    case 'ODP': return '/api/network/odps';
  }
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AddNodePanel({ lat, lng, onClose, onCreated, initialNodeType, onTypeChange }: Props) {
  const [step, setStep] = useState<'type' | 'form' | 'setup'>(initialNodeType ? 'form' : 'type');
  const [selectedType, setSelectedType] = useState<AddNodeType | null>(initialNodeType ?? null);
  const [createdNode, setCreatedNode] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [olts, setOlts] = useState<any[]>([]);
  const [odcs, setOdcs] = useState<any[]>([]);
  const [cables, setCables] = useState<any[]>([]);
  const [otbs, setOtbs] = useState<any[]>([]);
  const [jcs, setJcs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/network/olts').then(r => r.json()).then(d => setOlts(d.data || [])).catch(() => {});
    fetch('/api/network/odcs').then(r => r.json()).then(d => setOdcs(d.odcs || [])).catch(() => {});
    fetch('/api/network/cables?limit=100').then(r => r.json()).then(d => setCables(d.cables || [])).catch(() => {});
    fetch('/api/network/otbs?limit=100').then(r => r.json()).then(d => setOtbs(d.otbs || [])).catch(() => {});
    fetch('/api/network/joint-closures').then(r => r.json()).then(d => setJcs(d.data || [])).catch(() => {});
  }, []);

  const handlePlaceOlt = async (olt: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/network/olts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: olt.id, latitude: lat, longitude: lng }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Gagal menempatkan OLT');
      Swal.fire({ icon: 'success', title: `OLT "${olt.name}" ditempatkan`, timer: 1500, showConfirmButton: false });
      onCreated({ ...olt, latitude: lat, longitude: lng, type: 'OLT' });
      onClose();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    if (!selectedType) return;
    setLoading(true);
    try {
      // Strip UI-only fields before sending to API
      const { outputRows, feederCables, ...apiBody } = formData;

      const res = await fetch(getApiUrl(selectedType), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Gagal membuat node');

      // JC returns { success, data: jc }, OTB returns the object directly
      const node = data.data || data.otb || data.jc || data.odc || data.odp || data.olt || data;
      onCreated({ ...node, type: selectedType });

      // For OTB: save each feeder cable as an IN segment with port range
      if (selectedType === 'OTB' && Array.isArray(feederCables)) {
        const validFeeders = feederCables.filter((f: any) => f.cableId);
        if (validFeeders.length > 0) {
          await Promise.allSettled(validFeeders.map((f: any) =>
            fetch(`/api/network/otbs/${node.id}/feeder-cables`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cableId: f.cableId,
                portFrom: f.portFrom,
                portTo: f.portTo,
              }),
            })
          ));
        }
      }

      // JC connections are now handled via "Draw Line" connect mode on the map
      // No segment creation needed here — user draws connections after node is placed

      // OTB has a post-creation setup wizard (for feeder cable assignment)
      if (selectedType === 'OTB') {
        setCreatedNode({ ...node, _formData: formData });
        setStep('setup');
      } else {
        Swal.fire({ icon: 'success', title: 'Node berhasil ditambahkan', text: selectedType === 'JOINT_CLOSURE' ? 'Gunakan 🔗 Hubungkan di peta untuk menghubungkan ke device lain' : undefined, timer: 2000, showConfirmButton: false });
        onClose();
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const activeType = (step === 'form' || step === 'setup') && selectedType ? NODE_TYPES.find(t => t.type === selectedType) : null;
  const headerBg = activeType?.headerBg ?? 'bg-blue-600';

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl flex flex-col z-[1000] border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${headerBg} shrink-0 transition-colors duration-200`}>
        <div className="flex items-center gap-2">
          {(step === 'form') && (
            <button onClick={() => { setStep('type'); onTypeChange?.(null); }} className="p-1 hover:bg-white/20 rounded text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {step === 'type' && (
            <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
          )}
          {(step === 'form' || step === 'setup') && selectedType && activeType && (
            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${activeType.iconBg}`}>
              <NodeTypeIcon type={selectedType} className={`w-4 h-4 ${activeType.iconColor}`} />
            </div>
          )}
          <span className="text-white font-semibold text-sm">
            {step === 'type' && 'Tambah Node Baru'}
            {step === 'form' && `Tambah ${NODE_TYPES.find(t => t.type === selectedType)?.label}`}
            {step === 'setup' && 'Setup OTB — Penugasan Tabung'}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Coordinate info — updates live as user drags the map pin */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-300">
            Koordinat: <span className="font-mono text-gray-800 dark:text-white">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
          </span>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 ml-5">Seret pin di peta untuk menyesuaikan posisi</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 'type' ? (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Pilih tipe node yang akan ditambahkan di lokasi ini:</p>
            <div className="space-y-2">
              {NODE_TYPES.map(nt => (
                <button key={nt.type} onClick={() => { setSelectedType(nt.type); setStep('form'); onTypeChange?.(nt.type); }}
                  className={`w-full text-left p-3 border-2 rounded-lg transition-all group ${nt.color}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${nt.iconBg} group-hover:scale-105 transition-transform`}>
                      <NodeTypeIcon type={nt.type} className={`w-5 h-5 ${nt.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 dark:text-white">{nt.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{nt.description}</p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : step === 'setup' ? (
          <div>
            {selectedType === 'OTB' && createdNode && (
              <OTBSetupPanel
                otbId={createdNode.id}
                jcs={jcs}
                onDone={onClose}
              />
            )}
          </div>
        ) : (
          <div>
            {selectedType === 'OLT' && <OLTForm lat={lat} lng={lng} olts={olts} onSubmit={handleSubmit} onPlace={handlePlaceOlt} loading={loading} />}
            {selectedType === 'OTB' && <OTBForm lat={lat} lng={lng} olts={olts} cables={cables} onSubmit={handleSubmit} loading={loading} />}
            {selectedType === 'JOINT_CLOSURE' && <JCForm lat={lat} lng={lng} otbs={otbs} cables={cables} odcsList={odcs} jcsList={jcs} onSubmit={handleSubmit} loading={loading} />}
            {selectedType === 'ODC' && <ODCForm lat={lat} lng={lng} olts={olts} onSubmit={handleSubmit} loading={loading} />}
            {selectedType === 'ODP' && <ODPForm lat={lat} lng={lng} olts={olts} odcs={odcs} onSubmit={handleSubmit} loading={loading} />}
          </div>
        )}
      </div>
    </div>
  );
}
