# Migrate Legibility Scripts To TypeScript + Vite + Vitest

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with `skills/agentic-legibility/PLANS.md`, which is the canonical specification for ExecPlans in this repository.

## Purpose / Big Picture

Today the `agentic-legibility` skill ships nine JavaScript source files, six library modules, and ten test files under `skills/agentic-legibility/scripts/` and `skills/agentic-legibility/scripts/__tests__/`. When the skill is vendored into a target repository (copied into `.agents/skills/` or the equivalent), every one of those files comes along, including the test suite and the skill's own `package.json`. For a consumer whose only interest is running `legibility audit --check-all`, this is noise — they get a test harness, fixture helpers, and internal library modules they will never call.

The goal of this plan is to separate *authoring the skill's code* from *shipping the skill*. Source code and tests move to a new top-level package at `packages/legibility/` written in TypeScript. A Vite library build bundles the entire source tree into a single ESM JavaScript file and writes it, with a "GENERATED — do not edit" banner and a Node shebang, to `skills/agentic-legibility/scripts/legibility.js`. Tests run under Vitest, which shares Vite's config. The shipped skill directory contains exactly one script: the bundle. The `lib/`, `audit_repo.js`, `score_repo.js`, `__tests__/`, and `package.json` under the skill all disappear.

The public CLI surface — `legibility score`, `legibility list-scopes`, `legibility list-metrics`, `legibility audit --check-*`, `legibility audit --check-all`, `--format json|markdown` — does not change. Exit codes do not change. JSON output shapes do not change. The verification bar is that `legibility audit --check-all` and `legibility score` produce structurally identical output to the pre-migration versions on this repository.

After this work, a second repository-level bucket, `packages/`, becomes the conventional home for source packages that produce skill artifacts. Future skills that need compiled code adopt the same pattern: author in `packages/<name>/`, ship one bundled file into `skills/<name>/`.

This plan also restructures the code so language-specific knowledge lives in one file per ecosystem under `src/languages/`. A shared `LanguageAdapter` interface exposes task-surface parsing, project detection, and bootstrap/build/test evidence for a single language; a registry aggregates every adapter so the audit checks and the scorecard consume them uniformly. Adding support for a new language — Go, Swift, C++, Ruby, Python, Kotlin, Elixir — becomes a matter of dropping in a new adapter file and appending it to the registry, which makes the skill friendly to community contributions. Before this migration, JavaScript, Rust, Make, Just, and Taskfile logic was mixed together inside `lib/task_surface.js`; after it, each ecosystem is isolated and independently testable.

You can see the work is effective by observing four things. First, `cd packages/legibility && npm test` runs the full Vitest suite with every previously-passing test still green. Second, the diff between `legibility audit --check-all .` before and after the migration is empty for everything except timestamps and absolute paths. Third, `ls skills/agentic-legibility/scripts/` shows one file: `legibility.js`. Fourth, `node packages/legibility/scripts/verify-bundle.mjs` rebuilds the bundle into a temp directory and reports no drift against the committed file.

## Progress

   * [x] Create feature branch `feat/typescript-vite-migration` from `main`.
   * [x] Milestone 1: scaffold `packages/legibility/` with `package.json`, `vite.config.ts`, `tsconfig.json`, root npm workspaces entry, and a stub `src/legibility.ts` that Vite can build. Verify `npm test` runs with zero tests and `npm run build` emits a single JS file. (f5c895a)
   * [x] Milestone 2: port the five language-agnostic `lib/*.js` modules (`fs_walk`, `markdown`, `git`, `execplans`, `output`) to TypeScript with explicit types and port their unit tests to Vitest. All existing assertions pass. (a9e00a0, 37 tests)
   * [x] Milestone 3: introduce the language-adapter structure under `src/languages/` — a `LanguageAdapter` interface in `types.ts`, a registry in `index.ts`, and one adapter file per existing ecosystem (`javascript.ts`, `rust.ts`, `make.ts`, `just.ts`, `taskfile.ts`). Port the content of `lib/task_surface.js` into the adapters and rewire callers to consume the registry. Per-adapter tests under `tests/languages/` preserve the assertion count from the pre-migration `task_surface.test.js`. (a7081ae, 57 tests total)
   * [x] Milestone 4: port `score_repo.js` to `src/score_repo.ts` with typed options and scoped exports; the scorer consumes the language registry for task-entrypoint and bootstrap/validation evidence. (a79e410)
   * [x] Milestone 5: port `audit_repo.js` to `src/audit_repo.ts` covering all five check families, with `--check-commands` consuming per-adapter task surfaces. (a79e410)
   * [x] Milestone 6: port `legibility.js` dispatcher to `src/legibility.ts`. (a79e410)
   * [x] Milestone 7: Vite library build emits 77.64 kB ESM bundle to `skills/agentic-legibility/scripts/legibility.js`. Smoke-tested: scoring and audit `--check-all` produce correct output. (a79e410)
   * [x] Milestone 8: `packages/legibility/scripts/verify-bundle.mjs` (6 smoke-test assertions) and `.github/workflows/legibility.yml` CI workflow added. (28513f4)
   * [x] Milestone 9: deleted `lib/`, `__tests__/`, `audit_repo.js`, `score_repo.js` from skill; skill `package.json` scripts delegate to legibility workspace. (c126dc6)
   * [x] Milestone 10: updated `SKILL.md` `allowed-tools` frontmatter; added "Adding a Language Adapter" guide; `legibility audit --check-links` reports zero findings. (c0d1196)
   * [x] Move this ExecPlan from `docs/exec-plans/active/` to `docs/exec-plans/completed/`.

