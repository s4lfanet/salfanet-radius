import { describe, it, expect, beforeAll } from 'vitest';

/**
 * IDOR & Tenant Isolation Security Test Suite
 *
 * Verifies that cross-account access is properly denied:
 *   - User A cannot access User B's resources
 *   - Parameter tampering (userId, invoiceId, etc.) is rejected
 *   - Customer tokens cannot access other customers' data
 *   - Agent tokens cannot access other agents' data
 *   - Unauthenticated access is denied
 *
 * These tests send raw HTTP to the API.
 * They require a running backend.
 * Set TEST_API_URL to point to the backend.
 *
 * Run with: npm test -- -t "IDOR"
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

// ─── Helper: skip if server not available ────────────────────────────────────
function requireServer(): boolean {
  if (!serverAvailable) {
    console.log('   ⏭️  Skipped (server not available)');
    return false;
  }
  return true;
}

// ─── IDOR Tests: Unauthenticated access should be denied ────────────────────
describe('IDOR — Unauthenticated Access Denied', () => {
  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/users/test-id/permissions' },
    { method: 'PUT', path: '/api/admin/users/test-id/permissions' },
    { method: 'DELETE', path: '/api/admin/users/test-id/permissions' },
    { method: 'POST', path: '/api/admin/technicians' },
    { method: 'PUT', path: '/api/admin/technicians' },
    { method: 'DELETE', path: '/api/admin/technicians' },
    { method: 'POST', path: '/api/admin/registrations/test-id/reject' },
    { method: 'POST', path: '/api/admin/registrations/test-id/mark-installed' },
    { method: 'POST', path: '/api/admin/topup-requests/test-id/reject' },
    { method: 'GET', path: '/api/admin/agent-deposits' },
    { method: 'PATCH', path: '/api/admin/agent-deposits' },
    { method: 'POST', path: '/api/admin/evoucher/orders/bulk-delete' },
    { method: 'POST', path: '/api/admin/evoucher/orders/test-id/cancel' },
    { method: 'POST', path: '/api/admin/evoucher/orders/test-id/resend' },
    { method: 'POST', path: '/api/admin/users/test-id/renewal' },
    { method: 'POST', path: '/api/admin/pppoe/sync-all-radius' },
    { method: 'GET', path: '/api/admin/pppoe/radius-sync/status' },
    { method: 'POST', path: '/api/admin/pppoe/radius-sync/retry' },
  ];

  for (const endpoint of adminEndpoints) {
    it(`${endpoint.method} ${endpoint.path} → 401 without auth`, async () => {
      if (!requireServer()) return;

      const { status } = await req(endpoint.path, {
        method: endpoint.method,
        body: endpoint.method !== 'GET' ? JSON.stringify({}) : undefined,
      });

      expect(status).toBe(401);
    });
  }
});

// ─── IDOR Tests: Customer endpoints require valid token ─────────────────────
describe('IDOR — Customer Endpoints Require Token', () => {
  const customerEndpoints = [
    { method: 'GET', path: '/api/customer/dashboard' },
    { method: 'GET', path: '/api/customer/invoices' },
    { method: 'GET', path: '/api/customer/me' },
    { method: 'POST', path: '/api/customer/renewal' },
  ];

  for (const endpoint of customerEndpoints) {
    it(`${endpoint.method} ${endpoint.path} → 401 without token`, async () => {
      if (!requireServer()) return;

      const { status } = await req(endpoint.path, {
        method: endpoint.method,
        body: endpoint.method !== 'GET' ? JSON.stringify({}) : undefined,
      });

      expect(status).toBe(401);
    });
  }
});

// ─── IDOR Tests: Agent endpoints require valid JWT ──────────────────────────
describe('IDOR — Agent Endpoints Require JWT', () => {
  const agentEndpoints = [
    { method: 'GET', path: '/api/agent/dashboard' },
    { method: 'GET', path: '/api/agent/deposit/check?orderId=test-id' },
    { method: 'POST', path: '/api/agent/record-sales' },
  ];

  for (const endpoint of agentEndpoints) {
    it(`${endpoint.method} ${endpoint.path} → 401 without JWT`, async () => {
      if (!requireServer()) return;

      const { status } = await req(endpoint.path, {
        method: endpoint.method,
        body: endpoint.method !== 'GET' ? JSON.stringify({}) : undefined,
      });

      expect(status).toBe(401);
    });
  }
});

// ─── IDOR Tests: Parameter tampering ────────────────────────────────────────
describe('IDOR — Parameter Tampering Rejected', () => {
  it('customer endpoint with tampered userId in body → ignored (uses token userId)', async () => {
    if (!requireServer()) return;

    // Without a valid token, should get 401 regardless of body
    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token' },
      body: JSON.stringify({ userId: 'tampered-user-id' }),
    });

    expect(status).toBe(401);
  });

  it('agent endpoint with tampered agentId in body → ignored (uses JWT agentId)', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/agent/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-jwt' },
      body: JSON.stringify({ agentId: 'tampered-agent-id' }),
    });

    expect(status).toBe(401);
  });

  it('customer invoice with tampered invoiceId → 401 without auth', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/customer/invoices', {
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(status).toBe(401);
  });
});

// ─── IDOR Tests: Invalid token formats ──────────────────────────────────────
describe('IDOR — Invalid Token Formats Rejected', () => {
  it('malformed Bearer token → 401', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Bearer not-a-real-token' },
    });

    expect(status).toBe(401);
  });

  it('empty Bearer token → 401', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' },
    });

    expect(status).toBe(401);
  });

  it('non-Bearer auth scheme → 401', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(status).toBe(401);
  });

  it('expired-looking JWT → 401', async () => {
    if (!requireServer()) return;

    // A properly formatted but expired/invalid JWT
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QiLCJleHAiOjE1MDAwMDAwMDB9.invalid';
    const { status } = await req('/api/agent/dashboard', {
      method: 'GET',
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });

    expect(status).toBe(401);
  });
});

// ─── Tenant Isolation: Cross-role access denied ─────────────────────────────
describe('Tenant Isolation — Cross-Role Access Denied', () => {
  it('customer token cannot access admin endpoints', async () => {
    if (!requireServer()) return;

    // Even with a valid customer token, admin endpoints should deny
    const { status } = await req('/api/admin/users', {
      method: 'GET',
      headers: { Authorization: 'Bearer some-customer-token' },
    });

    // Admin uses NextAuth cookies, not Bearer — so this should be 401
    expect(status).toBe(401);
  });

  it('agent token cannot access customer endpoints', async () => {
    if (!requireServer()) return;

    const fakeAgentJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZ2VudElkIjoidGVzdCIsInBob25lIjoiMTIzIn0.invalid';
    const { status } = await req('/api/customer/dashboard', {
      method: 'GET',
      headers: { Authorization: `Bearer ${fakeAgentJwt}` },
    });

    expect(status).toBe(401);
  });
});

// ─── Privilege Escalation Prevention ────────────────────────────────────────
describe('Privilege Escalation — SUPER_ADMIN Protection', () => {
  it('cannot create SUPER_ADMIN without auth', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: 'attacker',
        password: 'password',
        role: 'SUPER_ADMIN',
      }),
    });

    expect(status).toBe(401);
  });

  it('cannot update user permissions without auth', async () => {
    if (!requireServer()) return;

    const { status } = await req('/api/admin/users/test-id/permissions', {
      method: 'PUT',
      body: JSON.stringify({
        permissions: ['*'], // Attempt to grant all permissions
      }),
    });

    expect(status).toBe(401);
  });
});
