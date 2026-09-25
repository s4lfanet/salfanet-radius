> ⚠️ **Usang.** Rencana Expo/React Native di dokumen ini tidak pernah dilanjutkan.
> Aplikasi customer yang benar-benar berjalan sekarang adalah **Flutter native**
> di `mobile/customer_app/`. Panduan setup dan Firebase yang akurat ada di
> [`mobile/customer_app/README.md`](../../mobile/customer_app/README.md) dan
> [`mobile/customer_app/FIREBASE_SETUP.md`](../../mobile/customer_app/FIREBASE_SETUP.md).
> Isi di bawah ini dibiarkan sebagai arsip saja.

# Panduan Development Aplikasi Mobile Native

## 📱 Ringkasan Implementasi Saat Ini

Aplikasi mobile customer portal saat ini dibangun menggunakan:
- **Expo SDK 54.0.0** dengan React Native 0.81.5
- **Expo Go** untuk development/testing (limited native features)
- **React Native Paper** untuk UI components

### ✅ Fitur yang Sudah Lengkap (6/7)
1. Dashboard - Saldo & Auto-renewal
2. Profile dengan Quick Actions
3. Top-Up Saldo
4. Payment Gateway Integration
5. Sistem Tiket Support (List, Create, Detail dengan Chat)
6. **Upgrade Paket** (baru saja diupdate dengan real API)

### ⚠️ Limitasi Expo Go
- **Push Notifications**: Terbatas, tidak bisa full FCM integration
- **Upload Bukti Bayar**: Memerlukan native modules (`expo-image-picker` works tapi dengan limitasi)
- **Background Tasks**: Terbatas
- **Custom Native Modules**: Tidak didukung

---

## 🚀 Opsi untuk Development Full Native

### **OPSI 1: Expo Development Build** ⭐ RECOMMENDED

Tetap menggunakan Expo/React Native tapi dengan kemampuan native penuh.

#### Keuntungan:
- Tetap menggunakan codebase yang sudah ada (TIDAK perlu rewrite)
- Full access ke native modules (FCM, camera, file picker, dll)
- Over-the-air (OTA) updates tetap bisa digunakan
- Development experience tetap smooth dengan Expo tooling
- Bisa install custom native modules
- File size lebih kecil dari React Native CLI

#### Langkah-langkah Implementation:

