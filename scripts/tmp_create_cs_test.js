// Temporary script: create a CUSTOMER_SERVICE test user to verify sync permission fixes.
// Usage: node scripts/tmp_create_cs_test.js  (run from backend dir with prisma available)
// Delete the user afterwards via tmp_delete_cs_test.js
const { PrismaClient } = require('@prisma/client');
const b = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  const hash = b.hashSync('cstest123', 10);
  const existing = await prisma.adminUser.findUnique({ where: { username: 'cstest' } });
  if (existing) {
    console.log('cstest already exists, updating password');
    await prisma.adminUser.update({ where: { username: 'cstest' }, data: { password: hash } });
  } else {
    await prisma.adminUser.create({
      data: {
        id: crypto.randomUUID(),
        username: 'cstest',
        email: 'cstest@example.com',
        name: 'CS Test',
        role: 'CUSTOMER_SERVICE',
        password: hash,
        isActive: true,
      },
    });
    console.log('cstest created (CUSTOMER_SERVICE / cstest123)');
  }
  await prisma.$disconnect();
})();
