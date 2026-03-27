# SALFANET RADIUS SECURITY AUDIT - REMEDIATION ROADMAP

**Audit Date**: March 27, 2026  
**Status**: 18 Vulnerabilities Found - ALL REQUIRE ACTION  
**Review Documents**:
- `SECURITY_FIXES_CRITICAL.md` - MUST apply within 24 hours
- `SECURITY_FIXES_HIGH_PRIORITY.md` - Apply within 1 week  
- `/memories/session/security-audit-report.md` - Full audit details
- `src/lib/utils/validation.ts` - Centralized validation utility

---

## VULNERABILITY SUMMARY BY SEVERITY

### 🔴 CRITICAL (4) - RCE / System Compromise

| # | Vulnerability | File | Impact | Status |
|---|---|---|---|---|
| 1 | Command Injection (Timezone) | `src/app/api/settings/timezone/route.ts` | Remote Code Execution | ⚠️ FIX PROVIDED |
| 2 | Shell Injection (MySQL Config) | `src/app/api/settings/timezone/route.ts` | Database Compromise | ⚠️ FIX PROVIDED |
| 3 | Path Traversal (FreeRADIUS Read) | `src/app/api/freeradius/config/read/route.ts` | Read System Files | ⚠️ FIX PROVIDED |
| 4 | Path Traversal (FreeRADIUS Write) | `src/app/api/freeradius/config/save/route.ts` | Write Malicious Configs | ⚠️ FIX PROVIDED |

**Total CRITICAL Impact**: Complete system compromise  
**Time to Exploit**: < 5 minutes  
**Ease of Exploitation**: TRIVIAL - no authentication bypass needed

### 🟠 HIGH (10) - Financial Fraud / Data Breach

| # | Vulnerability | File | Impact | Status |
|---|---|---|---|---|
| 5 | Template Injection (Email XSS) | Multiple renewal routes | Email XSS, Phishing | ⚠️ FIX PROVIDED |
| 6 | MIME Type Spoofing | `src/app/api/upload/*` | Arbitrary File Upload | ⚠️ FIX PROVIDED |
| 7 | Enum Injection | Transaction/webhook routes | Bypass Business Logic | ⚠️ FIX PROVIDED |
| 8 | Negative Amount Values | Payment routes | Financial Fraud | ⚠️ FIX PROVIDED |
| 9 | SSRF in MikroTik Test | `src/app/api/network/vpn-server/test/route.ts` | Internal Network Scan | ⚠️ FIX PROVIDED |
| 10 | No Webhook Signature Verification | Payment webhook routes | Payment Fraud | ⚠️ FIX PROVIDED |
| 11 | Email Header Injection | User input in email send | Email Spoofing | ⚠️ PARTIAL |
| 12 | Phone Numbers - No Validation | Messaging routes | SMS Injection | ⚠️ FIX PROVIDED |
| 13 | Dates - No Validation | Analytics/export routes | Logic Bypass | ⚠️ FIX PROVIDED |
| 14 | File Upload DOS | Upload endpoints | Disk Space Exhaustion | ⚠️ FIX PROVIDED |

**Total HIGH Impact**: Financial loss, customer data exposure  
**Time to Exploit**: 1-30 minutes  
**Ease of Exploitation**: EASY - most don't need special tools

### 🟡 MEDIUM (4) - Data Exposure / Availability

| # | Vulnerability | Issue | Status |
|---|---|---|---|
| 15 | Rate Limiting Missing | Payment APIs unprotected | ⚠️ FIX PROVIDED |
| 16 | Search Input Too Permissive | No length/complexity limits | ⚠️ FIX PROVIDED |
| 17 | No Prisma Schema Validation | DB schema accepts huge strings | ⚠️ REVIEW SCHEMA |
| 18 | cron-service.js - execSync | Child process usage risk | ⚠️ REVIEW USAGE |

---

## REMEDIATION TIMELINE

### IMMEDIATE (24 Hours)
**Goal**: Stop active RCE and file manipulation exploits

