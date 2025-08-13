# Codebase Structure

The project is structured into a Rust backend (`src-tauri/`) and a React/TypeScript frontend (`src/`).

- **`/` (Project Root)**: Contains configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `.eslintrc.json`), main entry points (`index.html`), and documentation (`README.md`, `GEMINI.md`, `docs/`).
- **`src/` (Frontend)**:
    - `App.tsx`: Main React application component.
    - `main.tsx`: Frontend entry point.
    - `components/`: Contains reusable React components (e.g., `AddStudent.tsx`, `Dashboard.tsx`, `ObservationForm.tsx`, `SettingsPage.tsx`, `SyncManager.tsx`, `StudentSearch.tsx`, `DataCorrection.tsx`, `DataPortability.tsx`, `PrivacyPolicy.tsx`, `Layout.tsx`).
    - `stores/`: Contains Zustand state management stores (e.g., `appStore.ts`).
    - `styles/`: Contains global CSS (`globals.css`).
- **`src-tauri/` (Backend)**:
    - `src/`: Contains Rust source code for the backend logic.
        - `main.rs`: Main Rust application entry point.
        - `audit.rs`: Audit logging functionality.
        - `crypto.rs`: Cryptographic operations (encryption/decryption).
        - `database.rs`: Database interactions (SQLite, SQLx).
        - `gdpr.rs`: GDPR compliance features.
        - `p2p.rs`: P2P synchronization logic.
    - `Cargo.toml`: Rust project manifest and dependencies.
    - `Cargo.lock`: Rust dependency lock file.
    - `tauri.conf.json`: Tauri application configuration.
    - `build.rs`: Rust build script.
    - `capabilities/`: Tauri capabilities configuration (`main.json`).
    - `gen/`: Generated files (schemas).
    - `icons/`: Application icons for various platforms.
    - `target/`: Compiled Rust binaries and build artifacts.
- **`tests/`**: Contains end-to-end tests (`integration.test.ts`).
- **`docs/`**: Additional documentation files (e.g., `API.md`, `CHANGELOG_DELETE_FEATURES.md`, `DELETE_FEATURES.md`, `DEPLOYMENT.md`, `DPIA.md`, `INSTALLATION.md`, `QUICK_INSTALL.md`, `README_DEPLOYMENT.md`).
- **`node_modules/`**: Frontend dependencies.
- **`.git/`**: Git repository files.
- **`.github/workflows/`**: GitHub Actions workflows (e.g., `release.yaml`).