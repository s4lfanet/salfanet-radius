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
}

export interface PppoeUserResponse {
  success?: boolean;
  user: PppoeUser;
}

export interface PppoeUserCreateResponse {
  success: boolean;
  user: PppoeUser;
  secrets?: Array<{ username: string; password: string; isNew: boolean; disabled: boolean }>;
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

export type PppoeProfileListResponse =
  | { profiles: PppoeProfile[] }
  | PppoeProfile[];

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

export type PppoeAreaListResponse =
  | { areas: PppoeArea[] }
  | PppoeArea[];

export interface PppoeAreaResponse {
  area: PppoeArea;
  success?: boolean;
}

// === Online Status ===

export interface PppoeOnlineStatus {
  username: string;
  online: boolean;
  framedIpAddress?: string | null;
  sessionId?: string | null;
  uptime?: number | null;
}

export interface PppoeOnlineStatusResponse {
  users: PppoeOnlineStatus[];
}

// === Sync Preview ===

export interface SyncPreviewSecret {
  username: string;
  password: string;
  isNew: boolean;
  disabled: boolean;
}

export interface SyncPreviewResponse {
  data: {
    secrets: SyncPreviewSecret[];
  };
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
