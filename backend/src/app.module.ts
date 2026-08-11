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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
