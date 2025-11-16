# 🎯 CLAUDE.md - Complete Technical Reference

## 🔧 QUICK START COMMANDS

**Essential Context Reading (4 files minimum):**

```bash
# Read these files first for immediate project context:
cat README.md package.json src-tauri/Cargo.toml ENCRYPTION_DISABLED.md
```

**Development Workflow:**

```bash
# Frontend development
npm run dev                 # Start development server
npm run build              # Production build
npm run lint               # Code linting
npm run test               # Run tests

# Backend development
cd src-tauri
cargo build                # Debug build
cargo build --release      # Release build
cargo test                 # Run tests
cargo clippy               # Linting

# Full application
npm run tauri:dev          # Complete dev environment
npm run tauri:build        # Production build with installer
```

**Quality Assurance (MANDATORY before task completion):**

```bash
# Frontend quality gates
npm run lint && npm run build

# Backend quality gates
cd src-tauri && cargo clippy && cargo fmt --check && cargo test && cd ..

# Full application validation
npm run tauri:build
```

## 💡 CRITICAL CONTEXT POINTS

**Architecture Fundamentals:**

- ❌ **NO P2P FUNCTIONALITY** - Removed in favor of EXPORT/IMPORT approach
- ✅ **Local-first architecture** - No server dependencies
- ✅ **GDPR by design** - Privacy-first with audit trails
- ✅ **Encryption disabled** - Currently plaintext storage (see ENCRYPTION_DISABLED.md)
- ✅ **Tauri 2.0 framework** - Rust backend + React TypeScript frontend
- ✅ **SQLite database** - Local storage with potential for export/import synchronization
- ✨ **NEW: User-Defined Categories** - Complete color-customizable category management system

**Development Requirements:**

- **System Dependencies**: GTK, PKG_CONFIG, WebKit2 (Linux), Visual Studio Build Tools (Windows)
- **Rust Version**: 1.70+
- **Node.js Version**: 18+
- **Critical**: All quality gates must pass before task completion

## 🏗️ ARCHITECTURE OVERVIEW

### Technology Stack

**Frontend (TypeScript/React):**

- React 18.2.0 with TypeScript
- Zustand 4.4.7 (State Management)
- TailwindCSS 3.3.6 (Styling)
- React Hook Form 7.48.2 (Forms)
- Lucide React 0.294.0 (Icons)
- date-fns 3.0.6 (Date Utilities)

**Backend (Rust):**

- Tauri 2.0 (Desktop Framework)
- SQLx 0.7 (Type-safe Database) with SQLite
- Tokio 1.0 (Async Runtime)
- Chrono 0.4 (Date/Time)
- UUID 1.0 (Identifiers)
- tracing 0.1 (Logging)
- ❌ **Encryption Dependencies Disabled** (keyring, chacha20poly1305)

### Data Model

**Core Entities:**

```sql
-- Classes Management
CREATE TABLE classes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    school_year TEXT NOT NULL
);

-- Student Management
CREATE TABLE students (
    id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    source_device_id TEXT,
    FOREIGN KEY (class_id) REFERENCES classes (id)
);

-- ✨ NEW: User-Defined Categories with Color Support
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3B82F6',           -- Primary color
    background_color TEXT NOT NULL DEFAULT '#EBF8FF', -- Background color
    text_color TEXT NOT NULL DEFAULT '#1E3A8A',      -- Text color
    is_active BOOLEAN NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_device_id TEXT NOT NULL DEFAULT ''
);

-- Observations (NO ENCRYPTION)
CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    category TEXT NOT NULL,              -- References categories.name
    text TEXT NOT NULL,                  -- Plaintext storage
    tags TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_device_id TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students (id)
);

-- GDPR Audit Trail (immutable)
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    details TEXT
);
```

## 📁 PROJECT STRUCTURE

