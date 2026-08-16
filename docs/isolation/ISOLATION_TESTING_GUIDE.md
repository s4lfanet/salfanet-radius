# 🧪 Testing Guide: Isolation System

**Date**: February 2, 2026  
**Version**: 2.0 (Enhanced with Auto-Detection)

---

## 📋 Testing Checklist

### ✅ Phase 1: Basic Setup

- [ ] MikroTik firewall configured (IP pool, profile, filter, NAT)
- [ ] Payment gateway address-list added
- [ ] Nginx/Traefik passes X-Real-IP header
- [ ] Middleware enabled (`src/proxy.ts`)
- [ ] Cron service running (`pm2 list`)

### ✅ Phase 2: Manual Isolation Test

#### Test 1: Isolate User via Admin Panel

1. **Login as Admin** → `http://localhost:3000/admin`

2. **Go to Isolated Users Monitor** → `/admin/isolated-users`

3. **Manually isolate a test user**:
   ```bash
   curl -X PUT http://localhost:3000/api/pppoe/users/status \
     -H "Content-Type: application/json" \
     -H "Cookie: <auth_cookie>" \
     -d '{"userId": "USER_ID", "status": "isolated"}'
   ```

4. **Check database**:
   ```sql
   SELECT username, status FROM pppoe_users WHERE username = 'testuser123';
   -- Should show: status = 'isolated'
   
   SELECT * FROM radusergroup WHERE username = 'testuser123';
   -- Should show: groupname = 'isolir'
   
   SELECT * FROM radacct WHERE username = 'testuser123' AND acctstoptime IS NULL;
   -- Should be empty (session closed)
   ```

5. **Expected Result**:
   - ✅ User status changed to `isolated`
   - ✅ radusergroup set to `isolir`
   - ✅ Session disconnected
   - ✅ User can still login (password not removed)

---

### ✅ Phase 3: PPPoE Re-Login Test

#### Test 2: User Re-Login with Isolated Profile

1. **User attempts to login via PPPoE**

2. **FreeRADIUS checks**:
   - Check radcheck: password should exist ✅
   - Check radcheck: NO Auth-Type=Reject ✅
   - Check radusergroup: groupname = 'isolir' ✅

3. **Expected RADIUS Reply**:
   ```
   Framed-IP-Address = 192.168.200.50  (from pool-isolir)
   Mikrotik-Address-Pool = "pool-isolir"
   Mikrotik-Rate-Limit = "64k/64k"
   ```

4. **Verify on MikroTik**:
   ```routeros
   /ppp active print where name=testuser123
   ```
   
   **Expected output**:
   ```
   name="testuser123" 
   address=192.168.200.50 
   profile="isolir"
   ```

5. **Test connection**:
   ```bash
   # From user device
   ping 8.8.8.8  # Should work (ICMP allowed)
   curl http://google.com  # Should redirect to billing server
   ```

---

### ✅ Phase 4: Auto-Redirect Test

#### Test 3: Middleware Auto-Detection

1. **User opens browser, accesses any website**:
   ```
   User tries: http://google.com
   ```

2. **Check proxy logs**:
   ```bash
   # On server
   pm2 logs salfanet-frontend --lines 50 | grep -i isol
   ```
   
   **Expected log**:
   ```
   [MIDDLEWARE] Isolated IP detected: 192.168.200.50, redirecting to /isolated
   ```

3. **Expected behavior**:
   - Browser URL stays: `http://google.com`
   - Actual destination: `http://YOUR_SERVER_IP/isolated?ip=192.168.200.50`

4. **Check API call**:
   ```bash
   curl "http://localhost:3000/api/pppoe/users/check-isolation?ip=192.168.200.50"
   ```
   
   **Expected response**:
   ```json
   {
     "success": true,
     "isolated": true,
     "data": {
       "username": "testuser123",
       "name": "Test User",
       "phone": "081234567890",
       "email": "test@example.com",
       "expiredAt": "2026-02-01T00:00:00.000Z",
       "unpaidInvoices": [...]
     }
   }
   ```

---

### ✅ Phase 5: Isolated Page Test

#### Test 4: Display Isolation Page

1. **User sees isolation page** → `/isolated?ip=192.168.200.50`

2. **Check page content**:
   - ✅ Company logo displayed
   - ✅ Alert message: "Layanan Anda diisolir"
   - ✅ User info (username, name, expired date)
   - ✅ Unpaid invoices list
   - ✅ "Bayar Sekarang" button for each invoice
   - ✅ WhatsApp and Email contact buttons

