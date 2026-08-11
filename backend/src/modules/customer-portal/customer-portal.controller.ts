import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CustomerPortalService } from './customer-portal.service';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerGuard } from '../../common/guards/customer.guard';

@ApiTags('customer-portal')
@Controller('customer')
export class CustomerPortalController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  // ==================== AUTH (public) ====================

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Customer login (phone or customer ID)' })
  async login(@Body() body: { phone?: string; identifier?: string }) {
    return this.customerPortalService.login(body);
  }

  @Public()
  @Post('auth/send-otp')
  @ApiOperation({ summary: 'Send OTP to customer WhatsApp' })
  async sendOtp(@Body() body: { phone: string }) {
    return this.customerPortalService.sendOtp(body);
  }

  @Public()
  @Post('auth/verify-otp')
  @ApiOperation({ summary: 'Verify OTP and create session' })
  async verifyOtp(@Body() body: { phone: string; otpCode: string }) {
    return this.customerPortalService.verifyOtp(body);
  }

  // ==================== PROTECTED ROUTES ====================

  @Get('dashboard')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Customer dashboard' })
  async dashboard(@Req() req: Request) {
    return this.customerPortalService.getDashboard((req as any).customer.userId);
  }

  @Get('me')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current customer' })
  async me(@Req() req: Request) {
    return this.customerPortalService.getProfile((req as any).customer.userId);
  }

  @Get('profile')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get customer profile' })
  async getProfile(@Req() req: Request) {
    return this.customerPortalService.getProfile((req as any).customer.userId);
  }

  @Patch('profile')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update customer profile' })
  async updateProfile(@Req() req: Request, @Body() body: { name?: string; phone?: string; email?: string }) {
    return this.customerPortalService.updateProfile((req as any).customer.userId, body);
  }

  @Get('invoices')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List customer invoices' })
  async listInvoices(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.customerPortalService.listInvoices((req as any).customer.userId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status,
    });
  }

  @Get('payments')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List customer payment history' })
  async listPayments(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.customerPortalService.listPayments((req as any).customer.userId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('packages')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get customer current package' })
  async getPackages(@Req() req: Request) {
    return this.customerPortalService.getPackages((req as any).customer.userId);
  }

  @Get('usage')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get customer usage stats' })
  async getUsage(@Req() req: Request) {
    return this.customerPortalService.getUsage((req as any).customer.userId);
  }

  @Get('notifications')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get customer notifications' })
  async getNotifications(@Req() req: Request, @Query('since') since?: string) {
    return this.customerPortalService.getNotifications((req as any).customer.userId, since);
  }

  @Get('referral')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get referral info' })
  async getReferral(@Req() req: Request) {
    return this.customerPortalService.getReferral((req as any).customer.userId);
  }

  @Post('referral')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate referral code' })
  async generateReferralCode(@Req() req: Request) {
    return this.customerPortalService.generateReferralCode((req as any).customer.userId);
  }

  @Post('auto-renewal')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle auto-renewal' })
  async toggleAutoRenewal(@Req() req: Request, @Body() body: { enabled: boolean }) {
    return this.customerPortalService.toggleAutoRenewal((req as any).customer.userId, body);
  }

  @Get('suspend-request')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get suspend request' })
  async getSuspendRequest(@Req() req: Request) {
    return this.customerPortalService.getSuspendRequest((req as any).customer.userId);
  }

  @Post('suspend-request')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create suspend request' })
  async createSuspendRequest(@Req() req: Request, @Body() body: { reason?: string; startDate: string; endDate: string }) {
    return this.customerPortalService.createSuspendRequest((req as any).customer.userId, body);
  }

  @Delete('suspend-request')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel suspend request' })
  async cancelSuspendRequest(@Req() req: Request, @Query('id') id: string) {
    return this.customerPortalService.cancelSuspendRequest((req as any).customer.userId, id);
  }

  // ==================== INVOICE PAYMENT ====================

  @Get('invoices/payment')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment link for invoice' })
  async getInvoicePaymentLink(@Req() req: Request, @Query('invoiceId') invoiceId: string) {
    return this.customerPortalService.getInvoicePaymentLink((req as any).customer.userId, invoiceId);
  }

  // ==================== TOPUP ====================

  @Post('topup-direct')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create top-up invoice' })
  async createTopup(@Req() req: Request, @Body() body: { amount: number; gateway?: string; paymentChannel?: string }) {
    return this.customerPortalService.createTopup((req as any).customer.userId, body);
  }

  // ==================== UPGRADE ====================

  @Post('upgrade')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create upgrade invoice' })
  async createUpgrade(@Req() req: Request, @Body() body: { newProfileId: string; gateway?: string }) {
    return this.customerPortalService.createUpgrade((req as any).customer.userId, body);
  }

  // ==================== RENEWAL ====================

  @Get('renewal')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if user can renew' })
  async checkRenewal(@Req() req: Request) {
    return this.customerPortalService.checkRenewal((req as any).customer.userId);
  }

  @Post('renewal')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create renewal invoice' })
  async createRenewal(@Req() req: Request, @Body() body: { newProfileId?: string }) {
    return this.customerPortalService.createRenewal((req as any).customer.userId, body);
  }

  // ==================== ONT ====================

  @Get('ont')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ONT device info from GenieACS' })
  async getOntInfo(@Req() req: Request) {
    return this.customerPortalService.getOntInfo((req as any).customer.userId);
  }

  // ==================== WIFI ====================

  @Get('wifi')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WiFi/ONT info from GenieACS' })
  async getWifiInfo(@Req() req: Request) {
    return this.customerPortalService.getWifiInfo((req as any).customer.userId);
  }

  @Post('wifi')
  @UseGuards(CustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update WiFi config via GenieACS' })
  async updateWifiConfig(@Req() req: Request, @Body() body: { deviceId: string; wlanIndex?: number; ssid?: string; password?: string; securityMode?: string; enabled?: boolean }) {
    return this.customerPortalService.updateWifiConfig((req as any).customer.userId, body);
  }
}