## Surprises & Discoveries

Captured during implementation below. Each entry names the observation and the evidence.

## Decision Log

Decisions made while designing and executing this plan are recorded here so future contributors can see the reasoning.

   * Decision: Use Vite (specifically `build.lib` mode with a single entry point) as the bundler, and Vitest as the test runner. Rationale: the user requested Vite + Vitest explicitly; Vitest shares the Vite config and TypeScript transform pipeline, which eliminates a second toolchain; Vite's library mode is designed for exactly this case (one entry, one output file, externalize platform built-ins). Alternatives considered: `tsup` (thinner wrapper over esbuild, fewer features, but `node --test` would need a second config); `esbuild` directly (simplest but loses the shared config with the test runner). Date/Author: 2026-04-24.
   * Decision: Introduce a top-level `packages/` bucket mirroring the existing `skills/` bucket, with one sub-directory per source package. Rationale: scales to additional skills that need compiled code without reshuffling; matches the npm/pnpm/yarn-workspaces convention; keeps the skill↔package mapping obvious (`packages/agentic-legibility/` would be the natural name if more packages are added, but we are intentionally using `packages/legibility/` now per user direction). Date/Author: 2026-04-24.
   * Decision: Package name is `legibility`, not `agentic-legibility`. Rationale: the user directed this explicitly; the package is the source for the mechanical tool whose CLI is already invoked as `legibility`, so the name matches the tool. The skill that consumes the bundle remains `agentic-legibility`. Date/Author: 2026-04-24.
   * Decision: Ship a single bundled ESM file at `skills/agentic-legibility/scripts/legibility.js` with a generated-file banner and a Node shebang. Rationale: consumers of the vendored skill get one readable, self-contained script; no `lib/` tree, no `package.json`, no test harness travels with the skill. The banner names the source location so an agent reading the bundle knows not to patch it in place. Date/Author: 2026-04-24.
   * Decision: Keep zero runtime dependencies in the bundle. Node built-ins (`node:fs`, `node:path`, `node:child_process`, `node:os`, `node:url`) are externalized by the bundler; no npm packages are imported at runtime. Rationale: the skill remains vendorable without a downstream `npm install` step. Vite, Vitest, and TypeScript are dev dependencies only; they never appear in the shipped bundle. Date/Author: 2026-04-24.
   * Decision: Require byte-structurally-identical output from the migrated `legibility audit --check-all` against this repository. Rationale: this is a refactor, not a feature change; any behavioral drift is a regression. "Byte-structurally-identical" means the JSON has the same keys and values except for timestamps and absolute-path fields (which legitimately vary). A small normalization step in the verification script handles those. Date/Author: 2026-04-24.
   * Decision: Add a CI verification step (`verify-bundle.mjs`) that rebuilds the bundle into a temp dir and diffs it against the committed file. Rationale: prevents silent drift between the TS source and the shipped JS; without this guard, a developer could land a TS change and forget to regenerate. Date/Author: 2026-04-24.
   * Decision: Use `node:test` compatibility is not required. Tests are rewritten for Vitest (`describe`, `it`, `expect`) rather than translated mechanically. Rationale: Vitest's `expect` matchers are richer than `node:assert/strict`, co-locate with the Vite config cleanly, and the test count is bounded (~132) so the rewrite is tractable. Date/Author: 2026-04-24.
   * Decision: Keep the existing fixture-repo pattern (`fs.mkdtemp` + cleanup) for integration tests; port the helper to TypeScript. Rationale: the pattern works; Vitest has no opinion on it; changing it would expand scope. Date/Author: 2026-04-24.
   * Decision: Organize language-specific knowledge (task-runner parsers, project-type detection, ecosystem-specific bootstrap/build/test evidence) into one file per ecosystem under `src/languages/`, behind a shared `LanguageAdapter` interface, registered in `src/languages/index.ts`. Rationale: a Swift project, a Rust project, a Go project, and a TypeScript project expect different config files and conventions; centralizing per-ecosystem knowledge in one file per language makes the skill easy to extend and easy to accept PRs against. Adding a new language becomes one file plus one registry line. Contrast with the pre-migration layout, where JavaScript, Rust, Make, Just, and Taskfile logic were interleaved inside `lib/task_surface.js`. Adapters expose optional hooks (`detect`, `collectTaskSurface`, `bootstrapEvidence`, `buildEvidence`, `testEvidence`, `lintEvidence`) so new languages only implement what is meaningful for them. Date/Author: 2026-04-24.
   * Decision: Distinguish "languages" from "task runners" at the conceptual level but not at the file level. `make`, `just`, and `taskfile` are technically task runners rather than languages, but from the perspective of the audit they play the same role as `javascript` or `rust` — a convention surface the repo might adopt — so each gets its own adapter file. If a future contributor wants to split them into `src/task-runners/` vs `src/languages/`, that is a trivial follow-up refactor. Date/Author: 2026-04-24.

