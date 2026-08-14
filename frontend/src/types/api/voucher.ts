/**
 * Voucher (Hotspot) API types.
 *
 * @see backend/src/app/api/hotspot/voucher/route.ts
 * @see backend/src/app/api/voucher-templates/route.ts
 * @see backend/prisma/schema.prisma (models: hotspot_vouchers, hotspot_profiles, voucher_templates)
 */

import type { ID, ISODateString, HotspotVoucherStatus } from './common';
import type { Router } from './pppoe';

// === Hotspot Voucher ===

export interface HotspotVoucher {
  id: ID;
  code: string;
  password: string | null;
  profileId: ID;
  routerId: ID | null;
  agentId: ID | null;
  voucherType: string; // "same" | "different"
  codeType: string; // "alphanumeric" | "numeric"
  status: HotspotVoucherStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  batchCode: string | null;
  expiresAt: ISODateString | null;
  firstLoginAt: ISODateString | null;
  lastUsedBy: string | null;
  orderId: ID | null;
  hotspot_profiles?: HotspotProfile;
  nas?: Router | null;
}

export interface HotspotVoucherListResponse {
  vouchers: HotspotVoucher[];
  total?: number;
}

export interface HotspotVoucherResponse {
  success?: boolean;
  voucher: HotspotVoucher;
}

// === Hotspot Profile ===

export interface HotspotProfile {
  id: ID;
  name: string;
  validityUnit: 'MINUTES' | 'HOURS' | 'DAYS';
  validityValue: number;
  usageDurationUnit: string | null;
  usageDurationValue: number | null;
  sharedUsers: number | null;
  rateLimit: string | null;
  price: number;
  description: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface HotspotProfileListResponse {
  profiles: HotspotProfile[];
}

// === Voucher Template ===

export interface VoucherTemplate {
  id: ID;
  name: string;
  paperSize: string;
  columns: number;
  rows: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  showLogo: boolean;
  showProfile: boolean;
  showPrice: boolean;
  showValidity: boolean;
  fontScale: number;
  template: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface VoucherTemplateListResponse {
  templates: VoucherTemplate[];
}

// === Generate Voucher ===

export interface GenerateVoucherPayload {
  profileId: ID;
  count: number;
  routerId?: ID;
  agentId?: ID;
  voucherType?: 'same' | 'different';
  codeType?: 'alphanumeric' | 'numeric';
  validityDays?: number;
}

export interface GenerateVoucherResponse {
  success: boolean;
  vouchers: HotspotVoucher[];
  batchCode: string;
}
