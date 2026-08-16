const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Show all tasks grouped by entity_id
  const tasks = await prisma.externalTask.findMany({
    where: { operation: 'coa_disconnect' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, entityId: true, operation: true, status: true, createdAt: true, payload: true },
  });
  console.log(`Total coa_disconnect tasks: ${tasks.length}`);
  for (const t of tasks) {
    const payload = typeof t.payload === 'string' ? JSON.parse(t.payload) : t.payload;
    console.log(`  ${t.status} | entity=${t.entityId.substring(0,40)} | user=${payload?.username || '?'} | created=${t.createdAt.toISOString()}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
