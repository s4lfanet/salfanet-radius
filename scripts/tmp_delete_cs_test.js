// Temporary script: delete the CUSTOMER_SERVICE test user created by tmp_create_cs_test.js
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  const res = await prisma.adminUser.deleteMany({ where: { username: 'cstest' } });
  console.log('Deleted:', res.count);
  await prisma.$disconnect();
})();