```
DSGVO/
├── src/                          # React TypeScript Frontend
│   ├── components/
│   │   ├── Layout.tsx            # Navigation and UI layout
│   │   ├── Dashboard.tsx         # Main dashboard with category colors
│   │   ├── ObservationForm.tsx   # Observation entry with dynamic categories
│   │   ├── StudentSearch.tsx     # Search and management with category colors
│   │   ├── AddStudent.tsx        # Student/Class management
│   │   ├── CategoryManager.tsx   # ✨ NEW: Category management interface
│   │   ├── UnifiedSyncManager.tsx # Consolidated sync interface
│   │   └── SettingsPage.tsx      # System settings and GDPR compliance
│   ├── stores/
│   │   └── appStore.ts          # Zustand state management
│   ├── App.tsx                  # Main application component
│   └── main.tsx                 # Application entry point
├── src-tauri/                   # Rust Backend
│   ├── src/
│   │   ├── main.rs              # Tauri commands and entry point
│   │   ├── database.rs          # SQLite operations
│   │   ├── crypto.rs            # Encryption (DISABLED)
│   │   ├── audit.rs             # GDPR audit logging
│   │   └── gdpr.rs              # Data protection functions
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri configuration
├── docs/                        # Comprehensive Documentation
│   ├── API.md                   # Complete API reference
│   ├── DPIA.md                  # Data Protection Impact Assessment
│   ├── DELETE_FEATURES.md       # GDPR deletion implementation
│   ├── DEPLOYMENT.md            # Installation and deployment
│   └── INSTALLATION.md          # System requirements
├── CHANGELOG.md                 # ✨ NEW: Version history and feature documentation
├── .serena/memories/            # Claude Instance Memory
│   ├── project_overview.md      # High-level project description
│   ├── tech_stack.md           # Technology stack details
│   ├── project_structure.md     # File organization
│   └── task_completion_requirements.md  # Quality gates
├── package.json                 # Frontend dependencies
├── ENCRYPTION_DISABLED.md       # Critical: Encryption status
└── README.md                    # User-facing documentation
```

## ⚙️ DEVELOPMENT WORKFLOW

### Code Style and Conventions

**TypeScript/React:**

- Strict TypeScript configuration (ES2020, strict mode)
- PascalCase for components (e.g., `StudentSearch.tsx`)
- camelCase for functions and hooks (e.g., `useStudentData`)
- ESLint + React hooks rules
- No unused imports/variables

**Rust:**

- Edition 2021, standard `cargo fmt`
- snake_case for functions (e.g., `create_observation`)
- PascalCase for structs (e.g., `ObservationData`)
- `anyhow` for general error handling
- `Result<T, String>` for Tauri commands

### File Naming Patterns

**Frontend:**

- Components: `StudentSearch.tsx`
- Hooks: `useStudentData.ts`
- Stores: `appStore.ts`
- Types: `StudentTypes.ts`

**Backend:**

- Modules: `database.rs`, `audit.rs`
- Functions: `create_observation`
- Structs: `ObservationData`
- Constants: `DEFAULT_PAGE_SIZE`

### Import/Module Organization

**Frontend Imports:**

```typescript
// Tauri API imports
import { invoke } from "@tauri-apps/api/core";

// React imports
import { useState, useEffect } from "react";

// External libraries
import { format } from "date-fns";

// Internal components
import { StudentSearch } from "./components/StudentSearch";
```

**Backend Module Structure:**

```rust
// External crates
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

// Internal modules
mod database;
mod audit;
mod gdpr;

// Re-exports
pub use database::*;
```

## 🛡️ GDPR COMPLIANCE IMPLEMENTATION

### Core Principles

**Data Minimization (Art. 5 DSGVO):**

```typescript
interface ObservationData {
  // Mandatory fields only
  student_id: number;
  category: "social" | "academic" | "behavior" | "support";
  text: string;
  created_at: Date;

  // Optional fields (configurable)
  tags?: string[]; // Can be disabled
  attachments?: File[]; // Can be disabled
}
```

**Storage Limitation:**

- Observation retention: 365 days (configurable)
- Audit log retention: 7 years (2555 days)
- Automatic anonymization: 3 years (1095 days)
- Regular cleanup processes

**Data Subject Rights Implementation:**

**Art. 15 - Right of Access:**

```typescript
// Complete data export
await invoke("export_student_data", {
  studentId: 123,
  format: "json" | "csv",
});
```

**Art. 16 - Right to Rectification:**

```typescript
// Update with audit trail
await invoke("update_observation", {
  observationId: 456,
  newText: "Corrected observation",
  correctionReason: "Typo correction",
});
```

