# ExecPlans

This note extracts the repository-facing guidance from OpenAI's ExecPlans cookbook article and adapts it into reusable repo conventions.

## What an ExecPlan is

An ExecPlan is a checked-in, self-contained plan for multi-step work that a stateless agent or new contributor can execute without prior context. It is not a brainstorm. It is a living implementation document that gets updated while work proceeds.

## Repo Conventions

- When vendoring this skill into another repository, copy `PLANS.md` from the skill root to `.agents/PLANS.md` unchanged.
- Store active plans under a predictable path such as `docs/exec-plans/active/`.
- Move finished plans to `docs/exec-plans/completed/`.
- Reference `.agents/PLANS.md` from root `AGENTS.md` and from `docs/exec-plans/README.md`.
- Treat plan maintenance as part of the work, not cleanup at the end.

## Required Sections

- `Purpose / Big Picture`
- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`
- `Context and Orientation`
- `Plan of Work`
- `Concrete Steps`
- `Validation and Acceptance`
- `Idempotence and Recovery`
- `Artifacts and Notes`
- `Interfaces and Dependencies`

## Writing Rules

- Make the plan self-contained. Assume the reader starts cold.
- Name files and modules by full path.
- Describe edits concretely, not abstractly.
- Use granular checkboxes in `Progress`.
- Timestamp progress updates so the current state is visible.
- Record changes in direction in `Decision Log`.
- Record unexpected behavior or performance findings in `Surprises & Discoveries` with concise evidence.
- Phrase validation as observable outcomes with concrete commands, inputs, and outputs.
- Document safe retry or rollback paths for risky steps.

## Canonical Source

Do not invent a shortened local template when this skill is present. Use the vendored `PLANS.md` file as the canonical repository-local instructions and copy it to `.agents/PLANS.md` unchanged.

## Source

- OpenAI Cookbook, "Using PLANS.md for multi-hour problem solving": https://developers.openai.com/cookbook/articles/codex_exec_plans