```
Priority 1: Deploy Critical Fixes
├── 1a. Timezone API - whitelist validation + safe subprocess
│   File: SECURITY_FIXES_CRITICAL.md #1, #2
│   Test: POST /api/settings/timezone with "'; rm -rf /" 
│   Expected: 400 Bad Request
│
├── 1b. FreeRADIUS Config Read/Save - absolute path validation
│   Files: SECURITY_FIXES_CRITICAL.md #3
│   Test: GET /api/freeradius/config/read {"filename": "../../../etc/passwd"}
│   Expected: 403 Access Denied
│
└── 1c. Validation Utility - implement centralized validation
    File: src/lib/utils/validation.ts
    Test: Run unit tests on all functions
```

**Deployment Steps**:
1. Branch: `security-critical-fixes`
2. Apply patches from `SECURITY_FIXES_CRITICAL.md`
3. Test each endpoint manually
4. Review code with security team
5. Deploy to staging → production
6. Monitor error logs for false positives

**Rollback Plan**: Keep backup of original files, revert if >10 errors/hour

---

### WEEK 1 (1-7 Days)
**Goal**: Prevent financial fraud and data theft

```
Priority 2: Deploy HIGH Severity Fixes
├── 2a. Email/WhatsApp Template Injection
│   Files: renewal routes (3 files)
│   Implementation: Use escapeHtml() from validation.ts
│   Test: Create invoice with name="<img src=x onerror=alert('xss')>"
│   Expected: HTML escaped in email template
│
├── 2b. File Upload MIME Validation
│   Files: 3 upload endpoints
│   Implementation: Install file-type, use magic bytes check
│   Test: Upload PHP file with .jpg extension
│   Expected: 400 Invalid file type
│
├── 2c. Payment Input Validation
│   Files: Payment/transaction routes
│   Implementation: Use validateAmount(), validateEnum()
│   Test: POST /api/payment/create {"amount": -1000000}
│   Expected: 400 Invalid amount
│
├── 2d. Date/Enum Validation
│   Files: Analytics/transaction routes
│   Implementation: Use validateDateRange(), validateEnum()
│   Tests: Invalid dates, enum values
│   Expected: 400 Bad Request
│
├── 2e. Webhook Signature Verification
│   Files: Payment webhook routes
│   Implementation: Verify signatures, check idempotency
│   Test: Send webhook with invalid signature
│   Expected: 401 Unauthorized
│
└── 2f. Network Endpoint Protection
    Files: MikroTik test route
    Implementation: IP validation, port validation, rate limit
    Test: POST with private IP 192.168.1.1
    Expected: 403 Forbidden
```

**Code Review Checklist**:
- [ ] All template variables escaped with escapeHtml()
- [ ] All enum values whitelisted
- [ ] All amounts validated (positive, max_safe_int)
- [ ] All dates validated (format, range)
- [ ] All file uploads use magic bytes check
- [ ] All webhooks verify signatures
- [ ] Validation utility fully tested

**Testing Requirements**:
```bash
# Run security tests
npm run test:security

# Manual testing
npm run dev

# Test each endpoint with payloads from docs
# Capture screenshots showing "400 Bad Request" for malicious input
```

---

### WEEK 2-3 (8-21 Days)
**Goal**: Harden against DOS and advanced attacks

```
Priority 3: Deploy MEDIUM Severity Fixes
├── 3a. Rate Limiting
│   Package: @upstash/ratelimit
│   Implementation: Add to payment APIs
│   Config: 10 reqs/min per IP
│   Test: Rapid fire 20 requests
│   Expected: 429 Too Many Requests
│
├── 3b. File Upload Quotas
│   Implementation: Track user monthly quota (100MB)
│   Database: Create uploadQuota table
│   Test: Upload 101MB in month
│   Expected: 413 Quota Exceeded
│
├── 3c. Search Input Length Limits
│   Implementation: Max 100 chars, sanitize special chars
│   Test: POST with 10MB search string
│   Expected: 400 Too Long
│
├── 3d. cron-service.js Audit
│   Review: All shell commands
│   Check: No user input in exec()
│   Refactor: Use safe subprocess methods
│
└── 3e. Database Schema Hardening
    Review: String field limits
    Update: Add constraints where missing
    Tests: Try to insert 1MB strings
```

