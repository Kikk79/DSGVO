# Project Overview

This is a GDPR-compliant student observation application designed for desktop use. It facilitates secure and local student observation with direct P2P synchronization between devices, eliminating the need for a central server. The application is built using the Tauri framework, with a Rust backend and a React/TypeScript frontend.

## Key Technologies

*   **Backend:** Rust, Tauri, SQLx, Tokio
*   **Frontend:** React, TypeScript, Vite, TailwindCSS, Zustand
*   **Database:** SQLite
*   **P2P Synchronization:** mDNS for discovery and mTLS for secure communication

## Architecture

The application follows a client-server architecture, where the "server" is a Rust backend running in a Tauri webview. The frontend is a single-page application (SPA) built with React and TypeScript. Communication between the frontend and backend is handled through Tauri's `invoke` API.

Data is stored locally in an SQLite database. The backend is responsible for all business logic, including database operations, data encryption, P2P synchronization, and GDPR compliance features.

# Building and Running

## Prerequisites

*   Rust (1.70+)
*   Node.js (18+)
*   System dependencies for Tauri (see `README.md` for platform-specific instructions)

## Development

To run the application in development mode (with hot-reloading for the frontend), use the following command:

```bash
npm run tauri dev
```

## Building

To build the application for production, use the following command:

```bash
npm run tauri build
```

This will create a standalone executable for your platform in the `src-tauri/target/release` directory.

## Testing

The project has a comprehensive test suite that includes unit tests, integration tests, and end-to-end tests.

*   **Frontend Unit Tests:** `npm test` (runs with Vitest)
*   **Backend Tests:** `cd src-tauri && cargo test`
*   **E2E Tests:** `npm run test:e2e` (runs with Playwright)

# Development Conventions

## Coding Style

*   **Rust:** The project follows the standard Rust formatting guidelines, enforced by `cargo fmt`. `cargo clippy` is used for linting.
*   **TypeScript:** The project uses ESLint and Prettier to enforce a consistent coding style.

## Commit Messages

Commit messages should follow the Conventional Commits specification.

## Pull Requests

Pull requests should be small and focused on a single feature or bug fix. They must pass all CI checks (linting, testing) before being merged.
