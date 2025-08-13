# Project Structure

## Root Directory Structure
```
DSGVO/
├── src/                          # Frontend React/TypeScript source
├── src-tauri/                    # Rust backend source  
├── docs/                         # Documentation
├── tests/                        # Test files
├── node_modules/                 # Node.js dependencies (auto-generated)
├── dist/                         # Frontend build output (auto-generated)
├── package.json                  # Frontend dependencies and scripts
├── package-lock.json            # Locked dependency versions
├── tsconfig.json                # TypeScript configuration
├── tsconfig.node.json           # Node-specific TypeScript config
├── vite.config.ts               # Vite build configuration
├── tailwind.config.js           # TailwindCSS configuration
├── postcss.config.js            # PostCSS configuration  
├── .eslintrc.json               # ESLint linting rules
├── index.html                   # HTML entry point
├── .gitignore                   # Git ignore rules
├── README.md                    # Main project documentation
├── ENCRYPTION_DISABLED.md       # Encryption troubleshooting info
├── OBSERVATION_DELETE_FEATURE.md # Delete feature documentation
└── Schuelerbeobachtung_0.1.0_amd64_NO-CRYPTO.deb  # Built package
```

## Frontend Structure (src/)
```
src/
├── components/                   # React components
│   ├── StudentSearch.tsx         # Student search and observation management
│   └── [other components]        # Additional UI components
├── hooks/                        # Custom React hooks  
├── stores/                       # Zustand state management
│   └── appStore.ts              # Main application state
├── styles/                       # CSS and styling files
├── utils/                        # Utility functions and helpers
├── App.tsx                       # Root application component
└── main.tsx                      # Application entry point
```

## Backend Structure (src-tauri/)
```
src-tauri/
├── src/                          # Rust source code
│   ├── main.rs                   # Main entry point, Tauri commands
│   ├── database.rs               # Database operations, SQLite management
│   ├── crypto.rs                 # Encryption/decryption (currently disabled)
│   ├── p2p.rs                    # Peer-to-peer networking and sync
│   ├── gdpr.rs                   # GDPR compliance functions
│   └── audit.rs                  # Audit logging system
├── target/                       # Rust build output (auto-generated)
│   └── release/                  # Release builds
│       └── schuelerbeobachtung   # Compiled binary
├── Cargo.toml                    # Rust dependencies and metadata
├── Cargo.lock                    # Locked Rust dependency versions
└── tauri.conf.json               # Tauri application configuration
```

## Configuration Files

### Frontend Configuration
- **tsconfig.json**: TypeScript compiler settings (ES2020, strict mode)
- **vite.config.ts**: Vite bundler config (port 1420, React plugin)
- **tailwind.config.js**: TailwindCSS utility configuration
- **postcss.config.js**: CSS processing pipeline
- **.eslintrc.json**: Code linting rules and React/TS integration

### Backend Configuration  
- **Cargo.toml**: Rust project metadata, dependencies, features
- **tauri.conf.json**: Tauri app config, window settings, permissions

### Development Configuration
- **package.json**: npm scripts, frontend dependencies
- **.gitignore**: Version control exclusions
- **index.html**: HTML template for Tauri webview

## Key Directories

### Generated/Build Directories (auto-created)
- `node_modules/`: npm dependencies
- `dist/`: Frontend build output  
- `src-tauri/target/`: Rust compilation output
- `src-tauri/target/release/`: Production Rust binaries

### Data Directories (runtime)
- `~/.local/share/schuelerbeobachtung/`: User data (Linux)
  - `data.db`: Main SQLite database
  - `audit.db`: Audit log database  
  - `certs/`: TLS certificates for P2P
  - `logs/`: Application logs

## File Naming Conventions

### Frontend (TypeScript/React)
- **Components**: PascalCase (e.g., `StudentSearch.tsx`)
- **Hooks**: camelCase with 'use' prefix (e.g., `useStudentData.ts`)
- **Stores**: camelCase with 'Store' suffix (e.g., `appStore.ts`)
- **Utils**: camelCase (e.g., `dateHelpers.ts`)
- **Types**: PascalCase with 'Types' suffix (e.g., `StudentTypes.ts`)

### Backend (Rust)
- **Modules**: snake_case (e.g., `database.rs`, `p2p.rs`)
- **Functions**: snake_case (e.g., `create_observation`)
- **Structs**: PascalCase (e.g., `ObservationData`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_PORT`)

## Import/Module Patterns

### Frontend Imports
```typescript
// Tauri API imports
import { invoke } from '@tauri-apps/api/core';

// React imports  
import { useState, useEffect } from 'react';

// External libraries
import { format } from 'date-fns';

// Internal components
import { StudentSearch } from './components/StudentSearch';
```

### Backend Module Structure
```rust
// External crates
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tokio::net::TcpListener;

// Internal modules
mod database;
mod crypto;
mod p2p;

// Re-exports
pub use database::*;
```

## Build Artifacts

### Development Artifacts
- `dist/`: Vite development build
- `src-tauri/target/debug/`: Debug Rust builds

### Production Artifacts
- `src-tauri/target/release/schuelerbeobachtung`: Linux binary
- `Schuelerbeobachtung_0.1.0_amd64_NO-CRYPTO.deb`: Debian package
- Platform-specific installers (Windows MSI, macOS DMG)

## Documentation Structure
```
docs/ (planned)
├── api/              # API documentation
├── user-guide/       # End-user documentation  
├── admin-guide/      # Administrator documentation
├── developer/        # Development documentation
└── compliance/       # GDPR and legal documentation
```