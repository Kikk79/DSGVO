# APK Build Quick Reference

## 🚀 Quick Start

### Trigger a Build
```bash
# Push to trigger automatic build
git push origin Dev

# Or manually trigger via GitHub Actions
# Go to: https://github.com/Kikk79/DSGVO/actions
# Click: "Build Android APK" → "Run workflow"
```

### Download APK
1. **GitHub Actions**: Go to completed workflow → Download from "Artifacts"
2. **Releases**: APK automatically attached to GitHub releases

## 📱 Build Outputs

| Build Type | Size | Use Case |
|------------|------|----------|
| **Debug APK** | ~8-12MB | Development & Testing |
| **Release APK** | ~5-8MB | Production & Distribution |

## ⚡ Build Process (6-10 minutes)

```
Source Code → TypeScript Compile → Vite Bundle → Capacitor Sync → Android Build → APK
     ↓              ↓                ↓              ↓              ↓           ↓
   React TS      JavaScript        Web Assets    Native Bridge   Gradle    APK Files
```

## 🛠️ Key Files

| File | Purpose |
|------|---------|
| `capacitor.config.ts` | App configuration |
| `android/app/build.gradle` | Android build settings |
| `.github/workflows/build-android-apk.yml` | CI/CD automation |
| `dist/` | Built web assets (661KB) |
| `android/app/build/outputs/apk/` | Generated APKs |

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check GitHub Actions logs |
| APK won't install | Enable "Unknown sources" on Android |
| Large APK size | Check asset optimization |
| Slow builds | Review dependency caching |

## 📊 App Details

- **App ID**: `com.school.schuelerbeobachtung`
- **Target SDK**: 34 (Android 14)
- **Min SDK**: 24 (Android 7.0)
- **Architecture**: ARM64, ARMv7
- **Permissions**: Internet, File Access

## 🎯 Next Steps

1. **Test APK**: Install on Android device
2. **Create Release**: Automatic APK distribution
3. **Monitor Builds**: Check success rates
4. **Optimize**: Reduce size and build time