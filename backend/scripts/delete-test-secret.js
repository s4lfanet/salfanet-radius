const { RouterOSAPI } = require('node-routeros');

async function deleteSecret() {
  const api = new RouterOSAPI({
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  });
  try {
    await api.connect();
    // Find and delete "server" secret
    const secrets = await api.write('/ppp/secret/print', ['?name=server']);
    console.log(`Found ${secrets.length} secret(s) for "server"`);
    if (secrets.length > 0) {
      const id = secrets[0]['.id'];
      await api.write('/ppp/secret/remove', [`=.id=${id}`]);
      console.log(`✅ Deleted PPP secret "server" (id=${id})`);
    }
    // Verify deletion
    const after = await api.write('/ppp/secret/print', ['?name=server']);
    console.log(`After delete: ${after.length} secret(s) for "server"`);
    await api.close();
  } catch (err) {
    console.error('Error:', err.message || err);
    try { await api.close() } catch {}
    process.exit(1);
  }
}
deleteSecret();
