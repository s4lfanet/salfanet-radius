import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { TicketsService } from './tickets.service';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CustomerGuard } from '../../common/guards/customer.guard';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List tickets (admin or customer)' })
  async list(
    @Req() req: Request,
    @Query('id') id?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    // If customer token present, scope to their tickets
    const customerUserId = (req as any).customer?.userId;
    return this.ticketsService.listTickets({
      id, customerId, status, priority, categoryId, search,
      customerUserId,
    });
  }

  @Post()
  @Public()
  @ApiOperation({ summary: 'Create new ticket (public)' })
  async create(@Body() body: {
    customerId?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone: string;
    subject: string;
    description: string;
    categoryId?: string;
    priority?: string;
  }) {
    return this.ticketsService.createTicket(body);
  }

  @Put()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket (admin)' })
  async update(@Body() body: {
    id: string;
    status?: string;
    priority?: string;
    categoryId?: string;
    assignedToId?: string;
    assignedToType?: string;
    subject?: string;
    description?: string;
  }) {
    return this.ticketsService.updateTicket(body);
  }

  @Delete()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ticket (admin)' })
  async delete(@Query('id') id: string) {
    return this.ticketsService.deleteTicket(id);
  }

  // ==================== CATEGORIES ====================

  @Get('categories')
  @ApiOperation({ summary: 'List ticket categories' })
  async listCategories() {
    return this.ticketsService.listCategories();
  }

  @Post('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create ticket category (admin)' })
  async createCategory(@Body() body: { name: string; description?: string; color?: string }) {
    return this.ticketsService.createCategory(body);
  }

  @Put('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket category (admin)' })
  async updateCategory(@Body() body: { id: string; name?: string; description?: string; color?: string; isActive?: boolean }) {
    return this.ticketsService.updateCategory(body);
  }

  @Delete('categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete ticket category (admin)' })
  async deleteCategory(@Query('id') id: string) {
    return this.ticketsService.deleteCategory(id);
  }

  // ==================== MESSAGES ====================

  @Get('messages')
  @ApiOperation({ summary: 'List ticket messages' })
  async listMessages(@Query('ticketId') ticketId: string) {
    return this.ticketsService.listMessages(ticketId);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Create ticket message' })
  async createMessage(@Body() body: { ticketId: string; senderType: string; senderId?: string; senderName: string; message: string; isInternal?: boolean; attachments?: string }) {
    return this.ticketsService.createMessage(body);
  }

  // ==================== STATS ====================

  @Get('stats')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ticket statistics (admin)' })
  async getStats() {
    return this.ticketsService.getStats();
  }
}