---

### WEEK 4+ (Ongoing)
**Goal**: Maintain security posture

```
Priority 4: Long-term Security Program
├── 4a. Automated Security Tests
│   Setup: SAST (SonarQube) + DAST (ZAP)
│   Schedule: Daily runs
│   Alerts: Slack notifications on new issues
│
├── 4b. Code Review Process
│   Requirement: All API changes reviewed
│   Checklist: Input validation, error handling
│
├── 4c. Dependency Updates
│   Schedule: Weekly npm audit
│   Test: After each major update
│
├── 4d. Security Training
│   Team: OWASP Top 10 + injection vulnerabilities
│   Frequency: Quarterly
│
└── 4e. Penetration Testing
    Schedule: Quarterly
    Scope: All API endpoints
    Report: Document and track findings
```

---

## TESTING & VALIDATION

### Unit Tests Required

Create `tests/security.test.ts`:

```typescript
import { 
  validateEmail, 
  validateAmount, 
  validateTimezone,
  escapeHtml 
} from '@/lib/utils/validation';

describe('Security Validation', () => {
  describe('validateEmail', () => {
    it('should reject emails with newlines', () => {
      expect(() => validateEmail('user@test.com\nBcc: all@company.com'))
        .toThrow('Invalid email');
    });
    
    it('should reject emails > 254 chars', () => {
      const longEmail = 'a'.repeat(255) + '@test.com';
      expect(() => validateEmail(longEmail))
        .toThrow('too long');
    });
  });

  describe('validateAmount', () => {
    it('should reject negative amounts', () => {
      expect(() => validateAmount(-1000, { allowNegative: false }))
        .toThrow('cannot be negative');
    });
    
    it('should reject amounts > MAX_SAFE_INTEGER', () => {
      expect(() => validateAmount(Number.MAX_SAFE_INTEGER + 1))
        .toThrow('exceeds maximum');
    });
  });

  describe('validateTimezone', () => {
    it('should only accept whitelisted timezones', () => {
      expect(() => validateTimezone('Asia/Jakarta')).not.toThrow();
      expect(() => validateTimezone('"; rm -rf /"')).toThrow('Invalid timezone');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });
});
```

### Integration Tests

```bash
# Test critical endpoints with payloads

# 1. Timezone RCE
curl -X POST http://localhost:3000/api/settings/timezone \
  -H "Content-Type: application/json" \
  -d '{"timezone": "'; id; '"}' \
  # Expected: 400 Invalid timezone

# 2. Path Traversal
curl -X POST http://localhost:3000/api/freeradius/config/read \
  -H "Content-Type: application/json" \
  -d '{"filename": "../../etc/passwd"}' \
  # Expected: 403 Access Denied

# 3. Payment Fraud
curl -X POST http://localhost:3000/api/payment/create \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "INV-1", "amount": -1000000, "gateway": "midtrans"}' \
  # Expected: 400 Invalid amount

# 4. File Upload RCE
curl -X POST http://localhost:3000/api/upload/payment-proof \
  -F "file=@shell.php" \
  -F "file_type=image/jpeg" \
  # Expected: 400 Invalid file type (magic bytes check)
```

---

## MONITORING & ALERTS

### Logging

Add to all API routes:

```typescript
// Log suspicious input
try {
  validateInput(userInput);
} catch (error) {
  logger.warn('Validation failed', {
    endpoint: req.path,
    input: userInput.substring(0, 100), // Don't log entire payload
    error: error.message,
    ip: req.headers['x-forwarded-for'],
    userId: session?.user?.id,
  });
  
  // Alert if >10 failed validations from same IP in 5 mins
}
```

### Alerts to Configure

