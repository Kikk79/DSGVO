🔧 Quick Start Command

  If they want to jump straight into development:
  # Read these 3 files first for immediate context:
  cat README.md package.json src-tauri/Cargo.toml

  💡 Essential Context Points

  The new Claude instance needs to understand:
  - No server architecture - everything is P2P between notebook/desktop
  - GDPR by design - encryption, audit trails, data minimization
  - SQLite changesets for P2P replication (not file sync)
  - Tauri 2.0 framework combining Rust + React
  - System dependencies required for compilation (GTK, PKG_CONFIG, etc.)

  These 20 files contain the complete implementation blueprint and would allow
  any developer (or Claude) to understand the architecture, continue
  development, fix issues, or deploy the system.


To fully understand this project and continue development, another Claude
  instance should read these essential files in order:

  🎯 Core Understanding (Read First)

  1. README.md - Complete project overview, architecture, features, and roadmap
  2. package.json - Dependencies, scripts, and project metadata
  3. src-tauri/Cargo.toml - Rust dependencies and build configuration

  🏗️ Architecture & Implementation

  4. src-tauri/src/main.rs - Main application entry point and Tauri commands
  5. src-tauri/src/database.rs - SQLite database layer with encryption
  6. src-tauri/src/crypto.rs - AES-256-GCM encryption and key management
  7. src-tauri/src/p2p.rs - P2P synchronization with mTLS
  8. src-tauri/src/audit.rs - GDPR-compliant audit logging
  9. src-tauri/src/gdpr.rs - Data protection and compliance functions

  📱 Frontend Implementation

  10. src/App.tsx - Main React application structure
  11. src/stores/appStore.ts - Zustand state management with Tauri integration
  12. src/components/Layout.tsx - Navigation and overall UI layout
  13. src/components/ObservationForm.tsx - Quick observation entry form
  14. src/components/Dashboard.tsx - Main dashboard with statistics

  ⚙️ Configuration & Build

  15. src-tauri/tauri.conf.json - Tauri app configuration
  16. vite.config.ts - Frontend build configuration
  17. tailwind.config.js - UI styling configuration

  📋 Documentation & Compliance

  18. docs/DPIA.md - Complete Data Protection Impact Assessment
  19. docs/INSTALLATION.md - System requirements and setup instructions

  🧪 Testing Framework

  20. tests/integration.test.ts - P2P sync, GDPR compliance, and security tests

  