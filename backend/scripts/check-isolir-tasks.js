// Check external tasks for isolated user 'server'
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  // Get user
  const user = await prisma.pppoeUser.findFirst({
    where: { username: 'server' },
    select: { id: true, username: true, status: true, profileId: true, profile: { select: { name: true, groupName: true } } },
  });
  console.log('User:', JSON.stringify(user, null, 2));

  // Get recent external tasks for this user
  const tasks = await prisma.externalTask.findMany({
    where: {
      OR: [
        { entityId: { contains: user?.id || 'f942096f' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, operation: true, status: true, result: true, createdAt: true, payload: true },
  });

  console.log(`\n=== Recent tasks: ${tasks.length} ===`);
  for (const t of tasks) {
    console.log(`\n[${t.createdAt}] ${t.operation} → ${t.status}`);
    console.log(`  result: ${t.result}`);
    const p = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
    console.log(`  payload.profile: ${p?.profile || p?.data?.profile || 'N/A'}`);
    console.log(`  payload.username: ${p?.username || p?.data?.username || 'N/A'}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
