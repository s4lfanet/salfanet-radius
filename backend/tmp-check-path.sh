#!/bin/bash
cd /var/www/salfanet-radius/backend
echo "PATH=$PATH"
echo "which pnpm: $(which pnpm)"
echo "pnpm version:"
pnpm --version 2>&1
echo "---"
echo "pnpm install test:"
pnpm install --no-frozen-lockfile 2>&1 | tail -10
echo "exit code: $?"
