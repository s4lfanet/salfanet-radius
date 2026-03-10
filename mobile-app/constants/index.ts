/**
 * Application Constants
 */

import Constants from 'expo-constants';

// Auto-detect API URL from Expo dev server host
// In development: uses the same IP as Metro bundler (auto-detect)
// In production: uses EXPO_PUBLIC_API_URL env variable
function getApiUrl(): string {
  if (__DEV__) {
    // Get host from Expo's Metro bundler (same machine as API server)
    const debugHost = Constants.expoConfig?.hostUri;
    if (debugHost) {
      const host = debugHost.split(':')[0]; // Extract IP without port
      return `http://${host}:3000`;
    }
    // Fallback: Android emulator alias for host localhost
    return 'http://10.0.2.2:3000';
  }
  // Production URL from environment variable
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
}

const API_URL = getApiUrl();

export const API_CONFIG = {
  BASE_URL: API_URL,
  TIMEOUT: 30000,
  ENDPOINTS: {
    // Auth
    LOGIN: '/api/customer/login',
    LOGOUT: '/api/customer/logout',
    PROFILE: '/api/customer/profile',
    
    // Dashboard
    DASHBOARD: '/api/customer/dashboard',
    USAGE: '/api/customer/usage',
    AUTO_RENEWAL: '/api/customer/auto-renewal',
    
    // Invoices
    INVOICES: '/api/customer/invoices',
    INVOICE_DETAIL: (id: string) => `/api/customer/invoices/${id}`,
    INVOICE_REGENERATE_PAYMENT: '/api/customer/invoice/regenerate-payment',
    
    // Payments
    PAYMENTS: '/api/customer/payments',
    PAYMENT_CREATE: '/api/customer/payments/create',
    PAYMENT_CONFIRM: '/api/customer/payments/confirm',
    
    // Notifications
    NOTIFICATIONS: '/api/customer/notifications',
    NOTIFICATION_READ: (id: string) => `/api/customer/notifications/${id}/read`,
    REGISTER_FCM: '/api/customer/fcm/register',
    
    // Support
    TICKETS: '/api/customer/tickets',
    TICKET_CREATE: '/api/customer/tickets/create',
    TICKET_CATEGORIES: '/api/tickets/categories',
    TICKET_MESSAGES: '/api/tickets/messages',
    
    // Top-Up & Payment Gateways
    TOPUP_DIRECT: '/api/customer/topup-direct',
    TOPUP_REQUEST: '/api/customer/topup-request',
    PAYMENT_GATEWAYS: '/api/public/payment-gateways',
    PAYMENT_METHODS: '/api/customer/payment-methods',
    
    // Packages
    PACKAGES: '/api/customer/packages',
    UPGRADE_PACKAGE: '/api/customer/upgrade-package',

    // WiFi Self-Service (GenieACS)
    WIFI: '/api/customer/wifi',

    // Suspend Request
    SUSPEND_REQUEST: '/api/customer/suspend-request',

    // Referral
    REFERRAL: '/api/customer/referral',
    REFERRAL_REWARDS: '/api/customer/referral/rewards',
  },
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  FCM_TOKEN: 'fcm_token',
  PUSH_ENABLED: 'push_enabled',
};

export const COLORS = {
  // Neon Cyberpunk Theme (matching web dashboard)
  primary: '#06b6d4',       // neon-cyan
  secondary: '#8b5cf6',     // neon-violet
  success: '#10b981',       // neon-green
  warning: '#f59e0b',       // amber
  error: '#ef4444',         // red
  info: '#3b82f6',          // neon-blue

  // Neon accents
  neonCyan: '#06b6d4',
  neonBlue: '#3b82f6',
  neonViolet: '#8b5cf6',
  neonPink: '#ec4899',
  neonGreen: '#10b981',
  neonYellow: '#eab308',
  neonOrange: '#f97316',

  // Dark backgrounds
  bgDark: '#0a0e1a',        // deepest bg
  bgCard: '#111827',        // card bg (gray-900)  
  bgElevated: '#1e293b',    // elevated surface (slate-800)
  bgInput: '#1e293b',       // input bg

  // Legacy aliases
  background: '#0a0e1a',
  surface: '#111827',
  text: '#f1f5f9',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',  // slate-400
  border: '#1e293b',         // subtle border

  // Glow effects
  glowCyan: 'rgba(6, 182, 212, 0.3)',
  glowBlue: 'rgba(59, 130, 246, 0.3)',
  glowViolet: 'rgba(139, 92, 246, 0.3)',
  glowPink: 'rgba(236, 72, 153, 0.3)',
  glowGreen: 'rgba(16, 185, 129, 0.3)',
};

export const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: 'Lunas', color: COLORS.neonGreen },
  PENDING: { label: 'Belum Bayar', color: COLORS.neonYellow },
  OVERDUE: { label: 'Jatuh Tempo', color: COLORS.neonPink },
  CANCELLED: { label: 'Dibatalkan', color: COLORS.textSecondary },
};

export const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Menunggu', color: COLORS.neonYellow },
  APPROVED: { label: 'Disetujui', color: COLORS.neonGreen },
  CONFIRMED: { label: 'Dikonfirmasi', color: COLORS.neonGreen },
  REJECTED: { label: 'Ditolak', color: COLORS.neonPink },
};

export const USER_STATUS = {
  active: { label: 'Aktif', color: COLORS.neonGreen },
  inactive: { label: 'Tidak Aktif', color: COLORS.textSecondary },
  isolated: { label: 'Diisolir', color: COLORS.neonOrange },
  blocked: { label: 'Diblokir', color: COLORS.neonPink },
  stop: { label: 'Berhenti', color: COLORS.error },
};

export const REFRESH_INTERVALS = {
  DASHBOARD: 30000, // 30 seconds
  NOTIFICATIONS: 60000, // 1 minute
  USAGE: 300000, // 5 minutes
};