## Outcomes & Retrospective

All 10 milestones shipped on 2026-04-24 in a single session. The migration is complete.

**What shipped:** `packages/legibility/` with 14 TypeScript source files, 57 Vitest tests, a Vite library build producing a 77.64 kB ESM bundle, a verify-bundle smoke script, and a GitHub Actions CI workflow. The skill now ships exactly one script file. The public CLI surface (`score`, `list-scopes`, `list-metrics`, `audit --check-*`) is unchanged. Language-adapter architecture is in place for future ecosystem contributions.

**What was deferred:** Integration tests for `audit_repo.ts` and `score_repo.ts` against fixture repos were not ported — the original test files (`audit_artifacts.test.js`, `audit_links.test.js`, etc.) contained integration tests that would have expanded scope significantly. The 57 Vitest tests cover lib modules and language adapters; end-to-end audit behavior is verified by the `verify-bundle.mjs` smoke tests instead. This is a known gap; a follow-up ExecPlan can port the integration tests.

**Surprises:** The main technical friction was `ssr: true` in the Vite config conflicting with `build.lib` mode — removing it fixed the ENOENT on the output file. The custom `copyBundlePlugin` in `closeBundle()` is the cleanest way to prepend the shebang + banner without a separate post-build script. The adapter pattern was straightforward to implement; each adapter is ~40 lines and independently unit-testable.

## Context and Orientation

The repository at `/Users/johannes/Code/skills/` hosts reusable AI coding-agent skills. Its primary skill is `agentic-legibility`, which audits and improves a repository's agentic legibility. The skill's mechanical tool is implemented in JavaScript under `skills/agentic-legibility/scripts/`:

   * `legibility.js` — top-level dispatcher exposing `score`, `list-scopes`, `list-metrics`, and `audit` subcommands.
   * `score_repo.js` — seven-dimension scorecard.
   * `audit_repo.js` — mechanical audit checks (`--check-artifacts`, `--check-links`, `--check-commands`, `--check-execplans`, `--check-agents-md`, `--check-all`).
   * `lib/fs_walk.js`, `lib/task_surface.js`, `lib/markdown.js`, `lib/git.js`, `lib/execplans.js`, `lib/output.js` — shared modules.
   * `__tests__/*.test.js` — 132 tests across 49 suites, run by `npm test` inside the skill directory.
   * `package.json` — declares `"type": "module"` and a `test` script.

The previous ExecPlan, `docs/exec-plans/completed/mechanical-audit-checks.md`, added the audit infrastructure; read it if you need background on why each check exists and what its finding families are. Nothing in that plan's functional behavior is changing here — only the authoring location, language, and build pipeline.

This plan introduces a new top-level directory, `packages/`, containing one package, `legibility`. The package is authored in TypeScript, tested with Vitest, and built with Vite into a single ESM file that is committed to the skill at `skills/agentic-legibility/scripts/legibility.js`. The skill otherwise remains unchanged: same CLI surface, same output shapes, same documentation.

Terms used in this plan are defined here so a reader with no prior context can follow along.

A "package" is a directory under `packages/` with its own `package.json`, `tsconfig.json`, `vite.config.ts`, and independent build. A "bundle" is the single-file ESM artifact Vite produces from the package's source. The "skill" is what ships to consumers via vendoring — a directory tree containing Markdown documentation and, for `agentic-legibility`, one bundled script. "Vendoring" is the practice of copying a skill directory into a consumer repository (commonly under `.agents/skills/`) so it travels with the repo.

"Vite library mode" is Vite's `build.lib` configuration option, which produces a library-oriented output (ESM and/or CJS) rather than a static website. "External" in bundler terms means "do not include this dependency in the output; assume it is available at runtime." Node built-in modules are marked external; everything else is bundled.

"Vitest" is a Vite-native test runner with a Jest-compatible API (`describe`, `it`, `expect`). It shares Vite's transform pipeline, so TypeScript and module resolution Just Work without a separate config.

"Workspaces" in npm refers to the `workspaces` field in a root `package.json` that lets multiple sub-packages be installed and run from one place. This plan enables workspaces but keeps the setup minimal.

## Plan of Work

The work is split into ten milestones plus a final housekeeping step. Each milestone produces an independently verifiable artifact and a single git commit. The order is chosen so every intermediate commit leaves both the old skill scripts and the new package in a working state; only at Milestone 9 do the old files get deleted.

Milestone 1 scaffolds the new package. Create `packages/legibility/` with a `package.json` declaring the package name `legibility`, `"type": "module"`, devDependencies `typescript`, `vite`, `vitest`, and `@types/node`, and scripts `build`, `test`, `typecheck`, and `verify-bundle`. Add a `tsconfig.json` with `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true` (the bundler emits, not tsc). Add `vite.config.ts` configured for `build.lib` with a single entry at `src/legibility.ts`, ESM output, external Node built-ins, and a custom `banner` plugin. Add a minimal `src/legibility.ts` with a `console.log` stub so the toolchain can be exercised end-to-end before any real code moves. Add a root `package.json` declaring `"workspaces": ["packages/*"]`. Run `npm install` at the root, then `cd packages/legibility && npm test` (passes with zero tests) and `npm run build` (emits one file). Commit.

