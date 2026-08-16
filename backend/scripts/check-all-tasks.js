const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check all recent tasks (any status)
  const tasks = await prisma.externalTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { id: true, entityId: true, operation: true, status: true, retryCount: true, lastError: true, createdAt: true, updatedAt: true },
  });
  console.log('All recent external tasks:');
  for (const t of tasks) {
    console.log(`  ${t.operation} | entity=${t.entityId.substring(0,40)} | status=${t.status} | retries=${t.retryCount} | err=${t.lastError ? t.lastError.substring(0,60) : 'none'} | updated=${t.updatedAt.toISOString()}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
