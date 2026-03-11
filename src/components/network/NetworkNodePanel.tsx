'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit2, Trash2, Save, XCircle, Loader2, MapPin, Server, Box, GitBranch, ChevronRight, ExternalLink } from 'lucide-react';
import Swal from 'sweetalert2';

export interface MapEntity {
  id: string;
  type: 'OLT' | 'OTB' | 'JOINT_CLOSURE' | 'ODC' | 'ODP' | 'CUSTOMER';
  code?: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  metadata?: any;
}

interface Props {
  entity: MapEntity | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (entity: MapEntity) => void;
}

// ─── API helpers ───────────────────────────────────────────────────────────────
function getApiBase(type: MapEntity['type']): string {
  switch (type) {
    case 'OLT': return '/api/network/olts';
    case 'OTB': return '/api/network/otbs';
    case 'JOINT_CLOSURE': return '/api/network/joint-closures';
    case 'ODC': return '/api/network/odcs';
    case 'ODP': return '/api/network/odps';
    default: return '';
  }
}

function getIdParam(type: MapEntity['type']): string {
  return type === 'OLT' ? 'oltId' : 'id';
}

const STATUS_OPTIONS = ['active', 'inactive', 'maintenance', 'damaged'];
const OTB_TYPES = ['patch_panel', 'splice_tray', 'fdt', 'odf'];
const JC_TYPES = ['dome', 'inline', 'vertical', 'horizontal', 'wall_mount'];

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const color = status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : status === 'maintenance' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : status === 'damaged' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status.toUpperCase()}</span>;
}

// ─── Type icon ─────────────────────────────────────────────────────────────────
function TypeIcon({ type }: { type: MapEntity['type'] }) {
  const props = { className: 'w-5 h-5' };
  if (type === 'OLT') return <Server {...props} />;
  if (type === 'JOINT_CLOSURE') return <GitBranch {...props} />;
  if (type === 'ODP' || type === 'ODC') return <Box {...props} />;
  return <MapPin {...props} />;
}

const TYPE_COLORS: Record<string, string> = {
  OLT: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
  OTB: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  JOINT_CLOSURE: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
  ODC: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700',
  ODP: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  CUSTOMER: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
};

