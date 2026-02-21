# Contributing to Tracking

Thanks for your interest in contributing! This document covers the essentials for getting set up and submitting changes.

## Setup

```bash
git clone https://github.com/astoreyai/tracking.git
cd tracking
npm install
npm run native:build   # Compile the C++ uinput addon (Linux required)
```

You will also need:
- **Linux** (Debian/Ubuntu recommended) with `/dev/uinput` access -- see [README.md](README.md#uinput-permissions) for permissions setup
- **Node.js 20+**
- **build-essential** and **python3** for the native addon

## Development Workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```

2. Make your changes and verify:
   ```bash
   npm test              # Run the full test suite
   npm run lint          # Check for lint errors
   npm run typecheck     # Verify TypeScript types
   npm run dev           # Manual testing with hot reload
   ```

3. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add gesture smoothing presets
   fix: prevent double-click on pinch release
   docs: update connector bus examples
   test: add edge cases for KNN classifier
   ```

4. Open a pull request against `main`.

## Project Structure

| Directory | Contents |
|-----------|----------|
| `src/main/` | Electron main process -- bus server, persistence, native input IPC |
| `src/renderer/` | React renderer -- tracking, gestures, graph, manifold, settings |
| `src/shared/` | Types shared across processes (protocol, bus-protocol, IPC channels) |
| `src/preload/` | Electron context bridge |
| `native/` | C++ N-API addon for uinput mouse/keyboard |
| `workers/` | Web Workers for layout computation |
| `demos/` | Runnable demo scripts |
| `assets/samples/` | Sample data files |
| `keymaps/` | Default gesture-to-key mappings |

## Testing

- Framework: **Vitest** with **happy-dom**
- Component tests: **@testing-library/react**
- Coverage thresholds: 90% statements, 85% branches, 90% functions, 90% lines

All tests must pass before merging. Run `npm run test:coverage` to check coverage locally.

## Code Style

- TypeScript strict mode
- ESLint with `@typescript-eslint` rules
- No `any` types without justification
- Prefer `const` over `let`; avoid `var`
- Use single quotes for strings (enforced by ESLint)
- Import order: Node builtins, external packages, then internal modules

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Prefixes:

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or updating tests |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `perf:` | Performance improvement |
| `chore:` | Build, CI, or tooling changes |
