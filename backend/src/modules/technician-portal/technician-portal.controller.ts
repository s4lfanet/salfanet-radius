import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { TechnicianPortalService } from './technician-portal.service';
import { TechnicianGuard } from '../../common/guards/technician.guard';

@ApiTags('technician-portal')
@Controller('technician')
export class TechnicianPortalController {
  constructor(private readonly technicianPortalService: TechnicianPortalService) {}

  @Get('customers')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List PPPoE customers (technician scoped)' })
  async listCustomers(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('routerId') routerId?: string,
    @Query('areaId') areaId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.technicianPortalService.listCustomers((req as any).technician.technicianId, {
      search, status, routerId, areaId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('form-data')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dropdown form data (profiles, routers, areas)' })
  async getFormData() {
    return this.technicianPortalService.getFormData();
  }

  @Get('sessions')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active PPPoE sessions' })
  async getSessions(
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('routerId') routerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.technicianPortalService.getSessions((req as any).technician.technicianId, {
      search, routerId,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('monitor')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Real-time monitoring dashboard' })
  async getMonitor() {
    return this.technicianPortalService.getMonitor();
  }

  @Get('offline')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List offline PPPoE users' })
  async getOffline(@Query('search') search?: string) {
    return this.technicianPortalService.getOffline(search);
  }

  @Get('isolated')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List isolated users with unpaid invoices' })
  async getIsolated() {
    return this.technicianPortalService.getIsolated();
  }

  @Get('profile')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get technician profile' })
  async getProfile(@Req() req: Request) {
    return this.technicianPortalService.getProfile((req as any).technician.technicianId);
  }

  @Put('profile')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update technician profile' })
  async updateProfile(@Req() req: Request, @Body() body: { name?: string; email?: string; phone?: string; currentPassword?: string; newPassword?: string }) {
    return this.technicianPortalService.updateProfile((req as any).technician.technicianId, body);
  }

  @Get('tasks')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tasks assigned to technician' })
  async getTasks(@Req() req: Request, @Query('status') status?: string) {
    return this.technicianPortalService.getTasks((req as any).technician.technicianId, status);
  }

  @Put('tasks')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update task status/notes' })
  async updateTask(@Req() req: Request, @Body() body: { id: string; status?: string; technicianNotes?: string }) {
    return this.technicianPortalService.updateTask((req as any).technician.technicianId, body);
  }

  @Get('work-orders')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List work orders' })
  async getWorkOrders(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('mine') mine?: string,
  ) {
    return this.technicianPortalService.getWorkOrders((req as any).technician.technicianId, { status, priority, mine });
  }

  @Post('work-orders')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perform work order action (ASSIGN/START/COMPLETE/CANCEL)' })
  async performWorkOrderAction(@Req() req: Request, @Body() body: { workOrderId: string; action: string }) {
    return this.technicianPortalService.performWorkOrderAction((req as any).technician.technicianId, body);
  }

  @Get('genieacs')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GenieACS settings' })
  async getGenieacsSettings() {
    return this.technicianPortalService.getGenieacsSettings();
  }

  @Get('genieacs/devices')
  @UseGuards(TechnicianGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List GenieACS devices' })
  async getGenieacsDevices() {
    return this.technicianPortalService.getGenieacsDevices();
  }
}
