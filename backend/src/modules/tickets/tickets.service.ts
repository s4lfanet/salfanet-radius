import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { nanoid } from 'nanoid';

function generateTicketNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TKT${year}${month}${random}`;
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTickets(params: {
    id?: string;
    customerId?: string;
    status?: string;
    priority?: string;
    categoryId?: string;
    search?: string;
    customerUserId?: string; // when set, restricts to customer's own tickets
  }) {
    const where: Record<string, unknown> = {};
    if (params.id) where.id = params.id;
    if (params.customerUserId) where.customerId = params.customerUserId;
    else if (params.customerId) where.customerId = params.customerId;
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.search) {
      where.OR = [
        { ticketNumber: { contains: params.search } },
        { subject: { contains: params.search } },
        { description: { contains: params.search } },
        { customerName: { contains: params.search } },
      ];
    }

    const tickets = await this.prisma.ticket.findMany({
      where: where as never,
      include: {
        category: true,
        customer: { select: { id: true, username: true, name: true, phone: true, email: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return tickets;
  }

  async createTicket(body: {
    customerId?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone: string;
    subject: string;
    description: string;
    categoryId?: string;
    priority?: string;
  }) {
    if (!body.customerName || !body.customerPhone || !body.subject || !body.description) {
      throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
    }

    let ticketNumber = generateTicketNumber();
    for (let i = 0; i < 10; i++) {
      const existing = await this.prisma.ticket.findUnique({ where: { ticketNumber } });
      if (!existing) break;
      ticketNumber = generateTicketNumber();
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        customerId: body.customerId || null,
        customerName: body.customerName,
        customerEmail: body.customerEmail || null,
        customerPhone: body.customerPhone,
        subject: body.subject,
        description: body.description,
        categoryId: body.categoryId || null,
        priority: body.priority || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        category: true,
        customer: { select: { id: true, username: true, name: true } },
      },
    });

    await this.prisma.ticketMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ticketId: ticket.id,
        senderType: 'SYSTEM',
        senderName: 'System',
        message: `Ticket #${ticketNumber} telah dibuat.`,
        isInternal: false,
      },
    });

    await this.prisma.notification.create({
      data: {
        type: 'new_ticket',
        title: 'Tiket Baru Masuk',
        message: `${body.customerName} membuat tiket baru: "${body.subject}" (#${ticketNumber})`,
        link: `/admin/tickets/${ticket.id}`,
      },
    });

    // WhatsApp + web push deferred to notification integration batch

    return ticket;
  }

  async updateTicket(body: {
    id: string;
    status?: string;
    priority?: string;
    categoryId?: string;
    assignedToId?: string;
    assignedToType?: string;
    subject?: string;
    description?: string;
  }) {
    const existing = await this.prisma.ticket.findUnique({ where: { id: body.id } });
    if (!existing) throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'RESOLVED' && !existing.resolvedAt) updateData.resolvedAt = new Date();
      if (body.status === 'CLOSED' && !existing.closedAt) updateData.closedAt = new Date();
    }
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;
    if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null;
    if (body.assignedToType !== undefined) updateData.assignedToType = body.assignedToType || null;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.description !== undefined) updateData.description = body.description;

    return this.prisma.ticket.update({
      where: { id: body.id },
      data: updateData,
      include: { category: true, customer: { select: { id: true, username: true, name: true } } },
    });
  }

  async deleteTicket(id: string) {
    await this.prisma.ticket.delete({ where: { id } });
    return { message: 'Ticket deleted successfully' };
  }

  // ==================== CATEGORIES ====================

  async listCategories() {
    return this.prisma.ticketCategory.findMany({
      include: { _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(body: { name: string; description?: string; color?: string }) {
    if (!body.name) throw new HttpException('Name is required', HttpStatus.BAD_REQUEST);
    return this.prisma.ticketCategory.create({ data: { name: body.name, description: body.description || null, color: body.color || null } });
  }

  async updateCategory(body: { id: string; name?: string; description?: string; color?: string; isActive?: boolean }) {
    try {
      return await this.prisma.ticketCategory.update({
        where: { id: body.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.color !== undefined && { color: body.color }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
      throw error;
    }
  }

  async deleteCategory(id: string) {
    const itemCount = await this.prisma.ticket.count({ where: { categoryId: id } });
    if (itemCount > 0) throw new HttpException('Cannot delete category with assigned tickets', HttpStatus.BAD_REQUEST);
    await this.prisma.ticketCategory.delete({ where: { id } });
    return { success: true };
  }

  // ==================== MESSAGES ====================

  async listMessages(ticketId: string) {
    return this.prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMessage(body: { ticketId: string; senderType: string; senderId?: string; senderName: string; message: string; isInternal?: boolean; attachments?: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: body.ticketId } });
    if (!ticket) throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);

    const msg = await this.prisma.ticketMessage.create({
      data: {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        ticketId: body.ticketId,
        senderType: body.senderType,
        senderId: body.senderId || null,
        senderName: body.senderName,
        message: body.message,
        isInternal: body.isInternal || false,
        attachments: body.attachments || null,
      },
    });

    await this.prisma.ticket.update({
      where: { id: body.ticketId },
      data: { lastResponseAt: new Date() },
    });

    return msg;
  }

  // ==================== STATS ====================

  async getStats() {
    const [open, inProgress, resolved, closed, total] = await Promise.all([
      this.prisma.ticket.count({ where: { status: 'OPEN' } }),
      this.prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({ where: { status: 'RESOLVED' } }),
      this.prisma.ticket.count({ where: { status: 'CLOSED' } }),
      this.prisma.ticket.count(),
    ]);
    return { open, inProgress, resolved, closed, total };
  }
}
