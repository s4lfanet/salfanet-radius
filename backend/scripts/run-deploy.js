#!/usr/bin/env node

const { spawnSync } = require('child_process');

const deployArgs = process.argv.slice(2);
const scriptPath = 'production/smart-deploy.sh';

function hasBash() {
  const check = spawnSync('bash', ['--version'], { stdio: 'ignore' });
  return check.status === 0;
}

if (!hasBash()) {
  console.error('[deploy] bash is not available in this environment.');
  console.error('[deploy] For local Windows usage, run via WSL/Git Bash or deploy from VPS.');
  process.exit(1);
}

const result = spawnSync('bash', [scriptPath, ...deployArgs], {
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
