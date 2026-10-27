import 'server-only'
/**
 * Firebase settings for the native apps, uploaded per installation from the
 * admin panel instead of being baked into the APK. One public APK then works
 * against any Salfanet server: the app asks the server which Firebase
 * project to use, or falls back to polling when the server has none.
 *
 * Both files live in a persistent data directory (outside git and builds):
 *   google-services.json   client config downloaded from the Firebase console
 *   service-account.json   private key the backend sends pushes with (0600)
 * FIREBASE_SERVICE_ACCOUNT_JSON in .env still works and wins over the file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

export const APP_PACKAGES = {
  customer: 'id.my.salfa.customer_app',
  admin: 'id.my.salfa.admin_app',
} as const;
export type PushApp = keyof typeof APP_PACKAGES;

const CONFIG_DIR =
  process.env.FIREBASE_CONFIG_DIR ||
  (process.env.NODE_ENV === 'production' ? '/var/data/salfanet/firebase' : join(process.cwd(), 'data', 'firebase'));
const CLIENT_FILE = join(CONFIG_DIR, 'google-services.json');
const SERVICE_ACCOUNT_FILE = join(CONFIG_DIR, 'service-account.json');

export interface FirebaseClientOptions {
  apiKey: string;
  appId: string;
  messagingSenderId: string;
  projectId: string;
  storageBucket?: string;
}

interface ClientConfig {
  projectId: string;
  apps: Partial<Record<PushApp, FirebaseClientOptions>>;
}

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

/** Parses google-services.json; throws a readable message when it is not one. */
export function parseGoogleServices(raw: string): ClientConfig {
  let json: {
    project_info?: { project_id?: string; project_number?: string; storage_bucket?: string };
    client?: Array<{
      client_info?: { mobilesdk_app_id?: string; android_client_info?: { package_name?: string } };
      api_key?: Array<{ current_key?: string }>;
    }>;
  };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  const info = json.project_info;
  if (!info?.project_id || !info.project_number || !Array.isArray(json.client)) {
    throw new Error('Ini bukan google-services.json dari Firebase (project_info/client tidak ada).');
  }
  const apps: ClientConfig['apps'] = {};
  for (const [app, pkg] of Object.entries(APP_PACKAGES) as Array<[PushApp, string]>) {
    const client = json.client.find((c) => c.client_info?.android_client_info?.package_name === pkg);
    const appId = client?.client_info?.mobilesdk_app_id;
    const apiKey = client?.api_key?.find((k) => k.current_key)?.current_key;
    if (appId && apiKey) {
      apps[app] = {
        apiKey,
        appId,
        messagingSenderId: info.project_number,
        projectId: info.project_id,
        ...(info.storage_bucket ? { storageBucket: info.storage_bucket } : {}),
      };
    }
  }
  if (!apps.customer && !apps.admin) {
    throw new Error(`Tidak ada aplikasi Android dengan package ${APP_PACKAGES.customer} atau ${APP_PACKAGES.admin} di file ini.`);
  }
  return { projectId: info.project_id, apps };
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let json: Partial<ServiceAccount> & { type?: string };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  if (json.type !== 'service_account' || !json.project_id || !json.client_email || !json.private_key) {
    throw new Error('Ini bukan kunci service account Firebase (Project settings → Service accounts → Generate new private key).');
  }
  return json as ServiceAccount;
}

function readClientConfig(): ClientConfig | null {
  if (!existsSync(CLIENT_FILE)) return null;
  try {
    return parseGoogleServices(readFileSync(CLIENT_FILE, 'utf8'));
  } catch (e) {
    console.error('[Firebase] google-services.json unreadable:', e);
    return null;
  }
}

/** The service account and a key that changes whenever its source does. */
export function readServiceAccount(): { account: ServiceAccount; source: 'env' | 'file'; signature: string } | null {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (env) {
    try {
      return { account: parseServiceAccount(env), source: 'env', signature: 'env' };
    } catch (e) {
      console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON invalid:', e);
      return null;
    }
  }
  if (!existsSync(SERVICE_ACCOUNT_FILE)) return null;
  try {
    const signature = `file:${statSync(SERVICE_ACCOUNT_FILE).mtimeMs}`;
    return { account: parseServiceAccount(readFileSync(SERVICE_ACCOUNT_FILE, 'utf8')), source: 'file', signature };
  } catch (e) {
    console.error('[Firebase] service-account.json unreadable:', e);
    return null;
  }
}

/**
 * Firebase options the given app should start with, or null when this
 * server cannot deliver FCM to it — the app then polls instead. Both halves
 * must exist and belong to the same project, otherwise tokens the app
 * registers could never be reached by this backend.
 */
export function getAppFirebaseOptions(app: PushApp): FirebaseClientOptions | null {
  const client = readClientConfig();
  const sa = readServiceAccount();
  const options = client?.apps[app];
  if (!options || !sa || sa.account.project_id !== client.projectId) return null;
  return options;
}

export function getFirebaseStatus() {
  const client = readClientConfig();
  const sa = readServiceAccount();
  const mismatch = !!client && !!sa && client.projectId !== sa.account.project_id;
  return {
    clientConfig: client ? { projectId: client.projectId, apps: Object.keys(client.apps) as PushApp[] } : null,
    serviceAccount: sa ? { projectId: sa.account.project_id, clientEmail: sa.account.client_email, source: sa.source } : null,
    projectMismatch: mismatch,
    ready: {
      customer: !!getAppFirebaseOptions('customer'),
      admin: !!getAppFirebaseOptions('admin'),
    },
  };
}

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function saveGoogleServices(raw: string) {
  const parsed = parseGoogleServices(raw);
  ensureDir();
  writeFileSync(CLIENT_FILE, raw, { mode: 0o644 });
  return parsed;
}

export function saveServiceAccount(raw: string) {
  const parsed = parseServiceAccount(raw);
  ensureDir();
  writeFileSync(SERVICE_ACCOUNT_FILE, raw, { mode: 0o600 });
  chmodSync(SERVICE_ACCOUNT_FILE, 0o600);
  return parsed;
}

export function removeFirebaseFile(kind: 'google-services' | 'service-account') {
  const file = kind === 'google-services' ? CLIENT_FILE : SERVICE_ACCOUNT_FILE;
  if (existsSync(file)) unlinkSync(file);
}
