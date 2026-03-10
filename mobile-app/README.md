# SALFANET RADIUS - Mobile App

Aplikasi mobile native untuk customer SALFANET RADIUS, dibangun dengan React Native dan Expo.

## 📱 Fitur

- ✅ **Authentication**: Login dengan username/password
- ✅ **Dashboard**: Info pengguna, status sesi, statistik penggunaan, ringkasan tagihan
- ✅ **Tagihan**: Daftar invoice dengan filter status (Belum Bayar, Lunas, Jatuh Tempo)
- ✅ **Pembayaran**: Riwayat pembayaran dengan upload bukti transfer
- ✅ **Profil**: Kelola informasi akun dan pengaturan
- ✅ **Push Notifications**: FCM untuk notifikasi real-time
- ✅ **Offline Support**: React Query caching untuk pengalaman offline yang lebih baik

## 🛠 Tech Stack

- **Framework**: Expo 51 + React Native 0.74
- **Language**: TypeScript 5.3
- **Navigation**: Expo Router 3.5 (file-based routing)
- **State Management**: Zustand 4.5
- **Data Fetching**: TanStack React Query 5.0
- **UI Components**: React Native Paper 5.12
- **Push Notifications**: Expo Notifications + FCM
- **Secure Storage**: Expo SecureStore
- **HTTP Client**: Axios 1.7

## 📋 Prerequisites

Pastikan sudah terinstall:

- **Node.js**: v18 atau lebih baru
- **npm** atau **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI**: `npm install -g eas-cli` (untuk building)

### Untuk Development Android:
- **Android Studio** dengan Android SDK
- **Java JDK** 17 atau lebih baru

### Untuk Development iOS (macOS only):
- **Xcode** 14 atau lebih baru
- **CocoaPods**: `sudo gem install cocoapods`

## 🚀 Installation

### 1. Install Dependencies

```bash
cd mobile-app
npm install
```

### 2. Setup Environment Variables

Copy `.env.example` ke `.env`:

```bash
cp .env.example .env
```

Edit `.env` dengan konfigurasi Anda:

```env
# Backend API URL
API_URL=http://192.168.1.100:3000

# Firebase Cloud Messaging
FCM_SERVER_KEY=your_fcm_server_key_here
FCM_SENDER_ID=your_fcm_sender_id_here

# App Environment
ENV=development
```

⚠️ **Catatan**: 
- Untuk testing di device fisik, gunakan IP lokal komputer Anda (bukan localhost)
- Untuk production, gunakan domain backend Anda

### 3. Setup Firebase (untuk Push Notifications)

