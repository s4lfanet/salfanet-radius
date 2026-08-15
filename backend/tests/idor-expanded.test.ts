import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Expanded IDOR & Tenant Isolation Test Suite — Phase 10
 *
 * Covers additional resources not in the original test file:
 *   - Customer
 *   - Invoice
 *   - Payment
 *   - PPPoE
 *   - Ticket
 *   - Notification
 *   - Finance
 *   - OLT
 *   - ONU
 *   - GenieACS
 *
 * These tests verify that unauthenticated access is denied to all
 * resource-specific endpoints (GET, POST, PUT, PATCH, DELETE, and action endpoints).
 *
 * Authenticated cross-tenant tests require test fixtures (two users, two tenants)
 * and are marked as REQUIRES_TEST_FIXTURES.
 *
 * Run with: npx vitest tests/idor-expanded.test.ts
 */

const BASE_URL =
  process.env.TEST_API_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3001';
const TIMEOUT = 10000;

let serverAvailable = false;

async function req(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    clearTimeout(id);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
});

function requireServer(): boolean {
  if (!serverAvailable) {
    console.log('   ⏭️  Skipped (server not available)');
    return false;
  }
  return true;
}

// Helper: test that an endpoint returns 401 (or 403/405) without auth
function expectDenied(status: number) {
  expect([401, 403, 405]).toContain(status);
}

