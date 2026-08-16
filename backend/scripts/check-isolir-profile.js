// Verify isolir profile exists on MikroTik and check PPP secret for test user
const { RouterOSAPI } = require('node-routeros');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const router = await prisma.router.findFirst({
    where: { isActive: true, authMode: { not: 'radius' } },
    select: { id: true, name: true, nasname: true, ipAddress: true, username: true, password: true, port: true, authMode: true },
  });
  if (!router) { console.log('No local-auth router found'); return; }
  console.log(`Router: ${router.name} (${router.ipAddress}:${router.port}) authMode=${router.authMode}`);

  const host = router.ipAddress || router.nasname;
  const api = new RouterOSAPI({
    host, port: router.port || 8728,
    user: router.username, password: router.password,
    timeout: 15000,
  });

  try {
    await api.connect();
    // 1. Check if 'isolir' profile exists in /ppp/profile
    const profiles = await api.write('/ppp/profile/print');
    const isolirProfile = profiles.find(p => p.name === 'isolir');
    console.log(`\n=== PPP Profiles (${profiles.length}) ===`);
    console.log('isolir profile exists:', !!isolirProfile);
    if (isolirProfile) {
      console.log('isolir profile details:', JSON.stringify({
        name: isolirProfile.name,
        'rate-limit': isolirProfile['rate-limit'] || '(none)',
        'local-address': isolirProfile['local-address'] || '(none)',
        'remote-address': isolirProfile['remote-address'] || '(none)',
      }));
    } else {
      console.log('Available profiles:', profiles.slice(0, 10).map(p => p.name).join(', '));
    }

    // 2. Check hotspot user profiles for 'isolir'
    try {
      const hsProfiles = await api.write('/ip/hotspot/user/profile/print');
      const hsIsolir = hsProfiles.find(p => p.name === 'isolir');
      console.log(`\n=== Hotspot User Profiles (${hsProfiles.length}) ===`);
      console.log('hotspot isolir profile exists:', !!hsIsolir);
      if (hsIsolir) {
        console.log('hotspot isolir details:', JSON.stringify({
          name: hsIsolir.name,
          'rate-limit': hsIsolir['rate-limit'] || '(none)',
          'shared-users': hsIsolir['shared-users'] || '(none)',
        }));
      }
    } catch (e) { console.log('Hotspot profile check skipped:', e.message); }

    // 3. Check current secret for test user 'server'
    const secrets = await api.write('/ppp/secret/print', ['?name=server']);
    if (secrets.length > 0) {
      const s = secrets[0];
      console.log(`\n=== PPP Secret for 'server' ===`);
      console.log('profile:', s.profile, '| disabled:', s.disabled, '| service:', s.service);
    } else {
      console.log(`\nNo PPP secret found for 'server'`);
    }

    // 4. Count active PPP sessions
    const active = await api.write('/ppp/active/print');
    console.log(`\n=== Active PPP Sessions: ${active.length} ===`);
    const serverActive = active.filter(s => s.name === 'server');
    if (serverActive.length > 0) {
      console.log('server active session:', JSON.stringify({
        name: serverActive[0].name,
        address: serverActive[0].address,
        uptime: serverActive[0].uptime,
        'rx-byte': serverActive[0]['rx-byte'],
        'tx-byte': serverActive[0]['tx-byte'],
      }));
    } else {
      console.log('No active session for server');
    }
  } catch (e) {
    console.error('Error:', e.message || e);
  } finally {
    try { await api.close(); } catch {}
    await prisma.$disconnect();
  }
}

main();
