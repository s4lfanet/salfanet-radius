// Check MAC addresses in pppoeUser table
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  // Get all users with their MAC addresses
  const users = await prisma.pppoeUser.findMany({
    select: { id: true, username: true, name: true, macAddress: true, connectionType: true, status: true },
    take: 50,
  });

  console.log(`=== Total users (first 50): ${users.length} ===\n`);

  // Categorize MAC addresses
  const withMac = users.filter(u => u.macAddress && u.macAddress.trim() !== '');
  const withoutMac = users.filter(u => !u.macAddress || u.macAddress.trim() === '');
  const defaultMacs = withMac.filter(u =>
    u.macAddress === '00:00:00:00:00:00' ||
    /^00:00:00:00:00:0[0-9]$/i.test(u.macAddress) ||
    /^FF:FF:FF:FF:FF:FF$/i.test(u.macAddress) ||
    /^AA:BB:CC:DD:EE:FF$/i.test(u.macAddress)
  );

  console.log(`With MAC: ${withMac.length}`);
  console.log(`Without MAC (empty/null): ${withoutMac.length}`);
  console.log(`Default/placeholder MAC: ${defaultMacs.length}`);

  console.log(`\n=== Users with default/placeholder MAC ===`);
  for (const u of defaultMacs) {
    console.log(`  ${u.username} (${u.name}): macAddress="${u.macAddress}" connType=${u.connectionType} status=${u.status}`);
  }

  console.log(`\n=== Users with actual MAC (first 10) ===`);
  const actualMacs = withMac.filter(u => !defaultMacs.includes(u));
  for (const u of actualMacs.slice(0, 10)) {
    console.log(`  ${u.username} (${u.name}): macAddress="${u.macAddress}" connType=${u.connectionType}`);
  }

  // Also check what the most common MAC values are
  const macCounts = {};
  for (const u of withMac) {
    macCounts[u.macAddress] = (macCounts[u.macAddress] || 0) + 1;
  }
  const sorted = Object.entries(macCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n=== Most common MAC values ===`);
  for (const [mac, count] of sorted) {
    console.log(`  "${mac}": ${count} users`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
