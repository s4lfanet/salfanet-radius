#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, 'src', 'app', 'api');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === 'route.ts') {
      out.push(full);
    }
  }
  return out;
}

function toEndpoint(routeFile) {
  const rel = path.relative(API_DIR, path.dirname(routeFile)).replace(/\\/g, '/');
  return `/api/${rel === '.' ? '' : rel}`.replace(/\/$/, '');
}

function detectMethods(routeFile) {
  const src = fs.readFileSync(routeFile, 'utf8');
  const methods = [];
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const re = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
    if (re.test(src)) methods.push(method);
  }
  return methods;
}

const files = walk(API_DIR).sort((a, b) => a.localeCompare(b));
const endpoints = files.map((file) => ({
  endpoint: toEndpoint(file),
  methods: detectMethods(file),
}));

console.log('=== API ENDPOINT SCAN ===');
console.log(`Total route files: ${endpoints.length}`);
console.log('');

for (const row of endpoints) {
  const methods = row.methods.length ? row.methods.join(',') : 'UNKNOWN';
  console.log(`${methods.padEnd(20)} ${row.endpoint}`);
}

console.log('');
console.log('Scan completed.');
