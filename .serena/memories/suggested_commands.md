# Suggested Commands for Development

## Essential Development Commands

### Frontend Development
```bash
# Start frontend development server
npm run dev

# Build frontend for production  
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Lint TypeScript/React code
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

### Backend Development (Rust)
```bash
# Navigate to Rust project
cd src-tauri

# Build debug version
cargo build

# Build release version  
cargo build --release

# Run tests
cargo test

# Run linting
cargo clippy

# Format code
cargo fmt

# Check without building
cargo check

# Return to project root
cd ..
```

### Full Application Development
```bash
# Run complete development environment (Frontend + Backend)
npm run tauri:dev

# Build complete application with installer
npm run tauri:build

# Access Tauri CLI directly
npm run tauri [command]
```

## Task Completion Commands

### Code Quality (run after making changes)
```bash
# Frontend quality checks
npm run lint
npm run build  # Verify TypeScript compilation

# Backend quality checks  
cd src-tauri
cargo clippy
cargo fmt --check
cargo test
cd ..

# Full application test
npm run tauri:build  # Verify complete build works
```

### Testing Commands
```bash
# Frontend tests
npm test                # Run all tests
npm run test:ui         # Interactive test UI

# Backend tests  
cd src-tauri
cargo test              # Unit tests
cargo test --release    # Release mode tests
cd ..
```

## System-Specific Commands (Linux)

### Package Management
```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt update && sudo apt install -y \
    build-essential \
    libssl-dev \
    pkg-config \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.0-dev

# Install Node.js dependencies
npm install
```

### File Operations
```bash
# List files and directories
ls -la

# Find files
find . -name "*.ts" -o -name "*.rs"

# Search in files
grep -r "pattern" src/
grep -r "pattern" src-tauri/src/

# Change directories
cd src/                 # Frontend source
cd src-tauri/          # Backend source  
cd docs/               # Documentation
```

### Git Commands
```bash
# Check status
git status

# Add changes
git add .
git add src/            # Add only frontend changes
git add src-tauri/      # Add only backend changes

# Commit changes
git commit -m "feat: description"
git commit -m "fix: description"

# View differences
git diff
git diff --staged

# View logs
git log --oneline
```

## Debugging Commands

### Application Debugging
```bash
# Run with verbose logging
RUST_LOG=debug npm run tauri:dev

# Check application logs
tail -f ~/.local/share/schuelerbeobachtung/logs/app.log

# Database inspection (if SQLite CLI available)
sqlite3 ~/.local/share/schuelerbeobachtung/data.db
```

### System Information
```bash
# Check system info
uname -a
lsb_release -a

# Check ports (if networking issues)
netstat -tlnp | grep :1420

# Check processes
ps aux | grep schuelerbeobachtung
```

## Quick Reference

### Most Common Workflow
```bash
# 1. Start development
npm run tauri:dev

# 2. Make changes to frontend (src/) or backend (src-tauri/src/)

# 3. Before committing - quality checks
npm run lint
cd src-tauri && cargo clippy && cd ..

# 4. Test the build
npm run tauri:build

# 5. Commit changes
git add .
git commit -m "feat: your change description"
```

### Emergency Commands
```bash
# Clean build (if issues)
npm run tauri clean
rm -rf node_modules
npm install

# Reset Rust build
cd src-tauri
cargo clean
cd ..

# Force rebuild
npm run tauri:build --force
```

## Environment Variables
```bash
# Enable debug logging
export RUST_LOG=debug

# Set custom data directory
export SCHUELERBEOBACHTUNG_DATA_DIR=/custom/path

# Development mode
export NODE_ENV=development
```