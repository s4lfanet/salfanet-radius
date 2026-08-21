#!/bin/bash
PID=$(pm2 pid salfanet-backend 2>/dev/null)
echo "PID: $PID"
cat /proc/$PID/environ 2>&1 | tr '\0' '\n' | grep PATH
echo "---"
which pnpm node npx
