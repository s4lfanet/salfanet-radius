const { RouterOSAPI } = require('node-routeros');

async function check() {
  const api = new RouterOSAPI({
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  });
  try {
    await api.connect();
    // Get all secrets and find "server" manually (avoid !empty bug)
    const allSecrets = await api.write('/ppp/secret/print');
    const server = allSecrets.find(s => s.name === 'server');
    if (server) {
      console.log('✅ PPP secret "server" exists:');
      console.log(`  name=${server.name}, disabled=${server.disabled}, profile=${server.profile}, service=${server.service}`);
      console.log(`  comment=${server.comment || '(none)'}`);
    } else {
      console.log('❌ PPP secret "server" NOT found');
      console.log(`Total secrets: ${allSecrets.length}`);
    }
    await api.close();
  } catch (err) {
    console.error('Error:', err.message || err);
    try { await api.close() } catch {}
    process.exit(1);
  }
}
check();
