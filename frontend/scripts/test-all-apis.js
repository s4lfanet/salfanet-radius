#!/usr/bin/env node

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const smokeTests = [
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/public/company' },
  { method: 'GET', path: '/api/public/stats' },
];

const timeoutMs = 12000;

async function requestWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log('=== API SMOKE TEST ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const t of smokeTests) {
    const url = `${BASE_URL}${t.path}`;
    try {
      const res = await requestWithTimeout(url, { method: t.method }, timeoutMs);
      const ok = res.status < 500;
      if (ok) {
        passed += 1;
        console.log(`[PASS] ${t.method} ${t.path} -> ${res.status}`);
      } else {
        failed += 1;
        console.log(`[FAIL] ${t.method} ${t.path} -> ${res.status}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`[FAIL] ${t.method} ${t.path} -> ${err && err.message ? err.message : String(err)}`);
    }
  }

  console.log('');
  console.log(`Result: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
})();