**1. Install EAS CLI (Expo Application Services)**
\`\`\`bash
npm install -g eas-cli
\`\`\`

**2. Login ke Expo Account**
\`\`\`bash
eas login
\`\`\`

**3. Configure EAS Build**
\`\`\`bash
cd mobile-app
eas build:configure
\`\`\`

**4. Install FCM Packages untuk Notifikasi**
\`\`\`bash
npx expo install expo-notifications expo-device expo-constants
npx expo install @react-native-firebase/app @react-native-firebase/messaging
\`\`\`

**5. Configure app.json untuk Firebase**
\`\`\`json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#1976d2",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ],
      "@react-native-firebase/app",
      "@react-native-firebase/messaging"
    ],
    "android": {
      "googleServicesFile": "./google-services.json",
      "package": "com.yourcompany.salfanetradiuscustomer"
    }
  }
}
\`\`\`

**6. Build Development APK**
\`\`\`bash
# Build untuk Android
eas build --profile development --platform android

# Atau build production APK
eas build --profile production --platform android
\`\`\`

**7. Install APK ke Device/Emulator**
- Download APK dari link yang diberikan EAS
- Install di device: \`adb install app.apk\`
- Atau scan QR code dari build result

#### Biaya:
- **Free tier**: 30 build/month (cukup untuk development)
- **Production**: $29/month untuk unlimited builds
- Bisa juga self-host EAS build (gratis tapi butuh setup server)

---

### **OPSI 2: React Native CLI** (Bare Workflow)

Pindah dari Expo managed workflow ke React Native CLI murni.

#### Keuntungan:
- Full control atas native code (iOS/Android)
- Tidak ada limitasi
- Performansi sedikit lebih baik
- Bisa customize build process sepenuhnya

#### Kekurangan:
- ❌ Perlu setup Android Studio / Xcode
- ❌ Perlu maintain native code (ios/, android/ folders)
- ❌ Tidak ada OTA updates
- ❌ Development lebih kompleks
- ❌ Perlu rewrite beberapa Expo-specific code

#### Estimasi Migration:
- **2-3 hari** untuk migrate dari Expo ke RN CLI
- **1 hari** untuk setup FCM dan notifications
- **1 hari** untuk testing dan debugging

---

### **OPSI 3: Flutter** 🎯 Alternative Stack

Rebuild aplikasi dari scratch dengan Flutter.

#### Keuntungan:
- ✅ Performansi sangat tinggi (compiled to native)
- ✅ Hot reload seperti React Native
- ✅ Widget library yang sangat rich
- ✅ Satu codebase untuk iOS, Android, Web, Desktop
- ✅ Full native access (FCM, camera, dll)
- ✅ Development speed cepat dengan Material/Cupertino widgets

#### Kekurangan:
- ❌ **PERLU REBUILD DARI NOL** (tidak bisa reuse React Native code)
- ❌ Tim perlu belajar Dart language
- ❌ 7 screens yang sudah dibuat perlu ditulis ulang
- ❌ Semua services (auth, dashboard, ticket, dll) perlu ditulis ulang

#### Estimasi Development:
- **Setup & Architecture**: 1-2 hari
- **Authentication & Dashboard**: 2-3 hari
- **7 Main Screens**: 5-7 hari
- **Services Layer**: 2-3 hari
- **Testing & Bug Fixes**: 2-3 hari
- **TOTAL**: 12-18 hari kerja (2.5-3.5 minggu)

#### Contoh Stack Flutter:
\`\`\`yaml
dependencies:
  flutter:
    sdk: flutter
  # State Management
  provider: ^6.0.0
  # Network
  http: ^1.1.0
  dio: ^5.3.0
  # Storage
  shared_preferences: ^2.2.0
  flutter_secure_storage: ^9.0.0
  # Firebase
  firebase_core: ^2.15.0
  firebase_messaging: ^14.6.5
  # UI
  google_fonts: ^6.0.0
  flutter_svg: ^2.0.7
  # Utils
  intl: ^0.18.1 # date formatting
  image_picker: ^1.0.0
\`\`\`

---

## 📊 Perbandingan Opsi

| Fitur | Expo Go (Current) | Expo Dev Build | RN CLI | Flutter |
|-------|-------------------|----------------|--------|---------|
| **Effort Migration** | Already Done | Minimal | Medium | HIGH |
| **Development Time** | ✅ Fast | ✅ Fast | ⚠️ Medium | ⚠️ Slower |
| **Full Native Access** | ❌ Limited | ✅ Yes | ✅ Yes | ✅ Yes |
| **FCM Notifications** | ⚠️ Limited | ✅ Full | ✅ Full | ✅ Full |
| **Code Reuse** | 100% | 100% | ~95% | ❌ 0% |
| **Learning Curve** | None | Low | Medium | HIGH |
| **Build Size** | N/A | ~30-40 MB | ~40-50 MB | ~15-20 MB |
| **Performansi** | Good | Good | Great | Excellent |
| **Hot Reload** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **OTA Updates** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Maintenance** | ✅ Easy | ✅ Easy | ⚠️ Medium | ⚠️ Medium |

---

## 🎯 Rekomendasi

### Untuk Produksi Cepat (< 1 minggu): **EXPO DEVELOPMENT BUILD** ⭐⭐⭐⭐⭐

**Alasan:**
1. ✅ **Codebase sudah 85% selesai** - hanya perlu build native APK
2. ✅ **Tidak perlu rewrite code** - tinggal install native modules
3. ✅ **Full notifications support** dengan FCM
4. ✅ **Upload bukti bayar** dengan expo-image-picker bisa full functional
5. ✅ **Biaya development MINIMAL** (hanya 1-2 hari setup)
6. ✅ **Tetap bisa OTA updates** untuk bug fixes cepat

**Timeline:**
- **Hari 1**: Setup EAS, configure FCM, build first dev APK
- **Hari 2**: Implement notification handler, test upload bukti bayar
- **Hari 3**: Testing & polish

### Untuk Jangka Panjang & Scalability: **FLUTTER** ⭐⭐⭐⭐

**Alasan:**
1. ✅ Performansi lebih tinggi untuk user experience
2. ✅ Build size lebih kecil (hemat bandwidth user)
3. ✅ Ekosistem package yang mature
4. ✅ Bisa deployed ke Web + Mobile dari satu codebase
5. ⚠️ Perlu invest waktu 2.5-3.5 minggu development

**Timeline:**
- **Week 1**: Setup, Auth, Dashboard, Profile
- **Week 2**: Invoices, Top-up, Tickets
- **Week 3**: Upgrade, Upload, Notifications, Testing

---

## 🔧 Setup Development Build (Step by Step)

Jika memilih **Expo Development Build**, ikuti langkah ini:

### 1. Install Expo Application Services (EAS)

\`\`\`bash
npm install -g eas-cli
eas login
\`\`\`

### 2. Configure EAS Build

\`\`\`bash
cd c:\\Users\\yanz\\Downloads\\salfanet-radius-main\\mobile-app
eas build:configure
\`\`\`

Akan membuat file \`eas.json\`:

\`\`\`json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
\`\`\`

### 3. Update app.json

\`\`\`json
{
  "expo": {
    "name": "Salfanet Customer",
    "slug": "salfanet-customer",
    "version": "1.0.0",
    "android": {
      "package": "com.salfanet.customer",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1976d2"
      }
    }
  }
}
\`\`\`

### 4. Build APK

\`\`\`bash
# Development build (for testing)
eas build --profile development --platform android

# Production build
eas build --profile production --platform android
\`\`\`

### 5. Install FCM untuk Notifications

\`\`\`bash
npx expo install expo-notifications
npx expo install expo-device expo-constants
\`\`\`

Update \`app.json\`:

\`\`\`json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#1976d2"
        }
      ]
    ]
  }
}
\`\`\`

### 6. Implement Notification Handler

Create \`services/notification.ts\`:

\`\`\`typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('Push token:', token);
  
  // Send token to backend
  // await apiClient.post('/api/customer/fcm/register', { token });
  
  return token;
}
\`\`\`

### 7. Test di Physical Device

\`\`\`bash
# Download APK dari EAS build result
# Install dengan:
adb install path/to/app.apk

# Atau transfer APK ke HP dan install manual
\`\`\`

---

## 📱 Alternative: Build Lokal (Tanpa EAS)

Jika ingin build tanpa menggunakan EAS (free, tapi lebih kompleks):

\`\`\`bash
# 1. Eject dari Expo managed
npx expo prebuild

# 2. Build dengan Gradle
cd android
./gradlew assembleRelease

# 3. APK ada di: android/app/build/outputs/apk/release/app-release.apk
\`\`\`

**Note**: Perlu Android Studio terinstall dan SDK setup.

---

## 🎨 Kesimpulan

**Untuk Proyek Ini**, saya sangat merekomendasikan:

### **OPSI 1: Expo Development Build** (1-2 hari)
- Codebase sudah 85% selesai
- Hanya perlu build native + setup FCM
- Production ready dalam 2-3 hari
- Total biaya development: **MINIMAL**

### Kapan Pilih Flutter?
- Jika ada rencana **expand ke iOS, Web, Desktop**
- Jika **performansi** jadi prioritas utama
- Jika ada **budget & waktu** 2.5-3.5 minggu
- Jika tim **sudah familiar dengan Dart/Flutter**

---

## 📞 Next Steps

1. **Pilih opsi development** (Expo Dev Build RECOMMENDED)
2. **Setup EAS account** jika belum punya
3. **Build first APK** untuk testing
4. **Implement upload bukti bayar** dengan image picker
5. **Setup FCM** untuk notifications
6. **Testing** di real device
7. **Deploy to Play Store**

Butuh bantuan implementasi? Beri tahu pilihan opsi yang mana! 🚀
