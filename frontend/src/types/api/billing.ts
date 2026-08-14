/**
 * Billing & Invoice API types.
 *
 * @see backend/src/app/api/invoices/route.ts
 * @see backend/src/app/api/manual-payments/route.ts
 * @see backend/src/app/api/transactions/route.ts
 * @see backend/prisma/schema.prisma (models: invoices, manual_payments, transactions)
 */

import type {
  ID,
  ISODateString,
  InvoiceStatus,
  InvoiceType,
  ManualPaymentStatus,
  TransactionType,
} from './common';

// === Invoice ===

export interface Invoice {
  id: ID;
  invoiceNumber: string;
  userId: ID | null;
  amount: number;
  status: InvoiceStatus;
  dueDate: ISODateString;
  paidAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  paymentLink: string | null;
  paymentToken: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerUsername: string | null;
  sentReminders: string | null;
  notes: string | null;
  invoiceType: InvoiceType;
  baseAmount: number | null;
  taxRate: number | null;
  additionalFees: unknown | null;
  addonAmount: number;
}

// GET /api/invoices returns { invoices, stats }
export interface InvoiceListStats {
  total: number;
  unpaid: number;
  paid: number;
  pending: number;
  overdue: number;
  totalUnpaidAmount: number;
  totalPaidAmount: number;
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  stats?: InvoiceListStats;
}

// POST/PUT /api/invoices returns { invoice } (no success field)
export interface InvoiceResponse {
  success?: boolean;
  invoice: Invoice;
}

// DELETE /api/invoices returns { success, message, deletedCount }
export interface InvoiceDeleteResponse {
  success: boolean;
  message: string;
  deletedCount?: number;
}

// POST /api/invoices/generate returns { success, generated, skipped, errors, message }
export interface InvoiceGenerateResponse {
  success: boolean;
  generated: number;
  skipped: number;
  errors: Array<{ username: string; error: string }>;
  message: string;
}

// POST /api/invoices/send-reminder returns { success, message, results }
export interface InvoiceSendReminderResponse {
  success: boolean;
  message: string;
  results: {
    whatsapp?: { success: boolean; error?: string };
    email?: { success: boolean; error?: string };
  };
}

// GET /api/invoices/[id]/pdf — endpoint does not exist in backend
// This is a BACKEND ISSUE: frontend calls this but backend has no such route
export interface InvoicePdfResponse {
  success: boolean;
  data: unknown;
}

// === Manual Payment ===

export interface ManualPayment {
  id: ID;
  invoiceId: ID | null;
  userId: ID | null;
  amount: number;
  status: ManualPaymentStatus;
  paymentMethod: string | null;
  proofImage: string | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// GET /api/manual-payments returns { success: true, data: [...] }
export interface ManualPaymentListResponse {
  success: boolean;
  data: ManualPayment[];
}

// PATCH /api/manual-payments/[id] with { action: 'APPROVE'|'REJECT' } returns updated payment
export interface ManualPaymentResponse {
  success: boolean;
  payment?: ManualPayment;
  message?: string;
}

// === Transaction (Keuangan) ===

export interface TransactionCategory {
  id: ID;
  name: string;
  type: TransactionType;
  color?: string | null;
}

export interface Transaction {
  id: ID;
  categoryId: ID;
  type: TransactionType;
  amount: number;
  description: string;
  date: ISODateString;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  transaction_categories?: TransactionCategory;
}

// GET /api/keuangan/transactions returns { success, transactions, total, pagination, stats }
export interface TransactionStats {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeCount: number;
  expenseCount: number;
  pppoeIncome: number;
  pppoeCount: number;
  hotspotIncome: number;
  hotspotCount: number;
  installIncome: number;
  installCount: number;
}

export interface TransactionListResponse {
  success: boolean;
  transactions: Transaction[];
  total: number;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: TransactionStats;
}

export interface TransactionResponse {
  success?: boolean;
  transaction: Transaction;
}
