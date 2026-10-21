#!/bin/bash
# Raises the backend's PM2 memory limit in an installed ecosystem.config.js.
#
# The installer wrote max_memory_restart 400M-450M for salfanet-backend
# next to a 350-400 MB V8 heap. The process's memory (RSS) is the heap plus
# Next.js's native memory, so a busy minute (GenieACS alert checks, OLT
# polling) pushed it past the limit and PM2 killed it, up to every few
# minutes. Each kill dropped requests in flight: 502s in the panel, failed
# cron jobs ("socket hang up"), and "rest: ERROR: Server returned no data"
# in the FreeRADIUS log. The backend normally uses about 250 MB.
#
# ecosystem.config.js is generated at install time and not tracked by git,
# so updates never changed it. Safe to run again.
#
# Usage: fix-pm2-limits.sh [--apply]
#   --apply  also re-register salfanet-backend so the new limit takes effect
#            (deploy.sh does not need it: it re-registers the backend itself)

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
ECO="$APP_DIR/ecosystem.config.js"
LIMIT_MB=768

[ -f "$ECO" ] || exit 0

CURRENT=$(awk '
  /name:[[:space:]]*.salfanet-backend./ { inblock = 1 }
  inblock && /max_memory_restart/ { if (match($0, /[0-9]+M/)) { print substr($0, RSTART, RLENGTH - 1) } exit }
' "$ECO")

if [ -z "$CURRENT" ] || [ "$CURRENT" -ge "$LIMIT_MB" ]; then
    echo "[pm2] backend memory limit already ${CURRENT:-unset}M"
    exit 0
fi

cp -p "$ECO" "$ECO.bak-memlimit"
awk -v limit="${LIMIT_MB}M" '
  /name:[[:space:]]*.salfanet-backend./ { inblock = 1 }
  inblock && !done && /max_memory_restart/ { sub(/[0-9]+M/, limit); done = 1 }
  { print }
' "$ECO.bak-memlimit" > "$ECO"

if ! node -e "require('$ECO')" >/dev/null 2>&1; then
    cp -p "$ECO.bak-memlimit" "$ECO"
    echo "[pm2] WARNING: could not update $ECO; previous file restored"
    exit 0
fi
echo "[pm2] backend memory limit ${CURRENT}M -> ${LIMIT_MB}M"

if [ "$1" = "--apply" ]; then
    cd "$APP_DIR" && pm2 delete salfanet-backend >/dev/null 2>&1
    pm2 start "$ECO" --only salfanet-backend >/dev/null 2>&1 && pm2 save >/dev/null 2>&1
    echo "[pm2] salfanet-backend re-registered with the new limit"
fi
exit 0
