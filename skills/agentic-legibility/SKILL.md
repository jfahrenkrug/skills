---
name: agentic-legibility
description: Use when the user asks to improve a repository's agentic legibility, set up AGENTS.md or CLAUDE.md, make a repo agent-friendly, score or re-score a repo, garden stale docs, or update agent-facing documentation after architectural changes — even if they don't say "agentic legibility" by name. Trigger on phrases like "score this repo", "the architecture changed, update AGENTS.md", "set up docs for agents", "check if the docs are still current", "add an ExecPlan", or any request to make a codebase workable for fresh coding agents without tribal knowledge. Covers AGENTS.md/CLAUDE.md, docs/ structure, ExecPlans, decision records, and mechanical audit checks.
compatibility: Requires Node.js 20+
metadata:
  author: Johannes Fahrenkrug (https://springenwerk.com)
  version: "0.2.0"
allowed-tools: Bash(node scripts/legibility.js:*) Read Write Edit Glob Grep
---

# Agentic Legibility

## Overview

Make the repository itself the system of record for how work gets done. The goal is not more documentation. The goal is a repo that tells an agent where to start, what boundaries matter, how to run and validate the system, where decisions live, and how to continue work without tribal knowledge.

Treat `AGENTS.md` as a concise table of contents, not a monolith. Push durable knowledge into indexed repo files and short docs that route the reader deeper only when needed.

## Outcomes

After applying this skill, an agent should be able to answer these questions from the repo alone:

- Where do I start for this task?
- Which commands are canonical for setup, development, testing, linting, and building?
- What are the major modules or domains, and which dependency directions are allowed?
- Where do implementation plans live, and how are they maintained while work is in progress?
- Where are important technical decisions recorded?
- How do I validate ordinary changes locally?
- Which docs are authoritative for onboarding, architecture, and active work?

## Core Rules

- Prefer short index documents over long root-level manuals.
- Keep durable knowledge in version control, not in chat, heads, or external docs.
- Route from general to specific: root map, then domain guide, then implementation detail.
- Expose one canonical command path for common tasks.
- Name architecture boundaries explicitly and describe allowed dependency direction.
- Treat plans, onboarding docs, and decision records as part of the product surface for agents.
- Prefer mechanical enforcement over “please remember” guidance. When an agent keeps making the same mistake, the fix is a lint rule or structural test, not more prose.
- Keep documentation fresh with repo-local checks, cross-links, and maintenance workflows.
- Make diagnostics legible: logs, metrics, traces, screenshots, or repro steps should be reachable through documented local workflows where possible.
- Every file added for legibility must help both a new human and a coding agent.

## Workflows

Choose the workflow that matches the current need:

- **Initial setup** — auditing a repo and creating legibility infrastructure from scratch. See [setup.md](setup.md).
  Use when the user asks to: "improve this repo's agentic legibility", "set up agentic legibility", "add AGENTS.md", "make this repo agent-friendly", "set up docs for agents", or "score this repo" and no legibility infrastructure exists yet.
  Initial setup is needed when any or all of the following artifacts are missing:
  - AGENTS.md
  - .agents/
  - .agents/PLANS.md
  - docs/
  - docs/exec-plans/

- **Maintenance** — keeping existing legibility artifacts current as the code evolves, re-scoring, and doc gardening. See [maintain.md](maintain.md).
  Use when the user asks to: "update the agent docs", "update agentic legibility", "re-score the repo", "the architecture changed, update AGENTS.md", "garden the docs", or "check if the docs are still current".

## Workflow Selection

Run the artifacts audit first and let its output gate the workflow:

```
node scripts/legibility.js audit --check-artifacts /path/to/repo
```

The check returns a JSON report with `status: ok` or `status: drift` and one finding per missing required artifact. Apply this precedence:

1. If `status` is `drift` (any required artifact is missing), run **Initial setup**.
2. If `status` is `ok` (every required artifact exists), run **Maintenance**.

Treat this as a hard gate. Do not choose Maintenance just because the repository has partial legibility infrastructure — the check is the source of truth.

The required artifacts enforced by `--check-artifacts` are:

- `AGENTS.md`
- `CLAUDE.md`
- `.agents/`
- `.agents/PLANS.md`
- `docs/`
- `docs/exec-plans/`
- `docs/exec-plans/active/`
- `docs/exec-plans/completed/`

## First Step

Run `legibility audit --check-artifacts` before anything else. Base workflow selection on its `status` field and findings list, not on overall impression of the repository.

## Common Misclassification To Avoid

Do not infer **Maintenance** from partial infrastructure such as an existing `AGENTS.md`, `docs/`, or custom agent-support folders like `.agent/`.

Custom or legacy structures do not satisfy the required-artifact check unless they include the exact required paths above, or the user explicitly asks to preserve an alternative convention.

When the repository contains a near-miss structure such as `.agent/` instead of `.agents/PLANS.md`, treat that as evidence for migration or integration work under **Initial setup**, not as justification for **Maintenance**.

Both workflows use the same scoring tool and reference materials. Load each file only when the condition applies:

- [PLANS.md](PLANS.md) — load when authoring, reviewing, or validating an ExecPlan; contains the section-by-section specification.
- [references/scorecard-and-guidance.md](references/scorecard-and-guidance.md) — load when applying the seven-dimension scorecard, interpreting a score report, or explaining a recommendation to the user.
- [references/execplans.md](references/execplans.md) — load when deciding where ExecPlans live in the repo, how they move between `active/` and `completed/`, or how they are indexed.
- [references/audit-checks.md](references/audit-checks.md) — load when you need the full finding schema, severities, or remediation families for a specific `--check-*` flag.

## Mechanical Audit Loop

`scripts/legibility.js` is the unified dispatcher. Paths in the commands below are relative to the skill directory; the agent resolves them automatically.

Scoring (seven-dimension scorecard — bootstrap, task entrypoints, validation, lint, repo map, structured docs, decisions):

- `node scripts/legibility.js score /path/to/repo`
- `node scripts/legibility.js list-scopes /path/to/repo`
- `node scripts/legibility.js list-metrics`

Audit (deterministic, language-agnostic checks that return findings with `severity`, `path`, `line`, `message`, `remediation`):

- `--check-artifacts` — required legibility artifacts exist (gates workflow selection).
- `--check-links` — broken Markdown links, anchors, and orphan docs under `docs/`.
- `--check-commands` — Markdown references to task-runner commands not in the task surface.
- `--check-execplans` — ExecPlan section coverage, progress, and staleness.
- `--check-agents-md` — paths and task references named in root agent docs still resolve.
- `--check-all` — aggregate report with top-level `status: ok | drift` and one section per check.

Exit codes: `0` ok, `1` drift, `2` invalid CLI. Maintenance begins with `legibility audit --check-all` and uses the findings' `remediation` fields as the to-do list.

Full schema and per-check finding families: [references/audit-checks.md](references/audit-checks.md).

## Quality Bar

The repository is legible when a fresh agent can:

- find the right starting file without guessing
- bootstrap the project from repo instructions alone
- pick a canonical command to run the relevant checks
- understand the main module boundaries before editing
- find active work and decisions in version control
- follow a short path from root docs to detailed guidance

If a fresh agent would need hidden context from a person or chat thread, the repo is still missing legibility infrastructure.

## Adding a Language Adapter

Language-specific task-runner parsing lives in `packages/legibility/src/languages/`. Each file exports one adapter that implements `LanguageAdapter` from `src/languages/types.ts`.

The skill ships adapters for `javascript` (npm/pnpm/yarn/bun), `make`, `just`, `task` (Taskfile), `cargo`, `python` (pyproject.toml + tox.ini), `gradle`, `maven`, `dotnet` (MSBuild), `cmake`, `composer` (PHP), `rake` (Ruby/Rails), and `xcode` (xcschemes + Fastlane).

**To add support for a new ecosystem** (e.g. `mix`, `bazel`, `pants`):

1. Create `packages/legibility/src/languages/<ecosystem>.ts`:
   - Set `id` to the runner name (used as key in `collectTaskSurfaceByRunner` output).
   - Set `patterns` to the filenames/glob patterns that contain task definitions.
   - Implement `detect(files)` — return `true` if any of `files` matches the ecosystem.
   - Implement `collectTaskSurface(root, files)` — parse the task files and return `{ names, sourceFiles }`.

2. Register the adapter in `packages/legibility/src/languages/index.ts` — add it to `ALL_ADAPTERS`.

3. Add unit tests in `packages/legibility/tests/languages/adapters.test.ts`.

4. Rebuild the bundle: `cd packages/legibility && npm run build`

The rebuilt `skills/agentic-legibility/scripts/legibility.js` bundle is the artifact that ships with the skill. Commit it alongside the TypeScript source change.
