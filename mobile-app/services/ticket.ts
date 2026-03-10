import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TicketCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  priority: TicketPriority;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: TicketCategory;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  lastResponseAt?: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  senderName: string;
  message: string;
  createdAt: string;
}

export interface CreateTicketData {
  subject: string;
  description: string;
  categoryId?: string;
  priority?: TicketPriority;
}

export class TicketService {
  /**
   * Get ticket list for current customer
   */
  static async getTickets(): Promise<Ticket[]> {
    try {
      const response = await apiClient.get<Ticket[]>(API_CONFIG.ENDPOINTS.TICKETS);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Get tickets error:', error);
      return [];
    }
  }

  /**
   * Get ticket categories
   */
  static async getCategories(): Promise<TicketCategory[]> {
    try {
      const response = await apiClient.get<TicketCategory[]>(
        API_CONFIG.ENDPOINTS.TICKET_CATEGORIES
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Get categories error:', error);
      return [];
    }
  }

  /**
   * Create new ticket
   */
  static async createTicket(data: CreateTicketData): Promise<{ success: boolean; ticket?: Ticket; error?: string }> {
    try {
      const user = await apiClient.get<any>(API_CONFIG.ENDPOINTS.PROFILE);
      
      const response = await apiClient.post<Ticket>(API_CONFIG.ENDPOINTS.TICKETS, {
        customerName: user.name || user.username,
        customerPhone: user.phone || '-',
        customerEmail: user.email || null,
        customerId: user.id,
        ...data,
      });
      
      return { success: true, ticket: response };
    } catch (error: any) {
      console.error('Create ticket error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal membuat tiket',
      };
    }
  }

  /**
   * Get ticket messages
   */
  static async getMessages(ticketId: string): Promise<TicketMessage[]> {
    try {
      const response = await apiClient.get<TicketMessage[]>(
        `${API_CONFIG.ENDPOINTS.TICKET_MESSAGES}?ticketId=${ticketId}&includeInternal=false`
      );
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Get messages error:', error);
      return [];
    }
  }

  /**
   * Send message/reply to ticket
   */
  static async sendMessage(
    ticketId: string,
    message: string,
    senderName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.TICKET_MESSAGES, {
        ticketId,
        senderType: 'CUSTOMER',
        senderName,
        message,
        isInternal: false,
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Gagal mengirim pesan',
      };
    }
  }
}
