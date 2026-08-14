/**
 * Settings API types.
 *
 * @see backend/src/app/api/settings/route.ts
 * @see backend/src/app/api/company/route.ts
 * @see backend/prisma/schema.prisma (models: companies)
 */

import type { ID, ISODateString } from './common';

// === Company ===

export interface Company {
  id: ID;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  baseUrl: string | null;
  logo: string | null;
  taxRate: number | null;
  currency: string;
  timezone: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// GET /api/company returns raw company object (no wrapper)
export type CompanyResponse = Company;

// === Settings (key-value style) ===

export interface Settings {
  [key: string]: string | number | boolean | null;
}

export interface SettingsResponse {
  settings: Settings;
}

export interface SettingsUpdateResponse {
  success: boolean;
  message?: string;
}

// === Cron ===

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  description: string | null;
  enabled: boolean;
  lastRun: ISODateString | null;
  nextRun: ISODateString | null;
}

// GET /api/cron/status returns { success: true, jobs }
export interface CronStatusResponse {
  success?: boolean;
  jobs: CronJob[];
}

export interface CronHistoryEntry {
  id: ID;
  jobName: string;
  status: 'success' | 'failed' | 'running';
  startedAt: ISODateString;
  finishedAt: ISODateString | null;
  duration: number | null;
  error: string | null;
}

// GET /api/cron/history returns { success: true, history }
export interface CronHistoryResponse {
  success?: boolean;
  history: CronHistoryEntry[];
}

// === GenieACS Config ===

export interface GenieACSConfig {
  url: string;
  username: string | null;
  password: string | null;
  enabled: boolean;
}
