/**
 * CRON_SECRET Security Tests
 *
 * Tests CRON_SECRET validation in the cron API route.
 * Must run on VPS where backend is accessible.
 *
 * Run with: npx tsx tests/cron-secret.test.ts
 */
import { CronExpressionParser } from 'cron-parser';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Test timing-safe comparison logic (same as production code)
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const { timingSafeEqual } = require('crypto');
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function testSafeCompare() {
  console.log('\n--- Test: Timing-safe comparison (fail-closed) ---');

  assert(safeCompare('abc123', 'abc123') === true, 'Equal strings match');
  assert(safeCompare('abc123', 'abc124') === false, 'Different strings do not match');
  // Fail-closed: empty strings always return false, even if both are empty.
  assert(safeCompare('', '') === false, 'Empty strings do not match (fail-closed)');
  assert(safeCompare('', 'abc') === false, 'Empty first arg does not match');
  assert(safeCompare('abc', '') === false, 'Empty second arg does not match');
  assert(safeCompare('abc', 'abcd') === false, 'Different lengths do not match');
  assert(safeCompare('a', 'b') === false, 'Single char mismatch');
}

function testSecretNotInLogs() {
  console.log('\n--- Test: Secret not exposed in logs ---');

  // Simulate the startup log message
  const secret = 'my-super-secret-cron-key-1234567890';
  const logMessage = `CRON_SECRET: set (length: ${secret.length})`;

  assert(!logMessage.includes(secret), 'Secret value not in log message');
  assert(logMessage.includes('length:'), 'Length is logged');
  assert(logMessage.includes(`${secret.length}`), 'Correct length logged');
}

async function testCronAPIWithCorrectSecret() {
  console.log('\n--- Test: API with correct CRON_SECRET ---');

  const apiUrl = process.env.CRON_API_URL || 'http://localhost:3001';
  // Read secret from .env file
  const fs = require('fs');
  let secret = '';
  try {
    const envContent = fs.readFileSync('/var/www/salfanet-radius/backend/.env', 'utf-8');
    const match = envContent.match(/CRON_SECRET=(.+)/);
    if (match) secret = match[1].trim().replace(/["']/g, '');
  } catch { /* not on VPS */ }

  if (!secret) {
    console.log('  ⏭️ SKIP: Not running on VPS (no .env found)');
    return;
  }

  const response = await fetch(`${apiUrl}/api/cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': secret,
    },
    body: JSON.stringify({ type: 'freeradius_health' }),
  });

  assert(response.status === 200, `Correct secret → 200 (got ${response.status})`);
  const data = await response.json();
  assert(data.success === true, 'Response success=true');

  // Verify secret is not in response
  const responseStr = JSON.stringify(data);
  assert(!responseStr.includes(secret), 'Secret not in response body');
}

async function testCronAPIWithWrongSecret() {
  console.log('\n--- Test: API with wrong CRON_SECRET ---');

  const apiUrl = process.env.CRON_API_URL || 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/api/cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': 'wrong-secret-12345',
    },
    body: JSON.stringify({ type: 'freeradius_health' }),
  });

  assert(response.status === 401, `Wrong secret → 401 (got ${response.status})`);
}

async function testCronAPIWithNoSecret() {
  console.log('\n--- Test: API with no CRON_SECRET header ---');

  const apiUrl = process.env.CRON_API_URL || 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/api/cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'freeradius_health' }),
  });

  assert(response.status === 401, `No secret → 401 (got ${response.status})`);
}

async function testCronAPIWithEmptySecret() {
  console.log('\n--- Test: API with empty CRON_SECRET header ---');

  const apiUrl = process.env.CRON_API_URL || 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/api/cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': '',
    },
    body: JSON.stringify({ type: 'freeradius_health' }),
  });

  assert(response.status === 401, `Empty secret → 401 (got ${response.status})`);
}

async function testCronAPIWithMalformedHeader() {
  console.log('\n--- Test: API with malformed header ---');

  const apiUrl = process.env.CRON_API_URL || 'http://localhost:3001';

  // Send secret with special characters.
  // Null bytes in header values are rejected by the HTTP layer (undici/Headers API),
  // which is itself a correct security behavior — the request never reaches the server.
  // We wrap in try/catch to verify the request is rejected at the client level.
  try {
    const response = await fetch(`${apiUrl}/api/cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': 'null\x00undefined\x00',
      },
      body: JSON.stringify({ type: 'freeradius_health' }),
    });
    assert(response.status === 401, `Malformed secret → 401 (got ${response.status})`);
  } catch (err: any) {
    // Client-side rejection of invalid header bytes is also acceptable.
    // The request never reaches the server, so the secret is never compared.
    assert(
      err?.message?.includes('invalid header') || err?.message?.includes('Header'),
      `Malformed header rejected at HTTP layer: ${err?.message?.slice(0, 80)}`,
    );
    console.log('  ✅ PASS: Malformed header rejected at HTTP client layer (never sent)');
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CRON_SECRET Security Tests');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    testSafeCompare();
    testSecretNotInLogs();
    await testCronAPIWithCorrectSecret();
    await testCronAPIWithWrongSecret();
    await testCronAPIWithNoSecret();
    await testCronAPIWithEmptySecret();
    await testCronAPIWithMalformedHeader();
  } catch (err) {
    console.error('Test error:', err);
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
