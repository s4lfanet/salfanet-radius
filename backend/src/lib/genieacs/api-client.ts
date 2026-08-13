/**
 * Server-side GenieACS NBI client.
 *
 * Resolves credentials in this order:
 *   1. `genieacsSettings` row from the application DB (preferred — set
 *      via the existing /admin/settings/genieacs UI).
 *   2. Environment variables `GENIEACS_NBI_INTERNAL_URL` /
 *      `GENIEACS_NBI_URL`, `GENIEACS_NBI_USERNAME`,
 *      `GENIEACS_NBI_PASSWORD` as a fallback for headless setups.
 *
 * All functions are async and intentionally throw on transport
 * errors so route handlers can wrap them with `fail()` from
 * `helpers.ts` for a consistent envelope.
 */

import 'server-only';
import { getGenieACSCredentials } from '@/app/api/settings/genieacs/route';
import { basicAuthHeader } from './helpers';
import type {
  GenieDevice,
  GeniePreset,
  GenieProvision,
  GenieVirtualParameter,
  GenieConfig,
  GenieTask,
  GenieFault,
  GenieFile,
  ParamUpdate,
} from './types';

interface NbiAuth {
  baseUrl: string;
  username?: string;
  password?: string;
}

async function resolveAuth(): Promise<NbiAuth> {
  const creds = await getGenieACSCredentials();
  if (creds && creds.host) {
    return {
      baseUrl: creds.host.replace(/\/+$/, ''),
      username: creds.username,
      password: creds.password,
    };
  }
  const envUrl =
    process.env.GENIEACS_NBI_INTERNAL_URL ||
    process.env.GENIEACS_NBI_URL ||
    process.env.NEXT_PUBLIC_GENIEACS_NBI_URL;
  if (!envUrl) {
    throw new Error('GenieACS NBI is not configured');
  }
  return {
    baseUrl: envUrl.replace(/\/+$/, ''),
    username: process.env.GENIEACS_NBI_USERNAME,
    password: process.env.GENIEACS_NBI_PASSWORD,
  };
}

interface NbiOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Return raw Response (for binary/text routes). */
  raw?: boolean;
}

/**
 * Low-level wrapper around `fetch` against the configured NBI base URL.
 * Resolves to parsed JSON unless `raw` is true.
 */
