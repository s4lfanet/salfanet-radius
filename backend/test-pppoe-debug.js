const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const routers = await prisma.router.findMany({
    where: { isActive: true },
    select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true }
  });

  for (const r of routers) {
    console.log('\n=== Router:', r.name, r.ipAddress || r.nasname, '===');
    try {
      const api = new RouterOSAPI({
        host: r.ipAddress || r.nasname,
        port: r.port || 8728,
        user: r.username,
        password: r.password,
        timeout: 10
      });
      await api.connect();

      // Get active PPPoE sessions
      const active = await api.write('/ppp/active/print');
      console.log('Active PPPoE count:', active.length);
      if (active.length > 0) {
        console.log('First session keys:', Object.keys(active[0]).join(', '));
        const s = active[0];
        console.log('name:', s.name, 'user:', s.user);
        console.log('bytes-in:', s['bytes-in'], 'bytes-out:', s['bytes-out']);
        console.log('rx-byte:', s['rx-byte'], 'tx-byte:', s['tx-byte']);
        console.log('uptime:', s.uptime);
      }

      // Get pppoe-in interface counters
      const ifaces = await api.write('/interface/print', ['?type=pppoe-in', '=.proplist=.id,name,rx-byte,tx-byte']);
      console.log('\nPPPoE-in interfaces:', ifaces.length);
      for (const iface of ifaces.slice(0, 5)) {
        console.log('  iface name:', iface.name, 'rx-byte:', iface['rx-byte'], 'tx-byte:', iface['tx-byte']);
      }

      // Also try without proplist to see all fields
      const ifaces2 = await api.write('/interface/print', ['?type=pppoe-in']);
      if (ifaces2.length > 0) {
        console.log('\nFull iface keys:', Object.keys(ifaces2[0]).join(', '));
        console.log('Full first iface:', JSON.stringify(ifaces2[0]).substring(0, 500));
      }

      await api.close();
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
  await prisma.$disconnect();
})();
