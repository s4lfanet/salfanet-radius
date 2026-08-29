/**
 * API Contract Types — barrel export.
 *
 * This module provides typed contracts for all backend API responses.
 * Use these with `apiAdmin<T>()` to get type safety on API calls.
 *
 * Usage:
 *   import type { PppoeUserListResponse } from '@/types/api';
 *   const data = await apiAdmin<PppoeUserListResponse>('/api/pppoe/users');
 *
 * @see frontend/src/lib/api/client.ts for apiAdmin
 */

// Common
export type {
  ApiErrorResponse,
  SuccessResponse,
  DataResponse,
  Pagination,
  PaginatedData,
  ID,
  ISODateString,
  AdminUserRole,
  InvoiceStatus,
  InvoiceType,
  HotspotVoucherStatus,
  TransactionType,
  ManualPaymentStatus,
  PppoeSubscriptionType,
  PppoeConnectionType,
  UserStatus,
} from './common';

// Auth
export type {
  AuthVerifyResponse,
  AuthVerify2faResponse,
  AdminSession,
  AdminUser,
  AdminUserListResponse,
  AdminUserResponse,
  UserPermissionsResponse,
} from './auth';

// PPPoE
export type {
  PppoeUser,
  PppoeUserListResponse,
  PppoeUserResponse,
  PppoeUserCreateResponse,
  PppoeUserDeleteResponse,
  PppoeProfile,
  PppoeProfileListResponse,
  PppoeProfileResponse,
  PppoeArea,
  PppoeAreaListResponse,
  PppoeAreaResponse,
  PppoeOnlineStatusResponse,
  SyncPreviewResponse,
  SyncMikrotikImportResponse,
  SyncAuditDiffEntry,
  SyncAuditResponse,
  SyncAuditFixResponse,
  UpdateUserStatusResponse,
  BulkUpdateStatusResponse,
  Router,
} from './pppoe';

// Billing
export type {
  Invoice,
  InvoiceListStats,
  InvoiceListResponse,
  InvoiceResponse,
  InvoiceDeleteResponse,
  InvoiceGenerateResponse,
  InvoiceSendReminderResponse,
  InvoicePdfResponse,
  ManualPayment,
  ManualPaymentListResponse,
  ManualPaymentResponse,
  Transaction,
  TransactionCategory,
  TransactionStats,
  TransactionListResponse,
  TransactionResponse,
} from './billing';

// Network
export type {
  OLT,
  OLTListResponse,
  OLTResponse,
  OnuStatus,
  VpnServer,
  VpnClient,
  RouterListResponse,
  RouterResponse,
  RadiusStatus,
} from './network';

// Voucher
export type {
  HotspotVoucher,
  HotspotVoucherListResponse,
  HotspotVoucherResponse,
  HotspotProfile,
  HotspotProfileListResponse,
  VoucherTemplate,
  VoucherTemplateListResponse,
  GenerateVoucherPayload,
  GenerateVoucherResponse,
} from './voucher';

// Settings
export type {
  Company,
  CompanyResponse,
  Settings,
  SettingsResponse,
  SettingsUpdateResponse,
  CronJob,
  CronStatusResponse,
  CronHistoryEntry,
  CronHistoryResponse,
  GenieACSConfig,
} from './settings';

// Notification & Ticket
export type {
  Notification,
  NotificationListResponse,
  Ticket,
  TicketListResponse,
  TicketResponse,
  TicketStatsResponse,
  TicketCategory,
  TicketCategoryListResponse,
  TicketMessage,
  TicketMessageListResponse,
} from './notification';

// Dashboard
export type {
  DashboardStats,
  ActivityLog,
  ActivityLogListResponse,
  DashboardAnalytics,
} from './dashboard';

// Customer
export type {
  CustomerUser,
  CustomerMeResponse,
  CustomerInvoice,
  CustomerInvoiceListResponse,
  CustomerWifiInfo,
  CustomerWifiResponse,
  CustomerActionResponse,
  CustomerRenewPayload,
  CustomerUpgradePayload,
  CustomerTopupDirectPayload,
  CustomerTopupRequestPayload,
  CustomerNotification,
  CustomerNotificationListResponse,
} from './customer';

// Agent
export type {
  AgentProfile,
  AgentDashboardResponse,
  AgentVoucher,
  AgentNotification,
  AgentNotificationListResponse,
  AgentNotificationActionResponse,
} from './agent';
