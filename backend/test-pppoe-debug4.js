const RouterOSAPI = require('node-routeros').RouterOSAPI;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const router = await prisma.router.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true, authMode: true }
  });

  console.log('Router:', router.name, 'authMode:', router.authMode);

  const api = new RouterOSAPI({
    host: router.ipAddress || router.nasname,
    port: router.port || 8728,
    user: router.username,
    password: router.password,
    timeout: 15
  });

  await api.connect();

  // Get active PPPoE sessions
  const active = await api.write('/ppp/active/print');
  console.log('Active PPPoE:', active.length);

  // Find 'server' user
  const serverSession = active.find(s => s.name === 'server' || s.user === 'server');
  if (serverSession) {
    console.log('Server session:', JSON.stringify(serverSession, null, 2));
  } else {
    console.log('No "server" session found in /ppp/active/print');
    // Show first 5 names
    console.log('First 5 names:', active.slice(0, 5).map(s => s.name || s.user));
  }

  // Get interface counters
  const ifaces = await api.write('/interface/print', ['?type=pppoe-in', '=.proplist=.id,name,rx-byte,tx-byte']);
  
  // Find matching interface for 'server'
  const serverIface = ifaces.find(i => i.name === '<pppoe-server>');
  if (serverIface) {
    console.log('\nServer interface counters:');
    console.log('  name:', serverIface.name);
    console.log('  rx-byte (upload):', serverIface['rx-byte']);
    console.log('  tx-byte (download):', serverIface['tx-byte']);
  } else {
    console.log('\nNo <pppoe-server> interface found');
    // Show first 5 iface names
    console.log('First 5 iface names:', ifaces.slice(0, 5).map(i => i.name));
  }

  await api.close();
  await prisma.$disconnect();
})();
