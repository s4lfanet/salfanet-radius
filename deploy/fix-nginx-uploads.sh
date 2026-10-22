#!/bin/bash
# Adds the /uploads/ location to an installed nginx site.
#
# Uploaded files (payment proofs, KTP and installation photos, ticket
# photos, registration documents) are written to the persistent upload dir
# (/var/data/salfanet/uploads unless UPLOAD_DIR says otherwise) and linked as
# /uploads/... . The installer's nginx site had no /uploads/ location, so
# those links went to the frontend and answered 404 on every install made
# with it. Older installs were set up by hand and already have the block.
#
# Only images are served; script and page files are refused. The site file
# is generated at install time and not tracked by git, so updates never
# changed it. Safe to run again: it does nothing when the block is there,
# and puts the old file back if nginx rejects the new one.

CONF="${NGINX_SITE:-/etc/nginx/sites-available/salfanet}"
APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"

[ -f "$CONF" ] || exit 0
command -v nginx >/dev/null 2>&1 || exit 0

if grep -q 'location /uploads/' "$CONF"; then
    echo "[nginx] /uploads/ already served"
    exit 0
fi

UPLOAD_DIR=$(grep -E '^UPLOAD_DIR=' "$APP_DIR/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'")
UPLOAD_DIR="${UPLOAD_DIR:-/var/data/salfanet/uploads}"
mkdir -p "$UPLOAD_DIR"

BACKUP="$CONF.bak-uploads"
cp -p "$CONF" "$BACKUP"

# One block in front of each server's catch-all "location / {".
awk -v dir="${UPLOAD_DIR%/}/" '
  /^[[:space:]]*location \/ \{/ {
    match($0, /^[[:space:]]*/); pad = substr($0, 1, RLENGTH)
    print pad "# Uploaded files: images only, straight from the upload dir"
    print pad "location /uploads/ {"
    print pad "    alias " dir ";"
    print pad "    access_log off;"
    print pad "    try_files $uri =404;"
    print pad "    location ~* \\.(php|js|mjs|html|htm|xhtml|svg|exe|sh|css)$ { deny all; }"
    print pad "    expires 30d;"
    print pad "    add_header X-Content-Type-Options \"nosniff\" always;"
    print pad "}"
    print ""
  }
  { print }
' "$BACKUP" > "$CONF"

if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    echo "[nginx] /uploads/ now served from $UPLOAD_DIR"
else
    cp -p "$BACKUP" "$CONF"
    echo "[nginx] new site config rejected by nginx -t; old one restored"
    exit 1
fi
