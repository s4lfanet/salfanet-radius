/**
 * sweetalert.ts — CyberToast bridge (replaces SweetAlert2)
 *
 * This module exposes the same API surface as the old Swal helpers but uses the
 * CyberToast/CyberConfirm system.  A GlobalToastBridge React component
 * (rendered inside the admin layout) registers the real functions at mount time
 * via `registerGlobalToast` and `registerGlobalConfirm`.
 */

// ─── Global registry ───────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToastFn = (opts: {
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}) => void;
type ConfirmFn = (opts: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}) => Promise<boolean>;

let _addToast: AddToastFn | null = null;
let _confirm: ConfirmFn | null = null;

/** Called by GlobalToastBridge in admin/customer layout. */
export function registerGlobalToast(fn: AddToastFn) { _addToast = fn; }
export function registerGlobalConfirm(fn: ConfirmFn) { _confirm = fn; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

const _toast = (type: ToastType, message: string, title: string, duration?: number) => {
  _addToast?.({ type, title, description: message, duration });
};

// ─── Public API ────────────────────────────────────────────────────────────────

export const showSuccess = (message: string, title = 'Berhasil!') =>
  _toast('success', message, title, 4000);

export const showError = (message: string, title = 'Error!') =>
  _toast('error', message, title);

export const showWarning = (message: string, title = 'Perhatian!') =>
  _toast('warning', message, title);

export const showInfo = (message: string, title = 'Info') =>
  _toast('info', message, title);

export const showToast = (
  message: string,
  icon: 'success' | 'error' | 'warning' | 'info' = 'success'
) => _toast(icon, message, icon === 'success' ? 'Berhasil!' : icon === 'error' ? 'Error!' : 'Info');

export const showConfirm = async (
  message: string,
  title = 'Konfirmasi',
  confirmText = 'Ya',
  cancelText = 'Batal'
): Promise<boolean> => {
  if (_confirm) {
    return _confirm({ title, message, confirmText, cancelText, variant: 'warning' });
  }
  return window.confirm(`${title}\n${message}`);
};

/** @deprecated Loading modal replaced with component-level loading state. No-op. */
export const showLoading = (_message?: string): void => { /* no-op */ };

/** @deprecated No-op. */
export const closeLoading = (): void => { /* no-op */ };