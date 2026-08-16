const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Reset stuck PROCESSING tasks back to PENDING
  const result = await prisma.externalTask.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'PENDING' },
  });
  console.log(`Reset ${result.count} stuck PROCESSING tasks back to PENDING`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
