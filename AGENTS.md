# Repository Guidelines

## Project Structure & Module Organization
- npm workspaces drive the monorepo: `packages/core` houses the TypeScript CLI, `packages/ui` the Next.js dashboard, and root scripts coordinate both.
- Runtime assets (`config/`, `audit/`, `debug-config/`) stay at the top level so the CLI can mount them; never commit secrets from these folders.
- CLI tests live in `packages/core/tests`; UI components reside in `packages/ui/src` with static assets in `packages/ui/public`.

## Build, Test, and Development Commands
- Install dependencies once at the root with `npm install`.
- CLI dev loop: `npm run dev --workspace @devrue/directus-config-toolkit`, then invoke the fresh build via `node packages/core/dist/cli.js`.
- UI dev loop: `npm run dev --workspace @devrue/directus-config-toolkit-ui` (available at http://localhost:3000).
- Build everything with `npm run build`; scope to a single workspace using `npm run build --workspace <name>`.

## Coding Style & Naming Conventions
- TypeScript runs in strict mode; keep imports grouped, add explicit return types on exported helpers, and favour small, composable utilities.
- CLI code follows 2-space indentation, double quotes, and trailing semicolons. Command modules end with `*Command.ts` and register through `register*` helpers.
- UI code honours the Next 15 ESLint config and Tailwind conventions: PascalCase React components, camelCase hooks, and colocated styling or route files under their component directory.

## Testing Guidelines
- Jest covers the CLI. Run suites with `npm run test --workspace @devrue/directus-config-toolkit`; append `-- <pattern>` to focus on a file.
- Integration cases in `packages/core/tests/integration` require Docker; use `npm run test:integration`, `:stable`, `:latest`, or `:all` after pulling the referenced Directus images.
- Generate coverage before submitting via `npm run test:coverage --workspace @devrue/directus-config-toolkit` (reports land in `packages/core/coverage`).
- UI linting currently stands in for formal tests; run `npm run lint --workspace @devrue/directus-config-toolkit-ui` to catch regressions.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`type(scope): summary`), e.g. `feat(core): add schema sync force flag`. Use scopes like `core`, `ui`, or a specific directory.
- Bundle related code, tests, and docs in the same change; avoid cross-package commits unless the feature spans both surfaces.
- PRs should explain the intent, list verification steps, link issues, and attach screenshots or CLI snippets whenever behaviour changes.

## Security & Configuration Tips
- Keep `.env*` files out of Git; provide sanitized samples in docs instead.
- Scrub `config/` and `audit/` before sharing archives. Generate bcrypt hashes with `dct hash-password` rather than storing plaintext credentials.
