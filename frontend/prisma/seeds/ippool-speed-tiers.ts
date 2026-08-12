import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed IP Pool per speed tier
 * Diadopsi dari home.pmynet.id-main (setup-ippool-speed.sql + expand-ippool-3000users.sql)
 *
 * Pool mapping:
 *   10Mbps → 172.19.200.0/22 (1022 IP)
 *   20Mbps → 172.24.200.0/22 (1022 IP)
 *   30Mbps → 172.25.30.0/22  (1022 IP)
 *   50Mbps → 172.25.50.0/22  (1022 IP)
 *
 * Run with: npx prisma db seed -- --ippool
 */

interface PoolTier {
  pool_name: string;
  groupname: string;
  base: string; // e.g. "172.19"
  start_third: number; // e.g. 200
  description: string;
}

const POOL_TIERS: PoolTier[] = [
  { pool_name: '10Mbps-Pool', groupname: '10Mbps', base: '172.19', start_third: 200, description: 'Basic 10Mbps — 1022 IP (/22)' },
  { pool_name: '20Mbps-Pool', groupname: '20Mbps', base: '172.24', start_third: 200, description: 'Bronze 20Mbps — 1022 IP (/22)' },
  { pool_name: '30Mbps-Pool', groupname: '30Mbps', base: '172.25', start_third: 30, description: 'Silver 30Mbps — 1022 IP (/22)' },
  { pool_name: '50Mbps-Pool', groupname: '50Mbps', base: '172.25', start_third: 50, description: 'Gold 50Mbps — 1022 IP (/22)' },
];

/**
 * Generate 1022 IPs for a /22 subnet (4 × /24 = 4 × 253 usable IPs)
 */
function generateIPs(tier: PoolTier): { pool_name: string; framedipaddress: string }[] {
  const ips: { pool_name: string; framedipaddress: string }[] = [];
  // /22 = 4 consecutive /24 subnets
  for (let octet3 = tier.start_third; octet3 < tier.start_third + 4; octet3++) {
    for (let octet4 = 1; octet4 <= 254; octet4++) {
      ips.push({
        pool_name: tier.pool_name,
        framedipaddress: `${tier.base}.${octet3}.${octet4}`,
      });
    }
  }
  return ips;
}

export async function seedIppoolSpeedTiers() {
  console.log('--- IP POOL SPEED TIER SEED START ---');

  for (const tier of POOL_TIERS) {
    // Check if pool already exists
    const existing = await prisma.radippool.count({
      where: { pool_name: tier.pool_name },
    });

    if (existing > 0) {
      console.log(`[SKIP] Pool '${tier.pool_name}' already exists (${existing} IPs)`);
      continue;
    }

    // Generate IPs
    const ips = generateIPs(tier);
    await prisma.radippool.createMany({ data: ips });
    console.log(`[OK] Pool '${tier.pool_name}': ${ips.length} IPs (${ips[0].framedipaddress} → ${ips[ips.length - 1].framedipaddress})`);

    // Map Pool-Name to RADIUS group (radgroupreply)
    const existingMapping = await prisma.radgroupreply.findFirst({
      where: { groupname: tier.groupname, attribute: 'Pool-Name' },
    });

    if (existingMapping) {
      await prisma.radgroupreply.update({
        where: { id: existingMapping.id },
        data: { value: tier.pool_name, op: ':=' },
      });
    } else {
      await prisma.radgroupreply.create({
        data: { groupname: tier.groupname, attribute: 'Pool-Name', op: ':=', value: tier.pool_name },
      });
    }
    console.log(`[OK] Mapped group '${tier.groupname}' → Pool-Name='${tier.pool_name}'`);
  }

  // Summary
  const summary = await prisma.radippool.groupBy({
    by: ['pool_name'],
    _count: { framedipaddress: true },
    _min: { framedipaddress: true },
    _max: { framedipaddress: true },
  });

  console.log('\n=== IP Pool Summary ===');
  for (const s of summary) {
    console.log(`  ${s.pool_name}: ${s._count.framedipaddress} IPs (${s._min.framedipaddress} → ${s._max.framedipaddress})`);
  }

  const mappings = await prisma.radgroupreply.findMany({
    where: { attribute: 'Pool-Name' },
    select: { groupname: true, value: true },
  });
  console.log('\n=== Pool-Name Mappings ===');
  for (const m of mappings) {
    console.log(`  ${m.groupname} → ${m.value}`);
  }

  console.log('--- IP POOL SEED COMPLETED ---');
}

// Run if called directly
if (require.main === module) {
  seedIppoolSpeedTiers()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
