# Security Scanning & Multi-Platform Build Documentation

## Overview

This document describes the security scanning and multi-platform build infrastructure set up for the DSGVO Student Observation System.

## Security Scanning Workflows

### 1. Dependency Vulnerability Scanning

**File**: `.github/workflows/security-scan.yml`

#### npm Audit (Frontend Dependencies)
- Runs on every push and Monday at 9 AM UTC
- Scans all npm packages for known vulnerabilities
- Audit level set to HIGH (fails on high/critical vulnerabilities)
- Results uploaded as artifacts

#### cargo audit (Backend Dependencies)
- Scans all Rust crates for known security vulnerabilities
- Runs in the `src-tauri` directory
- Uses official Rust Security Advisory Database
- Results uploaded as artifacts

### 2. CodeQL Security Analysis

**Purpose**: Static Application Security Testing (SAST)

- Analyzes JavaScript and TypeScript code for security issues
- Runs weekly and on every push
- Detects:
  - SQL injection vulnerabilities
  - Cross-site scripting (XSS)
  - Unsafe deserialization
  - Buffer overflows
  - Command injection
  - Other OWASP Top 10 issues

**Configuration**: 
- Languages: JavaScript, TypeScript
- Queries: security-extended, security-and-quality
- Results available in GitHub Security tab

### 3. Secret Scanning

**Tool**: TruffleHog OSS

- Detects accidentally committed secrets (API keys, tokens, passwords)
- Scans entire repository history
- Runs on every push and Monday at 9 AM UTC
- Configuration:
  - `--debug` flag for detailed output
  - `--only-verified` for high-confidence results

### 4. License Compliance Check

- Ensures all dependencies use approved licenses:
  - MIT
  - Apache-2.0
  - BSD-2-Clause / BSD-3-Clause
  - ISC
  - 0BSD

- Both npm and Rust dependencies checked
- Fails on unapproved licenses (with option to override)

### 5. SAST Analysis (SonarQube)

**Status**: Optional (requires SONAR_TOKEN secret)

- Deep static code analysis
- Code quality metrics
- Technical debt assessment
- Security hotspots detection

**Setup**:
1. Sign up at https://sonarcloud.io
2. Add `SONAR_TOKEN` to GitHub repository secrets
3. Analysis runs automatically on each push

### 6. Dependency Report

- Generates npm dependency tree (`npm ls`)
- Generates Cargo dependency tree (`cargo tree`)
- Detects unused dependencies with `depcheck`
- Helps identify outdated or unnecessary packages

## Security Report

All security scans generate a comprehensive report that includes:

- **Execution Date**: When the scan ran
- **Repository/Branch/Commit**: Context information
- **Executive Summary**: Status of all scans
- **Recommendations**: Security best practices

### Accessing Security Reports

1. **GitHub Actions Tab**: View individual workflow runs
2. **Artifacts**: Download detailed scan results
3. **Pull Request Comments**: Automatic comments on PRs with security findings

## Multi-Platform Build Workflow

**File**: `.github/workflows/desktop-build.yml`

### Supported Platforms

#### Linux (.deb)
- **OS**: Ubuntu 20.04 (for compatibility)
- **Artifacts**:
  - `.deb` package (Debian/Ubuntu)
  - `.AppImage` (Universal Linux executable)
- **Dependencies**: libssl-dev, libgtk-3-dev, librsvg2-dev, libayatana-appindicator3-dev

#### Windows (.msi, .exe)
- **OS**: Windows Latest
- **Artifacts**:
  - `.msi` installer (MSI format)
  - `.exe` installer (NSIS format)
- **Target**: x86_64-pc-windows-msvc

#### macOS (.dmg)
- **OS**: macOS Latest
- **Architectures**:
  - ARM64 (Apple Silicon) → `macos-arm64`
  - x86_64 (Intel) → `macos-x64`
- **Artifacts**: `.dmg` bundles and `.app` packages

### Build Process

1. **Pre-build Checks** (Ubuntu): Validates frontend build and Rust code
   - Checks frontend build
   - Validates Rust formatting
   - Fails fast if issues detected
   
2. **Platform-Specific Builds** (Linux/Windows/macOS):
   - Checkout Code
   - Setup Node.js 18
   - Setup Rust with platform targets
   - Caching: Use swatinem/rust-cache for faster builds
   - Install platform dependencies
   - Build frontend
   - Build Tauri application
   - Check for build artifacts
   - Upload artifacts (30-day retention)

3. **Error Handling**:
   - All builds use `continue-on-error: true` to complete even on failure
   - Build logs uploaded separately for debugging
   - Build summary report generated with status

### Triggers

