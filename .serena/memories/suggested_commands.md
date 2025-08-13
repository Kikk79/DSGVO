# Suggested Commands for Development

## General
- `git clone <repository-url>`: Clone the repository.
- `npm install`: Install frontend dependencies.
- `cd src-tauri && cargo build`: Build Rust backend dependencies.
- `npm run prepare`: Run pre-commit hooks setup.
- `git config core.hooksPath .githooks`: Configure git hooks path.

## Development
- `npm run dev`: Start frontend development server.
- `npm run tauri dev`: Run Frontend + Backend in development mode (with hot-reloading).

## Building
- `npm run build`: Build frontend for production.
- `cd src-tauri && cargo build`: Build Rust backend in debug mode.
- `cd src-tauri && cargo build --release`: Build Rust backend in release mode.
- `npm run tauri build`: Build the complete application for production (creates installer).

## Testing
- `npm test`: Run frontend unit tests (Vitest).
- `npm run test:watch`: Run frontend tests in watch mode.
- `npm run test:coverage`: Generate frontend test coverage report.
- `cd src-tauri && cargo test`: Run all Rust backend unit tests.
- `cd src-tauri && cargo test --release`: Run Rust backend tests in release mode.
- `cd src-tauri && cargo test p2p::tests`: Run specific Rust backend modules tests (e.g., p2p).
- `cd src-tauri && cargo bench`: Run Rust performance tests.
- `npm run test:e2e`: Run Playwright end-to-end tests.
- `npm run test:e2e:ui`: Run Playwright tests in interactive UI mode.
- `npm run test:e2e:debug`: Run Playwright tests in debug mode.
- `npm run test:all`: Run all tests in parallel.

## Linting & Formatting
- `npm run lint`: Run ESLint for TypeScript.
- `npm run lint:fix`: Fix ESLint issues.
- `cd src-tauri && cargo clippy`: Run Clippy for Rust linting.
- `cd src-tauri && cargo fmt`: Format Rust code.

## Windows Specific Utilities
- `dir`: List directory contents.
- `cd`: Change directory.
- `type <filename>`: Display file content.
- `findstr <pattern> <filename>`: Search for a pattern in files.
- `copy`, `move`, `del`: File operations.
- `code .`: Open VS Code in the current directory (if installed and in PATH).