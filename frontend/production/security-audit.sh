#!/bin/bash

###############################################
# SALFANET RADIUS - Security Audit Script
###############################################

echo "========================================"
echo "SALFANET RADIUS - Security Audit"
echo "========================================"
echo ""

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

issues=0
warnings=0
passed=0

# 1. Check .env file
echo "[1/12] Checking .env security..."
if [ ! -f ".env" ]; then
    echo -e "  ${RED}❌ CRITICAL: .env file not found!${NC}"
    ((issues++))
else
    # Check for default values
    if grep -q "your_password\|your-secret\|CHANGE_THIS\|ganti_dengan" .env; then
        echo -e "  ${RED}❌ CRITICAL: .env contains placeholder values!${NC}"
        ((issues++))
    else
        echo -e "  ${GREEN}✅ No placeholder values found${NC}"
        ((passed++))
    fi
    
    # Check NEXTAUTH_SECRET length
    secret=$(grep "NEXTAUTH_SECRET" .env | cut -d'=' -f2 | tr -d '"')
    if [ ${#secret} -lt 32 ]; then
        echo -e "  ${YELLOW}⚠️  WARNING: NEXTAUTH_SECRET should be at least 32 characters${NC}"
        ((warnings++))
    else
        echo -e "  ${GREEN}✅ NEXTAUTH_SECRET is strong${NC}"
        ((passed++))
    fi
fi

# 2. Check .env in .gitignore
echo ""
echo "[2/12] Checking .gitignore..."
if grep -q "^\.env$" .gitignore; then
    echo -e "  ${GREEN}✅ .env is in .gitignore${NC}"
    ((passed++))
else
    echo -e "  ${RED}❌ CRITICAL: .env is NOT in .gitignore!${NC}"
    ((issues++))
fi

# 3. Check for hardcoded secrets
echo ""
echo "[3/12] Scanning for hardcoded secrets..."
found=0
for file in $(find src -type f -name "*.ts" -o -name "*.tsx" 2>/dev/null); do
    if grep -iE "(password|secret|token|api_key)\s*=\s*['\"][^'\"]{10,}" "$file" > /dev/null 2>&1; then
        if [ $found -eq 0 ]; then
            echo -e "  ${YELLOW}⚠️  WARNING: Potential hardcoded secrets found:${NC}"
        fi
        echo "    - $file"
        ((found++))
    fi
done

if [ $found -eq 0 ]; then
    echo -e "  ${GREEN}✅ No hardcoded secrets detected${NC}"
    ((passed++))
else
    ((warnings++))
fi

# 4. Check file permissions (Linux/Mac only)
echo ""
echo "[4/12] Checking file permissions..."
if [ -f ".env" ]; then
    if [ "$(uname)" != "MINGW64_NT" ] && [ "$(uname)" != "MSYS_NT" ]; then
        perms=$(stat -c "%a" .env 2>/dev/null || stat -f "%Lp" .env 2>/dev/null)
        if [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
            echo -e "  ${YELLOW}⚠️  WARNING: .env permissions should be 600 or 400 (currently $perms)${NC}"
            echo "    Run: chmod 600 .env"
            ((warnings++))
        else
            echo -e "  ${GREEN}✅ .env has secure permissions${NC}"
            ((passed++))
        fi
    else
        echo -e "  ${GREEN}ℹ️  Skipped (Windows)${NC}"
    fi
fi

# 5. Check for exposed ports
echo ""
echo "[5/12] Checking exposed services..."
if grep -q "0\.0\.0\.0" src/**/*.ts 2>/dev/null; then
    echo -e "  ${YELLOW}⚠️  WARNING: Services binding to 0.0.0.0 (exposed to network)${NC}"
    ((warnings++))
else
    echo -e "  ${GREEN}✅ No services exposed to 0.0.0.0${NC}"
    ((passed++))
fi

# 6. Check Next.js security headers
echo ""
echo "[6/12] Checking Next.js security headers..."
if grep -q "X-Frame-Options\|X-Content-Type-Options" next.config.ts; then
    echo -e "  ${GREEN}✅ Security headers configured${NC}"
    ((passed++))
else
    echo -e "  ${YELLOW}⚠️  WARNING: Missing security headers in next.config.ts${NC}"
    ((warnings++))
fi

# 7. Check for debug code
echo ""
echo "[7/12] Scanning for debug code..."
debug_count=$(grep -r "console\.log\|debugger\|console\.debug" src/ 2>/dev/null | wc -l)
if [ $debug_count -gt 50 ]; then
    echo -e "  ${YELLOW}⚠️  WARNING: Found $debug_count console.log statements${NC}"
    echo "    Consider removing for production"
    ((warnings++))
elif [ $debug_count -gt 0 ]; then
    echo -e "  ${GREEN}ℹ️  Found $debug_count console.log statements (acceptable)${NC}"
else
    echo -e "  ${GREEN}✅ No debug code found${NC}"
    ((passed++))
fi

# 8. Check authentication on API routes
echo ""
echo "[8/12] Checking API authentication..."
unauth_apis=$(find src/app/api -name "route.ts" -type f -exec grep -L "getServerSession\|checkAuth" {} \; 2>/dev/null | wc -l)
if [ $unauth_apis -gt 10 ]; then
    echo -e "  ${YELLOW}⚠️  WARNING: $unauth_apis API routes may lack authentication${NC}"
    echo "    Review manually for public endpoints"
    ((warnings++))
else
    echo -e "  ${GREEN}✅ Most API routes have authentication${NC}"
    ((passed++))
fi

# 9. Check for SQL injection vulnerabilities
echo ""
echo "[9/12] Scanning for SQL injection risks..."
if grep -r "prisma\.\$executeRawUnsafe\|mysql\.query.*\${" src/ 2>/dev/null | grep -v "\/\/" > /dev/null; then
    echo -e "  ${RED}❌ CRITICAL: Potential SQL injection vulnerabilities found!${NC}"
    echo "    Use parameterized queries only"
    ((issues++))
else
    echo -e "  ${GREEN}✅ No SQL injection risks detected${NC}"
    ((passed++))
fi

# 10. Check CORS configuration
echo ""
echo "[10/12] Checking CORS configuration..."
if grep -r "Access-Control-Allow-Origin.*\*" src/ 2>/dev/null > /dev/null; then
    echo -e "  ${YELLOW}⚠️  WARNING: CORS allows all origins (*)${NC}"
    echo "    Restrict to specific domains in production"
    ((warnings++))
else
    echo -e "  ${GREEN}✅ CORS is properly configured${NC}"
    ((passed++))
fi

# 11. Check for Firebase private key at root (CRITICAL)
echo ""
echo "[11/12] Checking Firebase private key exposure..."
fb_exposed=0
for f in salfanet-radius-firebase-adminsdk*.json *-adminsdk-*.json; do
    if [ -f "$f" ]; then
        echo -e "  ${RED}❌ CRITICAL: Firebase service account key exposed at root: $f${NC}"
        echo "    Run: mv $f src/lib/firebase-service-account.json && git rm --cached $f"
        ((issues++))
        fb_exposed=1
    fi
done
if [ -f "google-services.json" ]; then
    echo -e "  ${YELLOW}⚠️  WARNING: google-services.json exposed at root (belongs in mobile-app only)${NC}"
    ((warnings++))
    fb_exposed=1
fi
if [ $fb_exposed -eq 0 ]; then
    echo -e "  ${GREEN}✅ No Firebase private keys exposed at root${NC}"
    ((passed++))
fi

# 12. Check for unauthenticated test/debug routes
echo ""
echo "[12/12] Checking for test/debug API routes..."
test_routes=0
for route in src/app/api/test src/app/api/test-disconnect src/app/api/debug; do
    if [ -d "$route" ]; then
        echo -e "  ${RED}❌ CRITICAL: Unauthenticated test route exists: $route${NC}"
        echo "    Run: rm -rf $route"
        ((issues++))
        test_routes=1
    fi
done
if [ $test_routes -eq 0 ]; then
    echo -e "  ${GREEN}✅ No test/debug API routes found${NC}"
    ((passed++))
fi
echo ""
echo "========================================"
echo "Security Audit Summary"
echo "========================================"
echo -e "${GREEN}✅ Passed: $passed${NC}"
echo -e "${YELLOW}⚠️  Warnings: $warnings${NC}"
echo -e "${RED}❌ Critical Issues: $issues${NC}"
echo ""

if [ $issues -gt 0 ]; then
    echo -e "${RED}🚨 FIX CRITICAL ISSUES BEFORE DEPLOYING!${NC}"
    exit 1
elif [ $warnings -gt 3 ]; then
    echo -e "${YELLOW}⚠️  Consider addressing warnings for better security${NC}"
    exit 0
else
    echo -e "${GREEN}✅ Security audit passed!${NC}"
    exit 0
fi
