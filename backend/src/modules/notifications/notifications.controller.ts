import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AdminGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notifications with filters' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'since', required: false, description: 'ISO date string' })
  async getNotifications(
    @Query('unreadOnly') unreadOnly?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.notificationsService.getNotifications({
      unreadOnly: unreadOnly === 'true',
      type,
      limit: limit ? parseInt(limit) : undefined,
      since,
    });
  }

  @Post('generate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate notifications (overdue invoices, expired users, pending registrations)' })
  async generateNotifications(@Body() body?: { type?: string }) {
    const type = body?.type || 'all';
    const result = await this.notificationsService.generateNotifications(type);
    return { success: true, message: `Generated ${result.count} notification(s)`, count: result.count };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a custom notification' })
  async createNotification(@Body() body: { type: string; title: string; message: string; link?: string }) {
    const notification = await this.notificationsService.create(body);
    return { success: true, notification };
  }

  @Post('mark-read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark notifications as read' })
  async markAsRead(@Body() body: { notificationIds?: string[]; markAll?: boolean }) {
    return this.notificationsService.markAsRead(body);
  }

  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete notification(s)' })
  @ApiQuery({ name: 'id', required: false, description: 'Single notification ID' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated notification IDs' })
  async deleteNotifications(
    @Query('id') id?: string,
    @Query('ids') ids?: string,
  ) {
    return this.notificationsService.deleteNotifications({ id, ids });
  }
}
