# Customer Session Hardening — Audit & Migration Plan

## Current Architecture (as of 2026-08-16)

### Authentication Flow
1. **Login:** `POST /api/customer/auth/login` → returns `{ token }` in JSON body
2. **Token Storage:** Frontend stores token in `localStorage`
3. **API Calls:** Frontend sends `Authorization: Bearer <token>` header
4. **Verification:** Backend looks up `customerSession` table with `token` + `expiresAt > now()`
5. **Logout:** `POST /api/customer/auth/logout` → deletes session from DB
6. **Expiry:** 7 days from login

### Security Assessment

| Aspect | Status | Risk |
|--------|--------|------|
| Token generation | ✅ `nanoid(64)` — cryptographically secure | Low |
| Server-side verification | ✅ Database lookup with expiry check | Low |
| Server-side logout | ✅ Implemented (deletes DB session) | Low |
| Token storage | ⚠️ `localStorage` — vulnerable to XSS | MEDIUM |
| Token transport | ⚠️ Bearer header — not automatically sent | LOW |
| CSRF protection | ✅ No cookies → CSRF not applicable | Low |
| Session expiry | ✅ 7 days with DB enforcement | Low |
| Token revocation | ✅ DB deletion on logout | Low |

### Risk Analysis

The primary risk is **XSS-based token theft**. If an attacker injects JavaScript
(via a stored XSS vulnerability), they can read `localStorage.getItem('customerToken')`
and impersonate the customer.

However, the risk is mitigated by:
- React's default HTML escaping (prevents most XSS)
- No `dangerouslySetInnerHTML` in critical paths
- CSP headers (if configured in Nginx)
- Short-lived sessions (7 days)
- Server-side logout (stolen tokens can be invalidated)

### Migration Plan (NOT YET IMPLEMENTED)

**Do NOT implement without explicit approval — this is a breaking change.**

#### Phase A: Backend Cookie Support (additive, non-breaking)
1. Add `Set-Cookie` response to login/verify-otp endpoints
   - `customer_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`
2. Add cookie-based token extraction to `getCustomerSessionFromRequest`
   - Check `Authorization` header first (backward compat)
   - Fall back to `customer_token` cookie
3. Add cookie clearing to logout endpoint
   - `Set-Cookie: customer_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

#### Phase B: Frontend Migration (breaking if not coordinated)
1. Update API client to use `credentials: 'include'` for customer routes
2. Remove `localStorage` token storage
3. Remove `Authorization` header injection for customer routes
4. Update logout to clear cookie via server call

#### Phase C: Cleanup
1. Remove `Authorization` header support from customer endpoints
2. Remove token from login response body (cookie only)

### Recommendation

**Do not migrate now.** The current architecture is functional and the XSS risk
is mitigated. Migration should be done as part of a dedicated security sprint
with full end-to-end testing of the customer portal.

## Conclusion

The customer session architecture is **acceptable for current deployment** with
the following conditions:
- XSS prevention must be maintained (React escaping, CSP headers)
- Server-side logout is already implemented
- Token expiry is enforced server-side
- Migration to httpOnly cookies is documented for future implementation
