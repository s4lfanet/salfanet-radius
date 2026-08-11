import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PppoeService } from './pppoe.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminJwtPayload } from '../auth/auth.service';

@ApiTags('pppoe')
@Controller('pppoe')
@UseGuards(AdminGuard)
export class PppoeController {
  constructor(private readonly pppoeService: PppoeService) {}

  // ==================== Customers ====================

  @Get('customers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List PPPoE customers with filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'active | inactive' })
  @ApiQuery({ name: 'id', required: false, description: 'Get single customer by ID' })
  @ApiQuery({ name: 'session', required: false, description: 'online | offline' })
  async getCustomers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('id') id?: string,
    @Query('session') session?: string,
  ) {
    return this.pppoeService.getCustomers({ search, status, id, session });
  }

  @Post('customers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create PPPoE customer' })
  async createCustomer(@Body() body: Record<string, unknown>) {
    return this.pppoeService.createCustomer(body as never);
  }

  @Put('customers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update PPPoE customer' })
  async updateCustomer(@Body() body: Record<string, unknown>) {
    return this.pppoeService.updateCustomer(body as never);
  }

  @Delete('customers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete PPPoE customer' })
  @ApiQuery({ name: 'id', required: true })
  async deleteCustomer(@Query('id') id: string) {
    return this.pppoeService.deleteCustomer(id);
  }

  // ==================== Profiles ====================

  @Get('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List PPPoE profiles with user count' })
  async getProfiles() {
    return this.pppoeService.getProfiles();
  }

  @Post('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create PPPoE profile (auto-syncs to FreeRADIUS)' })
  async createProfile(@Body() body: Record<string, unknown>) {
    return this.pppoeService.createProfile(body);
  }

  @Put('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update PPPoE profile (re-syncs to FreeRADIUS)' })
  async updateProfile(@Body() body: Record<string, unknown>) {
    return this.pppoeService.updateProfile(body);
  }

  @Delete('profiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete PPPoE profile (blocks if users exist)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteProfile(@Query('id') id: string) {
    return this.pppoeService.deleteProfile(id);
  }

  // ==================== Areas ====================

  @Get('areas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List PPPoE areas with user count' })
  async getAreas() {
    return this.pppoeService.getAreas();
  }

  @Post('areas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create PPPoE area' })
  async createArea(@Body() body: Record<string, unknown>, @CurrentUser() user?: AdminJwtPayload) {
    return this.pppoeService.createArea(body as never, user as never);
  }

  @Put('areas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update PPPoE area' })
  async updateArea(@Body() body: Record<string, unknown>, @CurrentUser() user?: AdminJwtPayload) {
    return this.pppoeService.updateArea(body as never, user as never);
  }

  @Delete('areas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete PPPoE area (blocks if users exist)' })
  @ApiQuery({ name: 'id', required: true })
  async deleteArea(@Query('id') id: string, @CurrentUser() user?: AdminJwtPayload) {
    return this.pppoeService.deleteArea(id, user as never);
  }
}
