# Monorepo Guidance

Use this guidance when the repository contains multiple projects, packages, or independently deployable units under a single root. The goal is a single authoritative entrypoint at the root with targeted subproject docs only where they earn their keep.

## Detection

A repository is likely a monorepo when it has:

- Multiple project manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`) in different subdirectories.
- A workspace configuration (`workspaces` in root `package.json`, `pnpm-workspace.yaml`, `Cargo.toml` with `[workspace]`, Nx/Turborepo/Lerna config).
- Subdirectories with their own build, test, or lint entrypoints.
- A root README that routes readers to subdirectories (`cd client`, `cd server`, etc.).

Use the scoring script's `--list-scopes` flag to identify strong subprojects:

```
node scripts/legibility.js list-scopes /path/to/repo
```

Evaluate each subproject that the scoring tool lists and decide whether to add an AGENTS.md file to it.
List each discovered subproject in the root agent map with a short description (see below).

Treat the `--list-scopes` output as the default subproject inventory for the task, not as a suggestion.
Before finishing, every discovered scope must be accounted for in exactly one of these ways:

- routed directly from the root `AGENTS.md`
- routed indirectly through a parent-directory `AGENTS.md`
- explicitly excluded with a written rationale

Do not collapse multiple discovered scopes into an unlabeled bucket. If you compress routing, the
parent bucket must itself have an `AGENTS.md` that enumerates the child scopes.

## Root Agent Map in a Monorepo

The root `AGENTS.md` is the single authoritative entrypoint for the entire repository. In a monorepo it must:

- Name every subproject and describe its purpose in one line.
- Account for every scope returned by `legibility list-scopes`, either directly or via a linked parent-directory `AGENTS.md`.
- State which subprojects have their own `AGENTS.md` and link to them.
- List root-level commands that span subprojects (e.g., `make test-all`, workspace-wide lint).
- Describe the dependency direction between subprojects if one exists (e.g., "client depends on shared-types, server depends on shared-types, client and server must not import from each other").
- Point to root-level docs (`docs/architecture/`, `docs/decisions/`) that cover cross-project concerns.

Keep the root map short. It routes to subproject docs; it does not duplicate them.

## When a Subproject Deserves Its Own Agent Doc

Create a subproject `AGENTS.md` only when the subproject is meaningfully independent. The threshold is: **does it have its own bootstrap, its own task entrypoints, and its own architectural boundaries?**

Good candidates:

- `client/` and `server/` in a full-stack repo — different languages, different build tools, different test suites.
- `packages/api-gateway/` in a services monorepo — its own deployment, its own integration tests.
- `mobile/` alongside `web/` — different toolchains entirely.

Poor candidates:

- `packages/utils/` — shared helpers with no independent build or architecture.
- `config/` — configuration files, no entrypoints of their own.
- `scripts/` — tooling, not a project.

When in doubt, cover the subproject with a line or two in the root `AGENTS.md` rather than creating a thin agent doc that just says "run `npm test`."

## Subproject Agent Doc Scope

A subproject `AGENTS.md` should cover only that subproject's scope:

- Purpose of the subproject in 1-2 sentences.
- Canonical commands for this subproject's setup, dev, test, lint, and build.
- Module boundaries and dependency direction within the subproject.
- Pointers to subproject-specific docs if they exist.
- Hard constraints specific to this subproject.

It should **not**:

- Duplicate root-level guidance (repo-wide conventions, cross-project decisions).
- Describe other subprojects or their interfaces — that belongs in the root map or architecture docs.
- Restate ExecPlans or decision records that live at the root level.

## Architecture Across Subprojects

Monorepos benefit most from explicit cross-project dependency rules. Document these in the root architecture map (`docs/architecture/`):

- Which subprojects may depend on which others and in which direction.
- Shared packages or modules and their role as boundaries.
- Cross-cutting concerns (auth, logging, types) and where they live.

Where possible, enforce these with mechanical checks:

- Workspace-level import restrictions (e.g., ESLint `no-restricted-imports` per subproject, `depguard` in Go).
- CI jobs that verify no disallowed cross-project imports exist.
- Structural tests that scan the dependency graph at build time.

## Scoring a Monorepo

The scoring script can evaluate individual subprojects:

```
node scripts/legibility.js score /path/to/repo --scope client
node scripts/legibility.js score /path/to/repo --scope server
```

Score both the root and each qualifying subproject. A subproject with a strong score but no root-level routing is still hard for an agent to find. A root with good routing but weak subproject docs leaves agents stranded once they navigate into a subproject.

## Adding a New Subproject

When a new subproject is added to the monorepo:

1. Update the root `AGENTS.md` to name the new subproject and describe its purpose.
2. Run `legibility list-scopes` and confirm the new scope is accounted for from the root, either directly or through a parent-directory `AGENTS.md`.
3. Decide whether it meets the threshold for its own `AGENTS.md` (own bootstrap, own entrypoints, own boundaries).
4. If yes, create a subproject `AGENTS.md` following the scope rules above.
5. Update the root architecture map if the new subproject introduces new dependency edges.
6. Add or extend mechanical enforcement for any new cross-project boundary rules.
7. Re-score both the root and the new subproject.
