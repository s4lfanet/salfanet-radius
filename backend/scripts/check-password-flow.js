const { PrismaClient } = require('@prisma/client');
const { RouterOSAPI } = require('node-routeros');
const prisma = new PrismaClient();

async function main() {
  // 1. Check password in DB
  const user = await prisma.pppoeUser.findUnique({
    where: { id: 'f942096f-ca8c-4795-a48e-56bdef6f004c' },
    select: { id: true, username: true, password: true, status: true, connectionType: true },
  });
  console.log('DB user:');
  console.log(`  username: ${user.username}`);
  console.log(`  password: "${user.password}" (${user.password.length} chars)`);
  console.log(`  status: ${user.status}`);
  console.log(`  connectionType: ${user.connectionType}`);

  // 2. Check password in MikroTik (secret password is not returned by API for security)
  // But we can check the latest task payload to see what was sent
  const task = await prisma.externalTask.findFirst({
    where: {
      operation: 'sync_mikrotik_create',
      entityId: 'f942096f-ca8c-4795-a48e-56bdef6f004c',
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, operation: true, status: true, result: true, payload: true, updatedAt: true },
  });
  console.log('\nLatest sync_mikrotik_create task:');
  console.log(`  status: ${task?.status}`);
  console.log(`  result: ${task?.result}`);
  console.log(`  payload:`, JSON.stringify(task?.payload, null, 2));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
