const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check all PPPoE users with their router info
  const users = await prisma.pppoeUser.findMany({
    where: { status: { in: ['active', 'isolated'] } },
    select: {
      id: true,
      username: true,
      password: true,
      status: true,
      connectionType: true,
      routerId: true,
      profileId: true,
    },
    take: 20,
  });
  console.log(`Total active/isolated users: ${users.length}`);
  for (const u of users) {
    console.log(`  ${u.username} | status=${u.status} | connType=${u.connectionType} | routerId=${u.routerId || 'NONE'} | pwd=${u.password ? u.password.length + 'chars' : 'NULL'} | profileId=${u.profileId}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
