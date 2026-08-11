import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ExtrasService } from './extras.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CustomerGuard } from '../../common/guards/customer.guard';
import { AgentGuard } from '../../common/guards/agent.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('extras')
@Controller()
export class ExtrasController {
  constructor(private readonly extrasService: ExtrasService) {}

  // ==================== PPPOE EXTRAS ====================

  @Post('pppoe/users/bulk')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk update/delete PPPoE users' })
  async pppoeUsersBulk(@Body() body: { action: string; userIds: string[]; data?: Record<string, unknown> }) {
    return this.extrasService.pppoeUsersBulk(body);
  }

  @Post('pppoe/users/bulk-status')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersBulkStatus(@Body() body: { userIds: string[]; status: string }) {
    return this.extrasService.pppoeUsersBulkStatus(body);
  }

  @Get('pppoe/users/export')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersExport(@Query('status') status?: string, @Query('areaId') areaId?: string, @Query('profileId') profileId?: string) {
    return this.extrasService.pppoeUsersExport({ status, areaId, profileId });
  }

  @Get('pppoe/users/status')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersStatus() { return this.extrasService.pppoeUsersStatus(); }

  @Post('pppoe/users/check-isolation')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersCheckIsolation(@Body() body: { userId?: string }) {
    return this.extrasService.pppoeUsersCheckIsolation(body);
  }

  @Post('pppoe/users/send-notification')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersSendNotification(@Body() body: { userIds: string[]; type: string; message: string }) {
    return this.extrasService.pppoeUsersSendNotification(body);
  }

  @Post('pppoe/users/sync-mikrotik')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUsersSyncMikrotik(@Body() body: { userIds: string[] }) {
    return this.extrasService.pppoeUsersSyncMikrotik(body);
  }

  @Get('pppoe/users/:id/activity')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUserActivity(@Param('id') id: string) { return this.extrasService.pppoeUserActivity(id); }

  @Post('pppoe/users/:id/extend')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUserExtend(@Param('id') id: string, @Body() body: { days: number }) {
    return this.extrasService.pppoeUserExtend(id, body);
  }

  @Post('pppoe/users/:id/mark-paid')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUserMarkPaid(@Param('id') id: string) { return this.extrasService.pppoeUserMarkPaid(id); }

  @Post('pppoe/users/:id/sync-radius')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeUserSyncRadius(@Param('id') id: string) { return this.extrasService.pppoeUserSyncRadius(id); }

  @Post('pppoe/profiles/sync-mikrotik')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeProfilesSyncMikrotik() { return this.extrasService.pppoeProfilesSyncMikrotik(); }

  @Post('pppoe/profiles/sync-radius')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async pppoeProfilesSyncRadius() { return this.extrasService.pppoeProfilesSyncRadius(); }

  // ==================== HOTSPOT EXTRAS ====================

  @Get('hotspot/agents')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotAgents(@Query('routerId') routerId?: string) { return this.extrasService.hotspotAgents({ routerId }); }

  @Get('hotspot/agents/balance')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotAgentBalance(@Query('agentId') agentId: string) { return this.extrasService.hotspotAgentBalance(agentId); }

  @Get('hotspot/agents/:id/history')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotAgentHistory(@Param('id') id: string) { return this.extrasService.hotspotAgentHistory(id); }

  @Get('hotspot/rekap-voucher')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotRekapVoucher(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('agentId') agentId?: string) {
    return this.extrasService.hotspotRekapVoucher({ startDate, endDate, agentId });
  }

  @Get('hotspot/rekap-voucher/export')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotRekapVoucherExport(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('agentId') agentId?: string) {
    return this.extrasService.hotspotRekapVoucherExport({ startDate, endDate, agentId });
  }

  @Post('hotspot/voucher/resync')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherResync(@Body() body: { voucherIds: string[] }) { return this.extrasService.hotspotVoucherResync(body); }

  @Post('hotspot/voucher/send-whatsapp')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherSendWhatsapp(@Body() body: { voucherIds: string[] }) { return this.extrasService.hotspotVoucherSendWhatsapp(body); }

  @Post('hotspot/voucher/bulk')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherBulk(@Body() body: { action: string; voucherIds: string[]; data?: Record<string, unknown> }) {
    return this.extrasService.hotspotVoucherBulk(body);
  }

  @Post('hotspot/voucher/bulk-delete')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherBulkDelete(@Body() body: { voucherIds: string[] }) { return this.extrasService.hotspotVoucherBulkDelete(body); }

