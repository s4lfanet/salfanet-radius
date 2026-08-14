/**
 * Notification & Ticket API types.
 *
 * @see backend/src/app/api/notifications/route.ts
 * @see backend/src/app/api/tickets/route.ts
 * @see backend/prisma/schema.prisma (models: notifications, tickets)
 */

import type { ID, ISODateString } from './common';

// === Notification ===

export interface Notification {
  id: ID;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: ISODateString;
}

// GET /api/notifications returns { success, notifications, unreadCount, categoryCounts }
export interface NotificationListResponse {
  success?: boolean;
  notifications: Notification[];
  unreadCount?: number;
  categoryCounts?: Record<string, number>;
}

// === Ticket ===

export interface Ticket {
  id: ID;
  ticketNumber: string;
  customerId: ID | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  subject: string;
  description: string;
  categoryId: ID | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
  assignedToId: ID | null;
  assignedToType: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  closedAt: ISODateString | null;
  resolvedAt: ISODateString | null;
  lastResponseAt: ISODateString | null;
}

export interface TicketListResponse {
  tickets: Ticket[];
  total?: number;
}

export interface TicketResponse {
  success?: boolean;
  ticket: Ticket;
}

export interface TicketStatsResponse {
  total: number;
  open: number;
  urgent: number;
  avgResponseHours: number;
}

// === Ticket Category ===

export interface TicketCategory {
  id: ID;
  name: string;
  description: string | null;
  color: string | null;
}

export interface TicketCategoryListResponse {
  categories: TicketCategory[];
}

// === Ticket Message ===

export interface TicketMessage {
  id: ID;
  ticketId: ID;
  senderId: ID | null;
  senderType: string;
  message: string;
  attachments: unknown | null;
  createdAt: ISODateString;
}

export interface TicketMessageListResponse {
  messages: TicketMessage[];
}
