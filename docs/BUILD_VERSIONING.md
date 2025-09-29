# Build Artifact Versioning System

## Overview

The build process now includes automatic patch version incrementing for build artifacts only, while keeping source code versions unchanged. This provides build tracking without affecting development workflows.

## How It Works

### Source Code Versions (Unchanged)
The following files maintain their original version numbers:
- `package.json`: `"version": "0.1.0"`
- `src-tauri/Cargo.toml`: `version = "0.1.0"`
- `src-tauri/tauri.conf.json`: `"version": "0.1.0"`

### Artifact Versions (Auto-Incremented)
Build artifacts are automatically renamed with incremented patch version numbers:
- `Schuelerbeobachtung_0.3.2_x64_en-US.msi` (MSI installer)
- `Schuelerbeobachtung_0.3.2_x64-setup.exe` (NSIS installer)
- Future: `.deb`, `.AppImage` files will also be versioned

## Usage

### Available Commands

```bash
# Standard build (no version increment)
npm run tauri:build

# Build with automatic artifact versioning
npm run tauri:build:versioned

# Increment versions of existing artifacts only
npm run increment:artifacts
```

### Version Tracking

Build versions are tracked in `.build-counter.json`:
```json
{
  "major": 0,
  "minor": 3,
  "patch": 2,
  "build": 0
}
```

### Version Increment Logic

- **Patch version**: Automatically incremented with each build (0.3.1 → 0.3.2 → 0.3.3)
- **Minor/Major version**: Manual increment when needed (future enhancement)
- **Build number**: Reserved for future use

## Technical Implementation

### Script Location
`scripts/increment-artifacts.js` - ES6 module that:
1. Loads current version from `.build-counter.json`
2. Increments patch version number
3. Renames all matching artifacts in `src-tauri/target/release/bundle/`
4. Saves updated version counter

### Supported Artifact Types
- **MSI**: Windows installer packages (`.msi`)
- **NSIS**: Windows setup executables (`.exe`)
- **DEB**: Linux packages (`.deb`) - future
- **AppImage**: Linux portable apps (`.AppImage`) - future

### Integration Points
- **package.json**: New npm scripts for versioned builds
- **Build process**: Post-build artifact processing
- **Version tracking**: Persistent counter in `.build-counter.json`

## Benefits

✅ **Clean Development**: Source code versions stay stable
✅ **Release Tracking**: Each build gets unique version number
✅ **No Conflicts**: Artifacts don't overwrite previous builds
✅ **Automation**: Integrated into build process
✅ **Backwards Compatible**: Standard builds still work unchanged

## Example Workflow

```bash
# Development phase
npm run tauri:dev                    # Version stays 0.1.0

# Release builds
npm run tauri:build:versioned        # Creates v0.3.3 artifacts
npm run tauri:build:versioned        # Creates v0.3.4 artifacts
npm run tauri:build:versioned        # Creates v0.3.5 artifacts

# Manual artifact versioning
npm run tauri:build                  # Standard build
npm run increment:artifacts          # Version existing artifacts
```

## File Structure

```
DSGVO_MAIN/
├── .build-counter.json              # Version tracking
├── scripts/
│   └── increment-artifacts.js       # Versioning script
└── src-tauri/target/release/bundle/
    ├── msi/
    │   └── Schuelerbeobachtung_0.3.2_x64_en-US.msi
    └── nsis/
        └── Schuelerbeobachtung_0.3.2_x64-setup.exe
```

## Notes

- Source code versions (0.1.0) remain unchanged for development stability
- Only build artifacts get incremented version numbers
- The `.build-counter.json` file should be committed to git for consistency
- Each team member will have synchronized version numbers across builds