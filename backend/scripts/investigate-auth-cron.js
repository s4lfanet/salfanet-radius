// Investigate permission matrix and stuck cron records
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
  // 1. List all 113 no-auth routes with their HTTP methods
  console.log('=== NO-AUTH ROUTES INVESTIGATION ===\n');
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

  const noAuthRoutes = [];
  for (const r of routes) {
    const content = fs.readFileSync(r, 'utf-8');
    const hasPerm = content.includes('requirePermission') || content.includes('checkAuth');
    const hasSession = content.includes('getServerSession') && !hasPerm;
    if (hasPerm || hasSession) continue;

    const rel = path.relative(apiRoot, r).replace(/\\/g, '/');

    // Extract HTTP methods
    const methods = [];
    if (content.match(/export async function GET/)) methods.push('GET');
    if (content.match(/export async function POST/)) methods.push('POST');
    if (content.match(/export async function PUT/)) methods.push('PUT');
    if (content.match(/export async function PATCH/)) methods.push('PATCH');
    if (content.match(/export async function DELETE/)) methods.push('DELETE');

    // Categorize
    let category = 'UNKNOWN';
    if (rel.includes('webhook')) category = 'WEBHOOK';
    else if (rel.includes('public')) category = 'PUBLIC';
    else if (rel.includes('company/info')) category = 'PUBLIC';
    else if (rel.includes('company/route')) category = 'PUBLIC';
    else if (rel.includes('auth')) category = 'AUTH';
    else if (rel.includes('payment/pay') || rel.includes('payment/status')) category = 'PAYMENT_PUBLIC';
    else if (rel.includes('evoucher')) category = 'PUBLIC';
    else if (rel.includes('isolated')) category = 'PUBLIC';
    else if (rel.includes('pay-manual')) category = 'PUBLIC';
    else if (rel.includes('register')) category = 'PUBLIC';
    else if (rel.includes('payment/create')) category = 'PAYMENT_CREATE';
    else if (methods.length === 1 && methods[0] === 'GET') category = 'GET_ONLY';

    noAuthRoutes.push({ path: rel, methods: methods.join(','), category });
  }

  // Group by category
  const byCategory = {};
  for (const r of noAuthRoutes) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  for (const [cat, routes] of Object.entries(byCategory).sort()) {
    console.log(`\n--- ${cat} (${routes.length} routes) ---`);
    for (const r of routes.slice(0, 15)) {
      console.log(`  [${r.methods}] ${r.path}`);
    }
    if (routes.length > 15) console.log(`  ... and ${routes.length - 15} more`);
  }

  // 2. Stuck "running" cron records
  console.log('\n\n=== STUCK "running" CRON RECORDS ===');
  const stuck = await prisma.$queryRawUnsafe(`
    SELECT jobType, status, startedAt, duration FROM cron_history
    WHERE status = 'running' ORDER BY startedAt DESC
  `);
  console.log(`Total stuck: ${stuck.length}`);
  for (const s of stuck) {
    console.log(`  ${s.jobType} started: ${s.startedAt}`);
  }

  // 3. Check cron errors around 01:15 (the incident)
  console.log('\n=== CRON ERRORS (recent) ===');
  const errors = await prisma.$queryRawUnsafe(`
    SELECT jobType, status, startedAt, LEFT(error, 200) as errorMsg FROM cron_history
    WHERE status = 'error' ORDER BY startedAt DESC LIMIT 10
  `);
  for (const e of errors) {
    console.log(`  ${e.jobType} @ ${e.startedAt}: ${e.errorMsg ? e.errorMsg.substring(0, 150) : '(no error msg)'}`);
  }

  // 4. Check cron history cleanup config
  console.log('\n=== CRON HISTORY CLEANUP CONFIG ===');
  const cleanupConfig = await prisma.$queryRawUnsafe(`
    SELECT job_type, schedule, enabled FROM cron_schedule_config WHERE job_type = 'cron_history_cleanup'
  `);
  for (const c of cleanupConfig) {
    console.log(`  ${c.job_type}: schedule=${c.schedule}, enabled=${c.enabled}`);
  }

  // 5. Check how many cron_history rows are older than 30 days
  console.log('\n=== CRON HISTORY AGE ===');
  const ageStats = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN startedAt < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as older_than_7d,
      SUM(CASE WHEN startedAt < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as older_than_30d,
      COUNT(*) as total
    FROM cron_history
  `);
  console.log(`  Total: ${ageStats[0].total}`);
  console.log(`  Older than 7 days: ${ageStats[0].older_than_7d}`);
  console.log(`  Older than 30 days: ${ageStats[0].older_than_30d}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
