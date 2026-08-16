const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Show all locks
  const locks = await prisma.cronLock.findMany();
  console.log('Current cron locks:');
  for (const l of locks) {
    const expired = l.expiresAt < new Date();
    console.log(`  ${l.jobKey} | acquired=${l.acquiredAt.toISOString()} | expires=${l.expiresAt.toISOString()} | expired=${expired}`);
  }

  // Delete all locks (force release)
  const deleted = await prisma.cronLock.deleteMany({});
  console.log(`\nForce-released ${deleted.count} cron locks`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