export async function nbiRequest<T = unknown>(path: string, opts: NbiOptions = {}): Promise<T> {
  const auth = await resolveAuth();
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${auth.baseUrl}${path}${qs}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...basicAuthHeader(auth.username, auth.password),
    ...(opts.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === 'string' || opts.body instanceof Uint8Array) {
      body = opts.body as BodyInit;
    } else {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NBI ${opts.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

/* ---------- Devices ---------- */

export async function getDevices(query?: object, projection?: string): Promise<GenieDevice[]> {
  const q: Record<string, string> = {};
  if (query) q.query = JSON.stringify(query);
  if (projection) q.projection = projection;
  return nbiRequest<GenieDevice[]>('/devices', { query: q });
}

export async function getDevice(deviceId: string): Promise<GenieDevice | null> {
  const arr = await getDevices({ _id: deviceId });
  return arr[0] ?? null;
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await nbiRequest(`/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

export async function countDevices(query?: object): Promise<number> {
  const q: Record<string, string> = {};
  if (query) q.query = JSON.stringify(query);
  // GenieACS returns count in `total` header for HEAD requests; fall back to length.
  const arr = await nbiRequest<GenieDevice[]>('/devices', { query: { ...q, projection: '_id' } });
  return arr.length;
}

/* ---------- Tasks ---------- */

export async function createTask(deviceId: string, task: Partial<GenieTask>): Promise<GenieTask> {
  return nbiRequest<GenieTask>(`/devices/${encodeURIComponent(deviceId)}/tasks`, {
    method: 'POST',
    query: { connection_request: '' },
    body: task,
  });
}

export async function getTasks(query?: object): Promise<GenieTask[]> {
  const q: Record<string, string> = {};
  if (query) q.query = JSON.stringify(query);
  return nbiRequest<GenieTask[]>('/tasks', { query: q });
}

export async function deleteTask(taskId: string): Promise<void> {
  await nbiRequest(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

export async function getParameterValues(deviceId: string, paths: string[]): Promise<GenieTask> {
  return createTask(deviceId, { name: 'getParameterValues', parameterNames: paths });
}

export async function setParameterValues(deviceId: string, updates: ParamUpdate[]): Promise<GenieTask> {
  return createTask(deviceId, {
    name: 'setParameterValues',
    parameterValues: updates.map((u) => [u.path, u.value, u.type ?? 'xsd:string']),
  });
}

export async function rebootDevice(deviceId: string): Promise<GenieTask> {
  return createTask(deviceId, { name: 'reboot' });
}

export async function factoryResetDevice(deviceId: string): Promise<GenieTask> {
  return createTask(deviceId, { name: 'factoryReset' });
}

export async function refreshObject(deviceId: string, objectName: string): Promise<GenieTask> {
  return createTask(deviceId, { name: 'refreshObject', objectName });
}

export async function addObject(deviceId: string, objectName: string): Promise<GenieTask> {
  return createTask(deviceId, { name: 'addObject', objectName });
}

export async function deleteObject(deviceId: string, objectName: string): Promise<GenieTask> {
  return createTask(deviceId, { name: 'deleteObject', objectName });
}

export async function downloadFirmware(
  deviceId: string,
  fileType: string,
  fileName: string,
  targetFileName?: string,
): Promise<GenieTask> {
  return createTask(deviceId, { name: 'download', fileType, fileName, targetFileName });
}

/* ---------- Faults ---------- */

export async function getFaults(query?: object): Promise<GenieFault[]> {
  const q: Record<string, string> = {};
  if (query) q.query = JSON.stringify(query);
  return nbiRequest<GenieFault[]>('/faults', { query: q });
}

export async function deleteFault(faultId: string): Promise<void> {
  await nbiRequest(`/faults/${encodeURIComponent(faultId)}`, { method: 'DELETE' });
}

/* ---------- Presets ---------- */

export async function getPresets(): Promise<GeniePreset[]> {
  return nbiRequest<GeniePreset[]>('/presets');
}

export async function getPreset(id: string): Promise<GeniePreset | null> {
  const all = await getPresets();
  return all.find((p) => p._id === id) ?? null;
}

export async function createOrUpdatePreset(id: string, preset: Omit<GeniePreset, '_id'>): Promise<void> {
  await nbiRequest(`/presets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: preset,
  });
}

export async function deletePreset(id: string): Promise<void> {
  await nbiRequest(`/presets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Provisions ---------- */

export async function getProvisions(): Promise<GenieProvision[]> {
  return nbiRequest<GenieProvision[]>('/provisions');
}

export async function getProvision(id: string): Promise<GenieProvision | null> {
  const all = await getProvisions();
  return all.find((p) => p._id === id) ?? null;
}

export async function createOrUpdateProvision(id: string, script: string): Promise<void> {
  await nbiRequest(`/provisions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: script,
    headers: { 'Content-Type': 'application/javascript' },
  });
}

export async function deleteProvision(id: string): Promise<void> {
  await nbiRequest(`/provisions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Virtual Parameters (NBI side) ---------- */

export async function getVirtualParameters(): Promise<GenieVirtualParameter[]> {
  return nbiRequest<GenieVirtualParameter[]>('/virtual_parameters');
}

export async function getVirtualParameter(id: string): Promise<GenieVirtualParameter | null> {
  const all = await getVirtualParameters();
  return all.find((v) => v._id === id) ?? null;
}

export async function createOrUpdateVirtualParameter(id: string, script: string): Promise<void> {
  await nbiRequest(`/virtual_parameters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: script,
    headers: { 'Content-Type': 'application/javascript' },
  });
}

export async function deleteVirtualParameter(id: string): Promise<void> {
  await nbiRequest(`/virtual_parameters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Config ---------- */

export async function getConfigs(): Promise<GenieConfig[]> {
  return nbiRequest<GenieConfig[]>('/config');
}

export async function getConfig(id: string): Promise<GenieConfig | null> {
  const all = await getConfigs();
  return all.find((c) => c._id === id) ?? null;
}

export async function setConfig(id: string, value: string | number | boolean): Promise<void> {
  await nbiRequest(`/config/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { value },
  });
}

export async function deleteConfig(id: string): Promise<void> {
  await nbiRequest(`/config/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ---------- Files ---------- */

export async function getFiles(): Promise<GenieFile[]> {
  return nbiRequest<GenieFile[]>('/files');
}

export async function deleteFile(fileName: string): Promise<void> {
  await nbiRequest(`/files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
}

export async function uploadFile(
  fileName: string,
  body: Uint8Array | string,
  metadata?: { fileType?: string; oui?: string; productClass?: string; version?: string },
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  if (metadata?.fileType) headers.fileType = metadata.fileType;
  if (metadata?.oui) headers.oui = metadata.oui;
  if (metadata?.productClass) headers.productClass = metadata.productClass;
  if (metadata?.version) headers.version = metadata.version;
  await nbiRequest(`/files/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    body,
    headers,
  });
}
