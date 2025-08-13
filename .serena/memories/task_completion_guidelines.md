# Task Completion Guidelines

When a task is completed, the following steps should be taken to ensure code quality and adherence to project standards:

1.  **Code Formatting:**
    *   **Rust:** Run `cargo fmt` in `src-tauri/`.
    *   **TypeScript:** Ensure Prettier is configured and run `npm run lint:fix` to fix ESLint issues.

2.  **Code Linting:**
    *   **Rust:** Run `cargo clippy` in `src-tauri/`.
    *   **TypeScript:** Run `npm run lint`.

3.  **Testing:**
    *   **Frontend Unit Tests:** Run `npm test`.
    *   **Backend Tests:** Run `cd src-tauri && cargo test`.
    *   **E2E Tests:** Run `npm run test:e2e`.
    *   Ensure new features have at least 80% test coverage.

4.  **Commit Messages:**
    *   Follow the Conventional Commits specification.

5.  **Pull Requests:**
    *   Ensure pull requests are small and focused on a single feature or bug fix.
    *   All CI checks (linting, testing) must pass before merging.

6.  **Documentation:**
    *   Add inline-docs for all public APIs.