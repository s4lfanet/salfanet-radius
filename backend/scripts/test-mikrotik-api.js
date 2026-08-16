// Test MikroTik API connection directly using node-routeros
const { RouterOSAPI } = require('node-routeros');

async function testConnection() {
  const config = {
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  };
  console.log('Connecting to MikroTik API:', config.host, ':', config.port, 'as', config.user);

  const api = new RouterOSAPI(config);
  try {
    console.log('Connecting...');
    await api.connect();
    console.log('✅ Connected!');

    console.log('Reading /ppp/secret/print...');
    const secrets = await api.write('/ppp/secret/print');
    console.log(`✅ Found ${secrets.length} PPP secrets`);
    for (const s of secrets.slice(0, 5)) {
      console.log(`  name=${s.name}, disabled=${s.disabled}, profile=${s.profile}`);
    }

    console.log('Reading /ppp/active/print...');
    const active = await api.write('/ppp/active/print');
    console.log(`✅ Found ${active.length} active PPP sessions`);
    for (const a of active.slice(0, 5)) {
      console.log(`  name=${a.name}, address=${a.address}`);
    }

    await api.close();
    console.log('✅ Connection closed');
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    try { await api.close() } catch {}
    process.exit(1);
  }
}

testConnection();