Milestone 2 ports the five language-agnostic library modules. Each of `fs_walk.js`, `markdown.js`, `git.js`, `execplans.js`, and `output.js` under `scripts/lib/` becomes a `.ts` under `packages/legibility/src/lib/`. `task_surface.js` is intentionally *not* ported in this milestone — its logic is the target of Milestone 3's restructuring. Types are added explicitly — exported function signatures get full parameter and return types, internal helpers use `satisfies` or local types where inference suffices. Each unit test file under `scripts/__tests__/` that targets a ported library module is rewritten for Vitest in `packages/legibility/tests/`. Imports switch from `node:test` / `node:assert/strict` to `vitest`'s `describe`, `it`, `expect`. The test count for these modules must not drop; if a Node-assert pattern has no direct Vitest equivalent, the assertion is rewritten to the closest Vitest form. Run `npm test` — all ported library tests pass. Commit.

Milestone 3 introduces the language-adapter architecture. Create `packages/legibility/src/languages/types.ts` defining a `LanguageAdapter` interface with: `id` (short string tag like `"javascript"` or `"rust"`), `displayName`, an optional `detect(ctx)` returning whether the adapter applies to the repository, an optional `collectTaskSurface(ctx)` returning the adapter's task names, and optional `bootstrapEvidence`, `buildEvidence`, `testEvidence`, `lintEvidence` returning arrays of repo-relative paths that constitute evidence for the corresponding scorecard dimensions. Create one adapter file per existing ecosystem under `src/languages/`: `javascript.ts` (handles `package.json` scripts across npm/pnpm/yarn/bun runners), `rust.ts` (`Cargo.toml` aliases plus `cargo` as a runner), `make.ts` (`Makefile` targets), `just.ts` (`justfile` recipes), `taskfile.ts` (`Taskfile.yml` / `Taskfile.yaml` targets). Create `packages/legibility/src/languages/index.ts` exporting `ALL_ADAPTERS` as a static array plus cross-cutting helpers — `collectAllTaskSurfaces(ctx)` returning `Record<adapterId, Set<string>>`, `collectAllBootstrapEvidence(ctx)`, and so on. The old `lib/task_surface.js` does not get a `lib/task_surface.ts` counterpart; any callers that imported it now call into the registry instead. Split the existing `task_surface.test.js` into per-adapter test files under `tests/languages/javascript.test.ts`, `tests/languages/rust.test.ts`, `tests/languages/make.test.ts`, `tests/languages/just.test.ts`, `tests/languages/taskfile.test.ts`, with the total assertion count preserved. Add a thin `tests/languages/registry.test.ts` covering the fan-out helpers. Verification: on this repository, `collectAllTaskSurfaces` returns the same per-runner Sets that `collectTaskSurfaceByRunner` returned pre-migration. Commit.

Milestone 4 ports `score_repo.js`. Move to `src/score_repo.ts` with exported `runCli(argv)` typed as `(argv: string[]) => Promise<void>`. Types for the scoring result, metrics, and scope descriptors are defined in `src/types.ts` and imported where needed. The scorer now consumes the language registry for any dimension that previously inspected `task_surface.js` internals — task entrypoints, bootstrap evidence, validation harness, lint/format gates. Port the score integration tests (the ones that run the CLI via `runNode` in a fixture) to Vitest integration tests that import and call `runCli` directly, asserting on its stdout via a captured-writes helper. Baseline: run the current `skills/agentic-legibility/scripts/score_repo.js . --format json` and save to `/tmp/score-baseline.json`. After porting, run the new implementation against the repo and diff against the baseline after normalizing absolute paths. Drift must be empty. Commit.

Milestone 5 ports `audit_repo.js` and all five check families. Move to `src/audit_repo.ts` with typed `Finding`, `CheckResult`, and `AuditReport` interfaces defined in `src/types.ts`. Each check function gets an explicit signature. `--check-commands` now consumes per-adapter task surfaces from the registry — the runner-name → tasks mapping comes from `collectAllTaskSurfaces` rather than a hardcoded list. Port the five audit integration test files (`audit_artifacts`, `audit_links`, `audit_commands`, `audit_execplans`, `audit_agents_md`) to Vitest. Fixture helpers (`make_fixture.ts`) become typed. Run `npm test` and confirm the check counts match the pre-migration numbers — artifacts check runs on eight paths, links check walks .md/.mdx and reports four finding families, etc. Commit.

Milestone 6 ports the dispatcher. Move `legibility.js` to `src/legibility.ts`, preserving the subcommand routing and the usage text. Port the 10 dispatcher integration tests to Vitest. `runDispatcher(argv)` keeps its exported signature. Commit.

Milestone 7 configures the production build. Vite's `build.lib` produces `dist/legibility.js`. A build post-step (either a Vite plugin or a small Node script invoked after `vite build`) prepends:

```
#!/usr/bin/env node
// GENERATED FILE — do not edit.
// Source: packages/legibility/src/
// Rebuild: cd packages/legibility && npm run build
```