// ─── Detail label/value row ────────────────────────────────────────────────────
function DetailRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-32">{label}</span>
      <span className={`text-xs font-medium text-gray-800 dark:text-white text-right ml-2 ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
    </div>
  );
}

// ─── Field input ──────────────────────────────────────────────────────────────
function FieldInput({ label, name, value, onChange, type = 'text', required = false, children }: {
  label: string; name: string; value: string | number; onChange: (n: string, v: string) => void;
  type?: string; required?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children || (
        <input type={type} value={value} onChange={e => onChange(name, e.target.value)} required={required}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      )}
    </div>
  );
}

// ─── Select input ─────────────────────────────────────────────────────────────
function FieldSelect({ label, name, value, onChange, options }: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(name, e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}

// ─── Edit forms per type ──────────────────────────────────────────────────────
function OLTEditForm({ data, onChange }: { data: any; onChange: (n: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <FieldInput label="Name" name="name" value={data.name || ''} onChange={onChange} required />
      <FieldInput label="IP Address" name="ipAddress" value={data.ipAddress || ''} onChange={onChange} />
      <FieldInput label="Brand" name="brand" value={data.brand || ''} onChange={onChange} />
      <FieldInput label="Model" name="model" value={data.model || ''} onChange={onChange} />
      <FieldSelect label="Status" name="status" value={data.status || 'active'} onChange={onChange} options={STATUS_OPTIONS} />
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Latitude" name="latitude" value={data.latitude || ''} onChange={onChange} type="number" />
        <FieldInput label="Longitude" name="longitude" value={data.longitude || ''} onChange={onChange} type="number" />
      </div>
    </div>
  );
}

function OTBEditForm({ data, onChange }: { data: any; onChange: (n: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <FieldInput label="Name" name="name" value={data.name || ''} onChange={onChange} required />
      <FieldSelect label="Type" name="type" value={data.type || 'patch_panel'} onChange={onChange} options={OTB_TYPES} />
      <FieldSelect label="Status" name="status" value={data.status || 'active'} onChange={onChange} options={STATUS_OPTIONS} />
      <FieldInput label="Port Count" name="portCount" value={data.portCount || 8} onChange={onChange} type="number" />
      <FieldInput label="Address" name="address" value={data.address || ''} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Latitude" name="latitude" value={data.latitude || ''} onChange={onChange} type="number" />
        <FieldInput label="Longitude" name="longitude" value={data.longitude || ''} onChange={onChange} type="number" />
      </div>
    </div>
  );
}

function JCEditForm({ data, onChange }: { data: any; onChange: (n: string, v: string) => void }) {
  return (
    <div className="space-y-3">
      <FieldInput label="Name" name="name" value={data.name || ''} onChange={onChange} required />
      <FieldSelect label="Type" name="type" value={data.closureType || 'dome'} onChange={onChange} options={JC_TYPES} />
      <FieldSelect label="Status" name="status" value={data.status || 'active'} onChange={onChange} options={STATUS_OPTIONS} />
      <FieldInput label="Splice Capacity" name="spliceCapacity" value={data.spliceCapacity || ''} onChange={onChange} type="number" />
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Latitude" name="latitude" value={data.latitude || ''} onChange={onChange} type="number" />
        <FieldInput label="Longitude" name="longitude" value={data.longitude || ''} onChange={onChange} type="number" />
      </div>
    </div>
  );
}

function ODCEditForm({ data, onChange, olts }: { data: any; onChange: (n: string, v: string) => void; olts: any[] }) {
  return (
    <div className="space-y-3">
      <FieldInput label="Name" name="name" value={data.name || ''} onChange={onChange} required />
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">OLT</label>
        <select value={data.oltId || ''} onChange={e => onChange('oltId', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">— Select OLT —</option>
          {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <FieldInput label="PON Port" name="ponPort" value={data.ponPort || ''} onChange={onChange} type="number" />
      <FieldInput label="Port Count" name="portCount" value={data.portCount || 8} onChange={onChange} type="number" />
      <FieldSelect label="Status" name="status" value={data.status || 'active'} onChange={onChange} options={STATUS_OPTIONS} />
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Latitude" name="latitude" value={data.latitude || ''} onChange={onChange} type="number" />
        <FieldInput label="Longitude" name="longitude" value={data.longitude || ''} onChange={onChange} type="number" />
      </div>
    </div>
  );
}

function ODPEditForm({ data, onChange, odcs }: { data: any; onChange: (n: string, v: string) => void; odcs: any[] }) {
  return (
    <div className="space-y-3">
      <FieldInput label="Name" name="name" value={data.name || ''} onChange={onChange} required />
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ODC</label>
        <select value={data.odcId || ''} onChange={e => onChange('odcId', e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
          <option value="">— Select ODC —</option>
          {odcs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <FieldInput label="Port Count" name="portCount" value={data.portCount || 8} onChange={onChange} type="number" />
      <FieldSelect label="Splitter Ratio" name="splitterRatio" value={data.splitterRatio || '1:8'} onChange={onChange} options={['1:2','1:4','1:8','1:16','1:32','1:64']} />
      <FieldSelect label="Status" name="status" value={data.status || 'active'} onChange={onChange} options={STATUS_OPTIONS} />
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Latitude" name="latitude" value={data.latitude || ''} onChange={onChange} type="number" />
        <FieldInput label="Longitude" name="longitude" value={data.longitude || ''} onChange={onChange} type="number" />
      </div>
    </div>
  );
}

// ─── Detail views per type ────────────────────────────────────────────────────
function NodeDetails({ detail, type }: { detail: any; type: MapEntity['type'] }) {
  if (!detail) return null;
  if (type === 'OLT') return (<>
    <DetailRow label="IP Address" value={detail.ipAddress} mono />
    <DetailRow label="Brand" value={detail.brand} />
    <DetailRow label="Model" value={detail.model} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  if (type === 'OTB') return (<>
    <DetailRow label="Type" value={detail.type?.replace(/_/g, ' ')} />
    <DetailRow label="Port Count" value={detail.portCount} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Address" value={detail.address} />
    <DetailRow label="OLT" value={detail.network_olts?.name} />
    <DetailRow label="ODC Count" value={detail.network_odcs?.length} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  if (type === 'JOINT_CLOSURE') return (<>
    <DetailRow label="Closure Type" value={detail.closureType?.replace(/_/g, ' ')} />
    <DetailRow label="Splice Capacity" value={detail.spliceCapacity} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  if (type === 'ODC') return (<>
    <DetailRow label="OLT" value={detail.network_olts?.name} />
    <DetailRow label="PON Port" value={detail.ponPort} />
    <DetailRow label="Port Count" value={detail.portCount} />
    <DetailRow label="ODP Count" value={detail._count?.network_odps} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  if (type === 'ODP') return (<>
    <DetailRow label="ODC" value={detail.network_odcs?.name} />
    <DetailRow label="OLT" value={detail.network_olts?.name} />
    <DetailRow label="Port Count" value={detail.portCount} />
    <DetailRow label="Splitter Ratio" value={detail.splitterRatio} />
    <DetailRow label="Subscribers" value={detail._count?.odp_customer_assignments} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  if (type === 'CUSTOMER') return (<>
    <DetailRow label="Username" value={detail.metadata?.username} mono />
    <DetailRow label="Package" value={detail.metadata?.package} />
    <DetailRow label="Status" value={detail.status} />
    <DetailRow label="Address" value={detail.metadata?.address} />
    <DetailRow label="Location" value={detail.latitude && `${detail.latitude}, ${detail.longitude}`} />
  </>);
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NetworkNodePanel({ entity, onClose, onDeleted, onUpdated }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [olts, setOlts] = useState<any[]>([]);
  const [odcs, setOdcs] = useState<any[]>([]);

  // Load detail when entity changes
  useEffect(() => {
    if (!entity || entity.type === 'CUSTOMER') {
      setDetail(null);
      setMode('view');
      return;
    }
    setMode('view');
    setDetail(null);
    setLoadingDetail(true);

    const base = getApiBase(entity.type);
    const url = entity.type === 'OLT'
      ? `${base}/${entity.id}`
      : `${base}/${entity.id}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const d = data.otb || data.odc || data.odp || data.jc || data.olt || data;
        setDetail(d);
        setFormData(d);
      })
      .catch(() => { /* show basic entity info */ })
      .finally(() => setLoadingDetail(false));
  }, [entity?.id, entity?.type]);

  // Load OLTs and ODCs for dropdowns
  useEffect(() => {
    if (!entity || entity.type === 'CUSTOMER') return;
    if (entity.type === 'ODC' || entity.type === 'ODP') {
      fetch('/api/network/olts').then(r => r.json()).then(d => setOlts(d.data || [])).catch(() => {});
    }
    if (entity.type === 'ODP') {
      fetch('/api/network/odcs').then(r => r.json()).then(d => setOdcs(d.odcs || [])).catch(() => {});
    }
  }, [entity?.type]);

  const handleChange = (name: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!entity) return;
    setSaving(true);
    try {
      const base = getApiBase(entity.type);
      let url: string;
      let method: string;

      if (entity.type === 'ODC' || entity.type === 'ODP') {
        // These use query-param style PUT at collection route
        url = `${base}?id=${entity.id}`;
        method = 'PUT';
      } else {
        url = `${base}/${entity.id}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save');

      const updated = data.otb || data.odc || data.odp || data.olt || data;
      setDetail(updated);
      setFormData(updated);
      setMode('view');

      onUpdated({
        ...entity,
        name: updated.name || entity.name,
        status: updated.status || entity.status,
        latitude: parseFloat(updated.latitude) || entity.latitude,
        longitude: parseFloat(updated.longitude) || entity.longitude,
      });

      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entity) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Delete Node?',
      text: `Are you sure you want to delete "${entity.name}"?`,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;

    try {
      const base = getApiBase(entity.type);
      let url: string;
      if (entity.type === 'ODC' || entity.type === 'ODP') {
        url = `${base}?id=${entity.id}`;
      } else if (entity.type === 'OLT') {
        url = `${base}/${entity.id}`;
      } else {
        url = `${base}/${entity.id}`;
      }

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok && data.error) throw new Error(data.error);

      Swal.fire({ icon: 'success', title: 'Deleted', timer: 1200, showConfirmButton: false });
      onDeleted(entity.id);
      onClose();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  if (!entity) return null;

  const typeColor = TYPE_COLORS[entity.type] || 'bg-gray-100 text-gray-800 border-gray-200';
  const displayType = entity.type === 'JOINT_CLOSURE' ? 'Joint Closure' : entity.type;
  const isReadOnly = entity.type === 'CUSTOMER';

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl flex flex-col z-[1000] border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-semibold ${typeColor}`}>
            <TypeIcon type={entity.type} />
            {displayType}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isReadOnly && mode === 'view' && (
            <>
              <button onClick={() => setMode('edit')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400" title="Edit">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={handleDelete} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Entity name + code */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <h2 className="font-bold text-gray-900 dark:text-white text-base leading-tight">{entity.name}</h2>
        {entity.code && <p className="text-xs text-gray-400 font-mono mt-0.5">{entity.code}</p>}
        <div className="mt-1.5"><StatusBadge status={entity.status} /></div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : mode === 'view' ? (
          <div className="space-y-1">
            <NodeDetails detail={detail || entity} type={entity.type} />
            {entity.type === 'CUSTOMER' && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <a href={`/admin/customers?search=${entity.code}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  View Customer Details <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {!isReadOnly && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                {/* Quick navigation links */}
                {(entity.type === 'ODP' || entity.type === 'ODC') && (
                  <a href={`/admin/network/diagrams`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <span className="text-gray-700 dark:text-gray-300">View Splitter Diagram</span>
                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </a>
                )}
                <a href={`/admin/network/trace`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <span className="text-gray-700 dark:text-gray-300">Trace Fiber Path</span>
                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </a>
              </div>
            )}
          </div>
        ) : (
          /* Edit form */
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Editing: <strong className="dark:text-gray-200">{entity.name}</strong></p>
            {entity.type === 'OLT' && <OLTEditForm data={formData} onChange={handleChange} />}
            {entity.type === 'OTB' && <OTBEditForm data={formData} onChange={handleChange} />}
            {entity.type === 'JOINT_CLOSURE' && <JCEditForm data={formData} onChange={handleChange} />}
            {entity.type === 'ODC' && <ODCEditForm data={formData} onChange={handleChange} olts={olts} />}
            {entity.type === 'ODP' && <ODPEditForm data={formData} onChange={handleChange} odcs={odcs} />}
          </div>
        )}
      </div>

      {/* Footer */}
      {mode === 'edit' && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          <button onClick={() => { setMode('view'); setFormData(detail); }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
