# AI-First Development Workflow

This project follows an **AI-first development model** where AI agents (Claude, GitHub Copilot) handle the majority of implementation, while human developers provide direction and oversight.

## Development Philosophy

### Human Role: Direction & Oversight

-   Define features and requirements
-   Set design direction and UX priorities
-   Report issues and bugs
-   Review and approve major architectural changes
-   Make business/product decisions

### AI Agent Role: Implementation & Maintenance

-   Write all code implementations
-   Create and maintain documentation
-   Perform regular quality checks
-   Fix bugs and test failures
-   Optimize performance and bundle sizes
-   Make architectural decisions within project scope
-   Handle deployment and CI/CD
-   Proactively improve codebase

## AI Agent Principles

### 1. Take Initiative

-   Don't wait for explicit instructions on implementation details
-   Proactively create missing documentation
-   Identify and fix code smells, anti-patterns
-   Optimize performance without being asked
-   Add comprehensive tests for new features

### 2. Maintain Quality Standards

-   **Always** run checks before committing:
    -   Type checking: `bun run check`
    -   Test suite: `bun test:run`
    -   Build verification: `bun run build`
-   Keep documentation in sync with code
-   Follow established patterns in CLAUDE.md
-   Ensure accessibility compliance

### 3. Document Everything

Create and maintain:

-   Feature documentation in `docs/`
-   Code comments for complex logic
-   TASKS.md for future work
-   CLAUDE.md for development patterns
-   API integration docs

### 4. Complete Work Fully

-   Features should be fully implemented, tested, documented
-   Don't leave TODO comments - implement or create task
-   Commit working code with descriptive messages
-   Deploy after verification

## Workflow Example

### Human Request:

> "Add photo uploads to places"

### AI Implementation:

1. ✅ Design PhotoGallery component
2. ✅ Implement Google Drive integration
3. ✅ Add to PlaceDetailModal
4. ✅ Create comprehensive tests
5. ✅ Update TypeScript types
6. ✅ Write documentation (feature docs, API docs)
7. ✅ Run quality checks (types, tests, build)
8. ✅ Optimize bundle size (code splitting)
9. ✅ Commit with descriptive message
10. ✅ Deploy to production
11. ✅ Update TASKS.md

## Quality Checklist

Before every commit, AI agents should verify:

-   [ ] **Type Safety:** `bun run check` passes
-   [ ] **Tests:** All tests pass, new features have tests
-   [ ] **Build:** `bun run build` succeeds without warnings
-   [ ] **Code Review:** No console.logs, TODO comments, or dead code
-   [ ] **Performance:** Check bundle sizes, optimize if needed
-   [ ] **Accessibility:** No a11y violations
-   [ ] **Documentation:** Updated to reflect changes
-   [ ] **Patterns:** Follows established patterns in CLAUDE.md

## Documentation Standards

### When to Create Documentation

AI agents should create docs for:

-   **New Features:** User-facing capabilities (e.g., photo-upload-feature.md)
-   **Integrations:** External APIs (e.g., api-integrations.md)
-   **Architecture:** Major design decisions (e.g., state-management.md)
-   **Patterns:** Code conventions (update CLAUDE.md)
-   **Tasks:** Future work items (update TASKS.md)

### Documentation Structure

```
docs/
├── README.md              # Overview and navigation
├── TASKS.md               # Future work, prioritized
├── AI_DEVELOPMENT.md      # This file
├── architecture.md        # System design
├── patterns.md            # Code patterns
├── {feature}.md           # Feature-specific docs
└── ui/
    └── design-system.md   # UI components and styles
```

## Commit Message Format

```
<type>: <short description>

- Bullet points with details
- Test results or metrics
- Related file changes
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

## Agent Self-Improvement

Agents should continuously:

1. **Learn project patterns** from existing code
2. **Identify improvements** during code review
3. **Optimize proactively** (performance, DX, maintainability)
4. **Update documentation** when patterns change
5. **Create examples** for complex implementations

## Communication

When reporting completion:

-   ✅ What was done (features, fixes, improvements)
-   📊 Metrics (test coverage, bundle size, performance)
-   📝 Documentation created/updated
-   🚀 Deployment status
-   🔄 Any trade-offs or decisions made

## Project-Specific Context

### This Codebase

-   **Users:** Z & T (couple using shared Google account)
-   **Storage:** Dedicated Google Drive (simple flat structure)
-   **Deployment:** Firebase Hosting (auto-deploy from main)
-   **Testing:** Vitest with 242+ tests
-   **Bundle Size:** Target <500KB per chunk
-   **PWA:** Offline support, installable

### Key Files

-   `CLAUDE.md` - Development patterns and conventions
-   `TASKS.md` - Prioritized future work
-   `docs/` - Comprehensive documentation
-   `src/lib/config.ts` - Firebase/API configuration
-   `vite.config.ts` - Build configuration with code splitting

## Success Metrics

AI agents are successful when:

-   ✅ Features work completely on first try
-   ✅ Tests are comprehensive and passing
-   ✅ Documentation is thorough and accurate
-   ✅ Code follows established patterns
-   ✅ Performance meets standards
-   ✅ Changes are deployed without issues
-   ✅ Future agents can understand the code

---

**Remember:** Humans set the destination, AI agents drive the implementation. Take full ownership of code quality and completeness.