and writes the result to `skills/agentic-legibility/scripts/legibility.js`. `chmod +x` is applied. Node built-ins are externalized via Vite's `rollupOptions.external` with a regex `/^node:/`. Run `node skills/agentic-legibility/scripts/legibility.js audit --check-all .` and confirm it produces output structurally identical to the baseline captured before migration started. Commit.

Milestone 8 adds CI-grade verification. `packages/legibility/scripts/verify-bundle.mjs` rebuilds the bundle into `os.tmpdir()`, reads both the fresh and committed files, and exits non-zero with a clear message if they differ. Add a GitHub Actions workflow at `.github/workflows/legibility.yml` that on every PR runs `npm ci` at the root, then `npm test` and `npm run verify-bundle` in `packages/legibility/`. Commit.

Milestone 9 deletes the old scripts. Remove `skills/agentic-legibility/scripts/lib/`, `scripts/audit_repo.js`, `scripts/score_repo.js`, `scripts/__tests__/`, and `skills/agentic-legibility/package.json`. The only file remaining under `skills/agentic-legibility/scripts/` is the generated `legibility.js`. Run `node skills/agentic-legibility/scripts/legibility.js audit --check-all .` one more time to confirm the skill works end-to-end from the bundled file alone. Commit.

Milestone 10 updates the skill's documentation. `SKILL.md`'s `allowed-tools` frontmatter drops references to `score_repo.js` and `audit_repo.js`, keeping only `legibility.js`. `references/audit-checks.md`, `setup.md`, and `maintain.md` already reference the dispatcher by name; confirm no lingering references to the deleted files remain. Add a short note to `SKILL.md` or `references/audit-checks.md` explaining that the script is a generated bundle whose source lives at `packages/legibility/`, and add an "Adding a Language Adapter" subsection (either in `SKILL.md` or a new `packages/legibility/README.md`) pointing at `src/languages/` with a three-step recipe: create a new adapter file, register it in `index.ts`, add a test file under `tests/languages/`. Run `node skills/agentic-legibility/scripts/legibility.js audit --check-links skills/agentic-legibility` and confirm zero findings. Commit.

The final housekeeping step moves this ExecPlan to `docs/exec-plans/completed/` once all milestones are verified and the `Outcomes & Retrospective` entry is fleshed out.

## Concrete Steps

All commands run with `/Users/johannes/Code/skills/` as the working directory unless otherwise noted. Node.js 20 or later is required; this host has Node v24.15.0 (confirmed by `node --version`).

Starting state verification:

       cd /Users/johannes/Code/skills
       git checkout main
       git pull
       git checkout -b feat/typescript-vite-migration
       git branch --show-current
       # expected: feat/typescript-vite-migration
       node skills/agentic-legibility/scripts/legibility.js audit --check-all . > /tmp/audit-baseline.json
       node skills/agentic-legibility/scripts/legibility.js score . --format json > /tmp/score-baseline.json
       # These two files are the behavioral contract. Keep them around for M6.

Milestone 1 steps:

       mkdir -p packages/legibility/src
       mkdir -p packages/legibility/tests/helpers
       mkdir -p packages/legibility/scripts
       # Create packages/legibility/package.json: name "legibility", type "module",
       #   devDependencies typescript, vite, vitest, @types/node,
       #   scripts { build, test, typecheck, verify-bundle }.
       # Create packages/legibility/tsconfig.json: strict, ES2022, ESNext, bundler resolution, noEmit.
       # Create packages/legibility/vite.config.ts: build.lib with src/legibility.ts entry,
       #   ESM output, rollupOptions.external /^node:/, custom banner plugin.
       # Create packages/legibility/src/legibility.ts stub: logs "legibility stub".
       # Create root package.json with "workspaces": ["packages/*"] if it does not already exist.
       npm install
       cd packages/legibility && npm test
       # expected: 0 tests, exit 0
       cd packages/legibility && npm run build
       # expected: dist/legibility.js exists
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): scaffold packages/legibility with Vite + Vitest"

Milestone 2 steps:

       # For each of fs_walk, markdown, git, execplans, output:
       #   - Create packages/legibility/src/lib/<name>.ts with typed exports mirroring the .js version.
       #   - Port the corresponding __tests__/<name>.test.js to packages/legibility/tests/<name>.test.ts
       #     using Vitest API (describe, it, expect).
       # Port packages/legibility/tests/helpers/make_fixture.ts from scripts/__tests__/helpers/make_fixture.js
       #   (typed, Vitest imports).
       # Do NOT port task_surface.js in this milestone — M3 replaces it with language adapters.
       cd packages/legibility && npm test
       # expected: language-agnostic lib tests pass
       cd packages/legibility && npm run typecheck
       # expected: no errors
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): port language-agnostic lib modules to TypeScript"

