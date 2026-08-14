/**
 * Network & Router API types.
 *
 * @see backend/src/app/api/network/routers/route.ts
 * @see backend/src/app/api/network/olts/route.ts
 * @see backend/prisma/schema.prisma (models: nas, network_olts, vpn_servers, vpn_clients)
 */

import type { ID, ISODateString } from './common';
import type { Router } from './pppoe';

// Re-export Router (NAS) for network module
export type { Router };

// === OLT ===

export interface OLT {
  id: ID;
  name: string;
  ipAddress: string;
  latitude: number;
  longitude: number;
  status: string;
  followRoad: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  snmpEnabled: boolean;
  snmpCommunity: string;
  snmpPort: number;
  telnetEnabled: boolean;
  telnetPort: number;
  sshEnabled: boolean;
  sshPort: number;
  username: string | null;
  password: string | null;
  monitoringEnabled: boolean;
  pollingInterval: number;
  lastPollAt: ISODateString | null;
  isOnline: boolean;
  uptime: number;
  temperature: number | null;
  totalOnu: number;
}

// GET /api/network/olts returns { success: true, olts }
export interface OLTListResponse {
  success?: boolean;
  olts: OLT[];
}

// POST/PUT /api/network/olts returns { success: true, olt }
export interface OLTResponse {
  success?: boolean;
  olt: OLT;
}

// === ONU Status ===

export interface OnuStatus {
  id: ID;
  oltId: ID;
  onuIndex: string;
  status: 'online' | 'offline';
  rxPower: number | null;
  txPower: number | null;
  temperature: number | null;
  uptime: number | null;
  lastUpdated: ISODateString | null;
}

// === VPN Server ===

export interface VpnServer {
  id: ID;
  name: string;
  type: string;
  ipAddress: string;
  port: number;
  username: string | null;
  password: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// === VPN Client ===

export interface VpnClient {
  id: ID;
  name: string;
  serverId: ID;
  localIp: string | null;
  remoteIp: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// === Router List Response ===
// GET /api/network/routers returns { routers, vpnClients, radiusServerIp }
export interface RouterListResponse {
  routers: Router[];
  vpnClients?: VpnClient[];
  radiusServerIp?: string;
}

// POST/PUT /api/network/routers returns { success, router, message? }
export interface RouterResponse {
  success?: boolean;
  router: Router;
  message?: string;
  vpnClientChanged?: boolean;
}

// === Radius Status ===

export interface RadiusStatus {
  running: boolean;
  uptime: number | null;
  version: string | null;
  pid: number | null;
}
