/**
 * One-time script: generates VAPID keys and writes them to a local temp file
 * Run: node scripts/write-vapid-env.js
 */
const wp = require('web-push');
const fs = require('fs');
const path = require('path');

const keys = wp.generateVAPIDKeys();
const output = [
  '',
  'VAPID_PUBLIC_KEY=' + keys.publicKey,
  'VAPID_PRIVATE_KEY=' + keys.privateKey,
  'VAPID_CONTACT_EMAIL=admin@salfanet.net',
  '',
].join('\n');

const outPath = path.join(require('os').tmpdir(), 'vapid_fragment.env');
fs.writeFileSync(outPath, output, 'utf8');

console.log('Public key  (' + keys.publicKey.length + ' chars): ' + keys.publicKey);
console.log('Private key (' + keys.privateKey.length + ' chars): ' + keys.privateKey);
console.log('Written to: ' + outPath);
