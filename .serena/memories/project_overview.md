# Project Overview: DSGVO-Compliant Student Observation System

## Purpose
A desktop application for student observation with P2P synchronization between notebook and desktop computers, fully GDPR-compliant without server dependencies.

## Core Objectives
- **Primary Goal**: Secure, local student observation with direct device synchronization
- **Architecture**: Tauri (Rust + React TypeScript) for maximum security and performance  
- **Compliance**: Privacy by Design/Default according to GDPR standards
- **Device Topology**: Notebook (school) for data entry, Desktop (home) for analysis and reporting

## Key Features

### ✅ Implemented
- **GDPR Compliance & Security**: AES-256-GCM encryption (currently disabled), audit protocols, data minimization
- **Database & Replication**: SQLite with session/changeset, incremental P2P replication
- **P2P Synchronization**: mDNS discovery, certificate-based authentication, QR-code pairing
- **User Interface**: React TypeScript, WCAG 2.1 AA compliance, responsive design
- **Search & Reporting**: Full-text search, multi-criteria filters, JSON/CSV/PDF export
- **GDPR Deletion Functions**: Differentiated deletion, right to be forgotten, cascading deletion

### 🔄 In Development  
- **Test Infrastructure**: Unit tests, integration tests, E2E tests with Playwright
- **Build & Deployment**: Cross-platform builds, code signing, auto-update mechanisms

## Current Status
- **Encryption**: Currently disabled due to Linux system issues (see ENCRYPTION_DISABLED.md)
- **Version**: 0.1.0
- **Available Build**: `Schuelerbeobachtung_0.1.0_amd64_NO-CRYPTO.deb`

## Important Notes
- Data is currently stored in plaintext due to encryption being disabled
- Fresh database will be created on first run
- All core functionality works without encryption
- Security implications documented in ENCRYPTION_DISABLED.md