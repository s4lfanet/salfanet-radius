'use client';

import { useState, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Power,
  RotateCcw,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Server,
  Activity,
  ListTodo,
  ChevronDown,
  ChevronUp,
  LayoutList,
} from 'lucide-react';
import { DeviceStatusBadge } from '@/components/genieacs/DeviceStatusBadge';
import { TaskStatusBadge } from '@/components/genieacs/TaskStatusBadge';
import { formatWIB } from '@/lib/timezone';
import { useToast } from '@/components/cyberpunk/CyberToast';

interface GenieDevice {
  _id: string;
  [key: string]: unknown;
}

interface GenieTask {
  _id: string;
  name: string;
  status?: string;
  timestamp?: string;
  fault?: { code: string; message: string };
}

function getParam(device: GenieDevice, ...paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let v: unknown = device;
    for (const p of parts) {
      if (v && typeof v === 'object') v = (v as Record<string, unknown>)[p];
      else { v = undefined; break; }
    }
    if (v && typeof v === 'object' && '_value' in (v as object)) {
      const val = (v as { _value: unknown })._value;
      if (val !== null && val !== undefined && val !== '') return String(val);
    }
    if (v !== null && v !== undefined && typeof v !== 'object') return String(v);
  }
  return '-';
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  variant?: 'default' | 'danger';
}

function ActionButton({ label, icon, onClick, loading, variant = 'default' }: ActionButtonProps) {
  const cls = variant === 'danger'
    ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20'
    : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 transition-colors ${cls}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

export default function DeviceDetailPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = use(params);
  const router = useRouter();
  const { addToast, confirm } = useToast();

  const [device, setDevice] = useState<GenieDevice | null>(null);
  const [tasks, setTasks] = useState<GenieTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showTasks, setShowTasks] = useState(true);

  const encodedId = encodeURIComponent(deviceId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devRes, taskRes] = await Promise.all([
        fetch(`/api/genieacs/devices/${encodedId}`),
        fetch(`/api/genieacs/devices/${encodedId}/tasks`),
      ]);
      if (!devRes.ok) {
        const j = await devRes.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${devRes.status}`);
      }
      const devJson = await devRes.json();
      setDevice(devJson.data);

      if (taskRes.ok) {
        const taskJson = await taskRes.json();
        setTasks(Array.isArray(taskJson.data) ? taskJson.data : []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [encodedId]);

  useEffect(() => { load(); }, [load]);

  async function runAction(action: string, label: string, body?: object) {
    setActionLoading(action);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/genieacs/devices/${encodedId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setSuccess(`${label} queued successfully.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!await confirm({
      title: 'Delete Device',
      message: 'This will permanently remove the device from GenieACS. Are you sure?',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })) return;
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/genieacs/devices/${encodedId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Delete failed');
      }
      addToast({ type: 'success', title: 'Deleted', description: 'Device removed from GenieACS', duration: 3000 });
      router.push('/admin/genieacs/devices');
    } catch (e) {
      setError((e as Error).message);
      setActionLoading(null);
    }
  }

  const serialNumber = device ? getParam(device,
    'InternetGatewayDevice.DeviceInfo.SerialNumber._value',
    'Device.DeviceInfo.SerialNumber._value',
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.SerialNumber',
  ) : '-';

  const manufacturer = device ? getParam(device,
    'InternetGatewayDevice.DeviceInfo.Manufacturer._value',
    'Device.DeviceInfo.Manufacturer._value',
    'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.Manufacturer',
  ) : '-';

  const model = device ? getParam(device,
    'InternetGatewayDevice.DeviceInfo.ModelName._value',
    'Device.DeviceInfo.ModelName._value',
    'InternetGatewayDevice.DeviceInfo.ModelName',
    'Device.DeviceInfo.ModelName',
  ) : '-';

  const swVersion = device ? getParam(device,
    'InternetGatewayDevice.DeviceInfo.SoftwareVersion._value',
    'Device.DeviceInfo.SoftwareVersion._value',
    'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    'Device.DeviceInfo.SoftwareVersion',
  ) : '-';

  const lastInform = device ? String((device as Record<string, unknown>)._lastInform ?? '') : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/genieacs/devices"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Devices
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
            {serialNumber !== '-' ? serialNumber : deviceId}
          </span>
          {lastInform && <DeviceStatusBadge lastInform={lastInform} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/genieacs/devices/${encodeURIComponent(deviceId)}/parameters`}
            className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
          >
            <LayoutList className="h-4 w-4" />
            Browse Parameters
          </Link>
          <ActionButton
            label="Refresh"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={load}
            loading={loading}
          />
          <ActionButton
            label="Reboot"
            icon={<Power className="h-4 w-4" />}
            onClick={() => runAction('reboot', 'Reboot')}
            loading={actionLoading === 'reboot'}
          />
          <ActionButton
            label="Factory Reset"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => runAction('factory-reset', 'Factory reset')}
            loading={actionLoading === 'factory-reset'}
            variant="danger"
          />
          <ActionButton
            label="Refresh Params"
            icon={<Activity className="h-4 w-4" />}
            onClick={() => runAction('refresh', 'Refresh parameters', { objectName: 'InternetGatewayDevice' })}
            loading={actionLoading === 'refresh'}
          />
          <ActionButton
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={handleDelete}
            loading={actionLoading === 'delete'}
            variant="danger"
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Device info */}
      {device && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Serial Number', value: serialNumber },
            { label: 'Manufacturer', value: manufacturer },
            { label: 'Model', value: model },
            { label: 'Software Version', value: swVersion },
            { label: 'Last Inform', value: lastInform ? formatWIB(new Date(lastInform)) : '-' },
            { label: 'Device ID', value: deviceId, mono: true },
          ].map(({ label, value, mono }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`mt-1 text-sm font-medium text-gray-900 dark:text-white break-all ${mono ? 'font-mono' : ''}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tasks */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <button
          className="flex w-full items-center justify-between px-4 py-3"
          onClick={() => setShowTasks((v) => !v)}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <ListTodo className="h-4 w-4" />
            Tasks ({tasks.length})
          </span>
          {showTasks ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {showTasks && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {tasks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No tasks pending.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Task', 'Status', 'Created'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {tasks.map((task) => (
                    <tr key={task._id}>
                      <td className="px-4 py-2 font-mono text-xs">{task.name}</td>
                      <td className="px-4 py-2">
                        <TaskStatusBadge status={task.status ?? 'pending'} />
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {task.timestamp ? formatWIB(new Date(task.timestamp)) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Raw JSON toggle */}
      {device && (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <button
            className="flex w-full items-center justify-between px-4 py-3"
            onClick={() => setShowRaw((v) => !v)}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <Server className="h-4 w-4" />
              Raw NBI Data
            </span>
            {showRaw ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showRaw && (
            <div className="border-t border-gray-200 p-4 dark:border-gray-700">
              <pre className="overflow-auto max-h-96 text-xs text-gray-700 dark:text-gray-300">
                {JSON.stringify(device, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
