// Check all isolated users and their PPP secret profile on MikroTik
const { RouterOSAPI } = require('node-routeros');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  // 1. Get all isolated users with local-auth routers
  const isolatedUsers = await prisma.pppoeUser.findMany({
    where: { status: 'isolated' },
    select: {
      id: true,
      username: true,
      name: true,
      status: true,
      connectionType: true,
      profile: { select: { name: true, groupName: true } },
      router: { select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true, authMode: true } },
    },
  });

  console.log(`=== Isolated Users: ${isolatedUsers.length} ===\n`);

  if (isolatedUsers.length === 0) {
    console.log('No isolated users found in DB');
    await prisma.$disconnect();
    return;
  }

  // Group by router
  const byRouter = new Map();
  for (const u of isolatedUsers) {
    const rid = u.router?.id || 'no-router';
    if (!byRouter.has(rid)) byRouter.set(rid, { router: u.router, users: [] });
    byRouter.get(rid).users.push(u);
  }

  for (const [rid, { router, users }] of byRouter) {
    console.log(`\n--- Router: ${router?.name || 'N/A'} (${router?.ipAddress || 'N/A'}) authMode=${router?.authMode || 'N/A'} ---`);
    console.log(`Users: ${users.length}`);

    if (!router || router.authMode === 'radius') {
      console.log('  RADIUS mode — profile managed by radusergroup, not PPP secret');
      for (const u of users) {
        console.log(`  ${u.username}: status=${u.status}, expectedProfile=isolir (via radusergroup)`);
      }
      continue;
    }

    // Local mode — fetch PPP secrets from MikroTik
    const host = router.ipAddress || router.nasname;
    const api = new RouterOSAPI({
      host, port: router.port || 8728,
      user: router.username, password: router.password,
      timeout: 15000,
    });

    try {
      await api.connect();
      for (const u of users) {
        try {
          const secrets = await api.write('/ppp/secret/print', [`?name=${u.username}`]);
          if (secrets.length > 0) {
            const s = secrets[0];
            const expectedProfile = 'isolir';
            const actualProfile = s.profile;
            const match = actualProfile === expectedProfile;
            const disabled = s.disabled;
            console.log(`  ${u.username}: profile=${actualProfile} (expected=${expectedProfile}) ${match ? 'OK' : 'MISMATCH!'} disabled=${disabled}`);
          } else {
            console.log(`  ${u.username}: NO PPP SECRET FOUND (expected profile=isolir)`);
          }
        } catch (e) {
          console.log(`  ${u.username}: Error fetching secret: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`  MikroTik connection failed: ${e.message}`);
    } finally {
      try { await api.close(); } catch {}
    }
  }

  // 2. Also check 'stop' and 'blocked' users
  for (const status of ['stop', 'blocked']) {
    const stoppedUsers = await prisma.pppoeUser.findMany({
      where: { status },
      select: {
        id: true, username: true, name: true, connectionType: true,
        profile: { select: { name: true, groupName: true } },
        router: { select: { id: true, name: true, ipAddress: true, nasname: true, username: true, password: true, port: true, authMode: true } },
      },
    });
    if (stoppedUsers.length === 0) continue;

    console.log(`\n=== ${status.toUpperCase()} Users: ${stoppedUsers.length} ===`);
    const byRouter2 = new Map();
    for (const u of stoppedUsers) {
      const rid = u.router?.id || 'no-router';
      if (!byRouter2.has(rid)) byRouter2.set(rid, { router: u.router, users: [] });
      byRouter2.get(rid).users.push(u);
    }

    for (const [rid, { router, users }] of byRouter2) {
      console.log(`\n--- Router: ${router?.name || 'N/A'} authMode=${router?.authMode || 'N/A'} ---`);
      if (!router || router.authMode === 'radius') {
        console.log('  RADIUS mode — skip');
        continue;
      }
      const host = router.ipAddress || router.nasname;
      const api = new RouterOSAPI({
        host, port: router.port || 8728,
        user: router.username, password: router.password,
        timeout: 15000,
      });
      try {
        await api.connect();
        for (const u of users) {
          try {
            const secrets = await api.write('/ppp/secret/print', [`?name=${u.username}`]);
            if (secrets.length > 0) {
              const s = secrets[0];
              const expectedDisabled = 'yes';
              console.log(`  ${u.username}: profile=${s.profile} disabled=${s.disabled} (expected disabled=yes) ${s.disabled === 'yes' ? 'OK' : 'MISMATCH!'}`);
            } else {
              console.log(`  ${u.username}: NO PPP SECRET (OK for stopped user)`);
            }
          } catch (e) {
            console.log(`  ${u.username}: Error: ${e.message}`);
          }
        }
      } catch (e) {
        console.log(`  MikroTik connection failed: ${e.message}`);
      } finally {
        try { await api.close(); } catch {}
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
