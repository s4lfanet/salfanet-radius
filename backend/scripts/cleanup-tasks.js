const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Delete all old tasks (cleanup from testing)
  const result = await prisma.externalTask.deleteMany({});
  console.log(`Deleted ${result.count} old external tasks (cleanup)`);

  // Verify: show remaining tasks
  const remaining = await prisma.externalTask.count();
  console.log(`Remaining tasks: ${remaining}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
