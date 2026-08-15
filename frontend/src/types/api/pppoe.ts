/**
 * PPPoE API types — matches backend pppoe service responses.
 *
 * @see backend/src/app/api/pppoe/users/route.ts
 * @see backend/src/app/api/pppoe/profiles/route.ts
 * @see backend/src/app/api/pppoe/areas/route.ts
 * @see backend/prisma/schema.prisma (models: pppoe_users, pppoe_profiles, pppoe_areas)
 */

import type {
  ID,
  ISODateString,
  PppoeSubscriptionType,
  PppoeConnectionType,
  UserStatus,
} from './common';

// === PPPoE User ===

export interface PppoeUser {
  id: ID;
  username: string;
  password?: string; // only returned in specific contexts
  profileId: ID;
  areaId: ID | null;
  status: UserStatus;
  ipAddress: string | null;
  macAddress: string | null;
  comment: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  expiredAt: ISODateString | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  email: string | null;
  lastSyncAt: ISODateString | null;
  name: string;
  phone: string;
  syncedToRadius: boolean;
  routerId: ID | null;
  subscriptionType: PppoeSubscriptionType;
  lastPaymentDate: ISODateString | null;
  billingDay: number | null;
  autoIsolationEnabled: boolean;
  balance: number;
  autoRenewal: boolean;
  connectionType: PppoeConnectionType;
  idCardNumber: string | null;
  idCardPhoto: string | null;
  followRoad: boolean;
  referralCode: string | null;
  referredById: ID | null;
  discount: number | null;
  discountNote: string | null;
  installDate: ISODateString | null;
  odp: string | null;
  registeredByTechnicianId: ID | null;
  // Joined relations (optional, depends on query)
  pppoe_profiles?: PppoeProfile;
  pppoe_areas?: PppoeArea | null;
  nas?: Router;
}

export interface PppoeUserListResponse {
  users: PppoeUser[];
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// GET /api/pppoe/users/[id] returns raw user object (no wrapper)
// PUT /api/pppoe/users returns { success: true, user }
export interface PppoeUserResponse {
  success?: boolean;
  user: PppoeUser;
  [key: string]: unknown;
}

// POST /api/pppoe/users returns { success: true, ...result }
export interface PppoeUserCreateResponse {
  success: boolean;
  user?: PppoeUser;
  secrets?: Array<{ username: string; password: string; isNew: boolean; disabled: boolean }>;
  [key: string]: unknown;
}

// DELETE /api/pppoe/users returns { success: true, message, ...result }
export interface PppoeUserDeleteResponse {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

// === PPPoE Profile ===

export interface PppoeProfile {
  id: ID;
  name: string;
  price: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  description: string | null;
  downloadSpeed: number;
  uploadSpeed: number;
  rateLimit: string | null;
  groupName: string;
  mikrotikProfileName: string | null;
  ipPoolName: string | null;
  ipPoolRange: string | null;
  localAddress: string | null;
  lastRouterId: ID | null;
  hpp: number | null;
  ppnActive: boolean;
  ppnRate: number;
  isActive: boolean;
  lastSyncAt: ISODateString | null;
  syncedToRadius: boolean;
  validityUnit: 'MONTHS' | 'DAYS' | 'HOURS';
  validityValue: number;
  sharedUser: boolean;
  radiusPoolName: string | null;
}

// GET /api/pppoe/profiles returns { profiles, count }
export interface PppoeProfileListResponse {
  profiles: PppoeProfile[];
  count?: number;
}

// POST/PUT /api/pppoe/profiles returns { success: true, profile }
export interface PppoeProfileResponse {
  profile: PppoeProfile;
  success?: boolean;
}

// === PPPoE Area ===

export interface PppoeArea {
  id: ID;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// GET /api/pppoe/areas returns { areas, count }
export interface PppoeAreaListResponse {
  areas: PppoeArea[];
  count?: number;
}

// POST/PUT /api/pppoe/areas returns { area, success: true }
export interface PppoeAreaResponse {
  area: PppoeArea;
  success?: boolean;
}

// === Online Status ===
// GET /api/pppoe/users/online-status returns { online, onlineCount, total, timestamp }
export interface PppoeOnlineStatusResponse {
  online: string[];
  onlineCount: number;
  total: number;
  timestamp: ISODateString;
}

// === Sync Preview ===
// GET /api/pppoe/users/sync-mikrotik?routerId=xxx returns { success, router, data: { total, new, existing, secrets } }
export interface SyncPreviewSecret {
  username: string;
  password: string;
  isNew: boolean;
  disabled: boolean;
}

export interface SyncPreviewResponse {
  success: boolean;
  router?: { id: ID; name: string; ipAddress: string };
  data: {
    total: number;
    new: number;
    existing: number;
    secrets: SyncPreviewSecret[];
  };
}

// POST /api/pppoe/users/sync-mikrotik returns { success, message, stats, imported, skipped, errors }
export interface SyncMikrotikImportResponse {
  success: boolean;
  message: string;
  stats: { total: number; imported: number; skipped: number; failed: number };
  imported: PppoeUser[];
  skipped: Array<{ username: string; reason: string }>;
  errors: Array<{ username: string; error: string }>;
}

// PUT /api/pppoe/users/status returns { success, user, coa }
export interface UpdateUserStatusResponse {
  success: boolean;
  user: PppoeUser;
  coa?: unknown;
}

// PUT /api/pppoe/users/bulk-status returns { success, updated, status, coa }
export interface BulkUpdateStatusResponse {
  success: boolean;
  updated: number;
  status: string;
  coa?: unknown;
}

// === Router (NAS) — referenced by PPPoE ===

export interface Router {
  id: ID;
  name: string;
  nasname: string;
  shortname: string;
  type: string;
  ipAddress: string;
  username: string | null;
  port: number;
  secret: string;
  ports: number;
  server: string | null;
  community: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  vpnClientId: ID | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  authMode: string;
}
