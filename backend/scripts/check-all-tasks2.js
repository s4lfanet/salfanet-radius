const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.externalTask.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, entityId: true, operation: true, status: true, result: true, lastError: true, updatedAt: true },
  });
  console.log(`Total tasks: ${tasks.length}`);
  for (const t of tasks) {
    console.log(`  ${t.operation} | entity=${t.entityId.substring(0,40)} | status=${t.status} | result=${t.result ? t.result.substring(0,60) : 'none'} | updated=${t.updatedAt.toISOString()}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