**Art. 17 - Right to Erasure:**

```typescript
// Differentiated deletion
await invoke("delete_student", {
  studentId: 123,
  forceDelete: false, // Soft delete (default)
});

await invoke("delete_student", {
  studentId: 123,
  forceDelete: true, // Hard delete (right to be forgotten)
});
```

### Deletion Strategies

**Soft Delete (Default):**

- Students with observations: Status set to 'deleted'
- Preserves statistical data integrity
- Maintains referential consistency
- Supports anonymized aggregations

**Hard Delete (Right to be Forgotten):**

- Complete removal of all personal data
- Cascading deletion of related records
- Irreversible operation with audit trail
- Full GDPR Art. 17 compliance

### Audit Logging

**All operations are logged:**

```rust
// Automatic audit trail
state.audit.log_action(
    "delete",           // Action type
    "student",          // Object type
    student_id,         // Object ID
    1,                  // User ID (current: hardcoded)
    Some("hard_delete") // Details
).await?;
```

## 📦 BUILD & DEPLOYMENT

### Development Commands

**Quality Gates Sequence (MANDATORY):**

```bash
# 1. Frontend validation
npm run lint
npm run build

# 2. Backend validation
cd src-tauri
cargo clippy
cargo fmt --check
cargo test
cd ..

# 3. Full application build
npm run tauri:build
```

### Cross-Platform Building

**Linux (Primary Platform):**

```bash
# System dependencies required
sudo apt install -y build-essential libssl-dev pkg-config \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libwebkit2gtk-4.0-dev

# Build
npm run tauri:build
```

**Windows:**

```powershell
# Visual Studio Build Tools required
winget install Microsoft.VisualStudio.2022.BuildTools

# Build
npm run tauri:build
```

**macOS:**

```bash
# Xcode Command Line Tools
xcode-select --install

# Build
npm run tauri:build
```

### Current Build Status

**Available Builds:**

- `Schuelerbeobachtung_0.1.0_amd64_NO-CRYPTO.deb` (Linux package)
- Working binary in `src-tauri/target/release/schuelerbeobachtung`

**Current Limitations:**

- Encryption disabled (plaintext storage)
- Single-user mode (hardcoded author_id = 1)
- No server/cloud functionality

## 🔄 UNIFIED SYNCHRONIZATION SYSTEM

✅ **FULLY OPERATIONAL** - Consolidated export/import functionality with comprehensive data control and bug fixes.

**Key Features:**

- **Single synchronization point** - Unified interface in `/sync` route
- **Fixed checksum verification** - Resolved import errors for changeset files
- **Full backup import support** - Complete JSON backup restoration functionality
- **Auto file type detection** - Handles both .dat (changeset) and .json (full backup) files
- **Dual export modes** - Changeset (incremental) vs Full Export (complete database)
- **Flexible data ranges** - 7 days, 30 days, 90 days, 1 year, or **ALL DATA** (unlimited)
- **Auto-detection** - Smart file type recognition for imports
- **GDPR compliant** - Separate compliance exports in Settings
- **Device metadata** - Source device information included in exports

**Export Options:**

1. **Changeset Export** - Incremental changes for device synchronization

   - File format: `.dat` (binary)
   - Use case: Regular sync between devices
   - Time-based filtering available

2. **Full Export** - Complete database backup/migration
   - File format: `.json` (structured)
   - Use case: Backup, migration, comprehensive data transfer
   - Includes all students, classes, observations with metadata

**Implementation Details:**

- `src/components/UnifiedSyncManager.tsx` - Main synchronization interface
- `src-tauri/src/main.rs` - `export_all_data` Tauri command with date filtering
- `src-tauri/src/database.rs` - `get_observations_since` method for efficient querying
- `src/stores/appStore.ts` - `exportAllData` method with comprehensive error handling
- `src/components/SettingsPage.tsx` - Simplified to GDPR compliance exports only

**Architecture Consolidation:**

- **Removed** `FileSyncManager.tsx` (replaced by unified solution)
- **Eliminated** duplicate export/import functions from Settings page
- **Added** comprehensive data range selection including "All Data" option
- **Enhanced** user experience with single point of access

## 🧪 TESTING REQUIREMENTS

