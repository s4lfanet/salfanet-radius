const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.adminUser.findMany({ select: { username: true, role: true } })
  .then(u => { console.log(JSON.stringify(u)); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
