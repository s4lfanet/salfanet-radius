import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { HealthModule } from './modules/health/health.module';
import { CompanyModule } from './modules/company/company.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PppoeModule } from './modules/pppoe/pppoe.module';
import { HotspotModule } from './modules/hotspot/hotspot.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { KeuanganModule } from './modules/keuangan/keuangan.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NetworkModule } from './modules/network/network.module';
import { RadiusModule } from './modules/radius/radius.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';
import { MikrotikModule } from './modules/mikrotik/mikrotik.module';
import { FreeradiusModule } from './modules/freeradius/freeradius.module';
import { SessionSyncModule } from './modules/session-sync/session-sync.module';
import { ManualPaymentsModule } from './modules/manual-payments/manual-payments.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { VoucherTemplatesModule } from './modules/voucher-templates/voucher-templates.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { AgentPortalModule } from './modules/agent-portal/agent-portal.module';
import { TechnicianPortalModule } from './modules/technician-portal/technician-portal.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { EvoucherModule } from './modules/evoucher/evoucher.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { UploadModule } from './modules/upload/upload.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { PushModule } from './modules/push/push.module';
import { BackupModule } from './modules/backup/backup.module';
import { PublicModule } from './modules/public/public.module';
import { OltModule } from './modules/olt/olt.module';
import { NetworkInfraModule } from './modules/network-infra/network-infra.module';
import { VpnModule } from './modules/vpn/vpn.module';
import { GenieacsModule } from './modules/genieacs/genieacs.module';
import { AdminExtrasModule } from './modules/admin-extras/admin-extras.module';
import { EmailModule } from './modules/email/email.module';
import { CronModule } from './modules/cron/cron.module';
import { NetworkExtrasModule } from './modules/network-extras/network-extras.module';
import { ExtrasModule } from './modules/extras/extras.module';
import { ExportModule } from './modules/export/export.module';
import { IppoolModule } from './modules/ippool/ippool.module';
import { DataUsageModule } from './modules/data-usage/data-usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    ActivityLogModule,
    HealthModule,
    CompanyModule,
    DashboardModule,
    PermissionsModule,
    SettingsModule,
    UsersModule,
    AdminUsersModule,
    NotificationsModule,
    PppoeModule,
    HotspotModule,
    InvoicesModule,
    KeuanganModule,
    PaymentModule,
    NetworkModule,
    RadiusModule,
    SessionsModule,
    PaymentGatewayModule,
    MikrotikModule,
    FreeradiusModule,
    SessionSyncModule,
    ManualPaymentsModule,
    RegistrationsModule,
    VoucherTemplatesModule,
    CustomerPortalModule,
    AgentPortalModule,
    TechnicianPortalModule,
    TicketsModule,
    EvoucherModule,
    InventoryModule,
    UploadModule,
    WhatsAppModule,
    TelegramModule,
    PushModule,
    BackupModule,
    PublicModule,
    OltModule,
    NetworkInfraModule,
    VpnModule,
    GenieacsModule,
    AdminExtrasModule,
    EmailModule,
    CronModule,
    NetworkExtrasModule,
    ExtrasModule,
    ExportModule,
    IppoolModule,
    DataUsageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
