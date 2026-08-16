const fs = require('fs');
const path = require('path');
console.log('cwd:', process.cwd());
console.log('__dirname:', __dirname);

// Check all possible paths
const paths = [
  path.join(process.cwd(), 'frontend', 'public', 'android-template', 'gradle-wrapper.jar'),
  path.join(process.cwd(), 'public', 'android-template', 'gradle-wrapper.jar'),
  '/var/www/salfanet-radius/frontend/public/android-template/gradle-wrapper.jar',
  '/var/www/salfanet-radius/public/android-template/gradle-wrapper.jar',
];

for (const p of paths) {
  console.log(`  ${p} => ${fs.existsSync(p)}`);
}

// Also check what the standalone server.js sees
console.log('server.js cwd:', process.cwd());
