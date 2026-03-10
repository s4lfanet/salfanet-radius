# Mobile App - Next Steps Checklist

Checklist lengkap untuk menyelesaikan implementasi mobile app SALFANET RADIUS.

---

## 🎉 UPDATE: npm install Fixed!

**Date**: February 17, 2026  
**Status**: ✅ All dependency errors resolved  

Masalah yang sudah diperbaiki:
- ✅ Dependency conflicts (React version mismatch)
- ✅ Missing babel.config.js
- ✅ Missing metro.config.js  
- ✅ Missing @expo/vector-icons
- ✅ Asset reference errors in app.json

Lihat [ERROR_FIXES.md](ERROR_FIXES.md) untuk detail lengkap perbaikan.

**Sekarang bisa langsung**:
```bash
cd mobile-app
npm install  # ✅ SUCCESS!
npm start    # Ready to run!
```

---

## ✅ SELESAI (85%)

### Phase 1: Setup & Configuration
- [x] Install Expo & React Native
- [x] Setup TypeScript
- [x] Configure Expo Router
- [x] Setup EAS Build
- [x] Create .env.example
- [x] Create .gitignore

### Phase 2: Services & State Management
- [x] HTTP client dengan Axios
- [x] Authentication service
- [x] Dashboard service
- [x] Invoice service
- [x] Payment service  
- [x] Notification service (FCM)
- [x] Zustand stores (auth, notifications)
- [x] React Query hooks

### Phase 3: Screens & UI
- [x] Root layout dengan auth routing
- [x] Login screen
- [x] Tab navigation layout
- [x] Dashboard screen (4 cards)
- [x] Invoices screen (dengan filter)
- [x] Payments screen (history)
- [x] Profile screen

### Phase 4: Documentation
- [x] Complete README.md (300+ lines)
- [x] Installation guide
- [x] Development guide
- [x] Build & deployment guide
- [x] API endpoints documentation
- [x] Troubleshooting guide
- [x] Implementation summary doc

---

## ⚠️ TODO - Backend (CRITICAL)

### Backend API Endpoints (Estimasi: 3-4 jam)

Buat folder: `src/app/api/customer/`

#### Authentication Endpoints
- [ ] `POST /api/customer/login` - Customer login dengan username/password
  - Input: `{ username: string, password: string }`
  - Output: `{ token: string, user: User }`
  - Validasi: Check dari tabel `pppoeUser` where `role = 'customer'`
  
- [ ] `GET /api/customer/profile` - Get customer profile
  - Auth: Required (Bearer token)
  - Output: User object dengan semua field

#### Dashboard Endpoints
- [ ] `GET /api/customer/dashboard` - Dashboard summary
  - Return: User info, usage stats, invoice summary, session status
  - Query: Join pppoeUser, radacct, invoices
  
- [ ] `GET /api/customer/usage` - Usage statistics
  - Return: Upload, download, total (in GB)
  - Source: Table `radacct` aggregate

#### Invoice Endpoints
- [ ] `GET /api/customer/invoices` - List invoices
  - Params: `?page=1&status=unpaid`
  - Return: Paginated invoice list
  - Filter: paid, unpaid, overdue
  
- [ ] `GET /api/customer/invoices/:id` - Invoice detail
  - Auth: Check invoice belongs to logged user
  - Return: Full invoice object

- [ ] `GET /api/customer/invoices/:id/download` - Download PDF
  - Return: PDF file (use existing PDF generator)

#### Payment Endpoints
- [ ] `GET /api/customer/payments` - Payment history
  - Params: `?page=1`
  - Return: Paginated payment list dengan invoice info
  
- [ ] `POST /api/customer/payments` - Create payment
  - Body: `{ invoiceId, amount, paymentMethod }`
  - Create record di tabel `payments` dengan status PENDING
  
- [ ] `POST /api/customer/payments/:id/proof` - Upload payment proof
  - Body: FormData with image file
  - Save file & update payment record

#### Notification Endpoints
- [ ] `POST /api/customer/fcm/register` - Register FCM token
  - Body: `{ token: string, deviceId: string, platform: string }`
  - Save to new table `customer_fcm_tokens`
  
- [ ] `GET /api/customer/notifications` - Get notifications
  - Return: List notifications dari tabel
  
- [ ] `PUT /api/customer/notifications/:id/read` - Mark as read
  - Update `isRead = true`

#### Database Changes
- [ ] Buat tabel baru `customer_fcm_tokens`:
  ```sql
  CREATE TABLE customer_fcm_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    fcm_token VARCHAR(255) NOT NULL,
    device_id VARCHAR(100),
    platform ENUM('android', 'ios'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES pppoeUser(id),
    UNIQUE KEY unique_device (user_id, device_id)
  );
  ```

