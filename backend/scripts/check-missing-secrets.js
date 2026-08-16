const { PrismaClient } = require('@prisma/client');
const { RouterOSAPI } = require('node-routeros');
const prisma = new PrismaClient();

async function main() {
  // Get all PPPoE users on this router
  const users = await prisma.pppoeUser.findMany({
    where: {
      routerId: '419423b7-4b9e-493b-8322-b63979168326',
      status: { in: ['active', 'isolated'] },
      connectionType: 'PPPOE',
    },
    select: { id: true, username: true, password: true, status: true },
  });
  console.log(`DB users (active/isolated PPPoE): ${users.length}`);

  // Get all PPP secrets from MikroTik
  const api = new RouterOSAPI({
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  });
  await api.connect();
  const secrets = await api.write('/ppp/secret/print');
  await api.close();

  const secretNames = new Set(secrets.map(s => s.name));
  console.log(`MikroTik PPP secrets: ${secrets.length}`);

  // Find users without PPP secret
  const missing = users.filter(u => !secretNames.has(u.username));
  console.log(`\nUsers WITHOUT PPP secret in MikroTik: ${missing.length}`);
  for (const u of missing) {
    console.log(`  ${u.username} | status=${u.status} | pwd=${u.password ? u.password.length + 'chars' : 'NULL'}`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
