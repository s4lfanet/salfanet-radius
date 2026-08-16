#!/bin/bash
echo "=== SYSTEM INFO (direct backend) ==="
curl -s http://127.0.0.1:3001/api/admin/system/info 2>&1
echo
echo "=== CHANGELOG (direct backend) ==="
curl -s http://127.0.0.1:3001/api/admin/system/changelog 2>&1
echo
echo "=== GIT LOG (raw) ==="
cd /var/www/salfanet-radius && git log -5 --format='%h|%ci|%an|%s' 2>&1
echo "=== GIT REMOTE ==="
git rev-parse --short HEAD 2>&1
git rev-parse --short origin/master 2>&1
echo "=== GIT FETCH ==="
git fetch origin master 2>&1
git rev-parse --short origin/master 2>&1
