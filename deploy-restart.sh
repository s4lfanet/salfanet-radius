#!/bin/bash
# Kill existing Go server
OLD_PID=$(ps aux | grep '[/]var/www/salfanet-radius/bin/server' | awk '{print $2}' | head -1)
if [ -n "$OLD_PID" ]; then
  echo "Killing PID $OLD_PID"
  kill $OLD_PID
  sleep 2
fi

# Replace binary
cp /tmp/server-new /var/www/salfanet-radius/bin/server
chmod +x /var/www/salfanet-radius/bin/server

# Start
cd /var/www/salfanet-radius
nohup ./bin/server > /var/log/salfanet-go.log 2>&1 &
echo "Started, waiting..."
sleep 3

# Health check
curl -s http://localhost:8080/api/system/health
echo ""
tail -8 /var/log/salfanet-go.log
