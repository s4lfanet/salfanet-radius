// Clean placeholder MAC addresses from pppoeUser table
const { PrismaClient } = require('@prisma/client');

function isPlaceholderMac(mac) {
  if (!mac) return false;
  const normalized = mac.trim().toUpperCase();
  if (normalized === '') return false;
  const placeholders = [
    '00:00:00:00:00:00',
    'FF:FF:FF:FF:FF:FF',
    'AA:BB:CC:DD:EE:FF',
    '11:22:33:44:55:66',
    'DE:AD:BE:EF:DE:AD',
  ];
  if (placeholders.includes(normalized)) return true;
  const parts = normalized.split(/[:-]/);
  if (parts.length === 6 && parts.every(p => p === parts[0])) return true;
  return false;
}

async function main() {
  const prisma = new PrismaClient();

  // Find all users with placeholder MAC
  const users = await prisma.pppoeUser.findMany({
    where: { macAddress: { not: null } },
    select: { id: true, username: true, macAddress: true },
  });

  const toClean = users.filter(u => isPlaceholderMac(u.macAddress));
  console.log(`Total users with MAC: ${users.length}`);
  console.log(`Users with placeholder MAC: ${toClean.length}`);

  if (toClean.length === 0) {
    console.log('No placeholder MACs to clean');
    await prisma.$disconnect();
    return;
  }

  for (const u of toClean) {
    console.log(`  Cleaning ${u.username}: "${u.macAddress}" → null`);
    await prisma.pppoeUser.update({
      where: { id: u.id },
      data: { macAddress: null },
    });
  }

  console.log(`\nDone! Cleaned ${toClean.length} placeholder MAC(s)`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
