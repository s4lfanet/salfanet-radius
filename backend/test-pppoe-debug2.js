const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Simulate what the sessions route does
  const routers = await prisma.router.findMany({
    where: { isActive: true },
    select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true }
  });

  // Get active radacct sessions for PPPoE
  const activeSessions = await prisma.radacct.findMany({
    where: { acctstoptime: null },
    select: { username: true, acctinputoctets: true, acctoutputoctets: true },
    orderBy: { acctstarttime: 'desc' },
  });

  // Get PPPoE usernames
  const pppoeUsers = await prisma.pppoeUser.findMany({
    where: { username: { in: activeSessions.map(s => s.username) } },
    select: { username: true },
  });
  const pppoeUsernames = new Set(pppoeUsers.map(u => u.username));
  console.log('PPPoE usernames in radacct:', pppoeUsernames.size);

  // Now test fetchLivePppoeTrafficMap logic
  const trafficByUsername = new Map();

  for (const router of routers) {
    console.log('\n=== Router:', router.name, '===');
    try {
      const api = new RouterOSAPI({
        host: router.ipAddress || router.nasname,
        port: router.port || 8728,
        user: router.username || '',
        password: router.password || '',
        timeout: 10,
      });
      await api.connect();

      const activePpp = await api.write('/ppp/active/print');
      console.log('Active PPPoE from MikroTik:', activePpp.length);

      // Build byte map from interfaces
      const byteMap = new Map();
      const ifaces = await api.write('/interface/print', ['?type=pppoe-in', '=.proplist=.id,name,rx-byte,tx-byte']);
      console.log('PPPoE-in interfaces:', ifaces.length);
      
      for (const iface of ifaces) {
        if (iface.name && iface['rx-byte'] !== undefined) {
          byteMap.set(iface.name, {
            rx: Number(iface['rx-byte'] || 0),
            tx: Number(iface['tx-byte'] || 0),
          });
        }
      }

      // Match sessions
      let matched = 0;
      let unmatched = 0;
      for (const s of activePpp) {
        const username = String(s.name || s.user || '').trim();
        if (!username) continue;
        if (!pppoeUsernames.has(username)) continue;

        const ifaceName = `<pppoe-${username}>`;
        const byteCounters = byteMap.get(ifaceName);
        
        if (byteCounters) {
          matched++;
          if (matched <= 3) {
            // Compare with radacct
            const radacctSession = activeSessions.find(a => a.username === username);
            const dbUpload = Number(radacctSession?.acctinputoctets || 0);
            const dbDownload = Number(radacctSession?.acctoutputoctets || 0);
            console.log(`  ${username}:`);
            console.log(`    MikroTik: rx(upload)=${byteCounters.rx} tx(download)=${byteCounters.tx}`);
            console.log(`    Radacct:  upload=${dbUpload} download=${dbDownload}`);
            console.log(`    Diff:     upload +${byteCounters.rx - dbUpload} download +${byteCounters.tx - dbDownload}`);
          }
        } else {
          unmatched++;
          if (unmatched <= 3) {
            console.log(`  NO BYTE COUNTER for ${username} (iface: ${ifaceName})`);
          }
        }
      }
      console.log(`Matched: ${matched}, Unmatched: ${unmatched}`);

      await api.close();
    } catch (e) {
      console.error('Error:', e.message);
    }
  }

  await prisma.$disconnect();
})();
