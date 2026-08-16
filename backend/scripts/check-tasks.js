const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.externalTask.findMany({
    where: {
      operation: { in: ['sync_mikrotik_create', 'coa_disconnect'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, entityId: true, operation: true, status: true, createdAt: true },
  });
  console.log('Recent sync_mikrotik_create + coa_disconnect tasks:');
  for (const t of tasks) {
    console.log(`  ${t.operation} | entity=${t.entityId} | status=${t.status} | created=${t.createdAt.toISOString()}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
