const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const routers = await prisma.router.findMany({
    select: {
      id: true,
      name: true,
      nasname: true,
      ipAddress: true,
      username: true,
      password: true,
      port: true,
      authMode: true,
      isActive: true,
      type: true,
    },
  });
  console.log('Router data from DB:');
  for (const r of routers) {
    console.log(`  id: ${r.id}`);
    console.log(`  name: ${r.name}`);
    console.log(`  nasname: ${r.nasname}`);
    console.log(`  ipAddress: ${r.ipAddress}`);
    console.log(`  username: ${r.username}`);
    console.log(`  password: ${r.password ? '***(' + r.password.length + ' chars)' : 'NULL'}`);
    console.log(`  port: ${r.port}`);
    console.log(`  authMode: ${r.authMode}`);
    console.log(`  isActive: ${r.isActive}`);
    console.log(`  type: ${r.type}`);
    console.log('---');
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
