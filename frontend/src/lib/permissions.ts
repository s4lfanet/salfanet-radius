/**
 * Centralized permission constant definitions.
 *
 * These keys match the `key` field returned by the backend
 * `/api/admin/permissions` endpoint and are used by `usePermissions()`
 * and `requiredPermission` in the admin sidebar menu.
 *
 * Keeping them as constants prevents typos and enables IDE autocomplete
 * when checking permissions in components.
 */

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Customers / PPPoE
  CUSTOMERS_VIEW: 'customers.view',
  USERS_VIEW: 'users.view',
  REGISTRATIONS_VIEW: 'registrations.view',

  // Hotspot
  HOTSPOT_VIEW: 'hotspot.view',
  VOUCHERS_VIEW: 'vouchers.view',

  // Sessions
  SESSIONS_VIEW: 'sessions.view',

  // Invoices & Payments
  INVOICES_VIEW: 'invoices.view',
  KEUANGAN_VIEW: 'keuangan.view',

  // Network
  NETWORK_VIEW: 'network.view',
  ROUTERS_VIEW: 'routers.view',

  // Reports
  REPORTS_VIEW: 'reports.view',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_PAYMENT: 'settings.payment',
  SETTINGS_GENIEACS: 'settings.genieacs',

  // WhatsApp
  WHATSAPP_VIEW: 'whatsapp.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role hierarchy — SUPER_ADMIN always has all permissions.
 * Other roles get permissions assigned via the management page.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FINANCE: 'FINANCE',
  CUSTOMER_SERVICE: 'CUSTOMER_SERVICE',
  TECHNICIAN: 'TECHNICIAN',
  MARKETING: 'MARKETING',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/**
 * Staff-level roles that can access the admin panel.
 */
export const STAFF_ROLES: RoleKey[] = [
  ROLES.SUPER_ADMIN,
  ROLES.FINANCE,
  ROLES.CUSTOMER_SERVICE,
  ROLES.TECHNICIAN,
  ROLES.MARKETING,
];

/**
 * Check if a role is a staff-level role.
 */
export function isStaffRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return STAFF_ROLES.includes(role as RoleKey);
}

/**
 * SUPER_ADMIN bypasses all permission checks.
 */
export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === ROLES.SUPER_ADMIN;
}
