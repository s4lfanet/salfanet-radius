# Mobile App Assets

Directory ini berisi image assets untuk mobile app SALFANET RADIUS.

## Required Assets

### 1. App Icon
**File**: `icon.png`  
**Size**: 1024x1024px  
**Format**: PNG  
**Purpose**: App launcher icon  
**Notes**: Logo SALFANET dengan background

### 2. Adaptive Icon (Android)
**File**: `adaptive-icon.png`  
**Size**: 1024x1024px (safe area: 512x512px di tengah)  
**Format**: PNG  
**Purpose**: Android adaptive icon  
**Notes**: Logo only, transparent background (sistem akan tambah background)

### 3. Splash Screen
**File**: `splash.png`  
**Size**: 1284x2778px (iPhone 14 Pro Max)  
**Format**: PNG  
**Purpose**: Launch screen saat app dibuka  
**Notes**: Logo + tagline center, background warna brand

### 4. Logo (Login Screen)
**File**: `logo.png`  
**Size**: 120x120px (atau lebih besar, akan di-resize)  
**Format**: PNG  
**Purpose**: Logo di login screen  
**Notes**: Transparent background preferred

### 5. Notification Icon (Android)
**File**: `notification-icon.png`  
**Size**: 96x96px  
**Format**: PNG (silhouette white)  
**Purpose**: Icon untuk push notifications Android  
**Notes**: Must be white silhouette on transparent background

## Placeholder Assets

Untuk testing, bisa gunakan temporary assets:
- Icon/Logo: Huruf "S" dengan background biru
- Splash: Full screen biru dengan text "SALFANET"
- Notification icon: Bell icon white silhouette

## Design Guidelines

**Brand Colors**:
- Primary: #1976d2 (blue)
- Secondary: #dc004e (pink)
- Background: White

**Logo Style**:
- Clean, modern
- Readable di ukuran kecil (icon launcher)
- Professional untuk ISP company

## Production Checklist

Before production build:
- [ ] All 5 assets created dengan size & format yang benar
- [ ] Assets optimized (compressed tapi quality tetap bagus)
- [ ] Tested di device (icon terlihat jelas di home screen)
- [ ] Splash screen tested (tidak distorted di berbagai ukuran layar)
- [ ] Notification icon tested (terlihat jelas di notification bar)

## How to Add Assets

1. Design atau prepare assets sesuai spec di atas
2. Save ke folder ini (`mobile-app/assets/`)
3. Update `app.json` jika perlu adjust path
4. Test di device: `npm run android` atau `npm run ios`
5. Check:
   - App icon muncul di home screen
   - Splash screen terlihat saat launch
   - Notification icon terlihat saat push notification muncul

## Tools untuk Create Assets

**Design**:
- Figma (recommended, free)
- Adobe Illustrator
- Canva (simple, template available)

**Icon Generators**:
- [App Icon Generator](https://appicon.co/)
- [Adaptive Icon Maker](https://icon.kitchen/)
- [Expo Asset Generator](https://www.npmjs.com/package/expo-generate-app-icon)

**Optimization**:
- [TinyPNG](https://tinypng.com/) - Compress PNG
- [ImageOptim](https://imageoptim.com/) - macOS
- [Squoosh](https://squoosh.app/) - Web-based

---

**Note**: Tanpa assets ini, app masih bisa jalan tapi akan gunakan Expo default icon & splash screen.
