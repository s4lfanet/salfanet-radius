const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  const admin = await p.adminUser.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, username: true, email: true, isActive: true, password: true }
  });
  
  if (!admin) {
    console.log('NO SUPER_ADMIN FOUND');
    return;
  }
  
  console.log('Admin user:', JSON.stringify({ id: admin.id, username: admin.username, email: admin.email, isActive: admin.isActive }));
  console.log('Password hash starts with $2:', admin.password?.startsWith('$2'));
  console.log('Password hash length:', admin.password?.length);
  
  // Test password verification
  const testPass = 'admin123';
  const match = await bcrypt.compare(testPass, admin.password);
  console.log('Password "admin123" matches:', match);
  
  // Also test common passwords
  for (const pwd of ['admin123', 'Admin123!', 'password', 'seven7890', 'Seven789@']) {
    const m = await bcrypt.compare(pwd, admin.password);
    if (m) console.log('Password matches:', pwd);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