1. Buat project baru di [Firebase Console](https://console.firebase.google.com/)
2. Tambahkan app Android dan/atau iOS
3. Download `google-services.json` (Android) dan/atau `GoogleService-Info.plist` (iOS)
4. Copy ke project:
   ```
   mobile-app/google-services.json
   mobile-app/GoogleService-Info.plist
   ```
5. Salin **Server Key** dan **Sender ID** ke `.env`

## 🧑‍💻 Development

### Run di Expo Go (Recommended untuk Development)

```bash
npm start
```

Scan QR code dengan:
- **Android**: Expo Go app
- **iOS**: Camera app

### Run di Android Emulator

```bash
npm run android
```

### Run di iOS Simulator (macOS only)

```bash
npm run ios
```

### Run dengan Environment Specific

```bash
# Development
npm start

# Staging (jika dikonfigurasi)
npm run start:staging

# Production (jika dikonfigurasi)
npm run start:prod
```

## 📦 Building untuk Production

### Setup EAS Build

1. Login ke Expo:
   ```bash
   eas login
   ```

2. Configure project:
   ```bash
   eas build:configure
   ```

### Build Android APK (untuk testing)

```bash
eas build --platform android --profile preview
```

### Build Android AAB (untuk Play Store)

```bash
eas build --platform android --profile production
```

### Build iOS (untuk App Store)

```bash
eas build --platform ios --profile production
```

Build profiles dikonfigurasi di `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

## 📱 Deployment

### Android - Google Play Store

1. Build production AAB:
   ```bash
   eas build --platform android --profile production
   ```

2. Download `.aab` file dari Expo dashboard

3. Upload ke [Google Play Console](https://play.google.com/console):
   - Create app
   - Fill app details
   - Upload AAB to Internal Testing atau Production
   - Complete store listing
   - Submit for review

### iOS - Apple App Store

1. Build production IPA:
   ```bash
   eas build --platform ios --profile production
   ```

2. Build akan otomatis submit ke TestFlight

3. Buka [App Store Connect](https://appstoreconnect.apple.com/):
   - Test di TestFlight
   - Complete app metadata
   - Submit for App Store review

## 🔧 Project Structure

```
mobile-app/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx   # Bottom tabs layout
│   │   ├── index.tsx     # Dashboard
│   │   ├── invoices.tsx  # Tagihan
│   │   ├── payments.tsx  # Pembayaran
│   │   └── profile.tsx   # Profil
│   ├── _layout.tsx       # Root layout
│   └── login.tsx         # Login screen
├── services/             # API services
│   ├── api.ts           # HTTP client
│   ├── auth.ts          # Authentication
│   ├── dashboard.ts     # Dashboard data
│   ├── invoice.ts       # Invoice management
│   ├── payment.ts       # Payment management
│   └── notification.ts  # Push notifications
├── store/               # State management
│   └── index.ts        # Zustand stores
├── hooks/              # Custom hooks
│   └── index.ts       # React Query hooks
├── constants/         # App constants
│   └── index.ts      # API config, colors, etc.
├── assets/           # Images, fonts, etc.
├── .env             # Environment variables
├── app.json        # Expo configuration
└── package.json   # Dependencies
```

## 🔐 Backend API Endpoints

App ini menggunakan endpoints berikut (harus tersedia di backend):

### Authentication
- `POST /api/customer/login` - Login customer
- `GET /api/customer/profile` - Get customer profile

### Dashboard
- `GET /api/customer/dashboard` - Dashboard data
- `GET /api/customer/usage` - Usage statistics

### Invoice
- `GET /api/customer/invoices` - List invoices
- `GET /api/customer/invoices/:id` - Invoice detail
- `GET /api/customer/invoices/:id/download` - Download PDF

### Payment
- `GET /api/customer/payments` - Payment history
- `POST /api/customer/payments` - Create payment
- `POST /api/customer/payments/:id/proof` - Upload payment proof

### Notifications
- `POST /api/customer/fcm/register` - Register FCM token
- `GET /api/customer/notifications` - Get notifications
- `PUT /api/customer/notifications/:id/read` - Mark as read

⚠️ **Backend Setup Required**: 
Endpoints di atas perlu dibuat di backend Next.js jika belum ada. Lihat dokumentasi backend untuk implementasi.

## 🔔 Push Notifications Setup

### Backend Integration

Backend perlu menyimpan FCM token customer dan mengirim notifikasi. Contoh implementasi:

```typescript
// Backend: Register FCM token
POST /api/customer/fcm/register
{
  "token": "fcm_token_here",
  "deviceId": "device_unique_id"
}

// Backend: Send notification
import admin from 'firebase-admin';

await admin.messaging().send({
  token: customerFcmToken,
  notification: {
    title: 'Tagihan Baru',
    body: 'Invoice #12345 sebesar Rp 250.000'
  },
  data: {
    type: 'invoice',
    invoiceId: '12345'
  }
});
```

### Database Schema (Example)

```sql
CREATE TABLE customer_fcm_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  fcm_token VARCHAR(255) NOT NULL,
  device_id VARCHAR(100),
  platform VARCHAR(10), -- 'android' or 'ios'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES pppoeUser(id),
  UNIQUE KEY unique_device (user_id, device_id)
);
```

## 🎨 Customization

### Branding

Edit di `app.json`:

```json
{
  "expo": {
    "name": "SALFANET RADIUS",
    "slug": "salfanet-radius",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png"
    },
    "android": {
      "package": "com.salfanet.radius",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png"
      }
    },
    "ios": {
      "bundleIdentifier": "com.salfanet.radius"
    }
  }
}
```

### Colors

Edit di `constants/index.ts`:

```typescript
export const COLORS = {
  primary: '#1976d2',
  secondary: '#dc004e',
  // ... dll
};
```

### Assets Required

Buat/tambahkan di folder `assets/`:

- `icon.png` - 1024x1024px (app icon)
- `adaptive-icon.png` - 1024x1024px (Android adaptive icon)
- `splash.png` - 1284x2778px (splash screen)
- `logo.png` - 120x120px (login screen logo)
- `notification-icon.png` - 96x96px (Android notification icon)

## 🐛 Troubleshooting

### Error: Unable to resolve module

```bash
# Clear cache
npm start -- --clear
# atau
expo start -c
```

### Android build failing

```bash
# Clean gradle
cd android
./gradlew clean
cd ..
```

### iOS build failing

```bash
# Clean pods
cd ios
pod deintegrate
pod install
cd ..
```

### Push notifications not working

1. Cek FCM configuration di Firebase Console
2. Pastikan `google-services.json` / `GoogleService-Info.plist` sudah di-copy
3. Cek FCM Server Key di `.env`
4. Test notification dari Firebase Console → Cloud Messaging

### API connection error

1. Pastikan backend sudah running
2. Cek `API_URL` di `.env` (gunakan IP lokal, bukan localhost)
3. Pastikan device/emulator dalam network yang sama
4. Test endpoint dengan Postman/curl

## 📄 Scripts

```bash
npm start           # Start Expo development server
npm run android     # Run on Android emulator/device
npm run ios         # Run on iOS simulator/device
npm run web         # Run on web browser
npm run build:android   # Build Android APK
npm run build:ios       # Build iOS IPA
npm run lint        # Run ESLint
npm run type-check  # Run TypeScript check
```

## 📚 Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [React Query](https://tanstack.com/query/latest)
- [Zustand](https://docs.pmnd.rs/zustand)
- [React Native Paper](https://callstack.github.io/react-native-paper/)

## 🤝 Support

Untuk bantuan dan support, hubungi:
- Email: support@salfanet.com
- WhatsApp: +62xxx (sesuaikan)

## 📝 License

Copyright © 2026 SALFANET

---

**Version**: 1.0.0
**Last Updated**: February 2026
