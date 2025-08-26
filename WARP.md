# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## 📋 Table of Contents

1. [⚠️ Critical Warnings & Known Issues](#️-critical-warnings--known-issues)
2. [🚀 Essential Development Commands](#-essential-development-commands)
3. [🏗️ Architecture Overview](#️-architecture-overview)
4. [🔄 Synchronization System](#-synchronization-system)
5. [🛡️ GDPR Compliance Features](#️-gdpr-compliance-features)
6. [🎨 User-Defined Categories](#-user-defined-categories)
7. [🧪 Testing & Quality Assurance](#-testing--quality-assurance)
8. [🔧 Common Development Tasks](#-common-development-tasks)
9. [🚨 Troubleshooting Guide](#-troubleshooting-guide)
10. [📋 Development Checklist](#-development-checklist)
11. [📖 Key Documentation Files](#-key-documentation-files)
12. [🔗 Important Routes & Navigation](#-important-routes--navigation)

## ⚠️ CRITICAL WARNINGS & KNOWN ISSUES

### ✅ CalendarView Component - RESOLVED
**Status**: **CONFIRMED FIXED** - Calendar infinite loading loop completely resolved
**Location**: `src/components/CalendarView.tsx` at `/kalender` route
**Issue**: Infinite loading loop caused by unstable Zustand function dependencies
**Fix Applied**: Direct getState pattern with initialization guards (August 26, 2025)
**Risk**: Low - Issue thoroughly resolved with robust solution

**What was fixed**:
- Eliminated all store function dependencies from useEffect hooks
- Implemented `hasInitialized` state guard to prevent re-initialization loops
- Used direct `useAppStore.getState()` calls in all event handlers
- Added proper cleanup with `isMounted` guards

**Prevention for future development**:
1. Never include Zustand store functions in useEffect dependency arrays
2. Use `useAppStore.getState()` for function calls in event handlers
3. Add initialization guards for complex loading sequences
4. Always include cleanup functions in useEffect hooks

### 🔓 Security Status: Encryption Disabled
**CRITICAL**: All data is currently stored in **PLAINTEXT**
- Student observations are unencrypted in SQLite database
- No password protection on database file
- Encryption was disabled due to Linux keyring compatibility issues
- See `ENCRYPTION_DISABLED.md` for full details

**Impact**: Suitable for testing/development, consider security implications for production use

## 🚀 Essential Development Commands

### Quick Start Development
```bash
# Start complete development environment (both frontend + backend)
npm run tauri:dev

# Frontend only (for UI development)
npm run dev
```

### Build & Quality Gates
```bash
# Frontend quality checks (REQUIRED before commits)
npm run lint
npm run build

# Backend quality checks (REQUIRED before commits) 
cd src-tauri
cargo clippy
cargo fmt --check
cargo test
cd ..

# Complete application build
npm run tauri:build
```

### Testing Commands
```bash
# Frontend tests
npm test
npm run test:ui          # Interactive test runner

# Backend tests
cd src-tauri
cargo test
cargo test --release
```

## 🏗️ Architecture Overview

### Technology Stack
- **Framework**: Tauri 2.0 (Rust backend + React TypeScript frontend)
- **Frontend**: React 18.2, TypeScript, TailwindCSS, Zustand (state)
- **Backend**: Rust with SQLx (SQLite), Tokio async runtime
- **Desktop**: Cross-platform (Linux/Windows/macOS) with native OS integration

### Core Architecture
```
DSGVO/
├── src/                          # React TypeScript Frontend
│   ├── components/               # UI Components
│   │   ├── Dashboard.tsx        # Main dashboard
│   │   ├── ObservationForm.tsx  # Student observation entry
│   │   ├── StudentSearch.tsx    # Student management
│   │   ├── CategoryManager.tsx  # Custom category management  
│   │   ├── CalendarView.tsx     # ✅ Calendar interface (fully functional)
│   │   ├── AssessmentsTable.tsx # Sortable observations table
│   │   └── UnifiedSyncManager.tsx # File-based sync interface
│   ├── stores/appStore.ts       # Zustand state management
│   └── App.tsx                  # Route configuration
├── src-tauri/                   # Rust Backend
│   ├── src/
│   │   ├── main.rs             # Tauri commands & app entry
│   │   ├── database.rs         # SQLite operations
│   │   ├── crypto.rs           # Encryption (DISABLED)
│   │   ├── audit.rs            # GDPR audit logging
│   │   └── gdpr.rs             # Data protection functions
│   └── Cargo.toml              # Rust dependencies
└── docs/                       # Comprehensive documentation
```

### Key Data Models
```rust
// Core entities
Student { id, class_id, first_name, last_name, status }
Class { id, name, school_year }
Category { id, name, color, background_color, text_color } // User-customizable
Observation { id, student_id, category, text, tags } // PLAINTEXT stored
```

## 🔄 Synchronization System

### File-Based Sync (Replaced P2P)
**Location**: `/sync` route via `UnifiedSyncManager.tsx`
- **Changeset Export**: Incremental changes (.dat files)
- **Full Export**: Complete database backup (.json files)
- **Data Ranges**: 7 days, 30 days, 90 days, 1 year, or ALL DATA
- **Import Support**: Auto-detects file types, handles both formats

### Export/Import Commands
```typescript
// Key Tauri commands for sync
export_changeset_to_file(file_path, days_back?)
import_changeset_from_file(file_path)
export_all_data(days_back?)
import_full_backup(file_path)
```

## 🛡️ GDPR Compliance Features

### Data Subject Rights Implementation
- **Right of Access (Art. 15)**: Complete data export via `export_student_data`
- **Right to Rectification (Art. 16)**: Edit observations with audit trail
- **Right to Erasure (Art. 17)**: Soft/hard delete with `delete_student` command
- **Data Portability (Art. 20)**: JSON/CSV exports

### Audit Trail
**Critical**: All data operations automatically logged to `audit.db`
```rust
// Every action is logged with:
audit.log_action(action_type, object_type, object_id, user_id, details)
```

### Deletion Strategies  
- **Soft Delete**: Status = 'deleted', preserves referential integrity
- **Hard Delete**: Complete removal, irreversible, GDPR Article 17 compliant

## 🎨 User-Defined Categories

### Custom Category System
**Location**: `/kategorien` route via `CategoryManager.tsx`
- **Color Customization**: Primary, background, and text colors per category  
- **Default Categories**: Professional color schemes (Sozial, Fachlich, Verhalten, etc.)
- **Visual Integration**: Colors displayed throughout app (dashboard, calendar, tables)

### Category Management Commands
```rust
get_categories() -> Vec<Category>
create_category(name, color, bg_color, text_color) -> Category  
update_category(id, name, color, bg_color, text_color)
delete_category(id, force_delete?)
```

## 🧪 Testing & Quality Assurance

### Pre-Commit Quality Gates
**MANDATORY**: All checks must pass before commits/merges
```bash
# Complete quality check sequence
npm run lint && npm run build
cd src-tauri && cargo clippy && cargo fmt --check && cargo test && cd ..
npm run tauri:build  # Final verification
```

### Frontend Testing (Vitest)
```bash
# Run all tests
npm test

# Interactive test runner with UI
npm run test:ui

# Run tests with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Run specific test file
npm test src/components/CalendarView.test.tsx
```

### Backend Testing (Cargo)
```bash
cd src-tauri

# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_create_observation

# Run tests in release mode
cargo test --release

# Run tests with specific features
cargo test --features "custom-protocol"
```

### Test Configuration
- **Frontend**: Vitest with jsdom, setup in `src/test/setup.ts`
- **Backend**: Standard Cargo test with `tempfile` for database tests  
- **Coverage**: V8 provider, excludes node_modules and test files
- **Integration**: Full app testing with mock Tauri commands

### Test Locations & Purpose
```
src/__tests__/integration.test.tsx    # Frontend integration tests
src/test/setup.ts                     # Test environment setup
tests/integration.test.ts             # Rust integration tests
tests/delete_observation.test.ts      # GDPR deletion tests
src-tauri/src/tests/                  # Backend unit tests (if present)
```

### Cross-Platform Testing Requirements

**Linux (Primary Development Platform)**:
```bash
# System dependencies check
sudo apt list --installed | grep -E "libgtk-3-dev|libwebkit2gtk"

# Build verification
npm run tauri:build
file src-tauri/target/release/schuelerbeobachtung  # Should show ELF executable
```

**Windows Testing**:
```powershell
# PowerShell - Build verification
npm run tauri:build
Get-ItemProperty src-tauri/target/release/schuelerbeobachtung.exe
```

**macOS Testing**:
```bash
# Build for both architectures
npm run tauri build -- --target aarch64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin
```

## 🔧 Common Development Tasks

### Adding New Tauri Commands
1. Define command in `src-tauri/src/main.rs`
2. Add to `invoke_handler![]` macro  
3. Create corresponding frontend function in `appStore.ts`
4. Add TypeScript types for parameters/return values

### Database Schema Changes
1. Modify schema in `src-tauri/src/database.rs`
2. Update migration logic in `Database::new()`
3. Update corresponding Rust structs
4. Update TypeScript interfaces in `appStore.ts`

### Working with Categories
- Colors use hex format: `#3B82F6` (primary), `#DBEAFE` (background), `#1E3A8A` (text)
- Categories integrate across: Dashboard, CalendarView, ObservationForm, AssessmentsTable
- Default categories auto-created on first run

### Debugging Tauri IPC Issues
```bash
# Enable debug logging
RUST_LOG=debug npm run tauri:dev

# Check console for:
# - Tauri command invocation errors
# - Parameter serialization issues (camelCase ↔ snake_case)
# - Database connection problems
```

### Working with File-Based Sync System
**Key Commands for Sync Development**:
```typescript
// Frontend: Export data ranges
const result = await exportAllData(-1);  // All data (unlimited)
const result = await exportAllData(30);  // Last 30 days
const result = await exportAllData(0);   // All data (alternative)

// Import handling with auto-detection
const file = await open({ filters: [{ name: 'All', extensions: ['*'] }] });
if (file.endsWith('.json')) {
  await importFullBackupData(fileContent);
} else {
  await importChangesetData(fileContent);
}
```

**Sync File Formats**:
- `.dat` files: Binary changeset data (incremental)
- `.json` files: Full database export (complete backup)
- Auto-detection in `UnifiedSyncManager.tsx` handles both

### Developer Environment Setup Checklist

**Prerequisites**:
- [ ] Node.js 18+ installed
- [ ] Rust 1.70+ with Cargo
- [ ] System dependencies for your platform:

**Linux (Ubuntu/Debian)**:
```bash
sudo apt install -y build-essential libssl-dev pkg-config \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.0-dev
```

**Windows**:
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
# Or Visual Studio with C++ workload
```

**macOS**:
```bash
xcode-select --install
```

**Project Setup**:
```bash
# Clone and install dependencies
git clone [repository-url]
cd DSGVO
npm install

# Verify build works
npm run tauri:build

# Start development
npm run tauri:dev
```

## 🚨 Troubleshooting Guide

### CalendarView Not Loading (If Bug Returns)
1. **Symptoms**: Infinite "Lade Kalender..." message
2. **Check**: Browser console for useEffect dependency warnings
3. **Debug**: Add logging to `loadCalendarEvents` function
4. **Fix**: Ensure Zustand store functions use stable references

### Build Failures
```bash
# Clean rebuild process
npm run tauri clean
rm -rf node_modules dist
npm install
npm run tauri:build
```

### Sync File Issues
- **Changeset files**: Binary format, use `import_changeset_from_file`
- **Full backup files**: JSON format, use `import_full_backup`
- **Auto-detection**: UnifiedSyncManager auto-detects file types

### Database Issues
- **Location**: `~/.local/share/schuelerbeobachtung/observations.db` (Linux)
- **Backup**: Use "Full Export" before major changes
- **Reset**: Delete database file to recreate with fresh schema

## 📋 Development Checklist

### New Feature Development
- [ ] Update Claude.md with technical details
- [ ] Add Tauri commands with proper error handling
- [ ] Include audit logging for GDPR compliance
- [ ] Add TypeScript interfaces and validation
- [ ] Write tests for new functionality
- [ ] Update UI to maintain design consistency
- [ ] Test on different screen sizes (responsive)
- [ ] Verify accessibility (ARIA labels, keyboard navigation)

### GDPR Compliance Checklist
- [ ] All data operations have audit trail entries
- [ ] Personal data can be exported (right of access)
- [ ] Personal data can be corrected (right of rectification)  
- [ ] Personal data can be deleted (right to erasure)
- [ ] Data minimization: only essential fields required
- [ ] Purpose limitation: clear data usage boundaries

## 📖 Key Documentation Files

### Technical Reference
- `Claude.md` - Complete technical documentation (670+ lines)
- `ENCRYPTION_DISABLED.md` - Security status and implications
- `README.md` - User-facing project overview

### Project Memory (.serena/memories/)
- `project_overview.md` - High-level project description
- `tech_stack.md` - Technology details  
- `suggested_commands.md` - Development commands
- `task_completion_requirements.md` - Quality gates

### GDPR Documentation (docs/)
- `DPIA.md` - Data Protection Impact Assessment
- `DELETE_FEATURES.md` - Deletion implementation details
- `API.md` - Complete Tauri command reference

## 🔗 Important Routes & Navigation

- `/` - Dashboard (main entry point)
- `/neue-beobachtung` - Observation entry form
- `/schueler-suchen` - Student search & management
- `/schueler-hinzufuegen` - Add new students/classes
- `/sync` - **Unified synchronization interface** (primary sync method)
- `/kategorien` - Category management with color customization
- `/bewertungen` - Sortable assessments/observations table
- `/kalender` - ✅ Calendar view (fully functional with FullCalendar)
- `/einstellungen` - Settings & GDPR compliance functions

---

**🎯 Remember**: This is a GDPR-compliant student observation system with unified file-based synchronization, user-defined categories, and currently disabled encryption. Always run quality gates before task completion!

**📅 Last Updated**: August 2025 • **🔒 GDPR-Compliant** • **⚠️ Encryption Disabled** • **🔄 File-Based Sync**
