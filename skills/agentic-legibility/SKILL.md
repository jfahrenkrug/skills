---
name: agentic-legibility
description: Audit and improve a repository's agentic legibility — the docs, entrypoints, and structure that let coding agents bootstrap, navigate, validate, and work without tribal knowledge. Covers AGENTS.md, docs/, ExecPlans, and scoring.
metadata:
  author: Johannes Fahrenkrug (https://springenwerk.com)
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/score_repo.js:*) Read Write Edit Glob Grep
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

Choose the workflow using this precedence order:

1. Run **Initial setup** if any required legibility artifact is missing.
2. Run **Maintenance** only if all required legibility artifacts already exist.

Treat this as a hard gate. Do not choose Maintenance just because the repository has partial legibility infrastructure.

The required artifacts are:

- `AGENTS.md`
- `.agents/`
- `.agents/PLANS.md`
- `docs/`
- `docs/exec-plans/`

If even one item in that list is missing, the task is **Initial setup**.

## First Step

Before choosing a workflow, list the required artifact paths and mark each one as present or missing in your notes. Base workflow selection on that checklist, not on overall impression.

## Common Misclassification To Avoid

Do not infer **Maintenance** from partial infrastructure such as an existing `AGENTS.md`, `docs/`, or custom agent-support folders like `.agent/`.

Custom or legacy structures do not satisfy the required-artifact check unless they include the exact required paths above, or the user explicitly asks to preserve an alternative convention.

When the repository contains a near-miss structure such as `.agent/` instead of `.agents/PLANS.md`, treat that as evidence for migration or integration work under **Initial setup**, not as justification for **Maintenance**.

Both workflows use the same scoring tool and reference materials:

- ExecPlans specification: [PLANS.md](PLANS.md)
- Scorecard rubric and recommendations: [references/scorecard-and-guidance.md](references/scorecard-and-guidance.md)
- ExecPlans repo conventions: [references/execplans.md](references/execplans.md)

## Audit Loop

If this skill is vendored with `scripts/score_repo.js`, use that script to score the repository from repo-visible evidence only.

Run it from the skill directory or by passing an absolute path, for example:

- `node <skill-dir>/scripts/score_repo.js /path/to/repo`
- `node <skill-dir>/scripts/score_repo.js /path/to/repo --format markdown`
- `node <skill-dir>/scripts/score_repo.js /path/to/repo --scope client`
- `node <skill-dir>/scripts/score_repo.js /path/to/repo --list-scopes`
- `node <skill-dir>/scripts/score_repo.js /path/to/repo --metric agent_repo_map --metric structured_docs`

`<skill-dir>` is the directory containing this skill. In Claude Code this is `${CLAUDE_SKILL_DIR}`. In other agents, substitute the path where the skill was vendored.

Use the script output to identify the next highest-leverage fixes. The seven scorecard dimensions are:

- bootstrap self-sufficiency
- task entrypoints
- validation harness
- lint and format gates
- agent repo map
- structured docs
- decision records

Use score changes to prioritize the next fixes, not as a substitute for judgment.

## Quality Bar

The repository is legible when a fresh agent can:

- find the right starting file without guessing
- bootstrap the project from repo instructions alone
- pick a canonical command to run the relevant checks
- understand the main module boundaries before editing
- find active work and decisions in version control
- follow a short path from root docs to detailed guidance

If a fresh agent would need hidden context from a person or chat thread, the repo is still missing legibility infrastructure.