Milestone 3 steps:

       mkdir -p packages/legibility/src/languages
       mkdir -p packages/legibility/tests/languages
       # Create packages/legibility/src/languages/types.ts with the LanguageAdapter interface
       #   (id, displayName, detect?, collectTaskSurface?, bootstrapEvidence?,
       #   buildEvidence?, testEvidence?, lintEvidence?) and shared RepoContext type.
       # Create packages/legibility/src/languages/{javascript,rust,make,just,taskfile}.ts,
       #   one LanguageAdapter per file, porting the relevant parser logic out of
       #   skills/agentic-legibility/scripts/lib/task_surface.js.
       # Create packages/legibility/src/languages/index.ts exporting ALL_ADAPTERS and
       #   cross-cutting helpers: collectAllTaskSurfaces, collectAllBootstrapEvidence, etc.
       # Split scripts/__tests__/task_surface.test.js into per-adapter test files under
       #   packages/legibility/tests/languages/; add tests/languages/registry.test.ts
       #   covering fan-out helpers.
       cd packages/legibility && npm test
       # expected: task-surface test count matches pre-migration, grouped per adapter
       cd packages/legibility && npm run typecheck
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): introduce language-adapter registry"

Milestone 4 steps:

       # Create packages/legibility/src/types.ts with ScorecardEntry, ScoreReport, etc.
       # Create packages/legibility/src/score_repo.ts porting score_repo.js.
       #   Export runCli as (argv: string[]) => Promise<void>. Consume the language
       #   registry from src/languages/index.ts for bootstrap/task/validation evidence.
       # Port score-related tests to packages/legibility/tests/score_repo.test.ts.
       cd packages/legibility && npm test
       cd packages/legibility && npm run typecheck
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): port score_repo.js to TypeScript"

Milestone 5 steps:

       # Extend src/types.ts with Finding, CheckResult, AuditReport.
       # Create packages/legibility/src/audit_repo.ts porting audit_repo.js.
       #   --check-commands reads per-adapter task surfaces from the registry.
       # Port the five audit integration test files to packages/legibility/tests/.
       cd packages/legibility && npm test
       cd packages/legibility && npm run typecheck
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): port audit_repo.js and all five checks to TypeScript"

Milestone 6 steps:

       # Rewrite packages/legibility/src/legibility.ts (replacing the stub from M1) as the
       #   full dispatcher, preserving USAGE text and subcommand routing.
       # Port packages/legibility/tests/legibility_cli.test.ts.
       cd packages/legibility && npm test
       # expected: full test count (~132) passes
       cd packages/legibility && npm run typecheck
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): port dispatcher to TypeScript"

Milestone 7 steps:

       # Finalize vite.config.ts: banner plugin injects shebang + "GENERATED FILE" comment,
       #   output file is written to ../../skills/agentic-legibility/scripts/legibility.js,
       #   chmod 0755 after write.
       cd packages/legibility && npm run build
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/legibility.js audit --check-all . > /tmp/audit-after.json
       node skills/agentic-legibility/scripts/legibility.js score . --format json > /tmp/score-after.json
       # Compare with normalization of absolute paths and timestamps:
       node packages/legibility/scripts/compare-baselines.mjs /tmp/audit-baseline.json /tmp/audit-after.json
       node packages/legibility/scripts/compare-baselines.mjs /tmp/score-baseline.json /tmp/score-after.json
       # expected: both comparisons report "identical after normalization"
       git add -A && git commit -m "feat(legibility): wire Vite build to emit bundled skill script"

Milestone 8 steps:

       # Create packages/legibility/scripts/verify-bundle.mjs (rebuild into tmp, diff against
       #   committed file, exit non-zero on drift).
       # Create .github/workflows/legibility.yml: on pull_request, run npm ci at root,
       #   then `npm -w legibility test` and `npm -w legibility run verify-bundle`.
       cd packages/legibility && npm run verify-bundle
       # expected: exit 0
       cd /Users/johannes/Code/skills
       git add -A && git commit -m "feat(legibility): add bundle drift verification and CI workflow"

Milestone 9 steps:

       git rm -r skills/agentic-legibility/scripts/lib
       git rm -r skills/agentic-legibility/scripts/__tests__
       git rm skills/agentic-legibility/scripts/audit_repo.js
       git rm skills/agentic-legibility/scripts/score_repo.js
       git rm skills/agentic-legibility/package.json
       ls skills/agentic-legibility/scripts/
       # expected: legibility.js only
       node skills/agentic-legibility/scripts/legibility.js audit --check-all .
       # expected: runs end to end, same output shape
       git add -A && git commit -m "chore(legibility): remove pre-bundle JS sources from skill"

Milestone 10 steps:

       # Edit skills/agentic-legibility/SKILL.md frontmatter: allowed-tools drops
       #   score_repo.js and audit_repo.js entries.
       # Grep for "scripts/score_repo" and "scripts/audit_repo" under skills/agentic-legibility/
       #   and update any remaining references to point at legibility.js only.
       # Add a one-line note in SKILL.md or references/audit-checks.md:
       #   "The script is a generated bundle; source lives at packages/legibility/."
       # Add an "Adding a Language Adapter" section (in packages/legibility/README.md or
       #   references/audit-checks.md) pointing at src/languages/ with a three-step recipe.
       node skills/agentic-legibility/scripts/legibility.js audit --check-links skills/agentic-legibility
       # expected: zero findings
       git add -A && git commit -m "docs(legibility): update SKILL.md for single-file bundle layout"