### Quality Assurance Standards

**Coverage Requirements:**

- Backend (Rust): 80% test coverage target
- Frontend (TypeScript): 70% test coverage minimum
- Integration tests for all GDPR operations
- Manual testing checklist completion

**Critical Test Scenarios:**

**GDPR Compliance:**

```rust
#[test]
fn test_hard_delete_completeness() {
    // Verify no traces remain after hard delete
}

#[test]
fn test_audit_trail_immutability() {
    // Ensure audit logs cannot be modified
}

#[test]
fn test_export_data_completeness() {
    // Validate complete data export functionality
}
```

**Data Integrity:**

```rust
#[test]
fn test_soft_delete_preserves_statistics() {
    // Verify aggregations work with deleted students
}

#[test]
fn test_database_migration_handling() {
    // Test migration from encrypted to plaintext
}
```

### Manual Testing Checklist

- [x] Application starts without errors
- [x] Student creation and editing works
- [x] Observation creation and search functions
- [x] Soft delete marks students as deleted
- [ ] Hard delete removes all data completely
- [x] Export functions provide complete data
- [x] Import functions (if implemented) work correctly
- [x] Audit trail captures all operations
- [x] No console errors or warnings

## 🎨 USER-DEFINED CATEGORY MANAGEMENT SYSTEM

✅ **FULLY OPERATIONAL** - Complete customizable category system with advanced color support and seamless migration from hardcoded categories.

**Key Features:**

- **Dynamic Category CRUD** - Create, read, update, delete custom categories via `/kategorien` interface
- **Advanced Color System** - Each category supports custom primary, background, and text colors
- **Visual Integration** - Categories display with custom colors throughout the application
- **Smart Migration** - Automatic creation of default categories matching original hardcoded system
- **GDPR Compliance** - Full audit logging for all category operations
- **Soft Delete Support** - Categories with existing observations can be deactivated instead of deleted

**Color System:**

Each category supports three color values:

- **Primary Color** (`color`) - Border and accent color (e.g., `#3B82F6`)
- **Background Color** (`background_color`) - Fill color (e.g., `#DBEAFE`)
- **Text Color** (`text_color`) - Text color for readability (e.g., `#1E3A8A`)

**Default Categories:**

Automatically created on first run with professional color schemes:

1. **Sozial** - Green theme (`#10B981`, `#D1FAE5`, `#065F46`)
2. **Fachlich** - Blue theme (`#3B82F6`, `#DBEAFE`, `#1E3A8A`)
3. **Verhalten** - Amber theme (`#F59E0B`, `#FEF3C7`, `#92400E`)
4. **Förderung** - Purple theme (`#8B5CF6`, `#EDE9FE`, `#5B21B6`)
5. **Sonstiges** - Gray theme (`#6B7280`, `#F3F4F6`, `#374151`)

**Implementation Details:**

- `src/components/CategoryManager.tsx` - Complete admin interface (647 lines)
- `get_categories`, `create_category`, `update_category`, `delete_category` Tauri commands
- Integrated into ObservationForm with live color preview
- Dynamic color display in Dashboard and StudentSearch components
- Backward compatible - existing observations continue to work seamlessly

**Architecture Benefits:**

- **User Flexibility** - Unlimited custom categories with personalized colors
- **Visual Organization** - Color-coded categories improve scanning and organization
- **Professional Appearance** - Customizable colors for institutional branding
- **No Breaking Changes** - Existing workflow enhanced, not disrupted

## 🚨 CRITICAL WARNINGS

### Security Status

- ❌ **ENCRYPTION DISABLED** - All data stored in plaintext
- ❌ **Single-user assumption** - No authentication system
- ⚠️ **Database file readable** - SQLite file contains plaintext data
- ✅ **GDPR compliance maintained** - Deletion and audit functions work

### Data Migration Risks

- **Existing encrypted databases** cannot be read by current version
- **Fresh database creation** required for first run
- **No automatic migration** from encrypted to plaintext format
- **Backup essential** before any deployment

### Development Dependencies

- **Linux**: Requires GTK development libraries
- **Windows**: Requires Visual Studio Build Tools
- **macOS**: Requires Xcode Command Line Tools
- **All platforms**: Node.js 18+, Rust 1.70+

