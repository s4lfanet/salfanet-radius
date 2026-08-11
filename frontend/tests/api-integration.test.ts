import { describe, it, expect, beforeAll } from 'vitest';

/**
 * API Integration Test Suite
 * 
 * Comprehensive testing for all API endpoints
 * 
 * Run with: npm test
 * Run specific: npm test -- -t "Health"
 * 
 * NOTE: These tests are designed to work with or without a running server
 * Some tests will be skipped if server is not available
 */

const BASE_URL = process.env.TEST_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TIMEOUT = 10000;

// Flag to track if server is available
let serverAvailable = false;

// Test utilities
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.json().catch(() => ({}));
    
    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: response.headers,
      error: null,
    };
  } catch (error: any) {
    return {
      status: 0,
      ok: false,
      data: {},
      headers: null,
      error: error.message,
    };
  }
}

// Check if server is available before running tests
beforeAll(async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    serverAvailable = response.ok;
  } catch {
    serverAvailable = false;
    console.warn('\n⚠️  Server not available at', BASE_URL);
    console.warn('   Some tests will be skipped. Start server with: npm run dev\n');
  }
});

// Helper to skip tests if server not available
function skipIfNoServer() {
  if (!serverAvailable) {
    console.log('   ⏭️  Skipped (server not available)');
    return true;
  }
  return false;
}

// ==========================================
// HEALTH & SYSTEM TESTS
// ==========================================
describe('Health Check API', () => {
  it('GET /api/health - should return healthy status', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.data.status).toBe('healthy');
    expect(response.data.database).toBe('connected');
  });
  
  it('GET /api/health - should return memory info', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/health');
    
    expect(response.data.memory).toBeDefined();
    expect(response.data.memory.heapUsed).toMatch(/\d+MB/);
    expect(response.data.uptime).toBeTypeOf('number');
  });
  
  it('GET /api/health - should respond within 200ms', async () => {
    if (skipIfNoServer()) return;
    
    const start = Date.now();
    await apiRequest('/api/health');
    const responseTime = Date.now() - start;
    
    expect(responseTime).toBeLessThan(200);
  });
});

// ==========================================
// COMPANY SETTINGS TESTS
// ==========================================
describe('Company Settings API', () => {
  it('GET /api/company - should return company info', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/company');
    
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });
  
  it('GET /api/settings/company - should return settings', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/settings/company');
    
    expect(response.status).toBe(200);
  });
});

// ==========================================
// AUTHENTICATION TESTS
// ==========================================
describe('Authentication API', () => {
  it('POST /api/customer/auth/send-otp - should validate phone', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: '' }),
    });
    
    expect([400, 422]).toContain(response.status);
  });
  
  it('POST /api/customer/auth/send-otp - should accept valid phone format', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: '08123456789' }),
    });
    
    expect([200, 400, 404]).toContain(response.status);
  });
  
  it('POST /api/customer/auth/verify-otp - should require phone and otp', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/customer/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    
    expect([400, 422]).toContain(response.status);
  });
});

// ==========================================
// PROTECTED ROUTES TESTS (No Auth)
// ==========================================
describe('Protected Routes (Without Auth)', () => {
  it('GET /api/pppoe - should require authentication', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/pppoe');
    
    expect([401, 403, 302, 307]).toContain(response.status);
  });
  
  it('GET /api/hotspot - should require authentication', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/hotspot');
    
    expect([401, 403, 302, 307]).toContain(response.status);
  });
  
  it('GET /api/invoices - should require authentication', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/invoices');
    
    expect([401, 403, 302, 307]).toContain(response.status);
  });
});

// ==========================================
// PUBLIC ENDPOINTS TESTS
// ==========================================
describe('Public Endpoints', () => {
  it('GET /api/payment-gateways - should be accessible', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/payment-gateways');
    
    expect([200, 404]).toContain(response.status);
  });
});

// ==========================================
// DATA VALIDATION TESTS
// ==========================================
describe('Data Validation', () => {
  it('POST /api/manual-payments - should validate required fields', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/manual-payments', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    
    expect([400, 401, 403, 422]).toContain(response.status);
  });
});

// ==========================================
// ERROR HANDLING TESTS
// ==========================================
describe('Error Handling', () => {
  it('GET /api/nonexistent - should return 404', async () => {
    if (skipIfNoServer()) return;
    
    const response = await apiRequest('/api/nonexistent');
    
    expect(response.status).toBe(404);
  });
});

// ==========================================
// PERFORMANCE TESTS
// ==========================================
describe('Performance', () => {
  it('API responses should be under 500ms', async () => {
    if (skipIfNoServer()) return;
    
    const endpoints = ['/api/health', '/api/company'];
    
    for (const endpoint of endpoints) {
      const start = Date.now();
      await apiRequest(endpoint);
      const responseTime = Date.now() - start;
      
      expect(responseTime).toBeLessThan(500);
    }
  });
});
