# Android APK Build Guide

This document explains how to build Android APKs for the Schuelerbeobachtung app using automated GitHub Actions.

## 🚀 Automated APK Building

Your project is now configured with GitHub Actions that automatically build Android APKs. Here's how it works:

### Automatic Builds Trigger On:
- **Push to main/master/mobile branches** → Builds debug and release APKs
- **Pull requests** → Builds APKs for testing
- **Manual trigger** → Build on-demand from GitHub Actions tab
- **Releases** → Automatically attaches APK to GitHub releases

## 📱 Getting Your APK

### Method 1: GitHub Actions Artifacts
1. Go to your repository on GitHub
2. Click "Actions" tab
3. Click on any completed build
4. Download APK from "Artifacts" section
5. Files will be named:
   - `schuelerbeobachtung-debug-apk.zip`
   - `schuelerbeobachtung-release-apk.zip`

### Method 2: GitHub Releases (Recommended)
1. Create a new release on GitHub
2. APK will be automatically built and attached
3. Download directly from the release page

### Method 3: Manual Trigger
1. Go to "Actions" → "Build Android APK"
2. Click "Run workflow"
3. Select branch and click "Run workflow"
4. Download from artifacts when complete

## 🛠️ Local Development Setup

If you want to build locally on a full development machine:

### Prerequisites
- Android Studio with Android SDK
- Node.js 18+
- Java 17+

### Build Steps
```bash
# Install dependencies
npm install

# Build web assets
npm run build

# Sync with Android project
npx cap sync android

# Open in Android Studio
npx cap open android

# Or build via command line
cd android
./gradlew assembleRelease
```

## 📋 Build Configuration

### Project Details
- **App ID**: `com.school.schuelerbeobachtung`
- **App Name**: Schuelerbeobachtung
- **Target SDK**: 34 (Android 14)
- **Min SDK**: 24 (Android 7.0)

### Build Outputs
- **Debug APK**: For development and testing
- **Release APK**: Optimized for production

### File Locations
- Android project: `android/`
- Web assets: `dist/` → `android/app/src/main/assets/public/`
- APK output: `android/app/build/outputs/apk/`

## 🔒 APK Signing (Optional)

To sign your release APKs for Play Store distribution:

1. Generate a keystore:
```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

2. Add secrets to GitHub repository:
   - `ANDROID_KEYSTORE`: Base64 encoded keystore file
   - `KEYSTORE_PASSWORD`: Keystore password
   - `KEY_ALIAS`: Key alias name
   - `KEY_PASSWORD`: Key password

3. The release workflow will automatically sign APKs when these secrets are present.

## 📱 Installing the APK

### On Android Device:
1. Enable "Install unknown apps" in Settings → Security
2. Download the APK file
3. Open the APK file to install
4. Grant necessary permissions

### Testing Recommendations:
- Test debug APK first for development
- Use release APK for production deployment
- Test on different Android versions if possible

## 🔧 Troubleshooting

### Common Issues:

**Build Fails:**
- Check GitHub Actions logs for specific errors
- Ensure all dependencies are properly listed in `package.json`
- Verify Capacitor configuration in `capacitor.config.ts`

**APK Won't Install:**
- Enable "Unknown sources" in Android settings
- Check if device meets minimum Android 7.0 requirement
- Try uninstalling previous versions first

**Missing Features:**
- Ensure web assets built successfully (`npm run build`)
- Check that all required plugins are installed
- Verify permissions in `android/app/src/main/AndroidManifest.xml`

## 📊 Build Status

You can monitor build status through:
- GitHub Actions tab (real-time build logs)
- README badges (add build status badge)
- Email notifications (configure in GitHub settings)

## 🎯 Next Steps

1. **Push your code** to trigger the first automated build
2. **Download and test** the generated APK
3. **Create a release** for automatic APK distribution
4. **Set up signing** for Play Store distribution (optional)

Your Android app is ready for distribution! 🎉