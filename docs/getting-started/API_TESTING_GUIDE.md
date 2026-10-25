# 🧪 API TESTING GUIDE

> **Comprehensive guide for testing all API endpoints in SALFANET RADIUS**

---

## 📋 **TESTING METHODS**

### **Method 1: Automated Test Suite (Recommended)**

#### **Setup:**
```bash
# Already configured in package.json
npm test
```

#### **Run specific tests:**
```bash
# Health check only
npm test -- api-integration.test.ts -t "Health"

# All customer APIs
npm test -- api-integration.test.ts -t "Customer"

# All WhatsApp APIs
npm test -- api-integration.test.ts -t "WhatsApp"
```

---

### **Method 2: Quick API Scanner**

Scan all endpoints and generate documentation:

```bash
node scripts/scan-api-endpoints.js
```

**Output:** `API_ENDPOINTS.md` with complete endpoint listing

---

### **Method 3: Automated Integration Testing**

Test all endpoints automatically:

```bash
# Make sure app is running
npm run dev

# In another terminal, run tests
node scripts/test-all-apis.js
```

**Features:**
- Tests all major endpoints
- Validates response status codes
- Measures response times
- Checks authentication protection
- Data validation tests

---

### **Method 4: Manual Testing with cURL**

#### **Health Check:**
```bash
curl http://localhost:3000/api/health
```

#### **Company Info (Public):**
```bash
curl http://localhost:3000/api/company
```

#### **Protected Endpoint (Should fail):**
```bash
curl http://localhost:3000/api/pppoe
# Expected: 401 Unauthorized
```

#### **With Authentication:**
```bash
# First, login to get token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}' \
  | jq -r '.token')

# Then use token
curl http://localhost:3000/api/pppoe \
  -H "Authorization: Bearer $TOKEN"
```

#### **POST Request Example:**
```bash
curl -X POST http://localhost:3000/api/customer/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"08123456789"}'
```

---

### **Method 5: Postman Collection**

#### **Generate Postman Collection:**

1. **Scan endpoints:**
   ```bash
   node scripts/scan-api-endpoints.js
   ```

2. **Import to Postman:**
   - Open Postman
   - Import → Link → `http://localhost:3000/api/*`
   - Or manually create from `API_ENDPOINTS.md`

3. **Set environment variables:**
   ```json
   {
     "base_url": "http://localhost:3000",
     "auth_token": "{{token}}"
   }
   ```

---

### **Method 6: VS Code REST Client**

Install **REST Client** extension, then create `api-tests.http`:

```http
### Health Check
GET http://localhost:3000/api/health

### Company Info
GET http://localhost:3000/api/company

### Customer Auth - Send OTP
POST http://localhost:3000/api/customer/auth/send-otp
Content-Type: application/json

{
  "phone": "08123456789"
}

### Login (Get Token)
# @name login
POST http://localhost:3000/api/auth/signin
Content-Type: application/json

{
  "email": "admin@test.com",
  "password": "password"
}

### Use Token for Protected Route
@token = {{login.response.body.token}}

GET http://localhost:3000/api/pppoe
Authorization: Bearer {{token}}
```

---

## 🎯 **TEST SCENARIOS**

### **1. Health & Availability**
- ✅ Health check returns 200
- ✅ Database connected
- ✅ Memory usage within limits
- ✅ Response time < 200ms

### **2. Authentication**
- ✅ Public endpoints accessible without auth
- ✅ Protected endpoints return 401 without token
- ✅ Valid token grants access
- ✅ Invalid token rejected

### **3. Data Validation**
- ✅ Missing required fields return 400
- ✅ Invalid data format rejected
- ✅ SQL injection prevented
- ✅ XSS attacks blocked

### **4. CRUD Operations**
- ✅ CREATE: POST returns 201 with new ID
- ✅ READ: GET returns correct data
- ✅ UPDATE: PUT/PATCH modifies data
- ✅ DELETE: Removes data properly

### **5. Error Handling**
- ✅ 404 for non-existent routes
- ✅ 500 errors logged properly
- ✅ Error messages user-friendly
- ✅ Stack traces hidden in production

### **6. Performance**
- ✅ Response time < 200ms for simple queries
- ✅ Pagination works for large datasets
- ✅ Database queries optimized
- ✅ No memory leaks

---

## 📊 **API ENDPOINT CATEGORIES**

