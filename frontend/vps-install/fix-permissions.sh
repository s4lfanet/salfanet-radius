#!/bin/bash
# ============================================================================
# SALFANET RADIUS - Fix Permissions Script
# ============================================================================
# Fix ownership and permissions untuk menjalankan PM2 tanpa sudo
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/var/www/salfanet-radius"
APP_USER="salfanet"
APP_GROUP="salfanet"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}SALFANET RADIUS - Fix Permissions${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}[ERROR] This script must be run as root${NC}"
    echo "Run with: sudo $0"
    exit 1
fi

# Check if app directory exists
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}[ERROR] Application directory not found: $APP_DIR${NC}"
    exit 1
fi

# Create app user if not exists
if ! id "$APP_USER" &>/dev/null; then
    echo -e "${YELLOW}[INFO] Creating user: $APP_USER...${NC}"
    useradd -r -m -s /bin/bash -d /home/$APP_USER $APP_USER
    echo -e "${GREEN}[OK] User $APP_USER created${NC}"
else
    echo -e "${GREEN}[OK] User $APP_USER already exists${NC}"
fi

# Ensure user has proper shell and groups
echo -e "${YELLOW}[INFO] Configuring user groups and permissions...${NC}"
usermod -s /bin/bash $APP_USER 2>/dev/null || true
usermod -aG sudo $APP_USER 2>/dev/null || true

# Fix Node.js binary permissions
echo -e "${YELLOW}[INFO] Fixing Node.js binary permissions...${NC}"
if [ -f "/usr/bin/node" ]; then
    chmod +x /usr/bin/node
    echo -e "${GREEN}[OK] Node.js binary is executable${NC}"
fi

# Fix npm binary permissions
if [ -f "/usr/bin/npm" ]; then
    chmod +x /usr/bin/npm
fi

# Fix PM2 binary permissions
if [ -f "/usr/lib/node_modules/pm2/bin/pm2" ]; then
    chmod +x /usr/lib/node_modules/pm2/bin/pm2
fi

if [ -f "/usr/bin/pm2" ]; then
    chmod +x /usr/bin/pm2
fi

# Fix ownership
echo -e "${YELLOW}[INFO] Setting ownership to $APP_USER:$APP_GROUP...${NC}"
chown -R $APP_USER:$APP_GROUP $APP_DIR

# Fix file permissions
echo -e "${YELLOW}[INFO] Fixing file permissions...${NC}"
find $APP_DIR -type f -exec chmod 644 {} \;
find $APP_DIR -type d -exec chmod 755 {} \;

# Make scripts executable
chmod +x $APP_DIR/*.sh 2>/dev/null || true

# Fix node_modules/.bin
if [ -d "$APP_DIR/node_modules/.bin" ]; then
    chmod +x $APP_DIR/node_modules/.bin/* 2>/dev/null || true
fi

# Fix Prisma engine binaries (CRITICAL!)
echo -e "${YELLOW}[INFO] Fixing Prisma engine permissions...${NC}"
if [ -d "$APP_DIR/node_modules/@prisma/engines" ]; then
    chmod +x $APP_DIR/node_modules/@prisma/engines/* 2>/dev/null || true
    
    # Specifically fix known engine files
    chmod +x $APP_DIR/node_modules/@prisma/engines/schema-engine-* 2>/dev/null || true
    chmod +x $APP_DIR/node_modules/@prisma/engines/query-engine-* 2>/dev/null || true
    chmod +x $APP_DIR/node_modules/@prisma/engines/migration-engine-* 2>/dev/null || true
    chmod +x $APP_DIR/node_modules/@prisma/engines/introspection-engine-* 2>/dev/null || true
    chmod +x $APP_DIR/node_modules/@prisma/engines/prisma-fmt-* 2>/dev/null || true
    
    echo -e "${GREEN}[OK] Prisma engines are now executable${NC}"
fi

# Fix Next.js binaries
if [ -d "$APP_DIR/node_modules/next/dist/bin" ]; then
    chmod +x $APP_DIR/node_modules/next/dist/bin/* 2>/dev/null || true
fi

# Create/fix PM2 directories
echo -e "${YELLOW}[INFO] Setting up PM2 directories for $APP_USER...${NC}"
mkdir -p /home/$APP_USER/.pm2/logs
mkdir -p /home/$APP_USER/.pm2/pids
chown -R $APP_USER:$APP_GROUP /home/$APP_USER/.pm2

# Fix logs directory
mkdir -p $APP_DIR/logs
chown -R $APP_USER:$APP_GROUP $APP_DIR/logs

# Test if salfanet can execute node
echo -e "${YELLOW}[INFO] Testing Node.js execution for $APP_USER...${NC}"
if sudo -u $APP_USER node --version &>/dev/null; then
    echo -e "${GREEN}[OK] User $APP_USER can execute Node.js: $(sudo -u $APP_USER node --version)${NC}"
else
    echo -e "${RED}[ERROR] User $APP_USER cannot execute Node.js!${NC}"
    echo -e "${YELLOW}[INFO] Attempting to fix...${NC}"
    
    # Try fixing with different approach
    chmod 755 /usr/bin/node
    chmod 755 /usr/bin/npm
    
    # Test again
    if sudo -u $APP_USER node --version &>/dev/null; then
        echo -e "${GREEN}[OK] Fixed! Node.js now executable by $APP_USER${NC}"
    else
        echo -e "${RED}[ERROR] Still cannot execute Node.js!${NC}"
        echo -e "${YELLOW}[INFO] You may need to reinstall Node.js or check SELinux/AppArmor${NC}"
    fi
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}[OK] Permissions fixed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${CYAN}Now you can run PM2 without sudo:${NC}"
echo ""
echo "  # Switch to salfanet user"
echo "  sudo su - $APP_USER"
echo ""
echo "  # Or run commands directly"
echo "  sudo -u $APP_USER pm2 list"
echo "  sudo -u $APP_USER pm2 logs salfanet-radius"
echo "  sudo -u $APP_USER pm2 restart salfanet-radius"
echo ""
echo -e "${YELLOW}[!] Important: Test Node.js first, then start PM2:${NC}"
echo ""
echo "  # Test Node.js works"
echo "  sudo -u $APP_USER node --version"
echo "  sudo -u $APP_USER npm --version"
echo ""
echo "  # Kill old PM2 processes"
echo "  pm2 kill                              # Kill root PM2"
echo "  sudo -u $APP_USER pm2 kill            # Kill salfanet PM2"
echo ""
echo "  # Start PM2 as salfanet"
echo "  sudo -u $APP_USER pm2 start $APP_DIR/ecosystem.config.js"
echo "  sudo -u $APP_USER pm2 save"
echo "  sudo -u $APP_USER pm2 startup systemd -u $APP_USER --hp /home/$APP_USER"
echo ""
echo -e "${CYAN}If 'spawn /usr/bin/node EACCES' error persists:${NC}"
echo "  sudo chmod 755 /usr/bin/node"
echo "  sudo chmod 755 /usr/bin/npm"
echo "  sudo -u $APP_USER bash -c 'node --version'"
echo ""
