# 🚀 Quick Start: Isolation System

**5-Minute Setup Guide**

---

## 📋 Prerequisites

- ✅ Salfanet Radius installed and running
- ✅ MikroTik router with PPPoE server
- ✅ FreeRADIUS configured
- ✅ Payment gateway configured (Midtrans/Xendit/Duitku)

---

## 🎯 Step-by-Step Setup

### 1️⃣ Configure MikroTik (5 minutes)

**Access**: Admin → Settings → Isolation → MikroTik Setup

**Copy script** and run in MikroTik terminal:

```routeros
# IMPORTANT: Ganti YOUR_SERVER_IP dengan IP server Anda!

/ip pool
add name=pool-isolir ranges=192.168.200.2-192.168.200.254

/ppp profile
add name=isolir local-address=pool-isolir remote-address=pool-isolir rate-limit=64k/64k

/ip firewall address-list
add list=payment-gateways address=api.midtrans.com
add list=payment-gateways address=api.xendit.co
add list=payment-gateways address=passport.duitku.com

/ip firewall filter
# Primary: Dynamic address-list (di-populate oleh RADIUS Mikrotik-Address-List)
add chain=forward src-address-list=isolir protocol=udp dst-port=53 action=accept
add chain=forward src-address-list=isolir dst-address=YOUR_SERVER_IP dst-port=80,443 protocol=tcp action=accept
add chain=forward src-address-list=isolir dst-address-list=payment-gateways action=accept
add chain=forward src-address-list=isolir action=drop

# Fallback: CIDR statis
add chain=forward src-address=192.168.200.0/24 protocol=udp dst-port=53 action=accept
add chain=forward src-address=192.168.200.0/24 dst-address=YOUR_SERVER_IP dst-port=80,443 protocol=tcp action=accept
add chain=forward src-address=192.168.200.0/24 dst-address-list=payment-gateways action=accept
add chain=forward src-address=192.168.200.0/24 action=drop

/ip firewall nat
# Primary: Dynamic address-list
add chain=dstnat src-address-list=isolir protocol=tcp dst-port=80 action=dst-nat to-addresses=YOUR_SERVER_IP to-ports=80

# Fallback: CIDR statis
add chain=dstnat src-address=192.168.200.0/24 protocol=tcp dst-port=80 action=dst-nat to-addresses=YOUR_SERVER_IP to-ports=80
```

**Replace `YOUR_SERVER_IP`** with:
- Direct IP: Your router's public IP
- VPN: Your VPN server IP or domain

---

### 2️⃣ Configure FreeRADIUS Group (2 minutes)

```sql
-- Create 'isolir' group
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES 
  ('isolir', 'Framed-Pool', ':=', 'pool-isolir'),
  ('isolir', 'Mikrotik-Rate-Limit', ':=', '64k/64k'),
  ('isolir', 'Mikrotik-Address-List', ':=', 'isolir');
```

**Or via MikroTik**:
```routeros
/radius
# Group 'isolir' will be handled by radgroupreply table
```

---

### 3️⃣ Test Isolation (3 minutes)

**Test User**: Create or use existing expired user

```bash
# Manually isolate a user via admin panel or API
# Admin Panel: PPPoE Users → Click user → Change Status → Isolated
curl -X PUT http://localhost:3000/api/pppoe/users/status \
  -H "Content-Type: application/json" \
  -H "Cookie: <auth_cookie>" \
  -d '{"userId": "USER_ID", "status": "isolated"}'
```

**Expected Result**:
```json
{
  "success": true
}
```

---

### 4️⃣ Verify Setup (5 minutes)

#### Check User Status
```sql
SELECT username, status FROM pppoe_users WHERE username = 'testuser';
-- Should show: ISOLATED
```

#### Check RADIUS
```sql
SELECT * FROM radusergroup WHERE username = 'testuser';
-- Should show: groupname = 'isolir'
```

#### User Re-Login
1. User login via PPPoE
2. Check IP on MikroTik:
```routeros
/ppp active print where name=testuser
-- Should show: address=192.168.200.x
```

#### Test Browsing
1. User opens browser → `http://google.com`
2. Should redirect to: `/isolated?ip=192.168.200.x`
3. Should see: Isolation page with unpaid invoices

---

## ✅ Verification Checklist

- [ ] MikroTik script executed successfully
- [ ] `pool-isolir` created
- [ ] `isolir` PPP profile created
- [ ] Firewall rules added
- [ ] Payment gateway address-list added
- [ ] Test user isolated
- [ ] User can login (not rejected)
- [ ] User gets IP from 192.168.200.x
- [ ] Browser auto-redirects to /isolated page
- [ ] Isolation page shows unpaid invoices
- [ ] "Bayar Sekarang" button works

---

## 🔥 Quick Troubleshooting

### User Cannot Login
```sql
-- Remove Auth-Type Reject
DELETE FROM radcheck WHERE username = 'testuser' AND attribute = 'Auth-Type';
```

### User Not Redirected
```bash
# Check middleware logs
pm2 logs salfanet-radius | grep MIDDLEWARE
```

### User Can Access All Sites
```routeros
# Check firewall order
/ip firewall filter print where src-address~"192.168.200"
# Drop rule must be LAST
```

### Payment Gateway Blocked
```routeros
# Check address-list
/ip firewall address-list print where list=payment-gateways
# Should show IPs resolved from domains
```

---

## 📊 Monitor

**Dashboard**: `/admin/isolated-users`

**Statistics**:
- Total isolated users
- Online/Offline status
- Unpaid invoices
- Total unpaid amount

---

## 📚 Full Documentation

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Complete changes
- [ISOLATION_TESTING_GUIDE.md](./ISOLATION_TESTING_GUIDE.md) - Detailed testing
- [FIREWALL_PAYMENT_INTEGRATION.md](./FIREWALL_PAYMENT_INTEGRATION.md) - Firewall guide

---

## 🎯 Done!

Your isolation system is now ready. Expired users will:
1. ✅ Auto-isolated every hour (cron)
2. ✅ Can login but restricted internet
3. ✅ Auto-redirected to payment page
4. ✅ Can pay via payment gateway
5. ✅ Auto-restored after payment

**Next**: Follow [ISOLATION_TESTING_GUIDE.md](./ISOLATION_TESTING_GUIDE.md) for complete testing.

---

*Setup time: ~15 minutes*  
*Last Updated: February 2, 2026*
