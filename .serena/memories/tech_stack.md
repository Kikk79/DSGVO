# Tech Stack

## Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** TailwindCSS (Responsive Design)
- **State Management:** Zustand
- **Forms:** React Hook Form
- **Icons:** Lucide React
- **Date Utilities:** date-fns

## Backend (Rust)
- **Desktop Framework:** Tauri 2.0
- **Database:** SQLite (with SQLx for type-safe database interactions, rusqlite for session/changeset)
- **Asynchronous Runtime:** Tokio
- **Encryption:** ChaCha20-Poly1305 (for data at rest), rustls (for TLS)
- **P2P Synchronization:** mDNS-SD (Service Discovery), tokio-rustls (mTLS implementation), rcgen (certificate generation)
- **OS Credential Storage:** Keyring
- **Error Handling:** anyhow, thiserror
- **Logging:** tracing, tracing-subscriber, env_logger
- **Serialization:** serde, serde_json
- **Utilities:** directories, chrono, uuid, base64, rand, x509-parser

## Build Tools
- **Frontend:** Vite
- **Rust:** Cargo
- **Tauri CLI:** for building and running the desktop application

## Testing
- **Frontend Unit Tests:** Vitest
- **Backend Tests:** `cargo test`
- **E2E Tests:** Playwright