  @Post('hotspot/voucher/delete-multiple')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherDeleteMultiple(@Body() body: { ids: string[] }) { return this.extrasService.hotspotVoucherDeleteMultiple(body); }

  @Post('hotspot/voucher/delete-expired')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherDeleteExpired() { return this.extrasService.hotspotVoucherDeleteExpired(); }

  @Get('hotspot/voucher/export')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async hotspotVoucherExport(@Query('status') status?: string, @Query('profileId') profileId?: string) {
    return this.extrasService.hotspotVoucherExport({ status, profileId });
  }

  @Post('hotspot/vouchers/validate')
  @Public()
  @ApiOperation({ summary: 'Validate hotspot voucher code' })
  async hotspotVouchersValidate(@Body() body: { code: string }) { return this.extrasService.hotspotVouchersValidate(body); }

  // ==================== INVOICES EXTRAS ====================

  @Post('invoices/generate')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesGenerate(@Body() body: { userIds?: string[]; month?: number; year?: number }) {
    return this.extrasService.invoicesGenerate(body);
  }

  @Public()
  @Get('invoices/by-token/:token')
  @ApiOperation({ summary: 'Get invoice by payment token' })
  async invoicesByToken(@Param('token') token: string) { return this.extrasService.invoicesByToken(token); }

  @Post('invoices/check')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesCheck(@Body() body: { invoiceNumbers: string[] }) { return this.extrasService.invoicesCheck(body); }

  @Get('invoices/export')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesExport(@Query('status') status?: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.extrasService.invoicesExport({ status, startDate, endDate });
  }

  @Post('invoices/send-reminder')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesSendReminder(@Body() body: { invoiceId: string }) { return this.extrasService.invoicesSendReminder(body); }

  @Post('invoices/send-reminders-bulk')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesSendRemindersBulk(@Body() body: { invoiceIds: string[] }) { return this.extrasService.invoicesSendRemindersBulk(body); }

  @Get('invoices/:id/pdf')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async invoicesPdf(@Param('id') id: string) { return this.extrasService.invoicesPdf(id); }

  // ==================== FREERADIUS EXTRAS ====================

  @Get('freeradius/config/list')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusConfigList() { return this.extrasService.freeradiusConfigList(); }

  @Post('freeradius/config/read')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusConfigRead(@Body() body: { filename: string }) { return this.extrasService.freeradiusConfigRead(body); }

  @Post('freeradius/config/save')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusConfigSave(@Body() body: { filename: string; content: string }) { return this.extrasService.freeradiusConfigSave(body); }

  @Get('freeradius/logs')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusLogs(@Query('lines') lines?: string) { return this.extrasService.freeradiusLogs({ lines: lines ? parseInt(lines) : undefined }); }

  @Get('freeradius/radcheck')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusRadcheck(@Query('username') username?: string) { return this.extrasService.freeradiusRadcheck({ username }); }

  @Post('freeradius/radtest')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusRadtest(@Body() body: { username: string; password: string; nasIp: string; secret: string }) {
    return this.extrasService.freeradiusRadtest(body);
  }

  @Get('freeradius/status')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusStatus() { return this.extrasService.freeradiusStatus(); }

  @Post('freeradius/start')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusStart() { return this.extrasService.freeradiusStart(); }

  @Post('freeradius/stop')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusStop() { return this.extrasService.freeradiusStop(); }

  @Post('freeradius/restart')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async freeradiusRestart() { return this.extrasService.freeradiusRestart(); }

  // ==================== TICKETS EXTRAS ====================

  @Post('tickets/dispatch')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async ticketsDispatch() { return this.extrasService.ticketsDispatch(); }

  @Get('tickets/dispatch-data')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async ticketsDispatchData() { return this.extrasService.ticketsDispatchData(); }

  @Get('tickets/stats')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async ticketsStats() { return this.extrasService.ticketsStats(); }

  // ==================== CUSTOMER EXTRAS ====================

  @Public()
  @Post('customer/auth/bypass-login')
  @ApiOperation({ summary: 'Customer bypass login (OTP disabled)' })
  async customerBypassLogin(@Body() body: { phone: string }) { return this.extrasService.customerBypassLogin(body); }

  @Public()
  @Post('customer/login')
  @ApiOperation({ summary: 'Customer mobile login' })
  async customerMobileLogin(@Body() body: { phone: string; password?: string }) { return this.extrasService.customerMobileLogin(body); }

  @Post('customer/invoice/regenerate-payment')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerRegeneratePayment(@Req() req: Request, @Body() body: { invoiceId: string }) {
    return this.extrasService.customerRegeneratePayment((req as any).customer.userId, body);
  }