## 📋 TASK COMPLETION REQUIREMENTS

### Before Marking Any Task Complete

**Frontend Quality Gates:**

```bash
npm run lint                # MUST pass without errors
npm run build              # MUST compile successfully
npm test                   # MUST pass all tests
```

**Backend Quality Gates:**

```bash
cd src-tauri
cargo clippy               # MUST pass without errors
cargo fmt --check          # MUST be properly formatted
cargo build --release      # MUST build successfully
cargo test                 # MUST pass all tests
cd ..
```

**Full Application Validation:**

```bash
npm run tauri:build        # MUST succeed completely
```

**Documentation Requirements:**

- Update relevant .md files for any API changes
- Document any new functionality
- Update this CLAUDE.md if architecture changes
- Maintain GDPR compliance documentation

### Security and Compliance Checks

- No sensitive data in logs or console output
- All data operations include audit trail entries
- Deletion functions work correctly (soft/hard delete)
- Export functions provide complete data sets
- Input validation prevents SQL injection
- Error messages don't expose internal details

## 🔗 QUICK REFERENCE LINKS

**Essential Documentation:**

- `CHANGELOG.md` - ✨ NEW: Complete version history and feature documentation
- `docs/API.md` - Complete Tauri command reference
- `docs/DELETE_FEATURES.md` - GDPR deletion implementation
- `docs/DPIA.md` - Data Protection Impact Assessment
- `ENCRYPTION_DISABLED.md` - Current security status
- `.serena/memories/task_completion_requirements.md` - Quality gates

**Development Files to Read First:**

1. `README.md` - Project overview and installation
2. `package.json` - Frontend dependencies and scripts
3. `src-tauri/Cargo.toml` - Backend dependencies
4. `ENCRYPTION_DISABLED.md` - Critical security context

**Key Implementation Files:**

- `src-tauri/src/main.rs` - All Tauri commands (including category CRUD)
- `src-tauri/src/database.rs` - Database operations (including category management)
- `src/components/CategoryManager.tsx` - ✨ NEW: Complete category admin interface
- `src/stores/appStore.ts` - Frontend state management
- `src/components/StudentSearch.tsx` - Main UI component with category colors

---

**🎯 REMEMBER**: This is a GDPR-compliant student observation system with NO P2P functionality. Features **UNIFIED SYNCHRONIZATION SYSTEM** with consolidated export/import through single `/sync` interface. Supports "All Data" exports and dual export modes (Changeset/Full). ✨ **NEW: USER-DEFINED CATEGORIES** with complete color customization system. Encryption is currently DISABLED - all data stored in plaintext. Always run quality gates before task completion!

**📅 Last Updated**: 2025-01-24 • **🔒 GDPR-Compliant** • **⚠️ No-Crypto Version** • **🔄 Unified Sync** • **🎨 Custom Categories**

- Always update correspondending .MD Files after making any changes worth mentioned to keep users and future Claude instances on track


# PROJECT_PLAN Integration
# Added by Claude Config Manager Extension

When working on this project, always refer to and maintain the project plan located at `.claude/.plans/PROJECT_PLAN.md`.

**Instructions for Claude Code:**
1. **Read the project plan first** - Always check `.claude/.plans/PROJECT_PLAN.md` when starting work to understand the project context, architecture, and current priorities.
2. **Update the project plan regularly** - When making significant changes, discoveries, or completing major features, update the relevant sections in PROJECT_PLAN.md to keep it current.
3. **Use it for context** - Reference the project plan when making architectural decisions, understanding dependencies, or explaining code to ensure consistency with project goals.

**Plan Mode Integration:**
- **When entering plan mode**: Read the current PROJECT_PLAN.md to understand existing context and priorities
- **During plan mode**: Build upon and refine the existing project plan structure
- **When exiting plan mode**: ALWAYS update PROJECT_PLAN.md with your new plan details, replacing or enhancing the relevant sections (Architecture, TODO, Development Workflow, etc.)
- **Plan persistence**: The PROJECT_PLAN.md serves as the permanent repository for all planning work - plan mode should treat it as the single source of truth

This ensures better code quality and maintains project knowledge continuity across different Claude Code sessions and plan mode iterations.
