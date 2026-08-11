#!/bin/bash

# =========================================
# SALFANET RADIUS - File Watcher Deploy
# =========================================
# Watch for file changes and deploy automatically
# Perfect for staging/development environments
#
# Usage: ./watch-deploy.sh
# =========================================

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
CHECK_INTERVAL=60  # Check every 60 seconds

echo "👁️  Starting file watcher for $APP_DIR"
echo "   Checking for changes every ${CHECK_INTERVAL}s"
echo "   Press Ctrl+C to stop"
echo ""

last_commit=""

while true; do
    cd "$APP_DIR"
    
    # Fetch latest
    git fetch origin master --quiet
    
    # Get current remote commit
    current_commit=$(git rev-parse origin/master)
    
    if [ "$last_commit" != "$current_commit" ] && [ -n "$last_commit" ]; then
        echo ""
        echo "🔔 New changes detected!"
        echo "   Previous: ${last_commit:0:8}"
        echo "   Current:  ${current_commit:0:8}"
        echo ""
        
        # Run smart deploy
        ./smart-deploy.sh
    fi
    
    last_commit="$current_commit"
    sleep $CHECK_INTERVAL
done