  @Post('customer/invoices/:id/manual-payment')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerManualPayment(@Req() req: Request, @Param('id') id: string, @Body() body: { amount: number; bankName?: string; senderAccount?: string; receiptImage?: string }) {
    return this.extrasService.customerManualPayment((req as any).customer.userId, { invoiceId: id, ...body });
  }

  @Post('customer/ont/reboot')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerOntReboot(@Req() req: Request) { return this.extrasService.customerOntReboot((req as any).customer.userId); }

  @Get('customer/payment-history')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerPaymentHistory(@Req() req: Request) { return this.extrasService.customerPaymentHistory((req as any).customer.userId); }

  @Get('customer/payment-methods')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerPaymentMethods() { return this.extrasService.customerPaymentMethods(); }

  @Post('customer/payments/:id/proof')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerPaymentProof(@Req() req: Request, @Param('id') id: string, @Body() body: { receiptImage: string }) {
    return this.extrasService.customerPaymentProof((req as any).customer.userId, { paymentId: id, receiptImage: body.receiptImage });
  }

  @Post('customer/topup-request')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerTopupRequest(@Req() req: Request, @Body() body: { amount: number; note?: string }) {
    return this.extrasService.customerTopupRequest((req as any).customer.userId, body);
  }

  @Post('customer/upgrade-package')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerUpgradePackage(@Req() req: Request, @Body() body: { newProfileId: string }) {
    return this.extrasService.customerUpgradePackage((req as any).customer.userId, body);
  }

  @Get('customer/referral/rewards')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerReferralRewards(@Req() req: Request) { return this.extrasService.customerReferralRewards((req as any).customer.userId); }

  @Post('customer/notifications/:id/read')
  @UseGuards(CustomerGuard) @ApiBearerAuth()
  async customerNotificationRead(@Req() req: Request, @Param('id') id: string) {
    return this.extrasService.customerNotificationRead((req as any).customer.userId, id);
  }

  // ==================== AGENT TICKETS ====================

  @Get('agent/tickets')
  @UseGuards(AgentGuard) @ApiBearerAuth()
  async agentTickets(@Req() req: Request) { return this.extrasService.agentTickets((req as any).agent.agentId); }

  @Get('agent/tickets/:id')
  @UseGuards(AgentGuard) @ApiBearerAuth()
  async agentTicketDetail(@Req() req: Request, @Param('id') id: string) {
    return this.extrasService.agentTicketDetail((req as any).agent.agentId, id);
  }

  @Post('agent/tickets/:id')
  @UseGuards(AgentGuard) @ApiBearerAuth()
  async agentTicketReply(@Req() req: Request, @Param('id') id: string, @Body() body: { message: string }) {
    return this.extrasService.agentTicketReply((req as any).agent.agentId, id, body);
  }

  // ==================== MISC ====================

  @Public()
  @Get('pwa/icon')
  async pwaIcon() { return this.extrasService.pwaIcon(); }

  @Public()
  @Get('sse/voucher-updates')
  async sseVoucherUpdates() { return this.extrasService.sseVoucherUpdates(); }

  @Get('system/radius')
  @UseGuards(AdminGuard) @ApiBearerAuth()
  async systemRadius() { return this.extrasService.systemRadius(); }

  @Public()
  @Post('auth/logout-log')
  async authLogoutLog(@Body() body: { userId: string; username: string }) { return this.extrasService.authLogoutLog(body); }

  @Public()
  @Get('pay/:token')
  async payByToken(@Param('token') token: string) { return this.extrasService.payByToken(token); }

  @Public()
  @Post('pay/manual')
  async payManual(@Body() body: { invoiceId: string; amount: number }) { return this.extrasService.payManual(body); }

  @Public()
  @Get('payment/check-order')
  async paymentCheckOrder(@Query('orderId') orderId?: string, @Query('token') token?: string) {
    return this.extrasService.paymentCheckOrder({ orderId, token });
  }

  @Public()
  @Post('payment/create')
  async paymentCreate(@Body() body: { invoiceId: string; gateway: string; paymentMethod?: string }) {
    return this.extrasService.paymentCreate(body);
  }

  @Public()
  @Get('payment/duitku-methods')
  async paymentDuitkuMethods(@Query('amount') amount?: string) {
    return this.extrasService.paymentDuitkuMethods({ amount: amount ? parseFloat(amount) : 0 });
  }

  @Public()
  @Post('payment/webhook')
  async paymentWebhook(@Body() body: any) { return this.extrasService.paymentWebhook(body); }
}
