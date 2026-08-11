/**
 * GenieACS MongoDB direct client.
 *
 * Dipakai untuk operasi yang tidak tersedia via NBI, misalnya:
 *   - Query langsung ke collection `faults` dengan aggregation
 *   - Membaca history tasks yang sudah completed (NBI hanya tampilkan pending)
 *   - Bulk read/write untuk auto-provision engine
 *
 * Koneksi diambil dari env GENIEACS_MONGODB_URL.
 * Jika env tidak di-set, semua fungsi throw sehingga caller bisa fallback ke NBI.
 *
 * Gunakan hanya di server-side (route handlers / server components).
 */
import 'server-only';
import { MongoClient, type Db, type Collection } from 'mongodb';
import type { GenieDevice, GeniePreset, GenieProvision, GenieVirtualParameter, GenieConfig, GenieTask, GenieFault, GenieFile } from './types';

const MONGODB_URL = process.env.GENIEACS_MONGODB_URL;
const DB_NAME = 'genieacs';

let _client: MongoClient | null = null;
let _clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (!MONGODB_URL) {
    throw new Error('GENIEACS_MONGODB_URL env var is not set');
  }
  if (!_clientPromise) {
    _client = new MongoClient(MONGODB_URL, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    _clientPromise = _client.connect();
  }
  return _clientPromise;
}

async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(DB_NAME);
}

/** Raw access to any GenieACS collection. */
export async function getCollection<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

/* ─── Convenience helpers ─────────────────────────────────────────────── */

/** Close connection (call on process exit if needed). */
export async function closeConnection(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
    _clientPromise = null;
  }
}

/* ─── Devices ─────────────────────────────────────────────────────────── */

export async function mongoGetDevices(
  filter: object = {},
  projection?: Record<string, 0 | 1>,
  limit = 200,
  skip = 0,
): Promise<GenieDevice[]> {
  const col = await getCollection<GenieDevice>('devices');
  const cursor = col.find(filter, { projection, limit, skip });
  return cursor.toArray() as unknown as GenieDevice[];
}

export async function mongoGetDevice(deviceId: string): Promise<GenieDevice | null> {
  const col = await getCollection<GenieDevice>('devices');
  return col.findOne({ _id: deviceId } as Parameters<typeof col.findOne>[0]) as unknown as GenieDevice | null;
}

export async function mongoCountDevices(filter: object = {}): Promise<number> {
  const col = await getCollection<GenieDevice>('devices');
  return col.countDocuments(filter);
}

/* ─── Tasks ───────────────────────────────────────────────────────────── */

export async function mongoGetTasks(
  filter: object = {},
  limit = 100,
): Promise<GenieTask[]> {
  const col = await getCollection<GenieTask>('tasks');
  return col.find(filter, { limit }).toArray() as unknown as GenieTask[];
}

/* ─── Faults ──────────────────────────────────────────────────────────── */

export async function mongoGetFaults(filter: object = {}): Promise<GenieFault[]> {
  const col = await getCollection<GenieFault>('faults');
  return col.find(filter).toArray() as unknown as GenieFault[];
}

export async function mongoDeleteFault(id: string): Promise<void> {
  const col = await getCollection<GenieFault>('faults');
  await col.deleteOne({ _id: id } as Parameters<typeof col.deleteOne>[0]);
}

/* ─── Presets ─────────────────────────────────────────────────────────── */

export async function mongoGetPresets(): Promise<GeniePreset[]> {
  const col = await getCollection<GeniePreset>('presets');
  return col.find({}).toArray() as unknown as GeniePreset[];
}

export async function mongoUpsertPreset(id: string, data: Omit<GeniePreset, '_id'>): Promise<void> {
  const col = await getCollection<GeniePreset>('presets');
  const filter = { _id: id } as Parameters<typeof col.replaceOne>[0];
  await col.replaceOne(filter, { _id: id, ...data } as unknown as GeniePreset, { upsert: true });
}

export async function mongoDeletePreset(id: string): Promise<void> {
  const col = await getCollection<GeniePreset>('presets');
  await col.deleteOne({ _id: id } as Parameters<typeof col.deleteOne>[0]);
}

/* ─── Provisions ─────────────────────────────────────────────────────── */

export async function mongoGetProvisions(): Promise<GenieProvision[]> {
  const col = await getCollection<GenieProvision>('provisions');
  return col.find({}).toArray() as unknown as GenieProvision[];
}

export async function mongoUpsertProvision(id: string, script: string): Promise<void> {
  const col = await getCollection<GenieProvision>('provisions');
  const filter = { _id: id } as Parameters<typeof col.replaceOne>[0];
  await col.replaceOne(filter, { _id: id, script } as unknown as GenieProvision, { upsert: true });
}

/* ─── Virtual Parameters ─────────────────────────────────────────────── */

export async function mongoGetVirtualParameters(): Promise<GenieVirtualParameter[]> {
  const col = await getCollection<GenieVirtualParameter>('virtualParameters');
  return col.find({}).toArray() as unknown as GenieVirtualParameter[];
}

/* ─── Config ─────────────────────────────────────────────────────────── */

export async function mongoGetConfigs(): Promise<GenieConfig[]> {
  const col = await getCollection<GenieConfig>('config');
  return col.find({}).toArray() as unknown as GenieConfig[];
}

/* ─── Files ─────────────────────────────────────────────────────────── */

export async function mongoGetFiles(): Promise<GenieFile[]> {
  const col = await getCollection<GenieFile>('fs.files');
  return col.find({}, { limit: 200 }).toArray() as unknown as GenieFile[];
}
