#!/bin/bash
# Brings an installed FreeRADIUS config up to date with fixes that the
# installer only applies to new installs. Run as root by deploy.sh and the
# web updater; safe to run again (it changes nothing that is already right).
#
#  1. rest module: connect_uri pointed at the frontend (port 3000), which has
#     no /api/radius routes, so every call got a 404 page: the log filled with
#     "rest: ERROR: Server returned no data", blocked and expired accounts
#     were not refused by /authorize, and hotspot vouchers never got their
#     first-login and expiry time from /post-auth. The API is on port 3001.
#  2. sql pool: connections lived forever while MySQL closes idle ones after
#     wait_timeout, so after a quiet night the first login could fail with
#     MySQL error 4031 and be rejected. Connections now live at most 1 hour.
#
# The changed config is checked with `freeradius -C` before FreeRADIUS is
# restarted; if the check fails, the previous files are put back.

FR_DIR="${FR_DIR:-/etc/freeradius/3.0}"
REST="$FR_DIR/mods-available/rest"
SQL="$FR_DIR/mods-available/sql"

[ -d "$FR_DIR" ] || exit 0
command -v freeradius >/dev/null 2>&1 || exit 0

CHANGED=""
BACKUP=$(mktemp -d)

if [ -f "$REST" ] && grep -qE 'connect_uri[[:space:]]*=[[:space:]]*"http://(localhost|127\.0\.0\.1):3000"' "$REST"; then
    cp -p "$REST" "$BACKUP/rest"
    sed -i -E 's#(connect_uri[[:space:]]*=[[:space:]]*"http://(localhost|127\.0\.0\.1)):3000"#\1:3001"#' "$REST"
    CHANGED="$CHANGED rest:connect_uri->3001"
fi

if [ -f "$SQL" ] && sed -n '/^[[:space:]]*pool[[:space:]]*{/,/}/p' "$SQL" | grep -qE '^[[:space:]]*lifetime[[:space:]]*=[[:space:]]*0[[:space:]]*$'; then
    cp -p "$SQL" "$BACKUP/sql"
    sed -i -E '/^[[:space:]]*pool[[:space:]]*\{/,/\}/ s/^([[:space:]]*lifetime[[:space:]]*=[[:space:]]*)0[[:space:]]*$/\13600/' "$SQL"
    CHANGED="$CHANGED sql:pool.lifetime->3600"
fi

if [ -z "$CHANGED" ]; then
    rm -rf "$BACKUP"
    echo "[freeradius] config already up to date"
    exit 0
fi

if freeradius -Cxm -lstdout >/dev/null 2>&1; then
    systemctl restart freeradius 2>/dev/null || true
    echo "[freeradius] updated:$CHANGED (FreeRADIUS restarted: $(systemctl is-active freeradius 2>/dev/null))"
else
    [ -f "$BACKUP/rest" ] && cp -p "$BACKUP/rest" "$REST"
    [ -f "$BACKUP/sql" ] && cp -p "$BACKUP/sql" "$SQL"
    echo "[freeradius] WARNING: config check failed after:$CHANGED; previous files restored, FreeRADIUS not restarted"
fi
rm -rf "$BACKUP"
exit 0
