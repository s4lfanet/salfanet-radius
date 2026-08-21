const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const result = await p.pppoeUser.groupBy({
    by: ['areaId', 'status'],
    _count: true,
  });
  console.log('Users grouped by areaId+status:', JSON.stringify(result, null, 2));

  const totalUsers = await p.pppoeUser.count();
  console.log('Total pppoeUsers:', totalUsers);

  const activeUsers = await p.pppoeUser.count({ where: { status: 'active' } });
  console.log('Active users:', activeUsers);

  const usersWithoutArea = await p.pppoeUser.count({ where: { areaId: null } });
  console.log('Users without areaId:', usersWithoutArea);

  await p.$disconnect();
})();
