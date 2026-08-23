#!/bin/bash
set -e

echo "[*] Deploying SALFANET RADIUS..."

APP_DIR="/var/www/salfanet-radius"
APP_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo salfanet)"
SOURCE_DIR=""
DEFAULT_BRANCH=""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] This script must be run as root"
    echo "Run with: sudo $0"
    exit 1
fi

for candidate in "$APP_DIR" "/root/salfanet-radius" "/root/SALFANET-RADIUS-main"; do
    if [ -f "$candidate/package.json" ]; then
        SOURCE_DIR="$candidate"
        break
    fi
done

if [ -z "$SOURCE_DIR" ]; then
    echo "[ERROR] Source directory not found"
    exit 1
fi

echo ">> Source directory: $SOURCE_DIR"
echo ">> Active directory: $APP_DIR"

# Pull latest code from source repo if available
if [ -d "$SOURCE_DIR/.git" ]; then
    echo ">> Pulling latest code from git source..."
    DEFAULT_BRANCH=$(git -C "$SOURCE_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')

    if [ -z "$DEFAULT_BRANCH" ]; then
        if git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/master; then
            DEFAULT_BRANCH="master"
        elif git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/main; then
            DEFAULT_BRANCH="main"
        else
            DEFAULT_BRANCH="master"
        fi
    fi

    git -C "$SOURCE_DIR" fetch origin
    git -C "$SOURCE_DIR" checkout "$DEFAULT_BRANCH"
    # --ff-only guards against silently discarding local commits. If this
    # ever fails after a deliberate history rewrite (e.g. purging a leaked
    # secret with git-filter-repo + force-push), realign manually first:
    #   git -C "$SOURCE_DIR" reset --hard "origin/$DEFAULT_BRANCH"
    git -C "$SOURCE_DIR" pull --ff-only origin "$DEFAULT_BRANCH"
fi

# Sync latest source into active app dir when source repo is separate
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
    echo ">> Syncing source into active app directory..."
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete \
            --exclude='.git' \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='logs' \
            "$SOURCE_DIR/" "$APP_DIR/"
    else
        cp -a "$SOURCE_DIR/." "$APP_DIR/"
    fi
fi

cd ${APP_DIR}

# Install dependencies (workspace-aware — this is a pnpm monorepo; backend
# and frontend depend on each other via the workspace:* protocol, which
# plain npm cannot resolve at all)
echo ">> Installing dependencies..."
pnpm install

# Generate Prisma Client (backend)
echo "[>] Generating Prisma Client..."
( cd backend && pnpm exec prisma generate )

# Push database schema (backend)
echo "[>] Updating database schema..."
( cd backend && pnpm exec prisma db push --accept-data-loss )

# Build backend application (API routes + Prisma + services)
echo "[>] Building backend application..."
( cd backend && NODE_OPTIONS="--max-old-space-size=1536" pnpm exec next build )

# Copy backend public assets into standalone bundle (required for static assets)
# NOTE: backend's own build script already runs scripts/postbuild.js, which
# copies .env + the Prisma client into .next/standalone/backend/ — this
# section is a redundant-but-harmless extra copy of public/static assets.
if [ -d "backend/.next/standalone" ]; then
    echo "[>] Copying backend public assets into standalone bundle..."
    [ -d "backend/public" ] && { mkdir -p backend/.next/standalone/backend/public; cp -r backend/public/. backend/.next/standalone/backend/public/; } || true
    if [ -d "backend/.next/static" ]; then
        mkdir -p backend/.next/standalone/backend/.next
        cp -r backend/.next/static backend/.next/standalone/backend/.next/static/ || true
    fi
    [ -f "backend/.env" ] && cp backend/.env backend/.next/standalone/backend/.env || true
    echo "[OK] Backend standalone assets copied"
fi

# Build frontend application (UI + NextAuth routes)
echo "[>] Building frontend application..."
( cd frontend && NODE_OPTIONS="--max-old-space-size=1536" pnpm exec next build )

# Copy frontend public assets into standalone bundle (required for PWA manifests + sw.js)
if [ -d "frontend/.next/standalone" ]; then
    echo "[>] Copying frontend public assets into standalone bundle..."
    [ -d "frontend/public" ] && { mkdir -p frontend/.next/standalone/frontend/public; cp -r frontend/public/. frontend/.next/standalone/frontend/public/; } || true
    if [ -d "frontend/.next/static" ]; then
        mkdir -p frontend/.next/standalone/frontend/.next
        cp -r frontend/.next/static frontend/.next/standalone/frontend/.next/static/ || true
    fi
    [ -f "frontend/.env" ] && cp frontend/.env frontend/.next/standalone/frontend/.env || true
    echo "[OK] Frontend standalone assets copied"
fi

# Fix ownership
echo "[>] Fixing permissions..."
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# Refresh ecosystem.config.js from production/ (rsync --delete erases root copy)
if [ -f "${APP_DIR}/production/ecosystem.config.js" ]; then
    cp "${APP_DIR}/production/ecosystem.config.js" "${APP_DIR}/ecosystem.config.js"
    echo "[>] ecosystem.config.js refreshed from production/"
fi

# Restart PM2 as the app user.
# NOTE: `pm2 reload/restart --update-env` is NOT reliable for picking up
# changed .env values (DATABASE_URL, NEXTAUTH_SECRET, etc). Those are read
# by Next.js itself from each app's .env file at process boot, not from
# ecosystem.config.js's `env` block — and PM2 caches a full env snapshot
# from the first time an app was registered, reinjecting it on every later
# restart. Since dotenv never overrides an already-set process.env value,
# that stale snapshot silently wins over the current .env file content.
# delete+start forces a fresh registration so the current .env is always
# what actually gets used (verified 2026-08-23 after a secret rotation
# caused a real DB-auth outage that `restart --update-env` did not fix).
echo "[>] Restarting application..."
sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 delete salfanet-backend salfanet-frontend >/dev/null 2>&1; pm2 start ${APP_DIR}/ecosystem.config.js --only salfanet-backend,salfanet-frontend"
sudo su - ${APP_USER} -c 'pm2 save'

echo "[OK] Deployment completed!"
echo ">> Note: PM2 runs 4 processes: salfanet-frontend, salfanet-backend, salfanet-cron, salfanet-wa."
echo ""
echo ">> Application status:"
sudo su - ${APP_USER} -c 'pm2 list'
