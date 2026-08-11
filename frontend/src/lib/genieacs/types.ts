/**
 * GenieACS NBI / data model TypeScript types.
 *
 * Used by the server-side NBI client (`api-client.ts`) and the admin
 * external-UI pages under `/admin/genieacs/*` to talk to a GenieACS
 * NBI endpoint (default port 7557).
 */

export interface GenieParameterValue {
  _value?: unknown;
  _type?: string;
  _timestamp?: string;
  _writable?: boolean;
  _object?: boolean;
}

/** Raw device document as returned by GET /devices on NBI. */
export interface GenieDevice {
  _id: string;
  _deviceId?: {
    _Manufacturer?: string;
    _OUI?: string;
    _ProductClass?: string;
    _SerialNumber?: string;
  };
  _lastInform?: string;
  _lastBoot?: string;
  _registered?: string;
  _tags?: string[];
  /** Free-form parameter tree as returned by NBI projection. */
  [key: string]: unknown;
}

/** Flattened parameter row used by parameter-tree UIs. */
export interface ParameterNode {
  path: string;
  value: string;
  type: string;
  writable: boolean;
  object: boolean;
}

/** Single parameter update for setParameterValues. */
export interface ParamUpdate {
  path: string;
  value: string | number | boolean;
  type?: 'xsd:string' | 'xsd:int' | 'xsd:unsignedInt' | 'xsd:boolean' | 'xsd:dateTime';
}

export interface GeniePreset {
  _id: string;
  weight?: number;
  channel?: string;
  schedule?: string;
  events?: Record<string, boolean>;
  precondition?: string;
  configurations?: unknown[];
}

export interface GenieProvision {
  _id: string;
  script: string;
}

export interface GenieVirtualParameter {
  _id: string;
  script: string;
}

export interface GenieConfig {
  _id: string;
  value: string | number | boolean;
}

export interface GenieTask {
  _id: string;
  device: string;
  name: string;
  timestamp?: string;
  expiry?: string;
  retries?: number;
  fault?: GenieFault;
  parameterValues?: Array<[string, unknown, string?]>;
  parameterNames?: string[];
  objectName?: string;
  fileType?: string;
  fileName?: string;
  targetFileName?: string;
  delaySeconds?: number;
  instance?: string;
}

export interface GenieFault {
  _id?: string;
  device?: string;
  channel?: string;
  code: string;
  message: string;
  detail?: unknown;
  timestamp?: string;
  retries?: number;
  expiry?: string;
}

export interface GenieFile {
  _id: string;
  metadata?: {
    fileType?: string;
    oui?: string;
    productClass?: string;
    version?: string;
  };
  contentType?: string;
  length?: number;
  uploadDate?: string;
}

/** Light row used in admin device listings. */
export interface DeviceListItem {
  id: string;
  serialNumber: string;
  manufacturer: string;
  productClass: string;
  model: string;
  ip: string;
  pppUsername: string;
  ssid: string;
  rxPower: string;
  online: boolean;
  lastInform: string | null;
  tags: string[];
}

/** Response envelope returned by all `/api/genieacs/*` routes. */
export type ApiEnvelope<T> =
  | { success: true; data: T; total?: number }
  | { success: false; error: string };

/** Auto-provision config used by the wizard page. */
export interface AutoProvisionConfig {
  id?: string;
  name?: string;
  enabled?: boolean;
  matchTags?: string[];
  matchModel?: string;
  presetIds?: string[];
  parameterValues?: ParamUpdate[];
  /** Parameters to set via declare() in the provision script */
  setParameters?: ParamUpdate[];
  /** Raw JS appended to the generated provision script */
  additionalScript?: string;
  /** GenieACS channel name for the preset (default: "default") */
  channel?: string;
  /** Preset precondition expression (default: "true") */
  precondition?: string;
  /** Preset weight (default: 0) */
  weight?: number;
}
