#!/bin/bash
echo "=== Current rate limit keys ==="
redis-cli keys 'ratelimit:*' 2>&1
echo "=== Deleting all rate limit keys ==="
KEYS=$(redis-cli keys 'ratelimit:*' 2>/dev/null)
if [ -n "$KEYS" ]; then
  for key in $KEYS; do
    redis-cli del "$key"
  done
  echo "Deleted all rate limit keys"
else
  echo "No rate limit keys found"
fi
echo "=== Verify ==="
redis-cli keys 'ratelimit:*' 2>&1
echo "DONE"