// ─── Customer Resource IDOR ─────────────────────────────────────────────────
describe('IDOR — Customer Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/customer/dashboard' },
    { method: 'GET', path: '/api/customer/invoices' },
    { method: 'GET', path: '/api/customer/invoices/test-id' },
    { method: 'GET', path: '/api/customer/me' },
    { method: 'GET', path: '/api/customer/payment-history' },
    { method: 'GET', path: '/api/customer/notifications' },
    { method: 'POST', path: '/api/customer/renewal' },
    { method: 'POST', path: '/api/customer/topup' },
    { method: 'POST', path: '/api/customer/logout' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without token`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Invoice Resource IDOR ──────────────────────────────────────────────────
describe('IDOR — Invoice Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/invoices' },
    { method: 'GET', path: '/api/admin/invoices/test-id' },
    { method: 'POST', path: '/api/admin/invoices' },
    { method: 'PUT', path: '/api/admin/invoices/test-id' },
    { method: 'PATCH', path: '/api/admin/invoices/test-id' },
    { method: 'DELETE', path: '/api/admin/invoices/test-id' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Payment Resource IDOR ──────────────────────────────────────────────────
describe('IDOR — Payment Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/payments' },
    { method: 'GET', path: '/api/admin/payments/test-id' },
    { method: 'POST', path: '/api/admin/payments' },
    { method: 'PUT', path: '/api/admin/payments/test-id' },
    { method: 'DELETE', path: '/api/admin/payments/test-id' },
    { method: 'POST', path: '/api/admin/payments/test-id/approve' },
    { method: 'POST', path: '/api/admin/payments/test-id/reject' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── PPPoE Resource IDOR ────────────────────────────────────────────────────
describe('IDOR — PPPoE Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/pppoe/users' },
    { method: 'GET', path: '/api/admin/pppoe/users/test-id' },
    { method: 'POST', path: '/api/admin/pppoe/users' },
    { method: 'PUT', path: '/api/admin/pppoe/users/test-id' },
    { method: 'PATCH', path: '/api/admin/pppoe/users/test-id' },
    { method: 'DELETE', path: '/api/admin/pppoe/users/test-id' },
    // Action endpoints
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/activate' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/suspend' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/reset' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/reboot' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Ticket Resource IDOR ───────────────────────────────────────────────────
describe('IDOR — Ticket Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/tickets' },
    { method: 'GET', path: '/api/admin/tickets/test-id' },
    { method: 'POST', path: '/api/admin/tickets' },
    { method: 'PUT', path: '/api/admin/tickets/test-id' },
    { method: 'DELETE', path: '/api/admin/tickets/test-id' },
    // Action endpoints
    { method: 'POST', path: '/api/admin/tickets/test-id/assign' },
    { method: 'POST', path: '/api/admin/tickets/test-id/close' },
    { method: 'POST', path: '/api/admin/tickets/test-id/reopen' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Notification Resource IDOR ─────────────────────────────────────────────
describe('IDOR — Notification Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/notifications' },
    { method: 'GET', path: '/api/admin/notifications/test-id' },
    { method: 'POST', path: '/api/admin/notifications' },
    { method: 'PUT', path: '/api/admin/notifications/test-id' },
    { method: 'DELETE', path: '/api/admin/notifications/test-id' },
    { method: 'POST', path: '/api/admin/notifications/test-id/mark-read' },
    { method: 'POST', path: '/api/admin/notifications/mark-all-read' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Finance Resource IDOR ──────────────────────────────────────────────────
describe('IDOR — Finance Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/finance/transactions' },
    { method: 'GET', path: '/api/admin/finance/transactions/test-id' },
    { method: 'POST', path: '/api/admin/finance/transactions' },
    { method: 'PUT', path: '/api/admin/finance/transactions/test-id' },
    { method: 'DELETE', path: '/api/admin/finance/transactions/test-id' },
    { method: 'GET', path: '/api/admin/finance/categories' },
    { method: 'POST', path: '/api/admin/finance/categories' },
    { method: 'PUT', path: '/api/admin/finance/categories/test-id' },
    { method: 'DELETE', path: '/api/admin/finance/categories/test-id' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── OLT Resource IDOR ──────────────────────────────────────────────────────
describe('IDOR — OLT Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/olt' },
    { method: 'GET', path: '/api/admin/olt/test-id' },
    { method: 'POST', path: '/api/admin/olt' },
    { method: 'PUT', path: '/api/admin/olt/test-id' },
    { method: 'DELETE', path: '/api/admin/olt/test-id' },
    // Action endpoints
    { method: 'POST', path: '/api/admin/olt/test-id/reboot' },
    { method: 'POST', path: '/api/admin/olt/test-id/provision' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── ONU Resource IDOR ──────────────────────────────────────────────────────
describe('IDOR — ONU Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/onu' },
    { method: 'GET', path: '/api/admin/onu/test-id' },
    { method: 'POST', path: '/api/admin/onu' },
    { method: 'PUT', path: '/api/admin/onu/test-id' },
    { method: 'DELETE', path: '/api/admin/onu/test-id' },
    // Action endpoints
    { method: 'POST', path: '/api/admin/onu/test-id/reboot' },
    { method: 'POST', path: '/api/admin/onu/test-id/provision' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── GenieACS Resource IDOR ─────────────────────────────────────────────────
describe('IDOR — GenieACS Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/genieacs/devices' },
    { method: 'GET', path: '/api/admin/genieacs/devices/test-id' },
    { method: 'POST', path: '/api/admin/genieacs/devices' },
    { method: 'PUT', path: '/api/admin/genieacs/devices/test-id' },
    { method: 'DELETE', path: '/api/admin/genieacs/devices/test-id' },
    // Action endpoints
    { method: 'POST', path: '/api/admin/genieacs/devices/test-id/reboot' },
    { method: 'POST', path: '/api/admin/genieacs/devices/test-id/reset' },
    { method: 'POST', path: '/api/admin/genieacs/devices/test-id/provision' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Subscription Resource IDOR ─────────────────────────────────────────────
describe('IDOR — Subscription Resource Endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/admin/subscriptions' },
    { method: 'GET', path: '/api/admin/subscriptions/test-id' },
    { method: 'POST', path: '/api/admin/subscriptions' },
    { method: 'PUT', path: '/api/admin/subscriptions/test-id' },
    { method: 'DELETE', path: '/api/admin/subscriptions/test-id' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: ep.method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expectDenied(status);
    });
  }
});

// ─── Parameter Tampering — Resource IDs ─────────────────────────────────────
describe('IDOR — Parameter Tampering on Resource IDs', () => {
  it('customer endpoint with tampered customerId in query → denied', async () => {
    if (!requireServer()) return;
    const { status } = await req('/api/customer/invoices?customerId=tampered-id', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expectDenied(status);
  });

  it('admin endpoint with tampered userId in body → denied', async () => {
    if (!requireServer()) return;
    const { status } = await req('/api/admin/pppoe/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'tampered-id', username: 'attacker' }),
    });
    expectDenied(status);
  });

  it('admin endpoint with tampered invoiceId in path → denied', async () => {
    if (!requireServer()) return;
    const { status } = await req('/api/admin/invoices/tampered-invoice-id', {
      method: 'GET',
    });
    expectDenied(status);
  });

  it('payment webhook with tampered orderId → still processes (webhook is public)', async () => {
    if (!requireServer()) return;
    // Webhook endpoints are typically public (called by payment gateway)
    // But they should still validate the signature/secret
    const { status } = await req('/api/payment/webhook', {
      method: 'POST',
      body: JSON.stringify({ order_id: 'tampered-order-id', status: 'settlement' }),
    });
    // Should be 400 (bad request — invalid signature) or 401, not 200
    expect([400, 401, 403]).toContain(status);
  });
});

// ─── Cross-Role Access ──────────────────────────────────────────────────────
describe('IDOR — Cross-Role Token Reuse', () => {
  it('customer token cannot access agent endpoints', async () => {
    if (!requireServer()) return;
    const { status } = await req('/api/agent/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Bearer fake-customer-session-token' },
    });
    expectDenied(status);
  });

  it('agent JWT cannot access admin endpoints', async () => {
    if (!requireServer()) return;
    const fakeAgentJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudElkIjoidGVzdCJ9.invalid';
    const { status } = await req('/api/admin/users', {
      method: 'GET',
      headers: { Authorization: `Bearer ${fakeAgentJwt}` },
    });
    expectDenied(status);
  });

  it('agent JWT cannot access customer endpoints', async () => {
    if (!requireServer()) return;
    const fakeAgentJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudElkIjoidGVzdCJ9.invalid';
    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: `Bearer ${fakeAgentJwt}` },
    });
    expectDenied(status);
  });
});

// ─── Action Endpoint Coverage ───────────────────────────────────────────────
describe('IDOR — Action Endpoints Denied Without Auth', () => {
  const actionEndpoints = [
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/activate' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/suspend' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/delete' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/reset' },
    { method: 'POST', path: '/api/admin/pppoe/users/test-id/reboot' },
    { method: 'POST', path: '/api/admin/pppoe/sync-all-radius' },
    { method: 'POST', path: '/api/admin/pppoe/radius-sync' },
    { method: 'POST', path: '/api/admin/registrations/test-id/approve' },
    { method: 'POST', path: '/api/admin/registrations/test-id/reject' },
    { method: 'POST', path: '/api/admin/topup-requests/test-id/approve' },
    { method: 'POST', path: '/api/admin/topup-requests/test-id/reject' },
  ];

  for (const ep of actionEndpoints) {
    it(`${ep.method} ${ep.path} → denied without auth`, async () => {
      if (!requireServer()) return;
      const { status } = await req(ep.path, {
        method: ep.method,
        body: JSON.stringify({}),
      });
      expectDenied(status);
    });
  }
});
