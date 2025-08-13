# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript app (e.g., `components/`, `stores/`, `styles/`, `App.tsx`, `main.tsx`).
- `src-tauri/`: Tauri 2 backend (Rust, `Cargo.toml`, `tauri.conf.json`, `capabilities/`).
- `tests/`: Vitest specs (e.g., `integration.test.ts`).
- `dist/`: Production build output (Vite).
- `docs/` and root configs: `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `.eslintrc.json`.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server for the web UI.
- `npm run preview`: Serve the production build locally.
- `npm run build`: Type-check (`tsc`) and build the app with Vite.
- `npm run tauri:dev`: Launch Tauri desktop app in dev.
- `npm run tauri:build`: Build packaged desktop binaries.
- `npm test`: Run Vitest in node/jsdom.
- `npm run test:ui`: Run Vitest with the interactive UI.
- `npm run lint` / `npm run lint:fix`: Lint (and auto-fix) project files.

## Coding Style & Naming Conventions
- TypeScript, React 18, Tailwind CSS; prefer functional components and hooks.
- ESLint (`eslint:recommended`, React Hooks, react-refresh) is authoritative; fix all warnings.
- Indentation: 2 spaces; single quotes or existing file style.
- Filenames: components `PascalCase.tsx` (e.g., `AddStudent.tsx`), utilities/stores `camelCase.ts` (e.g., `appStore.ts`).
- Keep side effects in stores/services; UI in `components/`.

## Testing Guidelines
- Framework: Vitest; place tests in `tests/` using `*.test.ts(x)`.
- Prefer integration tests for critical flows; mock Tauri plugins as needed.
- Run with `npm test`; add focused runs via `vitest -t "name"` if needed.

## Commit & Pull Request Guidelines
- Use Conventional Commits where possible: `feat:`, `fix:`, `refactor:`, `docs:`, etc.
- Commits: small, atomic, with clear scope and imperative subject.
- PRs: include purpose, linked issues, screenshots/CLI output, and test notes. Ensure `lint` and `test` pass.

## Security & Configuration Tips
- Avoid logging or committing any personal data (GDPR sensitive context).
- Review `src-tauri/capabilities/` and `tauri.conf.json` when adding permissions/plugins; use least privilege.
- Do not commit secrets; prefer env/config files excluded by `.gitignore`.
