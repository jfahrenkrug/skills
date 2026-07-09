---
name: agentic-legibility
description: Use when the user asks to improve a repository's agentic legibility, set up AGENTS.md or CLAUDE.md, make a repo agent-friendly, score or re-score a repo, garden stale docs, or update agent-facing documentation after architectural changes — even if they don't say "agentic legibility" by name. Trigger on phrases like "score this repo", "the architecture changed, update AGENTS.md", "set up docs for agents", "check if the docs are still current", "add an ExecPlan", or any request to make a codebase workable for fresh coding agents without tribal knowledge. Covers AGENTS.md/CLAUDE.md, docs/ structure, ExecPlans, decision records, and mechanical audit checks.
compatibility: Requires Node.js 20+
metadata:
  author: Johannes Fahrenkrug (https://springenwerk.com)
  version: "0.2.0"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/legibility.js:*) Read Write Edit Glob Grep
---

# Agentic Legibility

## Overview

Make the repository itself the system of record for how work gets done. The goal is not more documentation. The goal is a repo that tells an agent where to start, what boundaries matter, how to run and validate the system, where decisions live, and how to continue work without tribal knowledge. When the skill has been applied, a fresh agent can answer all of that from the repo alone.

Treat `AGENTS.md` as a concise table of contents, not a monolith. Push durable knowledge into indexed repo files and short docs that route the reader deeper only when needed.

## Core Rules

- Prefer short index documents over long root-level manuals; route from general to specific.
- Keep durable knowledge in version control, not in chat, heads, or external docs.
- Expose one canonical command path for common tasks.
- Name architecture boundaries explicitly and describe allowed dependency direction.
- Treat plans, onboarding docs, and decision records as part of the product surface for agents.
- Prefer mechanical enforcement over "please remember" guidance: when an agent keeps making the same mistake, the fix is a lint rule or structural test, not more prose.
- Keep documentation fresh with repo-local checks, cross-links, and maintenance workflows.
- Make diagnostics legible: logs, metrics, traces, or repro steps should be reachable through documented local workflows.
- Every file added for legibility must help both a new human and a coding agent.

## Workflows

- **Initial setup** — auditing a repo and creating legibility infrastructure from scratch. See [setup.md](setup.md).
  Use when the user asks to: "improve this repo's agentic legibility", "set up agentic legibility", "add AGENTS.md", "make this repo agent-friendly", "set up docs for agents", or "score this repo" and no legibility infrastructure exists yet.

- **Maintenance** — keeping existing legibility artifacts current as the code evolves, re-scoring, and doc gardening. See [maintain.md](maintain.md).
  Use when the user asks to: "update the agent docs", "re-score the repo", "the architecture changed, update AGENTS.md", "garden the docs", or "check if the docs are still current".

## Workflow Selection

Run the artifacts audit first and let its output gate the workflow:

```
node scripts/legibility.js audit --check-artifacts /path/to/repo
```

The check returns `status: ok` or `status: drift` with one finding per missing required artifact (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.agents/PLANS.md`, `docs/`, `docs/exec-plans/` with `active/` and `completed/`). Apply this precedence:

1. If `status` is `drift` (any required artifact is missing), run **Initial setup**.
2. If `status` is `ok` (every required artifact exists), run **Maintenance**.

Treat this as a hard gate. Do not infer Maintenance from partial infrastructure such as an existing `AGENTS.md`, `docs/`, or near-miss structures like `.agent/` — custom or legacy layouts do not satisfy the check unless they contain the exact required paths, or the user explicitly asks to preserve an alternative convention. Near-miss structures are migration work under **Initial setup**.

## Reference Files

Both workflows use the same scoring tool and reference materials. Load each file only when the condition applies:

- [PLANS.md](PLANS.md) — load when authoring, reviewing, or validating an ExecPlan; contains the section-by-section specification.
- [references/scorecard-and-guidance.md](references/scorecard-and-guidance.md) — load when applying the eight-dimension scorecard, interpreting a score report, or explaining a recommendation to the user.
- [references/execplans.md](references/execplans.md) — load when deciding where ExecPlans live in the repo, how they move between `active/` and `completed/`, or how they are indexed.
- [references/audit-checks.md](references/audit-checks.md) — load when you need the full list of `--check-*` flags, the finding schema, severities, or remediation families.

## Mechanical Audit Loop

`scripts/legibility.js` is the unified dispatcher. Paths in the commands below are relative to the skill directory; the agent resolves them automatically.

Scoring (eight-dimension scorecard — bootstrap, task entrypoints, validation, lint, guardrails and hooks, repo map, structured docs, decisions):

- `node scripts/legibility.js score /path/to/repo`
- `node scripts/legibility.js list-scopes /path/to/repo`
- `node scripts/legibility.js list-metrics`

Audit (deterministic, language-agnostic checks that return findings with `severity`, `path`, `line`, `message`, `remediation`):

- `node scripts/legibility.js audit --check-all /path/to/repo` — aggregate report with top-level `status: ok | drift` and one section per check.
- Individual `--check-*` flags run one check at a time; `--check-artifacts` gates workflow selection. The full flag list is in `legibility.js --help` and [references/audit-checks.md](references/audit-checks.md).
- `--stale-threshold-days N` adjusts the ExecPlan staleness threshold (default 30).

Exit codes: `0` ok, `1` drift, `2` invalid CLI. Maintenance begins with `legibility audit --check-all` and uses the findings' `remediation` fields as the to-do list.

Templates (Initial setup shortcut):

- `node scripts/legibility.js init [--force] /path/to/repo` — scaffolds `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md` include), `.agents/PLANS.md`, `docs/README.md`, and `docs/exec-plans/{active,completed}/`. Emits `{ created, skipped }` JSON. Existing files are skipped without `--force`. After `init`, `--check-artifacts` reports `status: ok`.

## Quality Bar

The repository is legible when a fresh agent can find the right starting file without guessing, bootstrap the project from repo instructions alone, pick a canonical command to run the relevant checks, understand the main module boundaries before editing, find active work and decisions in version control, and follow a short path from root docs to detailed guidance.

If a fresh agent would need hidden context from a person or chat thread, the repo is still missing legibility infrastructure.