- **Manual**: `workflow_dispatch` - Run anytime from GitHub UI
- **Push**: On push to `main`, `master`, `Dev` branches
- **Scheduled**: Nightly builds (2 AM UTC) to catch regressions

### Build Summary

After all platforms complete, a build summary is generated showing:
- Platform build status
- Build completion time
- Artifact download links

## Automated Dependency Updates

**File**: `.github/dependabot.yml`

### npm Updates
- **Schedule**: Weekly (Monday 4 AM UTC)
- **Limit**: 5 open PRs maximum
- **Labels**: `dependencies`, `npm`
- **Reviewers**: Automatically assigned to you

### Cargo Updates
- **Schedule**: Weekly (Monday 4:30 AM UTC)
- **Limit**: 3 open PRs maximum
- **Labels**: `dependencies`, `cargo`
- **Reviewers**: Automatically assigned to you

### GitHub Actions Updates
- **Schedule**: Weekly (Sunday 5 AM UTC)
- **Limit**: 5 open PRs maximum
- **Labels**: `dependencies`, `github-actions`

### Merging Dependabot PRs

1. Check that tests pass (CI workflow)
2. Review dependency changes
3. Merge PR (auto-rebase enabled)

## CI/CD Integration

### PR Quality Gate (`pr-quality-gate.yml`)

Runs on every pull request:
- ESLint checks
- TypeScript type checking
- Unit tests with coverage
- Rust Clippy linting
- Rust tests

PRs are blocked until all checks pass.

### Continuous Integration (`ci.yml`)

Runs on every push:
- Full test suite
- Build verification
- Security checks (npm audit, cargo audit, CodeQL)
- Performance benchmarks

## Best Practices

### For Developers

1. **Keep Dependencies Updated**: Review and merge Dependabot PRs promptly
2. **Monitor Security Alerts**: Check GitHub Security tab weekly
3. **Fix Vulnerabilities**: Address high/critical issues immediately
4. **Test Locally**: Run `npm run lint` and `npm test` before pushing
5. **Review Changes**: Check what Dependabot is updating

### For Release Manager

1. **Use Multi-Platform Builds**: Always build on all platforms before release
2. **Verify Artifacts**: Test built installers on each platform
3. **Check Security Reports**: Review latest scan results
4. **Update Dependencies**: Ensure dependencies are current before release
5. **Sign Binaries**: (Future) Implement code signing for production releases

## Troubleshooting

### Build Failures

**Linux Build Fails**:
- **Missing GTK libraries**: Install `libgtk-3-dev`, `libglib2.0-dev`, `libwebkit2gtk-4.0-dev`
- **pkg-config not found**: Install `pkg-config`
- **Missing development headers**: Run `sudo apt-get install build-essential`
- **WebKit build issues**: Ensure `libwebkit2gtk-4.0-dev` is installed
- Solution: Workflow automatically installs all dependencies via `apt-get`

**Windows Build Fails**:
- **MSVC not found**: Ensure Visual Studio or Build Tools installed
- **Missing SDK**: Install Windows 10+ SDK
- **Path issues**: Check for spaces in paths
- Solution: Use `dtolnay/rust-toolchain@stable` with `x86_64-pc-windows-msvc` target

**macOS Build Fails**:
- **Xcode not installed**: Run `xcode-select --install`
- **Apple Silicon target missing**: Manually add via `rustup target add aarch64-apple-darwin`
- **Code signing issues**: Ensure entitlements configured in `tauri.conf.json`
- Solution: Workflow installs all required Rust targets automatically

### Security Scan Issues

**npm audit Fails**:
- Check for outdated packages
- Review vulnerability details
- Update or patch vulnerable packages

**CodeQL Timeout**:
- Increase timeout in workflow
- Split analysis into smaller jobs
- Check GitHub Actions quotas

**Secret Scan False Positives**:
- Add to TruffleHog allowlist
- Use `.trufflehogignore` file
- Document why secret is safe

## Monitoring & Alerts

### GitHub Security Tab

- Vulnerability alerts
- Dependabot alerts
- Secret scanning findings
- CodeQL results

### Workflow Notifications

- Email on workflow failures
- PR comments with security findings
- Artifact uploads for manual review

## Future Enhancements

1. **Code Signing**: Implement signing for release binaries
2. **Notarization**: Add macOS notarization for App Store distribution
3. **SBOM Generation**: Create Software Bill of Materials for compliance
4. **DAST Testing**: Add Dynamic Application Security Testing
5. **Performance Baselines**: Track performance regressions over time

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [CodeQL Documentation](https://codeql.github.com/)
- [TruffleHog Documentation](https://github.com/trufflesecurity/trufflehog)
- [Tauri Build Documentation](https://tauri.app/)

---

**Last Updated**: 2025-11-12
**Version**: 1.0
