const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.pppoeUser.findMany({
    where: { routerId: '419423b7-4b9e-493b-8322-b63979168326' },
    select: {
      id: true,
      username: true,
      password: true,
      profileId: true,
      status: true,
      connectionType: true,
      ipAddress: true,
      macAddress: true,
    },
  });
  console.log(`Total users on router: ${users.length}`);
  for (const u of users) {
    console.log(`  id: ${u.id}`);
    console.log(`  username: ${u.username}`);
    console.log(`  password: ${u.password ? '***(' + u.password.length + ' chars)' : 'NULL/EMPTY'}`);
    console.log(`  profileId: ${u.profileId}`);
    console.log(`  status: ${u.status}`);
    console.log(`  connectionType: ${u.connectionType}`);
    console.log(`  ipAddress: ${u.ipAddress}`);
    console.log(`  macAddress: ${u.macAddress}`);
    console.log('---');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
