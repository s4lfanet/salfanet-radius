#!/bin/bash

##############################################
# SALFANET RADIUS - Production Cleanup Script
##############################################

echo "========================================"
echo "SALFANET RADIUS - Production Cleanup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleaned=0

echo "🧹 Starting cleanup process..."
echo ""

# 1. Remove build artifacts
echo "[1/8] Removing build artifacts..."
if [ -d ".next" ]; then
    rm -rf .next
    echo "  ✅ Removed .next/"
    ((cleaned++))
fi

if [ -f "tsconfig.tsbuildinfo" ]; then
    rm -f tsconfig.tsbuildinfo
    echo "  ✅ Removed tsconfig.tsbuildinfo"
    ((cleaned++))
fi

if [ -f "build-error.log" ]; then
    rm -f build-error.log
    echo "  ✅ Removed build-error.log"
    ((cleaned++))
fi

# 2. Remove logs
echo ""
echo "[2/8] Removing log files..."
find . -type f -name "*.log" ! -path "./node_modules/*" ! -path "./vps-install/*" -delete 2>/dev/null
echo "  ✅ Removed log files"

# 3. Remove temp files
echo ""
echo "[3/8] Removing temporary files..."
find . -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*.bak" -o -name "*.old" \) ! -path "./node_modules/*" -delete 2>/dev/null
echo "  ✅ Removed temporary files"

# 4. Remove OS specific files
echo ""
echo "[4/8] Removing OS-specific files..."
find . -type f \( -name ".DS_Store" -o -name "Thumbs.db" -o -name "desktop.ini" \) -delete 2>/dev/null
echo "  ✅ Removed OS-specific files"

# 5. Clean test artifacts
echo ""
echo "[5/8] Cleaning test artifacts..."
if [ -d "coverage" ]; then
    rm -rf coverage
    echo "  ✅ Removed coverage/"
fi

# 6. Remove duplicate gitignore/gitattributes
echo ""
echo "[6/8] Checking git config files..."
if [ -f "gitignore" ] && [ -f ".gitignore" ]; then
    rm -f gitignore
    echo "  ✅ Removed duplicate 'gitignore' (kept .gitignore)"
    ((cleaned++))
fi

if [ -f "gitattributes" ] && [ -f ".gitattributes" ]; then
    rm -f gitattributes
    echo "  ✅ Removed duplicate 'gitattributes' (kept .gitattributes)"
    ((cleaned++))
fi

# 7. Optimize node_modules (optional)
echo ""
echo "[7/8] Node modules..."
if [ -d "node_modules" ]; then
    echo "  ℹ️  node_modules exists (${du -sh node_modules 2>/dev/null | cut -f1})"
    echo "  ⚠️  Run 'npm prune --production' to remove dev dependencies"
else
    echo "  ⚠️  node_modules not found - run 'npm install'"
fi

# 8. Check environment files
echo ""
echo "[8/8] Checking environment files..."
if [ -f ".env" ]; then
    echo "  ✅ .env exists"
    if grep -q "your_password\|your-secret\|CHANGE_THIS" .env 2>/dev/null; then
        echo -e "  ${YELLOW}⚠️  WARNING: .env contains default/placeholder values!${NC}"
    fi
else
    echo -e "  ${RED}❌ .env NOT FOUND - copy from .env.example${NC}"
fi

# Summary
echo ""
echo "========================================"
echo "Cleanup Summary"
echo "========================================"
echo "✅ Cleaned $cleaned items"
echo ""
echo "Next steps for production:"
echo "  1. Review .env file"
echo "  2. Run: npm run build"
echo "  3. Run: npm prune --production"
echo "  4. Deploy using PM2 or Docker"
echo ""
echo "Done! 🚀"