```
Rule 1: Timezone API 400+ errors
  Threshold: >5 in 5 minutes
  Level: WARNING
  Action: Notify security team

Rule 2: Path Traversal attempts
  Pattern: "\.\./" in filename
  Level: CRITICAL
  Action: Immediately block IP, page

Rule 3: Payment fraud attempts
  Pattern: negative amounts
  Level: HIGH
  Action: Block account, investigate

Rule 4: File upload magic bytes fail
  Pattern: MIME mismatch
  Level: MEDIUM
  Action: Log attempt, inform user
```

---

## DOCUMENTATION

### Updated README for Security

Add to `README.md`:

```markdown
## 🔒 Security

This project contains API endpoints handling financial transactions and 
customer data. Security is critical.

### Authentication
- All protected endpoints require NextAuth session
- Admin endpoints require SUPER_ADMIN role

### Input Validation
- All user input validated using `src/lib/utils/validation.ts`
- Type whitelist for enum values
- Magic bytes validation for file uploads
- HTML escaping for email/template content

### Secrets Management
- Use environment variables for all secrets
- Never commit .env files
- Rotate API keys monthly
- Use strong database passwords

### File Uploads
- Validated using magic bytes (not MIME type)
- Re-encoded to strip embedded code
- Limited to 2MB per file
- User quota: 100MB per month
- Stored outside webroot

### API Webhooks
- All webhooks verify cryptographic signatures
- Idempotency checked to prevent duplicate processing
- Raw body logged for audit trail

### Regular Audits
- SAST checks: daily
- DAST checks: weekly
- Penetration test: quarterly
- Code review: all PRs
```

---

## DEPLOYMENT CHECKLIST

Before deploying any security fix:

- [ ] Code reviewed by 2+ developers
- [ ] Unit tests pass (new + existing)
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Error logs monitored for false positives
- [ ] Rollback plan prepared
- [ ] Staging deployed 24h before production
- [ ] Performance impact tested (<5% latency increase)
- [ ] Database migrations tested
- [ ] Customer notification prepared (if needed)

---

## ROLES & RESPONSIBILITIES

### Security Team
- [ ] Review all fixes
- [ ] Lead penetration testing
- [ ] Configure monitoring & alerts
- [ ] Security training

### Development Team
- [ ] Implement fixes
- [ ] Write tests
- [ ] Code review
- [ ] Deploy to staging/prod

### DevOps Team
- [ ] Deploy fixes
- [ ] Configure alerts
- [ ] Monitor production
- [ ] Maintain security infrastructure

### Project Manager
- [ ] Track remediation progress
- [ ] Coordinate with stakeholders
- [ ] Manage timeline
- [ ] Report status to executives

---

## COMPLIANCE & AUDIT TRAIL

### Documented
- [x] Vulnerabilities identified
- [x] Fixes provided with examples
- [x] Testing procedures documented
- [x] Timeline established
- [ ] Implemented in code
- [ ] Deployed to production
- [ ] Verified in production
- [ ] Audit report completed

### Required for Compliance
- Proof of fixes in git commit history
- Test results/screenshots
- Monitoring confirmed active
- Audit report written
- Sign-off from security lead

---

## FAQ

### Q: Can we delay these fixes?
**A**: NO. Vulnerabilities rated CRITICAL can be exploited in <5 minutes with no special tools.

### Q: Will these fixes break existing functionality?
**A**: Unlikely. Validation should only reject truly invalid input. Monitor error rates closely.

### Q: Which fix is most urgent?
**A**: Timezone API (RCE). It executes system commands with user input. Disable immediately:
```typescript
// Disable timezone endpoint until fixed
export async function POST() {
  return NextResponse.json(
    { error: 'Feature currently unavailable for maintenance' },
    { status: 503 }
  );
}
```

### Q: What about the other 4 CRITICAL issues?
**A**: All 4 must be fixed ASAP. They all allow attackers to read/write system files.

### Q: Do we need penetration testing?
**A**: YES. After fixes are deployed, hire a professional to verify they work.

---

END OF REMEDIATION ROADMAP

**Last Updated**: March 27, 2026  
**Next Review**: April 3, 2026 (after critical fixes deployed)