- [ ] Atau tambah kolom di `pppoeUser`:
  ```sql
  ALTER TABLE pppoeUser 
  ADD COLUMN fcm_token VARCHAR(255),
  ADD COLUMN fcm_device_id VARCHAR(100),
  ADD COLUMN fcm_platform VARCHAR(10);
  ```

#### Middleware
- [ ] Create customer auth middleware:
  - Verify JWT token
  - Check user role = 'customer'
  - Attach user to request object

#### Testing
- [ ] Test semua endpoints dengan Postman/http file
- [ ] Pastikan return data sesuai TypeScript interface di mobile
- [ ] Test error handling (401, 404, 500)

---

## 🎨 TODO - Assets (Estimasi: 1-2 jam)

### Required Images (5 files)

- [ ] **App Icon** (`assets/icon.png`)
  - Size: 1024x1024px
  - Logo SALFANET dengan background
  - Format: PNG

- [ ] **Adaptive Icon** (`assets/adaptive-icon.png`)
  - Size: 1024x1024px
  - Logo only, center 512x512px safe area
  - Transparent background
  - Format: PNG

- [ ] **Splash Screen** (`assets/splash.png`)
  - Size: 1284x2778px
  - Logo + brand di center
  - Background warna brand (#1976d2)
  - Format: PNG

- [ ] **Login Logo** (`assets/logo.png`)
  - Size: 120x120px minimum
  - Transparent background
  - Format: PNG

- [ ] **Notification Icon** (`assets/notification-icon.png`)
  - Size: 96x96px
  - White silhouette on transparent
  - Format: PNG

### Options:
1. **Design sendiri** dengan Figma/Illustrator
2. **Hire designer** di Fiverr/Upwork (~$20-50)
3. **Use generator tools**:
   - https://appicon.co/
   - https://icon.kitchen/
4. **Temporary placeholders** untuk testing (bisa pakai huruf "S" saja)

---

## 🧪 TODO - Testing (Estimasi: 2-3 jam)

### Local Development Testing

- [ ] Install dependencies:
  ```bash
  cd mobile-app
  npm install
  ```

- [ ] Setup environment:
  ```bash
  cp .env.example .env
  # Edit .env dengan backend URL (gunakan IP lokal, bukan localhost)
  ```

- [ ] Start Expo:
  ```bash
  npm start
  ```

- [ ] Test di Expo Go (physical device):
  - [ ] Scan QR code
  - [ ] App terbuka tanpa crash
  - [ ] Login screen muncul

### Feature Testing

- [ ] **Authentication**:
  - [ ] Login dengan username/password yang benar
  - [ ] Error message jika credentials salah
  - [ ] Token tersimpan di SecureStore
  - [ ] Auto redirect ke dashboard setelah login
  
- [ ] **Dashboard**:
  - [ ] 4 cards muncul dengan data yang benar
  - [ ] Pull-to-refresh berfungsi
  - [ ] Auto-refresh every 30s
  - [ ] Data real-time dari backend
  
- [ ] **Invoices**:
  - [ ] List invoices muncul
  - [ ] Filter tabs berfungsi (Semua, Belum Bayar, Lunas, Jatuh Tempo)
  - [ ] "Bayar Sekarang" button muncul untuk unpaid
  - [ ] Invoice amount formatted dengan Rp
  
- [ ] **Payments**:
  - [ ] Payment history muncul
  - [ ] Status chips dengan warna yang benar
  - [ ] "Tambah Pembayaran" FAB berfungsi
  
- [ ] **Profile**:
  - [ ] User info muncul dengan benar
  - [ ] Logout confirmation muncul
  - [ ] Logout berfungsi (redirect ke login)

### Platform Testing

- [ ] **Android**:
  - [ ] Test di emulator: `npm run android`
  - [ ] Test di physical device
  - [ ] Check app icon di home screen
  - [ ] Check splash screen
  
- [ ] **iOS** (jika ada macOS):
  - [ ] Test di simulator: `npm run ios`
  - [ ] Test di physical device (via TestFlight)

---

## 🔔 TODO - Firebase Setup (Estimasi: 1 jam)

### Firebase Console

- [ ] Buat project baru di https://console.firebase.google.com/
- [ ] Project name: "SALFANET RADIUS Mobile"

### Android Setup

- [ ] Add Android app
- [ ] Package name: `com.salfanet.radius`
- [ ] Download `google-services.json`
- [ ] Copy ke `mobile-app/google-services.json`

### iOS Setup (optional)

- [ ] Add iOS app
- [ ] Bundle ID: `com.salfanet.radius`
- [ ] Download `GoogleService-Info.plist`
- [ ] Copy ke `mobile-app/GoogleService-Info.plist`

### FCM Configuration

- [ ] Go to Project Settings → Cloud Messaging
- [ ] Copy **Server Key**
- [ ] Copy **Sender ID**
- [ ] Add ke `.env`:
  ```
  FCM_SERVER_KEY=your_server_key_here
  FCM_SENDER_ID=your_sender_id
  ```

### Testing Push Notifications

- [ ] Run app di device
- [ ] Check console log untuk FCM token
- [ ] Test send notification dari Firebase Console:
  - Cloud Messaging → Send test message
  - Paste FCM token
  - Send
- [ ] Notification harus muncul di device

---

## 📦 TODO - Production Build (LATER)

### EAS Account Setup

- [ ] Login to Expo:
  ```bash
  eas login
  ```

- [ ] Link project:
  ```bash
  cd mobile-app
  eas build:configure
  ```

### Android Build

- [ ] Build preview APK (untuk testing):
  ```bash
  eas build --platform android --profile preview
  ```

- [ ] Test APK di device

- [ ] Build production AAB:
  ```bash
  eas build --platform android --profile production
  ```

### iOS Build (jika ada macOS)

- [ ] Setup Apple Developer account ($99/year)

- [ ] Build production:
  ```bash
  eas build --platform ios --profile production
  ```

---

## 🚀 TODO - Deployment

### Play Store (Android)

- [ ] Buat akun Google Play Console ($25 one-time)
- [ ] Create new app
- [ ] Fill app details:
  - [ ] App name
  - [ ] Description
  - [ ] Screenshots (4-8 images)
  - [ ] Icon
  - [ ] Feature graphic
  - [ ] Privacy policy URL
- [ ] Upload AAB file
- [ ] Submit untuk internal testing
- [ ] Test di internal testing
- [ ] Submit untuk production review
- [ ] Wait for approval (1-3 days)

### App Store (iOS)

- [ ] Buat Apple Developer account ($99/year)
- [ ] Create app di App Store Connect
- [ ] Fill app metadata
- [ ] Upload screenshots
- [ ] Submit for TestFlight testing
- [ ] Submit for App Store review
- [ ] Wait for approval (1-7 days)

---

## ⏱️ Time Estimation Summary

| Task | Priority | Time | Status |
|------|----------|------|--------|
| Backend API endpoints | CRITICAL | 3-4 hours | ⏳ TODO |
| Image assets | HIGH | 1-2 hours | ⏳ TODO |
| Local testing | MEDIUM | 2-3 hours | ⏳ TODO |
| Firebase setup | MEDIUM | 1 hour | ⏳ TODO |
| Production build | LOW | 2 hours | ⏳ LATER |
| App Store submission | LOW | 4-6 hours | ⏳ LATER |

**Total to MVP**: 7-10 hours  
**Total to Production**: 15-20 hours

---

## 🎯 Recommended Workflow

### Week 1: Core Functionality
**Day 1-2**: Backend API endpoints (3-4h)
- Implement all 11 endpoints
- Test dengan Postman
- Fix bugs

**Day 3**: Integration Testing (3h)
- Setup .env dengan backend URL
- Test mobile app dengan real API
- Fix integration issues

**Day 4**: Assets & Polish (2h)
- Add image assets
- Test UI/UX
- Minor adjustments

### Week 2: Push Notifications & Testing
**Day 5**: Firebase Setup (1h)
- Setup Firebase project
- Configure FCM
- Test push notifications

**Day 6-7**: Complete Testing (4h)
- Test all features thoroughly
- Fix bugs
- Performance testing

### Week 3: Production (optional, bisa nanti)
**Day 8-10**: Build & Deploy
- Production builds
- App Store submissions
- Handle review feedback

---

## 📝 Notes

- **Backend API adalah blocker utama** - Mobile app tidak bisa ditest tanpa backend endpoints
- **Assets bisa pakai placeholder dulu** untuk testing
- **Firebase setup bisa ditunda** jika push notification tidak urgent
- **Production build bisa nanti** setelah semua features stable

---

**Priority NOW**:
1. ⚠️ Backend API endpoints (3-4 hours)
2. 🎨 Image assets atau placeholders (1 hour)
3. 🧪 Test integration (2 hours)

After that, mobile app is **fully functional** dan ready untuk production!

---

Last updated: February 2026
