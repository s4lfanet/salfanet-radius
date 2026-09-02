const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  const hash = '$2b$10$8O3NbqYypjI5icdI.FTEYedMmwexNqfvqyEy5OUGE7cjDkHj/U9T.';
  const result = await prisma.adminUser.updateMany({
    where: { username: 'superadmin' },
    data: { password: hash }
  });
  console.log('Updated rows:', result.count);
  await prisma.$disconnect();
})();