### **Public APIs (No Auth Required):**
- `/api/health` - Health check
- `/api/company/info` - Company info
- `/api/public/*` - Public data (company, areas, profiles, payment-gateways, stats, promo-banners)
- `/api/customer/auth/*` - Customer login/OTP

### **Admin Protected APIs:**
- `/api/pppoe/*` - PPPoE users management
- `/api/hotspot/*` - Hotspot vouchers
- `/api/invoices` - Invoice management
- `/api/network/routers` - Routers / NAS
- `/api/backup` - Backup & restore
- `/api/whatsapp/*` - WhatsApp integration
- `/api/tickets/*` - Support tickets
- `/api/system/*` - System settings

### **Customer Portal APIs:**
- `/api/customer/invoices` - Customer invoices
- `/api/customer/wifi` - WiFi management
- `/api/customer/upgrade` - Package upgrade

### **Technician APIs:**
- `/api/technician/tickets` - Tiket (daftar, klaim, status, balasan, `?ticketId=` untuk percakapan)
- `/api/technician/customers` - Data pelanggan

---

## 🚀 **QUICK START TESTING**

### **1. Start Development Server:**
```bash
npm run dev
```

### **2. Generate API Documentation:**
```bash
node scripts/scan-api-endpoints.js
# Creates: API_ENDPOINTS.md
```

### **3. Run Automated Tests:**
```bash
# Quick test (basic endpoints)
node scripts/test-all-apis.js

# Full test suite
npm test
```

### **4. Manual Testing:**
```bash
# Health check
curl http://localhost:3000/api/health

# Company info
curl http://localhost:3000/api/company

# Test protected endpoint (should fail)
curl http://localhost:3000/api/pppoe
```

---

## 📈 **PERFORMANCE BENCHMARKS**

Expected response times:
- **Health Check:** < 50ms
- **Simple GET:** < 100ms
- **Database Query:** < 200ms
- **Complex Query:** < 500ms
- **File Upload:** < 2000ms

---

## 🔍 **DEBUGGING TIPS**

### **Check Server Logs:**
```bash
# PM2 logs
pm2 logs salfanet-backend

# Or file logs
tail -f logs/out.log
tail -f logs/error.log
```

### **Development Server:**
```bash
pnpm dev:all   # frontend (3000) and backend (3001) together
```
Errors are printed to the terminal. There is no `DEBUG` or `LOG_LEVEL` setting.

### **Database Queries:**
```bash
# Look at the table directly
mysql -u salfanet -p salfanet_radius -e "SELECT id, jobType, status, startedAt FROM cron_history ORDER BY startedAt DESC LIMIT 10;"
```

### **Network Issues:**
```bash
# Check port 3000
netstat -ano | findstr :3000

# Test localhost
curl -v http://localhost:3000/api/health
```

---

## 📝 **TEST CHECKLIST**

### **Before Deployment:**
- [ ] All health checks passing
- [ ] Authentication working
- [ ] CRUD operations functional
- [ ] Error handling proper
- [ ] Response times acceptable
- [ ] No console errors
- [ ] No memory leaks
- [ ] Database connections stable

### **Production Testing:**
- [ ] SSL certificate valid
- [ ] All domains resolving
- [ ] CORS configured correctly
- [ ] Rate limiting active
- [ ] Payment gateways working
- [ ] Email notifications sending
- [ ] WhatsApp integration active
- [ ] FreeRADIUS authenticating

---

## 🆘 **TROUBLESHOOTING**

### **API Returns 500:**
```bash
# Check logs
pm2 logs salfanet-backend --err

# Check database
mysql -u root -p -e "SHOW PROCESSLIST;"
```

### **Authentication Fails:**
```bash
# Check session
# Verify NEXTAUTH_SECRET in .env

# Test login endpoint
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test"}'
```

### **Slow Responses:**
```bash
# Check database queries
# Enable query logging in Prisma

# Check memory
pm2 monit

# Check database connections
mysql -e "SHOW STATUS LIKE 'Threads_connected';"
```

---

## 📚 **RESOURCES**

- **Vitest Docs:** https://vitest.dev
- **Postman:** https://www.postman.com
- **REST Client (VS Code):** https://marketplace.visualstudio.com/items?itemName=humao.rest-client
- **cURL Docs:** https://curl.se/docs/

---

**Last Updated:** March 27, 2026  
**Version:** SALFANET RADIUS v2.11.6