3. **Test invoice payment link**:
   ```bash
   # Check invoice paymentLink
   curl "http://localhost:3000/api/pppoe/users/check-isolation?username=testuser123"
   ```
   
   **Expected** payment link format:
   ```
   http://YOUR_SERVER_IP/pay/<paymentToken>
   ```

---

### ✅ Phase 6: Payment Flow Test

#### Test 5: Complete Payment Flow

1. **User clicks "Bayar Sekarang"** → redirects to `/pay/<token>`

2. **Check MikroTik firewall allows**:
   ```routeros
   /ip firewall filter print stats where src-address~"192.168.200"
   ```
   
   **Expected**:
   - ✅ DNS traffic allowed (UDP 53)
   - ✅ Billing server traffic allowed (dst-address=YOUR_SERVER_IP)
   - ✅ Payment gateway traffic allowed (dst-address-list=payment-gateways)
   - ✅ Other traffic dropped

3. **User selects payment gateway** (Midtrans/Xendit/Duitku)

4. **Redirect to payment gateway**:
   ```
   https://app.midtrans.com/snap/v3/...
   ```

5. **Check firewall allows payment gateway**:
   ```routeros
   /ip firewall address-list print where list=payment-gateways
   ```
   
   **Expected domains**:
   - api.midtrans.com
   - app.midtrans.com
   - api.xendit.co
   - passport.duitku.com

6. **User completes payment** → webhook received

7. **Check webhook log**:
   ```bash
   tail -f /var/log/salfanet-radius/webhook.log
   ```

8. **Check invoice status**:
   ```sql
   SELECT invoiceNumber, status, paidAt FROM invoice WHERE userId = '<userId>';
   -- Should show: status = 'PAID', paidAt = NOW()
   ```

---

### ✅ Phase 7: Auto-Restore Test

#### Test 6: Auto-Restoration After Payment

1. **Wait for webhook processing** (realtime via payment gateway webhook)
   
   OR manually trigger cron to verify:
   ```bash
   curl -X POST http://localhost:3000/api/cron \
     -H "Content-Type: application/json" \
     -d '{"type": "pppoe_auto_isolir"}'
   ```

2. **Check user status**:
   ```sql
   SELECT username, status, expiredAt FROM pppoe_users WHERE username = 'testuser123';
   -- Should show: status = 'active', expiredAt = NOW() + 30 days
   ```

3. **Check RADIUS tables**:
   ```sql
   SELECT * FROM radusergroup WHERE username = 'testuser123';
   -- Should show: groupname = normal profile (not 'isolir')
   
   SELECT * FROM radcheck WHERE username = 'testuser123' AND attribute = 'Auth-Type';
   -- Should be empty (no Auth-Type:Reject)
   
   SELECT * FROM radreply WHERE username = 'testuser123' AND attribute = 'Framed-IP-Address';
   -- Should show: static IP restored (if configured)
   ```

4. **Check session disconnected**:
   ```sql
   SELECT * FROM radacct WHERE username = 'testuser123' AND acctstoptime IS NULL;
   -- Should be empty (old isolated session closed)
   ```

5. **User re-login** → should get normal IP and full internet access

6. **Verify on MikroTik**:
   ```routeros
   /ppp active print where name=testuser123
   ```
   
   **Expected output**:
   ```
   name="testuser123" 
   address=10.10.10.50  (NOT 192.168.200.x!)
   profile="profile-10mbps"  (NOT "isolir")
   ```

7. **Test full internet access**:
   ```bash
   # From user device
   curl http://google.com  # Should load Google normally
   curl https://youtube.com  # Should work
   speedtest  # Should show normal speed (not 64k)
   ```

---

## 🔥 Troubleshooting Tests

### Issue 1: User Can Access All Websites (Not Isolated)

**Diagnosis**:
```routeros
/ppp active print where name=testuser123
# Check if address is from pool-isolir (192.168.200.x)

/ip firewall filter print stats where src-address~"192.168.200"
# Check if rules are hit
```

**Common Causes**:
- ❌ Firewall rules not in correct order
- ❌ Profile not set to "isolir"
- ❌ IP not from isolated pool

**Fix**:
```routeros
# Move drop rule to bottom
/ip firewall filter
move [find comment="Block internet for isolated users"] \
     [find comment~"Allow" last]

# Force re-login
/ppp active remove [find name=testuser123]
```

---

### Issue 2: User Cannot Login (Auth Rejected)

**Diagnosis**:
```sql
SELECT * FROM radcheck WHERE username = 'testuser123';
-- Check if Auth-Type = 'Reject' exists
```

**Common Causes**:
- ❌ Old suspension logic (Auth-Type=Reject) still active
- ❌ Password removed from radcheck

