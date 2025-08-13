# Task Completion Requirements

## Code Quality Checklist

### Before Marking Any Task Complete

#### Frontend (TypeScript/React) Quality Gates
```bash
# 1. Linting - MUST pass without errors
npm run lint

# 2. Type checking - MUST compile successfully
npm run build

# 3. Test execution (when tests exist)
npm test

# 4. Code formatting check
npm run lint:fix  # Apply auto-fixes if needed
```

#### Backend (Rust) Quality Gates
```bash
# Navigate to Rust project
cd src-tauri

# 1. Linting - MUST pass clippy without errors  
cargo clippy

# 2. Formatting - MUST be properly formatted
cargo fmt --check

# 3. Compilation - MUST build successfully
cargo build --release

# 4. Test execution - MUST pass all tests
cargo test

# Return to project root
cd ..
```

#### Full Application Validation
```bash
# 1. Complete build - MUST succeed
npm run tauri:build

# 2. Development mode - MUST start without errors
npm run tauri:dev  # Test briefly then stop
```

## Documentation Requirements

### Code Documentation
- **Rust**: Document all public functions, structs, and modules with `///` comments
- **TypeScript**: Document complex functions and components with JSDoc comments
- **API Changes**: Update relevant .md files in project root if APIs change

### Change Documentation
- **Commit Messages**: Follow conventional commit format
  - `feat:` for new features
  - `fix:` for bug fixes  
  - `docs:` for documentation changes
  - `refactor:` for code refactoring
  - `test:` for test additions/changes

## Testing Requirements

### Unit Testing
- **Frontend**: Use Vitest for component and utility testing
- **Backend**: Use `#[test]` and `#[tokio::test]` for Rust unit tests
- **Coverage**: Aim for reasonable test coverage on new code

### Integration Testing
- **Database**: Test database operations with real SQLite
- **P2P**: Test networking components with mock peers
- **GDPR**: Test compliance functions thoroughly

### Manual Testing Checklist
- [ ] Application starts without errors
- [ ] Core functionality works as expected
- [ ] UI responds correctly to user interactions
- [ ] Error handling works properly
- [ ] No console errors or warnings

## Security and Compliance

### Security Review
- **Data Protection**: Ensure no sensitive data in logs
- **Input Validation**: Validate all user inputs
- **Error Handling**: Don't expose internal details in error messages
- **Encryption**: Handle current no-crypto state appropriately

### GDPR Compliance
- **Data Minimization**: Only collect necessary data
- **Audit Logging**: Log all data operations
- **Deletion Rights**: Ensure complete data removal
- **Data Export**: Provide complete data export functionality

## Performance Standards

### Frontend Performance
- **Build Size**: Keep bundle size reasonable
- **Load Time**: Application should start quickly
- **Responsiveness**: UI should be responsive to user input
- **Memory Usage**: Monitor for memory leaks in long-running sessions

### Backend Performance  
- **Database**: Optimize queries for reasonable response times
- **P2P Sync**: Network operations should handle timeouts gracefully
- **Resource Usage**: Monitor CPU and memory usage

## Environment Compatibility

### Linux Support (Primary)
- Test on Ubuntu/Debian systems
- Verify all system dependencies are available
- Ensure package builds correctly

### Cross-Platform Considerations
- Code should be portable across platforms
- Avoid Linux-specific features where possible
- Test builds on multiple platforms when possible

## Deployment Readiness

### Build Verification
- [ ] Debug build works (`cargo build`)
- [ ] Release build works (`cargo build --release`)
- [ ] Frontend build works (`npm run build`)
- [ ] Complete application builds (`npm run tauri:build`)
- [ ] Generated packages are functional

### Configuration Validation
- [ ] All configuration files are valid
- [ ] Dependencies are properly declared
- [ ] Version numbers are updated appropriately

## Error Handling Standards

### User-Facing Errors
- Provide clear, actionable error messages
- Don't expose internal implementation details
- Offer recovery suggestions when possible
- Log detailed errors for debugging

### System Errors
- Handle database connection failures gracefully
- Manage network timeouts and interruptions
- Provide fallback behavior for critical operations

## Code Review Requirements

### Self-Review Checklist
- [ ] Code follows project conventions
- [ ] No commented-out code blocks
- [ ] No debugging console.log or println! statements
- [ ] Proper error handling implemented
- [ ] Documentation updated if needed

### Quality Metrics
- **Complexity**: Keep functions reasonably simple
- **Duplication**: Eliminate code duplication
- **Naming**: Use clear, descriptive names
- **Structure**: Organize code logically

## Final Verification Commands

### Complete Quality Check Sequence
```bash
# 1. Frontend quality
npm run lint && npm run build

# 2. Backend quality  
cd src-tauri && cargo clippy && cargo fmt --check && cargo test && cd ..

# 3. Full application test
npm run tauri:build

# 4. Version control
git status  # Verify all changes are committed
git log --oneline -n 5  # Review recent commits
```

### Success Criteria
✅ All linting passes without errors  
✅ All tests pass  
✅ Application builds successfully  
✅ No security vulnerabilities introduced  
✅ Documentation is updated  
✅ Changes are properly committed  
✅ GDPR compliance maintained