const { RouterOSAPI } = require('node-routeros');

async function checkSecret() {
  const api = new RouterOSAPI({
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  });
  try {
    await api.connect();
    // Check if "server" secret exists
    const secrets = await api.write('/ppp/secret/print', ['?name=server']);
    console.log(`PPP secrets for "server": ${secrets.length}`);
    for (const s of secrets) {
      console.log(`  name=${s.name}, disabled=${s.disabled}, profile=${s.profile}, service=${s.service}`);
    }
    // Also check all secrets count
    const allSecrets = await api.write('/ppp/secret/print');
    console.log(`Total PPP secrets on MikroTik: ${allSecrets.length}`);
    await api.close();
  } catch (err) {
    console.error('Error:', err.message || err);
    try { await api.close() } catch {}
    process.exit(1);
  }
}
checkSecret();
