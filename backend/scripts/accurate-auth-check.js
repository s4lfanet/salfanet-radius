// Accurate auth detection — check all auth mechanisms
const fs = require('fs');
const path = require('path');

const apiRoot = path.join(__dirname, '..', 'src', 'app', 'api');

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.name === 'route.ts') results.push(full);
  }
  return results;
}

const routes = walk(apiRoot);
const noStandardAuth = [];

for (const r of routes) {
  const content = fs.readFileSync(r, 'utf-8');
  const hasPerm = content.includes('requirePermission') || content.includes('checkAuth');
  const hasSession = content.includes('getServerSession') && !hasPerm;
  if (hasPerm || hasSession) continue;

  const rel = path.relative(apiRoot, r).replace(/\\/g, '/');

  // Comprehensive auth detection
  const authMechanisms = [];

  // Standard admin auth
  if (content.includes('requirePermission')) authMechanisms.push('requirePermission');
  if (content.includes('checkAuth')) authMechanisms.push('checkAuth');
  if (content.includes('getServerSession')) authMechanisms.push('NextAuth');

  // Customer auth (Bearer token / session)
  if (content.includes('customerSession')) authMechanisms.push('CustomerSession');
  if (content.includes('verifyCustomerToken')) authMechanisms.push('CustomerToken');
  if (content.includes("authorization") || content.includes('Bearer ')) authMechanisms.push('BearerHeader');

  // Technician auth (cookie-based JWT)
  if (content.includes('technician-token')) authMechanisms.push('TechnicianCookieJWT');
  if (content.includes('verifyTechnician')) authMechanisms.push('TechnicianVerify');
  if (content.includes('TECH_JWT_SECRET')) authMechanisms.push('TechnicianJWT');
  if (content.includes('technicianJwt')) authMechanisms.push('TechnicianJWT');

  // Agent auth
  if (content.includes('agent-token')) authMechanisms.push('AgentCookieJWT');
  if (content.includes('verifyAgentToken')) authMechanisms.push('AgentToken');
  if (content.includes('agentJwt') || content.includes('AGENT_JWT_SECRET')) authMechanisms.push('AgentJWT');

  // Cron secret
  if (content.includes('CRON_SECRET') || content.includes('x-cron-secret')) authMechanisms.push('CronSecret');

  // API key
  if (content.includes('x-api-key') || content.includes('API_KEY')) authMechanisms.push('ApiKey');

  // RADIUS secret (for RADIUS endpoints)
  if (content.includes('RADIUS_SECRET') || content.includes('radius-secret')) authMechanisms.push('RadiusSecret');

  // Public/legitimate no-auth
  const isWebhook = rel.includes('webhook');
  const isPublic = rel.includes('public/') || rel.includes('company/info') || rel.includes('company/route');
  const isAuthEndpoint = rel.includes('auth/login') || rel.includes('auth/send-otp') ||
                         rel.includes('auth/verify') || rel.includes('auth/logout') ||
                         rel.includes('auth/request-otp') || rel.includes('auth/bypass') ||
                         rel.includes('auth/pre-login') || rel.includes('auth/session');
  const isEvoucher = rel.includes('evoucher/');
  const isPaymentPublic = rel.includes('payment/create') || rel.includes('payment/pay') ||
                          rel.includes('pay/') || rel.includes('invoices/by-token') ||
                          rel.includes('invoices/check') || rel.includes('payment/check-order') ||
                          rel.includes('payment/duitku-methods');
  const isRegister = rel.includes('register') || rel.includes('upload-registration') ||
                     rel.includes('upload/payment-proof');
  const isHealth = rel.includes('health');
  const isPWA = rel.includes('pwa/') || rel.includes('push/vapid');
  const isRadius = rel.includes('radius/authorize') || rel.includes('radius/post-auth') ||
                   rel.includes('radius/accounting');

  const isLegitimateNoAuth = isWebhook || isPublic || isAuthEndpoint || isEvoucher ||
                              isPaymentPublic || isRegister || isHealth || isPWA || isRadius;

  if (authMechanisms.length > 0) {
    // Has some auth — OK
    continue;
  }

  if (isLegitimateNoAuth) {
    // Legitimate no-auth — OK
    continue;
  }

  // Genuinely no auth detected
  noStandardAuth.push(rel);
}

console.log('=== ROUTES WITH NO DETECTABLE AUTH ===\n');
console.log(`Total: ${noStandardAuth.length}\n`);
for (const r of noStandardAuth) {
  console.log(`  ❌ ${r}`);
}

// Now check each one more carefully — read first 50 lines
console.log('\n=== DETAILED CHECK OF SUSPECT ROUTES ===\n');
for (const r of noStandardAuth) {
  const fullPath = path.join(apiRoot, r);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const first50 = content.split('\n').slice(0, 50).join('\n');

  // Check for any auth-like pattern
  const hasCookieCheck = content.includes('cookies.get');
  const hasHeaderCheck = content.includes('headers.get');
  const hasTokenCheck = content.includes('token') && (content.includes('verify') || content.includes('check'));
  const hasSessionCheck = content.includes('session');

  const flags = [];
  if (hasCookieCheck) flags.push('cookie');
  if (hasHeaderCheck) flags.push('header');
  if (hasTokenCheck) flags.push('token');
  if (hasSessionCheck) flags.push('session');

  console.log(`\n--- ${r} ---`);
  console.log(`  Flags: ${flags.join(', ') || 'NONE'}`);
  // Show first 5 lines of actual handler
  const handlerMatch = content.match(/export async function (GET|POST|PUT|DELETE|PATCH)\(([^)]+)\)/);
  if (handlerMatch) {
    console.log(`  Handler: ${handlerMatch[1]}(${handlerMatch[2].substring(0, 60)})`);
  }
}
