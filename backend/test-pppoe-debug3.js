const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const routers = await prisma.router.findMany({
    where: { isActive: true },
    select: { id: true, name: true, authMode: true, nasname: true }
  });
  console.log('Routers:', JSON.stringify(routers, null, 2));

  const activeCount = await prisma.radacct.count({ where: { acctstoptime: null } });
  console.log('Active radacct sessions:', activeCount);

  const withAt = await prisma.radacct.count({
    where: { acctstoptime: null, username: { contains: '@' } }
  });
  console.log('Active radacct with @ in username:', withAt);

  // Check pppoeUser table
  const pppoeCount = await prisma.pppoeUser.count();
  console.log('Total PPPoE users:', pppoeCount);

  // Sample some active radacct usernames
  const sample = await prisma.radacct.findMany({
    where: { acctstoptime: null },
    select: { username: true, nasipaddress: true, acctinputoctets: true, acctoutputoctets: true },
    take: 10,
    orderBy: { acctstarttime: 'desc' }
  });
  console.log('Sample active radacct:', JSON.stringify(sample, null, 2));

  // Check if any pppoe users match active radacct
  const pppoeUsers = await prisma.pppoeUser.findMany({
    select: { username: true },
    take: 5
  });
  console.log('Sample PPPoE users:', pppoeUsers.map(u => u.username));

  // Check if those usernames exist in radacct
  if (pppoeUsers.length > 0) {
    const radacctMatch = await prisma.radacct.findMany({
      where: { username: { in: pppoeUsers.map(u => u.username) }, acctstoptime: null },
      select: { username: true, acctstoptime: true }
    });
    console.log('PPPoE users in active radacct:', radacctMatch.length);
  }

  await prisma.$disconnect();
})();
