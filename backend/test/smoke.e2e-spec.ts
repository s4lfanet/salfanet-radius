import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createMockPrisma } from './test-helpers';

/**
 * Smoke tests for key API endpoints.
 * Verifies that modules are properly registered and routes exist.
 * Does NOT test business logic (that requires real DB + external services).
 *
 * Note: Routes return 401/403 (auth required) or 500 (Prisma mock incomplete).
 * We only check that routes are NOT 404 (route doesn't exist).
 */
describe('API Smoke Tests (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = createMockPrisma();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // Helper: check that endpoint exists (not 404)
  const expectRouteExists = async (method: string, path: string) => {
    const res = await (request(app.getHttpServer()) as any)[method](path);
    expect(res.status).not.toBe(404);
  };

  describe('Module registration — routes should exist (not 404)', () => {
    // Auth
    it('POST /api/v1/auth/login', async () => await expectRouteExists('post', '/api/v1/auth/login'));

    // Health
    it('GET /health', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });

    // Company
    it('GET /api/v1/company', async () => await expectRouteExists('get', '/api/v1/company'));
    it('GET /api/v1/company/info', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/company/info');
      expect([200, 404]).toContain(res.status);
    });

    // Dashboard
    it('GET /api/v1/dashboard/stats', async () => await expectRouteExists('get', '/api/v1/dashboard/stats'));

    // Users
    it('GET /api/v1/users/list', async () => await expectRouteExists('get', '/api/v1/users/list'));

    // Admin Users
    it('GET /api/v1/admin/users', async () => await expectRouteExists('get', '/api/v1/admin/users'));

    // PPPoE
    it('GET /api/v1/pppoe/customers', async () => await expectRouteExists('get', '/api/v1/pppoe/customers'));

    // Hotspot
    it('GET /api/v1/hotspot/profiles', async () => await expectRouteExists('get', '/api/v1/hotspot/profiles'));

    // Invoices
    it('GET /api/v1/invoices', async () => await expectRouteExists('get', '/api/v1/invoices'));

    // Sessions
    it('GET /api/v1/sessions', async () => await expectRouteExists('get', '/api/v1/sessions'));

    // Network
    it('GET /api/v1/network/routers', async () => await expectRouteExists('get', '/api/v1/network/routers'));

    // Radius (POST-only controller — test POST authorize)
    it('POST /api/v1/radius/authorize', async () => await expectRouteExists('post', '/api/v1/radius/authorize'));

    // Mikrotik
    it('GET /api/v1/mikrotik/hotspot-sessions', async () => await expectRouteExists('get', '/api/v1/mikrotik/hotspot-sessions'));

    // FreeRADIUS
    it('GET /api/v1/freeradius/radclient-status', async () => await expectRouteExists('get', '/api/v1/freeradius/radclient-status'));

    // Settings
    it('GET /api/v1/settings/company', async () => await expectRouteExists('get', '/api/v1/settings/company'));

    // WhatsApp
    it('GET /api/v1/whatsapp/templates', async () => await expectRouteExists('get', '/api/v1/whatsapp/templates'));

    // Email (controller base is empty, path is settings/email)
    it('GET /api/v1/settings/email', async () => await expectRouteExists('get', '/api/v1/settings/email'));

    // GenieACS
    it('GET /api/v1/genieacs/devices', async () => await expectRouteExists('get', '/api/v1/genieacs/devices'));

    // Cron
    it('GET /api/v1/cron/status', async () => await expectRouteExists('get', '/api/v1/cron/status'));

    // OLT (first route is :id param)
    it('GET /api/v1/olt/test-id', async () => await expectRouteExists('get', '/api/v1/olt/test-id'));

    // VPN
    it('GET /api/v1/network/vpn/servers', async () => await expectRouteExists('get', '/api/v1/network/vpn/servers'));

    // Tickets
    it('GET /api/v1/tickets', async () => await expectRouteExists('get', '/api/v1/tickets'));

    // Notifications
    it('GET /api/v1/notifications', async () => await expectRouteExists('get', '/api/v1/notifications'));

    // Push
    it('GET /api/v1/push/vapid-public-key', async () => await expectRouteExists('get', '/api/v1/push/vapid-public-key'));

    // Export
    it('GET /api/v1/export/invoices/excel', async () => await expectRouteExists('get', '/api/v1/export/invoices/excel'));

    // Permissions
    it('GET /api/v1/permissions', async () => await expectRouteExists('get', '/api/v1/permissions'));
  });

  describe('Public endpoints (no auth required)', () => {
    it('GET /health should be accessible', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/company/info should be accessible (200 or 404)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/company/info');
      expect([200, 404]).toContain(res.status);
    });
  });
});
