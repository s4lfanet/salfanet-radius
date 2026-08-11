#!/bin/bash
# ============================================================================
# SALFANET RADIUS - Fix Prisma Engine Permissions
# ============================================================================
# Fix "spawn schema-engine EACCES" error
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/var/www/salfanet-radius"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}Fix Prisma Engine Permissions${NC}"
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

cd $APP_DIR

echo -e "${YELLOW}[1] Checking Prisma engines...${NC}"

if [ ! -d "node_modules/@prisma/engines" ]; then
    echo -e "${RED}[ERROR] Prisma engines not found!${NC}"
    echo "Run: npm install"
    exit 1
fi

# List engine files
echo "Found engines:"
ls -lh node_modules/@prisma/engines/ | grep -E "engine|prisma-fmt"
echo ""

echo -e "${YELLOW}[2] Fixing engine permissions...${NC}"

# Make all engine binaries executable
find node_modules/@prisma/engines -type f | while read engine; do
    if [[ "$engine" =~ (engine|prisma-fmt) ]]; then
        echo "  Fixing: $engine"
        chmod +x "$engine"
    fi
done

# Specifically target known engine files
chmod +x node_modules/@prisma/engines/schema-engine-* 2>/dev/null || true
chmod +x node_modules/@prisma/engines/query-engine-* 2>/dev/null || true
chmod +x node_modules/@prisma/engines/migration-engine-* 2>/dev/null || true
chmod +x node_modules/@prisma/engines/introspection-engine-* 2>/dev/null || true
chmod +x node_modules/@prisma/engines/prisma-fmt-* 2>/dev/null || true

echo ""
echo -e "${GREEN}[OK] Permissions fixed${NC}"
echo ""

echo -e "${YELLOW}[3] Verifying permissions...${NC}"
ls -lh node_modules/@prisma/engines/ | grep -E "engine|prisma-fmt"
echo ""

echo -e "${YELLOW}[4] Testing schema engine...${NC}"

# Test schema engine
SCHEMA_ENGINE=$(find node_modules/@prisma/engines -name "schema-engine-*" | head -1)

if [ -n "$SCHEMA_ENGINE" ]; then
    echo "Testing: $SCHEMA_ENGINE"
    
    if [ -x "$SCHEMA_ENGINE" ]; then
        echo -e "${GREEN}[OK] Schema engine is executable${NC}"
        
        # Try to run version check
        if $SCHEMA_ENGINE --version 2>/dev/null; then
            echo -e "${GREEN}[OK] Schema engine runs successfully!${NC}"
        else
            echo -e "${YELLOW}[WARN] Engine is executable but version check failed${NC}"
            echo "This may be normal - engine might need specific arguments"
        fi
    else
        echo -e "${RED}[ERROR] Schema engine is NOT executable${NC}"
        chmod +x "$SCHEMA_ENGINE"
        echo "Applied chmod +x, testing again..."
        
        if [ -x "$SCHEMA_ENGINE" ]; then
            echo -e "${GREEN}[OK] Now executable${NC}"
        fi
    fi
else
    echo -e "${RED}[ERROR] Schema engine not found!${NC}"
fi

echo ""
echo -e "${YELLOW}[5] Testing Prisma commands...${NC}"

# Test prisma generate
echo "Testing: npx prisma generate --help"
if npx prisma generate --help >/dev/null 2>&1; then
    echo -e "${GREEN}[OK] prisma generate works${NC}"
else
    echo -e "${RED}[ERROR] prisma generate failed${NC}"
fi

# Test prisma db push
echo "Testing: npx prisma db push --help"
if npx prisma db push --help >/dev/null 2>&1; then
    echo -e "${GREEN}[OK] prisma db push works${NC}"
else
    echo -e "${RED}[ERROR] prisma db push failed${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Summary${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Count executable engines
TOTAL_ENGINES=$(find node_modules/@prisma/engines -type f | grep -E "(engine|prisma-fmt)" | wc -l)
EXECUTABLE_ENGINES=$(find node_modules/@prisma/engines -type f -executable | grep -E "(engine|prisma-fmt)" | wc -l)

echo "Total engines found: $TOTAL_ENGINES"
echo "Executable engines: $EXECUTABLE_ENGINES"
echo ""

if [ "$TOTAL_ENGINES" -eq "$EXECUTABLE_ENGINES" ]; then
    echo -e "${GREEN}[OK] All engines are executable!${NC}"
    echo ""
    echo -e "${CYAN}You can now run:${NC}"
    echo "  cd $APP_DIR"
    echo "  npx prisma generate"
    echo "  npx prisma db push"
    echo ""
else
    echo -e "${YELLOW}[WARN] Some engines may not be executable${NC}"
    echo ""
    echo "Try running this script again:"
    echo "  sudo $0"
    echo ""
fi

echo -e "${CYAN}If you still get EACCES errors:${NC}"
echo "1. Check ownership: ls -la node_modules/@prisma/engines/"
echo "2. Re-install Prisma: npm install @prisma/client prisma --force"
echo "3. Run this script again after re-install"
echo ""
