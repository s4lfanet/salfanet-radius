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

export interface InvoiceListResponse {
  invoices: Invoice[];
  total?: number;
}

export interface InvoiceResponse {
  success?: boolean;
  invoice: Invoice;
}

export interface InvoiceGenerateResponse {
  success: boolean;
  generated?: number;
  message?: string;
}

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

export interface ManualPaymentListResponse {
  payments: ManualPayment[];
  total?: number;
}

export interface ManualPaymentResponse {
  success?: boolean;
  payment: ManualPayment;
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

export interface TransactionListResponse {
  transactions: Transaction[];
  total?: number;
}

export interface TransactionResponse {
  success?: boolean;
  transaction: Transaction;
}
