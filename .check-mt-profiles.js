// Check MikroTik PPP secrets and active sessions for isolir profile
const { RouterOSAPI } = require('node-routeros');

async function main() {
  const api = new RouterOSAPI({
    host: '103.191.165.120',
    port: 8742,
    user: 'mikhmon',
    password: '654321',
    timeout: 15,
  });

  try {
    await api.connect();

    // Get all PPP secrets
    const secrets = await api.write('/ppp/secret/print');
    console.log('=== PPP SECRETS ===');
    console.log(`Total: ${secrets.length}`);

    // Group by profile
    const profileMap = {};
    for (const s of secrets) {
      const profile = s.profile || '(none)';
      if (!profileMap[profile]) profileMap[profile] = [];
      profileMap[profile].push(s.name);
    }
    for (const [profile, names] of Object.entries(profileMap)) {
      console.log(`  Profile "${profile}": ${names.length} users`);
      if (profile === 'isolir' || names.length <= 5) {
        console.log(`    → ${names.join(', ')}`);
      }
    }

    // Get all active PPP sessions
    const active = await api.write('/ppp/active/print');
    console.log('\n=== ACTIVE PPP SESSIONS ===');
    console.log(`Total: ${active.length}`);

    // Group by profile
    const activeProfileMap = {};
    for (const s of active) {
      const profile = s.profile || '(none)';
      if (!activeProfileMap[profile]) activeProfileMap[profile] = [];
      activeProfileMap[profile].push(s.name);
    }
    for (const [profile, names] of Object.entries(activeProfileMap)) {
      console.log(`  Profile "${profile}": ${names.length} sessions`);
      if (profile === 'isolir') {
        console.log(`    → ${names.join(', ')}`);
      }
    }

    // Find users on isolir profile in secrets but not in active
    const isolirSecrets = profileMap['isolir'] || [];
    const isolirActive = activeProfileMap['isolir'] || [];
    console.log('\n=== ISOLIR ANALYSIS ===');
    console.log(`Secrets on isolir: ${isolirSecrets.length}`);
    console.log(`Active sessions on isolir: ${isolirActive.length}`);
    if (isolirSecrets.length > 0) {
      console.log(`Secrets on isolir: ${isolirSecrets.join(', ')}`);
    }
    if (isolirActive.length > 0) {
      console.log(`Active on isolir: ${isolirActive.join(', ')}`);
    }

    // Find active sessions where secret profile != active session profile
    const mismatches = [];
    const secretMap = {};
    for (const s of secrets) {
      secretMap[s.name] = s.profile || '(none)';
    }
    for (const a of active) {
      const secretProfile = secretMap[a.name];
      const activeProfile = a.profile || '(none)';
      if (secretProfile && secretProfile !== activeProfile) {
        mismatches.push({ name: a.name, secretProfile, activeProfile });
      }
    }
    if (mismatches.length > 0) {
      console.log(`\n=== PROFILE MISMATCHES (secret vs active) ===`);
      for (const m of mismatches.slice(0, 20)) {
        console.log(`  ${m.name}: secret="${m.secretProfile}" vs active="${m.activeProfile}"`);
      }
      if (mismatches.length > 20) {
        console.log(`  ... and ${mismatches.length - 20} more`);
      }
    }

    await api.close();
  } catch (e) {
    console.error('Error:', e.message || e);
    try { await api.close(); } catch {}
  }
}

main();
