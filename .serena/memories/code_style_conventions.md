# Code Style and Conventions

## TypeScript/React Conventions

### Configuration
- **TypeScript**: Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`
- **Target**: ES2020 with DOM libraries
- **JSX**: react-jsx transform (no need for React imports)
- **Module Resolution**: bundler mode with import extensions allowed

### ESLint Configuration
- **Base**: eslint:recommended
- **Plugins**: react-hooks/recommended, react-refresh
- **Parser**: @typescript-eslint/parser
- **Rules**: 
  - `react-refresh/only-export-components` warning with constant export allowed
  - React version auto-detection enabled

### File Structure
```
src/
├── components/     # React components
├── hooks/          # Custom React hooks  
├── stores/         # Zustand state stores
├── styles/         # CSS and styling
├── utils/          # Utility functions
├── App.tsx         # Main application component
└── main.tsx        # Application entry point
```

### Naming Conventions
- **Files**: PascalCase for components (e.g., `StudentSearch.tsx`)
- **Components**: PascalCase function components
- **Hooks**: camelCase starting with 'use'
- **Stores**: camelCase with 'Store' suffix

## Rust Conventions

### Project Structure
```
src-tauri/src/
├── main.rs         # Main application entry and Tauri commands
├── database.rs     # Database operations and models
├── crypto.rs       # Encryption/decryption (currently disabled)
├── p2p.rs         # Peer-to-peer networking
├── gdpr.rs        # GDPR compliance functions
└── audit.rs       # Audit logging functionality
```

### Code Style
- **Edition**: 2021
- **Formatting**: Standard `cargo fmt`
- **Linting**: `cargo clippy` for code quality
- **Error Handling**: 
  - `anyhow` for general error handling
  - `thiserror` for custom error types
  - `Result<T, String>` for Tauri commands

### Naming Conventions
- **Files**: snake_case (e.g., `database.rs`)
- **Functions**: snake_case
- **Structs**: PascalCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Modules**: snake_case

## Dependencies Management

### Frontend Dependencies
- **Production**: Only essential runtime dependencies
- **Development**: Comprehensive tooling (ESLint, TypeScript, Vite)
- **Version Strategy**: Caret ranges for minor updates (^)

### Backend Dependencies
- **Features**: Explicitly specified (e.g., `tokio = { version = "1.0", features = ["full"] }`)
- **Security**: Commented out encryption dependencies due to system issues
- **Database**: Full SQLite feature set with runtime-tokio-rustls

## Configuration Files

### Package.json Scripts
- `dev`: Vite development server
- `build`: TypeScript compilation + Vite build
- `preview`: Vite preview server  
- `tauri`: Tauri CLI access
- `tauri:dev`: Full development with backend
- `tauri:build`: Production build with installer
- `test`: Vitest test runner
- `test:ui`: Vitest UI mode
- `lint`: ESLint check
- `lint:fix`: ESLint auto-fix

### Development Standards
- **Type Safety**: Strict TypeScript configuration
- **Code Quality**: ESLint + cargo clippy
- **Testing**: Vitest for frontend, cargo test for backend
- **Building**: Vite for frontend, cargo for backend
- **Formatting**: Prettier-compatible ESLint rules + cargo fmt