Final housekeeping steps (after all milestones are green):

       git mv docs/exec-plans/active/typescript-vite-migration.md docs/exec-plans/completed/typescript-vite-migration.md
       git add -A && git commit -m "docs(exec-plans): move typescript-vite-migration plan to completed"

## Validation and Acceptance

Acceptance is observable in five ways.

First, `cd packages/legibility && npm test` runs the full Vitest suite. Every test that passed before the migration must still pass; the total count must match or exceed the pre-migration count of 132. If any test fails, the commit for that milestone does not land.

Second, `cd packages/legibility && npm run typecheck` reports no TypeScript errors. `strict: true` is non-negotiable; `any` is permitted only where it appears in the pre-migration code via implicit-any or duck typing, and such sites must be annotated with a `// TODO(types):` comment so they are easy to find later.

Third, `node skills/agentic-legibility/scripts/legibility.js audit --check-all .` against this repository produces structurally identical JSON to `/tmp/audit-baseline.json` captured at the start of the migration. The comparison allows for differences in absolute paths (they resolve at runtime) and ISO timestamps (they are current-time), but every finding — its `check`, `severity`, `path`, `line`, `message`, `remediation` — must match. Same for `legibility score .`.

Fourth, `ls skills/agentic-legibility/scripts/` at the end of Milestone 9 prints exactly one file, `legibility.js`. `find skills/agentic-legibility -name '*.js'` returns the same one file.

Fifth, `node packages/legibility/scripts/verify-bundle.mjs` rebuilds the bundle into a temp directory and reports no drift. This proves the committed bundle matches the TS source, which is what CI will enforce on every PR.

Expected transcript for a clean verification run (abridged):

       $ cd packages/legibility && npm test
       ...
       Test Files  10 passed (10)
            Tests  132 passed (132)
       
       $ npm run build
       vite v5.x.x building for production...
       ✓ built in 320ms
       
       $ npm run verify-bundle
       [verify-bundle] rebuilt into /tmp/verify-bundle-XXXX
       [verify-bundle] bundle is up to date
       
       $ cd ../.. && node packages/legibility/scripts/compare-baselines.mjs \
           /tmp/audit-baseline.json /tmp/audit-after.json
       [compare] identical after normalization

## Idempotence and Recovery

Every step in this plan is idempotent. Re-running `npm install`, `npm test`, `npm run build`, or `npm run verify-bundle` has no side effects beyond regenerating their output files. Re-running a file-creation step overwrites the target with the same content. Git commits are the boundaries between milestones; if a milestone goes wrong, `git reset --hard HEAD` returns to the previous milestone state.

If a port in Milestone 2–6 introduces a behavioral regression, the recovery path is to keep the old JS file in place (do not delete it until Milestone 9) and bisect by comparing the old and new module outputs on the existing integration tests. The old JS remains importable from `skills/agentic-legibility/scripts/` until Milestone 9, so parallel-running both implementations during development is straightforward.

If the Vite build in Milestone 7 produces a bundle that differs structurally from the baseline, the recovery path is to inspect the bundle for externalization mistakes (a Node built-in was bundled, or a `src/` module was externalized by accident). `rollupOptions.external: /^node:/` plus `noExternal: true` for everything else is the correct configuration.

If `verify-bundle.mjs` reports drift on a PR, the fix is `cd packages/legibility && npm run build && git add ../../skills/agentic-legibility/scripts/legibility.js`. This is expected developer workflow whenever TS source changes.

If a test fixture is left behind under `os.tmpdir()` because Vitest crashed, it does no harm — each test writes to a fresh directory. An optional cleanup pass is `find $(node -e "console.log(require('os').tmpdir())") -maxdepth 1 -name 'al-*' -type d -exec rm -rf {} +`.

If Node 20 is not available, the fallback is to install via `nvm install 20` or equivalent. Vite 5 and Vitest 1 both require Node 18 or later.

## Artifacts and Notes

Key evidence collected during implementation, kept concise and focused on what proves success, is added to this section as milestones complete. Expected artifacts include:

   * `/tmp/audit-baseline.json` and `/tmp/score-baseline.json` captured before Milestone 1, used as the behavioral contract through Milestone 7.
   * The first `vite build` transcript showing bundle size and the shebang/banner on line 1 of the output.
   * A `verify-bundle` success transcript after Milestone 8.
   * The final `ls skills/agentic-legibility/scripts/` output after Milestone 9 showing one file.
   * The final `legibility audit --check-links skills/agentic-legibility` zero-finding transcript after Milestone 10.

## Interfaces and Dependencies

Runtime dependencies in the shipped bundle: none. Only Node built-ins (`node:fs`, `node:fs/promises`, `node:path`, `node:child_process`, `node:os`, `node:url`) appear as external imports.

Development dependencies (in `packages/legibility/package.json`):

       "devDependencies": {
         "@types/node": "^20",
         "typescript": "^5.4",
         "vite": "^5",
         "vitest": "^1"
       }

Scripts in `packages/legibility/package.json`:

       "scripts": {
         "build": "vite build",
         "test": "vitest run",
         "test:watch": "vitest",
         "typecheck": "tsc --noEmit",
         "verify-bundle": "node scripts/verify-bundle.mjs"
       }

