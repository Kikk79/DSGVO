# Technology Stack

## Frontend (TypeScript/React)
- **React**: 18.2.0 with TypeScript
- **State Management**: Zustand 4.4.7
- **Styling**: TailwindCSS 3.3.6 with PostCSS/Autoprefixer
- **Forms**: React Hook Form 7.48.2
- **Routing**: React Router DOM 6.20.1
- **Icons**: Lucide React 0.294.0
- **Date Utilities**: date-fns 3.0.6
- **UI Components**: React Select 5.8.0

## Backend (Rust)
- **Framework**: Tauri 2.0 (Desktop Framework)
- **Database**: SQLx 0.7 (Type-safe Database) with SQLite
- **Async Runtime**: Tokio 1.0 with full features
- **Date/Time**: Chrono 0.4 with serde support
- **UUID**: UUID 1.0 with v4 and serde features
- **Error Handling**: anyhow 1.0, thiserror 1.0
- **Logging**: tracing 0.1, tracing-subscriber 0.3, env_logger 0.11.3
- **Encoding**: base64 0.22
- **Random**: rand 0.8

## Security & Networking
- **TLS**: rustls 0.22, rustls-pemfile 2.0, tokio-rustls 0.25
- **Service Discovery**: mdns-sd 0.10  
- **Certificate Generation**: rcgen 0.12
- **Encryption**: Currently disabled (keyring and chacha20poly1305 commented out)

## Development Tools
- **Build Tool**: Vite 5.0.0 with React plugin
- **TypeScript**: 5.2.2 with strict configuration
- **Linting**: ESLint 8.53.0 with TypeScript parser
- **Testing**: Vitest 1.0.4 (configured but not extensively used yet)
- **Package Manager**: npm with package-lock.json

## Tauri Plugins
- @tauri-apps/plugin-dialog (file dialogs)
- @tauri-apps/plugin-fs (filesystem access)
- @tauri-apps/plugin-notification (system notifications)
- @tauri-apps/plugin-shell (shell command execution)
- tauri-plugin-updater (application updates)

## Configuration
- **Vite**: Port 1420, strict port enforcement
- **TypeScript**: ES2020 target, strict mode, bundler module resolution
- **ESLint**: React hooks, TypeScript integration
- **PostCSS**: TailwindCSS processing
- **Tauri**: Custom protocol enabled by default