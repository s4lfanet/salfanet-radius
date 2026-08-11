import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminExtrasService } from './admin-extras.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('admin-extras')
@Controller('admin')
export class AdminExtrasController {
  constructor(private readonly adminExtrasService: AdminExtrasService) {}

  // ==================== ANALYTICS ====================

  @Get('analytics')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Monthly analytics with revenue, churn, ARPU' })
  async getAnalytics(@Query('year') year?: string, @Query('month') month?: string) {
    return this.adminExtrasService.getAnalytics({
      year: year ? parseInt(year) : undefined,
      month: month ? parseInt(month) : undefined,
    });
  }

  // ==================== LAPORAN ====================

  @Get('laporan')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate reports (invoice/payment/customer)' })
  async getLaporan(@Query('type') type?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminExtrasService.getLaporan({ type, startDate, endDate });
  }

  // ==================== ISOLATED USERS ====================

  @Get('isolated-users')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List isolated/suspended users' })
  async listIsolatedUsers() { return this.adminExtrasService.listIsolatedUsers(); }

  @Post('isolate-user')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually isolate a user' })
  async isolateUser(@Body() body: { userId: string }) { return this.adminExtrasService.isolateUser(body); }

  // ==================== AGENT DEPOSITS ====================

  @Get('agent-deposits')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List agent deposit requests' })
  async listAgentDeposits(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminExtrasService.listAgentDeposits({
      status, page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('agent-deposits/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject agent deposit' })
  async approveAgentDeposit(@Param('id') id: string, @Body() body: { action: 'approve' | 'reject'; adminNotes?: string }) {
    return this.adminExtrasService.approveAgentDeposit(id, body);
  }

  // ==================== TOPUP REQUESTS ====================

  @Get('topup-requests')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List customer top-up requests' })
  async listTopupRequests(@Query('status') status?: string) {
    return this.adminExtrasService.listTopupRequests({ status });
  }

  @Post('topup-requests/:id/approve')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve top-up request' })
  async approveTopupRequest(@Param('id') id: string) { return this.adminExtrasService.approveTopupRequest(id); }

  @Post('topup-requests/:id/reject')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject top-up request' })
  async rejectTopupRequest(@Param('id') id: string) { return this.adminExtrasService.rejectTopupRequest(id); }

  // ==================== SUSPEND REQUESTS ====================

  @Get('suspend-requests')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List suspend requests' })
  async listSuspendRequests(@Query('status') status?: string) {
    return this.adminExtrasService.listSuspendRequests({ status });
  }

  @Post('suspend-requests/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject suspend request' })
  async processSuspendRequest(@Param('id') id: string, @Body() body: { action: 'approve' | 'reject'; adminNotes?: string }) {
    return this.adminExtrasService.processSuspendRequest(id, body);
  }

  // ==================== REFERRALS ====================

  @Get('referrals')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List referral rewards with stats' })
  async listReferrals() { return this.adminExtrasService.listReferrals(); }

  @Post('referrals/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Credit or expire referral reward' })
  async processReferral(@Param('id') id: string, @Body() body: { action: 'credit' | 'expire' }) {
    return this.adminExtrasService.processReferral(id, body);
  }

  @Get('referrals/config')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral config' })
  async getReferralConfig() { return this.adminExtrasService.getReferralConfig(); }

  @Put('referrals/config')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update referral config' })
  async updateReferralConfig(@Body() body: { referralEnabled?: boolean; referralRewardAmount?: number }) {
    return this.adminExtrasService.updateReferralConfig(body);
  }

  // ==================== TECHNICIANS ====================

  @Get('technicians')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List technicians' })
  async listTechnicians() { return this.adminExtrasService.listTechnicians(); }

  @Post('technicians')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create technician' })
  async createTechnician(@Body() body: Record<string, unknown>) { return this.adminExtrasService.createTechnician(body as never); }