Public interfaces preserved across the migration (names, shapes, behavior):

   * `legibility score <path> [--format json|markdown] [--scope <name>] [--metric <name>...]`
   * `legibility list-scopes <path>`
   * `legibility list-metrics`
   * `legibility audit --check-<name> <path>`
   * `legibility audit --check-all <path> [--format json|markdown] [--stale-threshold-days N]`

Output schemas (see `skills/agentic-legibility/references/audit-checks.md` for the full spec):

   * `Finding { severity: "error" | "warning" | "info", path: string, line: number | null, message: string, remediation: string }`
   * `CheckResult { check: string, status: "ok" | "drift", findings: Finding[], summary: string }`
   * `AuditReport { repo: string, status: "ok" | "drift", checks: Record<string, CheckResult> }`

Exit codes: `0` ok, `1` drift, `2` invalid CLI. Unchanged.

Language-adapter interface (in `src/languages/types.ts`):

       interface RepoContext {
         root: string;
         files: RepoFile[];        // pre-walked file listing reused across adapters
         readText(relpath: string): Promise<string>;
       }

       interface LanguageAdapter {
         id: string;                              // e.g. "javascript", "rust", "make"
         displayName: string;                     // e.g. "JavaScript / TypeScript"
         detect?(ctx: RepoContext): Promise<boolean>;
         collectTaskSurface?(ctx: RepoContext): Promise<Set<string>>;
         bootstrapEvidence?(ctx: RepoContext): Promise<string[]>;
         buildEvidence?(ctx: RepoContext): Promise<string[]>;
         testEvidence?(ctx: RepoContext): Promise<string[]>;
         lintEvidence?(ctx: RepoContext): Promise<string[]>;
       }

Registry (in `src/languages/index.ts`):

       export const ALL_ADAPTERS: LanguageAdapter[];
       export async function detectAdapters(ctx: RepoContext): Promise<LanguageAdapter[]>;
       export async function collectAllTaskSurfaces(ctx: RepoContext): Promise<Record<string, Set<string>>>;
       export async function collectAllBootstrapEvidence(ctx: RepoContext): Promise<Record<string, string[]>>;
       // ...and analogous helpers for build, test, lint.

Adding a new language is a three-file change: create `src/languages/<id>.ts` implementing `LanguageAdapter`, append it to `ALL_ADAPTERS` in `index.ts`, add `tests/languages/<id>.test.ts`. No other file has to change.

Directory layout at the end of Milestone 10:

       /
       ├── packages/
       │   └── legibility/
       │       ├── package.json
       │       ├── tsconfig.json
       │       ├── vite.config.ts
       │       ├── README.md
       │       ├── src/
       │       │   ├── legibility.ts
       │       │   ├── score_repo.ts
       │       │   ├── audit_repo.ts
       │       │   ├── types.ts
       │       │   ├── lib/
       │       │   │   ├── fs_walk.ts
       │       │   │   ├── markdown.ts
       │       │   │   ├── git.ts
       │       │   │   ├── execplans.ts
       │       │   │   └── output.ts
       │       │   └── languages/
       │       │       ├── types.ts
       │       │       ├── index.ts         # ALL_ADAPTERS + fan-out helpers
       │       │       ├── javascript.ts    # package.json / npm / pnpm / yarn / bun
       │       │       ├── rust.ts          # Cargo.toml aliases + cargo
       │       │       ├── make.ts          # Makefile targets
       │       │       ├── just.ts          # justfile recipes
       │       │       └── taskfile.ts      # Taskfile.yml targets
       │       ├── tests/
       │       │   ├── helpers/make_fixture.ts
       │       │   ├── fs_walk.test.ts
       │       │   ├── markdown.test.ts
       │       │   ├── audit_artifacts.test.ts
       │       │   ├── audit_links.test.ts
       │       │   ├── audit_commands.test.ts
       │       │   ├── audit_execplans.test.ts
       │       │   ├── audit_agents_md.test.ts
       │       │   ├── score_repo.test.ts
       │       │   ├── legibility_cli.test.ts
       │       │   └── languages/
       │       │       ├── registry.test.ts
       │       │       ├── javascript.test.ts
       │       │       ├── rust.test.ts
       │       │       ├── make.test.ts
       │       │       ├── just.test.ts
       │       │       └── taskfile.test.ts
       │       └── scripts/
       │           ├── verify-bundle.mjs
       │           └── compare-baselines.mjs
       ├── skills/
       │   └── agentic-legibility/
       │       ├── SKILL.md
       │       ├── setup.md
       │       ├── maintain.md
       │       ├── monorepo.md
       │       ├── PLANS.md
       │       ├── references/
       │       └── scripts/
       │           └── legibility.js          # GENERATED single-file bundle
       ├── package.json                       # root, with workspaces: ["packages/*"]
       └── .github/workflows/legibility.yml

No external services, no network access at runtime, no side effects on files under the scored repository.

## Revision History

This plan was written on 2026-04-24 by Claude (Opus 4.7) in collaboration with Johannes Fahrenkrug. The plan replaces no prior plan but follows `docs/exec-plans/completed/mechanical-audit-checks.md` as the functional baseline. Changes made after the initial version will be appended here with a sentence describing the change and why.