**Fix**:
```sql
-- Remove Auth-Type Reject
DELETE FROM radcheck WHERE username = 'testuser123' AND attribute = 'Auth-Type';

-- Restore password
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('testuser123', 'Cleartext-Password', ':=', 'user_password')
ON DUPLICATE KEY UPDATE value = 'user_password';
```

---

### Issue 3: User Cannot Pay (Payment Gateway Blocked)

**Diagnosis**:
```routeros
/ip firewall address-list print where list=payment-gateways
# Check if payment gateway IPs are resolved
```

**Common Causes**:
- ❌ Payment gateway address-list not configured
- ❌ DNS not working for isolated users

**Fix**:
```routeros
# Add payment gateway address-list
/ip firewall address-list
add list=payment-gateways address=api.midtrans.com
add list=payment-gateways address=app.midtrans.com
add list=payment-gateways address=api.xendit.co
add list=payment-gateways address=passport.duitku.com

# Allow DNS
/ip firewall filter
add chain=forward src-address=192.168.200.0/24 \
    protocol=udp dst-port=53 action=accept place-before=0
```

---

### Issue 4: Redirect Not Working (No Isolated Page)

**Diagnosis**:
```bash
# Check proxy logs
pm2 logs salfanet-frontend --lines 50 | grep -i isol

# Check X-Real-IP header
curl -H "X-Real-IP: 192.168.200.50" http://localhost:3000/
```

**Common Causes**:
- ❌ Nginx not passing X-Real-IP header
- ❌ Middleware not detecting IP
- ❌ MikroTik NAT redirect misconfigured

**Fix Nginx**:
```nginx
location / {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://localhost:3000;
}
```

**Fix MikroTik NAT**:
```routeros
/ip firewall nat
# Primary: Dynamic address-list
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=80 \
    action=dst-nat to-addresses=YOUR_SERVER_IP to-ports=80

# Fallback: CIDR statis
add chain=dstnat src-address=192.168.200.0/24 protocol=tcp dst-port=80 \
    action=dst-nat to-addresses=YOUR_SERVER_IP to-ports=80
```

---

## 📊 Performance Tests

### Load Test: Multiple Isolated Users

**Scenario**: 100 users simultaneously accessing isolation page

```bash
# Install Apache Bench
apt-get install apache2-utils

# Test isolation page
ab -n 1000 -c 100 http://localhost:3000/isolated?username=testuser123

# Expected result:
# - Requests per second: > 100
# - Failed requests: 0
# - Mean time per request: < 1000ms
```

### Database Performance Test

```sql
-- Test query performance for finding active isolated sessions
EXPLAIN SELECT 
  u.username, u.name, u.status,
  r.framedipaddress, r.acctstarttime
FROM pppoe_users u
LEFT JOIN radacct r ON u.username = r.username AND r.acctstoptime IS NULL
WHERE u.status = 'isolated';

-- Should use index on:
-- - pppoe_users.status
-- - radacct.username
-- - radacct.acctstoptime
```

**Add indexes if needed**:
```sql
CREATE INDEX idx_pppoe_status ON pppoe_users(status);
CREATE INDEX idx_radacct_username_stop ON radacct(username, acctstoptime);
```

---

## ✅ Final Checklist

Before deploying to production:

- [ ] All 6 test phases passed
- [ ] Firewall rules tested and verified
- [ ] Payment gateway access confirmed
- [ ] Auto-redirect working
- [ ] Auto-restoration working
- [ ] Notifications sent (WhatsApp/Email)
- [ ] Performance acceptable (< 1s page load)
- [ ] Database indexes optimized
- [ ] Cron service running and stable
- [ ] Monitoring dashboard accessible
- [ ] Documentation complete

---

## 📞 Support

If issues persist after following this guide:

1. Check logs:
   ```bash
   # Next.js logs
   pm2 logs salfanet-frontend
   pm2 logs salfanet-backend
   
   # Cron logs
   pm2 logs salfanet-cron
   
   # FreeRADIUS logs
   tail -f /var/log/freeradius/radius.log
   
   # MikroTik logs
   /log print where topics~"ppp"
   ```

2. Review documentation:
   - [ISOLATION_SYSTEM_WORKFLOW.md](./ISOLATION_SYSTEM_WORKFLOW.md)
   - [FIREWALL_PAYMENT_INTEGRATION.md](./FIREWALL_PAYMENT_INTEGRATION.md)
   - [ISOLATION_NAT_VS_PROXY.md](./ISOLATION_NAT_VS_PROXY.md)

3. Contact support with:
   - Test results from this guide
   - Relevant logs
   - MikroTik configuration export
   - Database queries results

---

**End of Testing Guide**

*Last Updated: August 16, 2026*