  @Put('technicians/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update technician' })
  async updateTechnician(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminExtrasService.updateTechnician(id, body);
  }

  @Delete('technicians/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete technician' })
  async deleteTechnician(@Param('id') id: string) { return this.adminExtrasService.deleteTechnician(id); }

  // ==================== PPPoE SYNC ALL RADIUS ====================

  @Post('pppoe/sync-all-radius')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync all PPPoE users to RADIUS' })
  async syncAllRadius() { return this.adminExtrasService.syncAllRadius(); }

  // ==================== USER DEPOSIT ====================

  @Post('pppoe/users/:id/deposit')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add deposit to user balance' })
  async addUserDeposit(@Param('id') id: string, @Body() body: { amount: number; note?: string }) {
    return this.adminExtrasService.addUserDeposit(id, body);
  }

  @Get('pppoe/users/:id/deposit')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user deposit history' })
  async getUserDepositHistory(@Param('id') id: string) { return this.adminExtrasService.getUserDepositHistory(id); }

  // ==================== USER RENEWAL (admin) ====================

  @Post('users/:id/renewal')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create renewal invoice for user' })
  async createUserRenewal(@Param('id') id: string, @Body() body: { newProfileId?: string }) {
    return this.adminExtrasService.createUserRenewal(id, body);
  }

  // ==================== CLOUDFLARE TUNNEL ====================

  @Get('cloudflare-tunnel')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Cloudflare tunnel settings' })
  async getCloudflareTunnel() { return this.adminExtrasService.getCloudflareTunnel(); }

  @Post('cloudflare-tunnel')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update Cloudflare tunnel settings' })
  async updateCloudflareTunnel(@Body() body: { tunnelId?: string; domain?: string }) {
    return this.adminExtrasService.updateCloudflareTunnel(body);
  }

  // ==================== SYSTEM INFO ====================

  @Get('system/info')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system info' })
  async getSystemInfo() { return this.adminExtrasService.getSystemInfo(); }

  // ==================== OLT TEST CONNECTION ====================

  @Post('olt/test-connection')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test OLT connection via TCP' })
  async testOltConnection(@Body() body: { host: string; port?: number; protocol?: string; username?: string; password?: string }) {
    return this.adminExtrasService.testOltConnection(body);
  }

  @Get('olt/model-profiles')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OLT model profiles (placeholder)' })
  async getOltModelProfiles() { return this.adminExtrasService.getOltModelProfiles(); }

  // ==================== INVOICE IMPORT ====================

  @Get('invoices/import')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get CSV template for invoice import' })
  async getInvoiceImportTemplate() { return this.adminExtrasService.getInvoiceImportTemplate(); }

  @Post('invoices/import')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import invoices from CSV data' })
  async importInvoices(@Body() body: { invoices: Array<Record<string, unknown>> }) {
    return this.adminExtrasService.importInvoices(body);
  }

  // ==================== 2FA ====================

  @Get('profile/2fa')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get 2FA status' })
  async get2faStatus(@Req() req: Request) { return this.adminExtrasService.get2faStatus((req as any).user.id); }

  @Post('profile/2fa')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Setup 2FA' })
  async setup2fa(@Req() req: Request) { return this.adminExtrasService.setup2fa((req as any).user.id); }

  @Delete('profile/2fa')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2fa(@Req() req: Request) { return this.adminExtrasService.disable2fa((req as any).user.id); }

  // ==================== EVOUCHER ORDERS (admin) ====================

  @Get('evoucher/orders')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all e-voucher orders' })
  async listEvoucherOrders(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminExtrasService.listEvoucherOrders({
      status, page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('evoucher/orders/:id/cancel')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel pending e-voucher order' })
  async cancelEvoucherOrder(@Param('id') id: string) { return this.adminExtrasService.cancelEvoucherOrder(id); }

  @Post('evoucher/orders/:id/resend')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend voucher WhatsApp notification' })
  async resendEvoucherOrder(@Param('id') id: string) { return this.adminExtrasService.resendEvoucherOrder(id); }

  @Post('evoucher/orders/bulk-delete')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk delete e-voucher orders' })
  async bulkDeleteEvoucherOrders(@Body() body: { ids: string[] }) {
    return this.adminExtrasService.bulkDeleteEvoucherOrders(body);
  }
}
