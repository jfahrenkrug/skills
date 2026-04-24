# Scorecard And Guidance

This note consolidates actionable repository-legibility guidance extracted from:

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world"
- OpenAI build-hours `24-api-codex`
- the build-hours `agentic-legibility` skill and its scorecard rubric

Use it as a local reference when improving a repository. Do not depend on external context during the task.

When this skill is present locally, the audit entrypoint is `scripts/legibility.js`.

## Working Principles

- Treat the repository as the system of record for agent-visible knowledge.
- Keep `AGENTS.md` short and use it as a table of contents.
- Use progressive disclosure: short index docs at the top, detail deeper in the tree.
- Prefer mechanical enforcement over prose-only norms.
- Make architecture boundaries explicit and, where possible, testable.
- Keep plans and decisions in version control.
- Make bootstrap, validation, and diagnostics discoverable through stable repo entrypoints.

## Seven Repo-Visible Scoring Dimensions

### Bootstrap self-sufficiency

Measure whether the repo can declare and stand up its local toolchain and services.

Strong signals:

- pinned runtime files
- lockfiles
- `devcontainer.json`
- `docker-compose.yml` or `compose.yaml`
- `mise.toml`, `.tool-versions`, `flake.nix`, `shell.nix`
- canonical `setup` or `bootstrap` tasks

### Task entrypoints

Measure whether common tasks are exposed through stable commands.

Strong signals:

- `Makefile`, `justfile`, `Taskfile.yml`
- package manager scripts
- canonical commands for `setup`, `dev`, `test`, `lint`, `build`, `check`

### Validation harness

Measure whether ordinary changes can be validated locally.

Strong signals:

- test directories and test configs
- smoke/integration/e2e entrypoints
- fixtures or seed data
- explicit acceptance commands

### Lint and format gates

Measure whether style and static checks are enforced mechanically.

Strong signals:

- linter configs
- formatter configs
- `lint`, `fmt`, or `format` entrypoints
- repo-local CI or pre-commit checks

### Agent repo map

Measure whether the repo contains a concise navigation aid for agents.

Strong signals:

- root `AGENTS.md`
- root `CLAUDE.md`
- `.github/copilot-instructions.md`
- short contributor guidance that links commands, docs, and constraints

Scoring note:

- root agent docs are the strongest repo-wide signal
- nested agent docs help subtree guidance
- nested docs should not be treated as full repo-wide coverage automatically

### Structured docs

Measure whether documentation is organized and navigable.

Strong signals:

- `docs/` with an index
- cross-linked Markdown files
- separate architecture, onboarding, planning, and decision docs

### Decision records

Measure whether major decisions are captured in version control.

Strong signals:

- `docs/decisions/` or `docs/adr/`
- consistent ADR headings
- status and supersession links

## Concrete Repo Improvements

### Root routing

- keep root `AGENTS.md` under about 100 lines
- add an `ExecPlans` section that points to `.agents/PLANS.md`
- add a concise `Available Skills` section when repo-local skills exist
- create root `CLAUDE.md` containing `@AGENTS.md` when that convention is useful

### Progressive docs

Create a short docs tree with orientation files:

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/onboarding/README.md`
- `docs/exec-plans/README.md`
- `docs/decisions/README.md`

Each should route the reader to the next useful file rather than duplicate everything.

### Architecture legibility

- add a module/domain map
- state dependency direction explicitly
- identify cross-cutting interfaces and boundary layers
- connect the documented rules to linters or structural tests when they exist

### Mechanical enforcement

- expose lint/test/build/check entrypoints at the repo surface
- prefer custom lint or structural tests for architectural invariants
- make lint failures remediation-oriented so agents can recover quickly
- add doc-maintenance checks or doc-gardening workflows when docs drift becomes a recurring problem

### Diagnostics

- document the shortest path to logs, metrics, traces, or browser-driven repros
- make “how to observe success or failure” explicit in onboarding and plans

### Decisions and design history

- store architectural decisions in version control
- keep active plans, completed plans, and technical debt visible in the repo
- avoid relying on chat threads or human memory for durable engineering context

## Companion Repo Patterns

The build-hours `24-api-codex` example reinforces these patterns:

- a vendorable `agentic-legibility` skill
- a seven-dimension scorecard with repo-visible evidence only
- a local scoring script at `scripts/legibility.js`
- nested scope detection for repos with strong subtrees such as `client/` or `server/`
- concrete recommendations phrased as “add a file, add a command, add an index, add a rule”

## Sources

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world": https://openai.com/index/harness-engineering/
- OpenAI build-hours `24-api-codex`: https://github.com/openai/build-hours/tree/main/24-api-codex
- build-hours `agentic-legibility` skill: https://github.com/openai/build-hours/tree/main/24-api-codex/skills/agentic-legibility
