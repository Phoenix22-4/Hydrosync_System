# HydroSync Android App Build Instructions

## What Was Completed

### 1. App Detection & Login Flow ✅
- **Login Button** in navigation now detects if native app is installed
- **If app installed**: Opens `hydrosync://login` to launch native app directly
- **If app NOT installed**: Scrolls to download section for APK download
- Works like YouTube/Google - detects app presence and routes accordingly

### 2. Simulation Files Removed ✅
- Deleted `src/services/simulation.ts`
- Deleted `src/services/seed.ts`
- Removed all references from:
  - `src/pages/admin/Dashboard.tsx`
  - `src/pages/CreateAccount.tsx`
  - `src/pages/Login.tsx`

### 3. Firestore Rules Updated ✅
- Anyone can read devices (for registration)
- Authenticated users can claim unassigned devices
- Authenticated users can create activity logs

### 4. ChatBot Gemini API ✅
- Both `ChatBot.tsx` and `FloatingChatBot.tsx` now use `import.meta.env.VITE_GEMINI_API_KEY`
- Set this in Netlify environment variables or `.env` file

### 5. Landing Page Updated ✅
- "Login" button in nav tries to open native app
- "Open App" button in native-app section tries to launch app
- "Download APK" button directly downloads the APK file
- Added `id="native-app"` for scroll-to-download fallback

### 6. Anti-Debugging ✅
- F12 blocked → redirects to APK download
- Ctrl+Shift+I/J/C/U blocked → redirects to APK download
- Right-click disabled
- Console methods disabled

## To Build the APK (On Your Local Machine)

### Prerequisites
1. Install Android Studio
2. Install Android SDK (API 33+)
3. Set `ANDROID_HOME` environment variable

### Build Commands

```bash
# 1. Build the web app
npm run build

# 2. Sync with Capacitor
npx cap sync

# 3. Open Android Studio (optional - for GUI build)
npx cap open android

# 4. Build debug APK via command line
cd android
.\gradlew assembleDebug

# 5. The APK will be at:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Alternative: Build Release APK

```bash
cd android
# Create keystore (first time only)
keytool -genkey -v -keystore hydrosync.keystore -alias hydrosync -keyalg RSA -keysize 2048 -validity 10000

# Build release
.\gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### Quick Build Script

Create `build-apk.bat`:
```batch
@echo off
echo Building HydroSync APK...
npm run build
npx cap sync
cd android
.\gradlew assembleDebug
echo.
echo APK built successfully!
echo Location: app\build\outputs\apk\debug\app-debug.apk
pause
```

## Environment Variables for Netlify

Set these in Netlify dashboard:
```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_FIREBASE_API_KEY=your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Firestore Rules to Deploy

Copy the rules from `firestore.rules` to Firebase Console:
1. Go to Firebase Console → Firestore Database → Rules
2. Paste the rules
3. Click "Publish"

## APK Download Setup

1. Build the APK using instructions above
2. Rename `app-debug.apk` to `HydroSync-App.apk`
3. Place in `public/HydroSync-App.apk`
4. Deploy to hosting

## Architecture: Live Data Flow

```
IoT Device → HiveMQ MQTT → Cloud Function/Bridge → Firestore
                                      ↓
                              Native App (Capacitor)
                                      ↓
                              Real-time Firestore Listeners
```

The mobile app uses Firestore real-time listeners, NOT direct MQTT. This provides:
- Offline data persistence
- Better mobile network handling
- Automatic reconnection
- Cross-platform sync

## Current Status

- ✅ Web app builds successfully
- ✅ Capacitor sync works
- ⚠️ Android build requires local Android Studio/Gradle setup
- ✅ All TypeScript compiles
- ✅ No simulation data remaining
