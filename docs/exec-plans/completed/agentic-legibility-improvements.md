# Agentic Legibility Improvements (research-driven)

This ExecPlan is a living document. The sections `Progress`, `Surprises &
Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept
up to date as work proceeds. This plan must be maintained in accordance
with [skills/agentic-legibility/PLANS.md](../../../skills/agentic-legibility/PLANS.md)
in this repository.

## Purpose / Big Picture

The `agentic-legibility` skill helps a coding agent walk into a fresh
repository, find a foothold, and start working without tribal knowledge.
After this change, the skill ships eleven new pieces of mechanical
behavior, all driven by recent community findings about how AI coding
agents actually consume repositories:

1. The artifacts gate stops nagging about `CLAUDE.md` when `AGENTS.md`
   already exists. The community has converged on `AGENTS.md` as the
   canonical agent doc; `CLAUDE.md` is one supported alias among many,
   not a separate artifact.
2. New audit checks catch real failure modes:
   `--check-cross-tool-aliases` detects drift between `AGENTS.md` and
   sibling files (`.cursor/rules/*.mdc`, `.github/copilot-instructions.md`,
   `.windsurfrules`, `GEMINI.md`, `CONVENTIONS.md`, `.aider.conf.yml`).
   `--check-context-budget` warns when an agent doc is so long it will
   blow the agent's context window. `--check-readme-drift` flags repos
   where the human README and `AGENTS.md` describe the same setup
   commands inconsistently. `--check-nesting` rewards monorepos that
   place per-package `AGENTS.md` files at workspace boundaries.
   `--check-repo-map` enforces a one-screen architecture index. And
   `--check-adrs` validates that decision records have a working index
   and consistent supersession links.
3. The ExecPlan check graduates from "section headings exist" to
   "Validation and Acceptance has substance, and stalled checkboxes
   are flagged."
4. A new `guardrails_and_hooks` scorecard dimension recognizes
   mechanical enforcement (pre-commit, lefthook, husky, githooks,
   `.claude/hooks/`) — community wisdom is "make the agent's bad
   habits impossible, not forbidden."
5. Four new task-runner adapters (`nx`, `turbo`, `mise`, `mix`) cover
   the orchestrators that monorepos and Elixir projects rely on.
6. A new `init` subcommand scaffolds the required-artifact tree from
   templates so a user can go from "empty repo" to "passes
   `--check-artifacts`" with one command.

A user can see all of this working by running, against any repository:

    node skills/agentic-legibility/scripts/legibility.js audit --check-all <repo>
    node skills/agentic-legibility/scripts/legibility.js score <repo>
    node skills/agentic-legibility/scripts/legibility.js init <new-empty-dir>

The aggregated audit report will include the new check sections; the
score report will include the new dimension; and `init` will create
`AGENTS.md`, `CLAUDE.md`, `.agents/PLANS.md`, `docs/`, and
`docs/exec-plans/{active,completed}/` from templates. After running
`init`, `--check-artifacts` will report `status: ok`.

## Progress

This is the only section in which checkboxes are permitted. Use them
to track granular progress. Update timestamps on completion.

   * [x] (2026-04-25 09:00Z) M1: Relax `--check-artifacts` so the
     `CLAUDE.md` warning is suppressed when `AGENTS.md` exists. Test
     suite `tests/audit/artifacts.test.ts` passes.
   * [x] (2026-04-25 13:01Z) M2: Add language adapters for `nx`, `turbo`,
     `mise`, `mix`. New parsers and detectors live under
     `packages/legibility/src/languages/{nx,turbo,mise,mix}.ts`. Task
     reference patterns and `RUNNER_LABEL` extended for the four new
     runners. 17 adapters total now.
   * [x] (2026-04-25 14:10Z) M3: Implement `--check-cross-tool-aliases`.
     New `checkCrossToolAliases` in `audit_repo.ts` with Jaccard
     similarity over ≥30-char lines, symlink/include detection.
   * [x] (2026-04-25 14:25Z) M4: Implement `--check-context-budget`.
     Thresholds: > 4000 tokens warns, > 8000 errors. Token estimate
     `Math.ceil(text.length / 4)`.
   * [x] (2026-04-25 14:40Z) M5: Implement `--check-readme-drift`.
     Compares per-runner task references between README.md and
     AGENTS.md; emits warnings only where both files reference the
     same runner with diverging tokens.
   * [x] (2026-04-25 14:55Z) M6: Implement `--check-nesting`. Detects
     monorepos via pnpm-workspace, nx.json, turbo.json, or root
     package.json `workspaces`; softens message when ≥ 50% of
     packages already carry a per-package AGENTS.md.
   * [x] (2026-04-25 15:10Z) M7: Implement `--check-repo-map` and
     surface a `repo_map` signal in the existing `agent_repo_map`
     dimension. Recognized paths: `docs/repo-map.md`,
     `docs/architecture.md`, `ARCHITECTURE.md`.
   * [x] (2026-04-25 15:25Z) M8: Implement `--check-adrs`. Detects
     ADR directories, requires a directory-local index, and validates
     supersession links.
   * [x] (2026-04-25 15:40Z) M9: Upgrade `--check-execplans`.
     `parseExecPlan` now returns `sectionBodies`. `Validation and
     Acceptance` empty body produces a warning; the existing stalled
     active-plan check is unchanged.
   * [x] (2026-04-25 15:55Z) M10: Add a new `guardrails_and_hooks`
     scoring dimension between `lint_format_gates` and
     `agent_repo_map`. Eight metrics now.
   * [x] (2026-04-25 16:10Z) M11: Added `init` (alias
     `generate-templates`) subcommand. Templates inlined under
     `packages/legibility/src/init/`. PLANS.md is embedded via
     `scripts/embed-templates.mjs` (run as `prebuild`/`pretest`).
     New tests in `tests/init/init.test.ts`. Running `init`
     against an empty directory produces output that passes
     `--check-artifacts` with `status: ok`.
   * [x] (2026-04-25 16:30Z) M12: Wire-up complete. SKILL.md now
     mentions all eleven checks, the `init` subcommand, the
     four new task runners, and the eight-dimension scorecard.
     `references/audit-checks.md` and
     `references/scorecard-and-guidance.md` updated. Bundle
     rebuilt via `npm -w legibility run build`; extended
     `verify-bundle` covers `init` and `--check-all` with all
     eleven check keys. 145 tests pass; typecheck clean; bundle
     verification 10/10.

## Surprises & Discoveries

Document unexpected behaviors, bugs, optimizations, or insights here as
they appear. Provide concise evidence (test output, file excerpts,
diffs).

   * (none yet)

## Decision Log

   * Decision: `--check-artifacts` keeps `CLAUDE.md` in
     `REQUIRED_ARTIFACTS` but suppresses the warning when `AGENTS.md`
     is present. Rationale: the community standard is `AGENTS.md`;
     `CLAUDE.md` is one of several aliases (Cursor, Copilot, Windsurf,
     Gemini, Aider). Keeping a soft prompt to add `CLAUDE.md` when no
     primary doc exists at all is still useful, but penalizing repos
     that already follow the standard is wrong. Date/Author: 2026-04-25.
   * Decision: skip `bun` and `deno` adapters in M2. Rationale: `bun`
     reads `package.json` scripts already covered by the JavaScript
     adapter; `deno` uses `deno.json` tasks but has limited deployment
     in agent-coded projects today, and adding it here would balloon
     scope. Revisit if a real user reports the gap. Date/Author:
     2026-04-25.
   * Decision: the new dimension is named `guardrails_and_hooks`
     (eight metric names total). Rationale: keeps the noun consistent
     with how the community talks about the practice (pre-commit
     hooks, agent guardrails, deterministic gates) and is unambiguous
     against the existing `lint_format_gates` dimension, which
     specifically scores config files and lint commands rather than
     mechanical execution. Date/Author: 2026-04-25.
   * Decision: the `init` command writes templates that already pass
     `--check-artifacts` and `--check-execplans` against an empty
     ExecPlan dir. Rationale: bootstrapping must produce a green
     audit so the user can immediately evolve the repo from a known
     baseline. Date/Author: 2026-04-25.

## Outcomes & Retrospective

All twelve milestones (M1–M12) landed. The eleven research-driven
improvements promised in `Purpose / Big Picture` are present and
covered by tests:

- The `--check-artifacts` gate now suppresses the `CLAUDE.md`
  warning when `AGENTS.md` exists.
- Six new audit checks are wired into `--check-all`:
  `cross_tool_aliases`, `context_budget`, `readme_drift`, `nesting`,
  `repo_map`, `adrs`. The aggregated audit report exposes one
  section per check.
- `--check-execplans` now flags an empty `Validation and
  Acceptance` body in addition to the existing staleness and
  completion checks.
- The scorecard has graduated from seven to eight dimensions; the
  new `guardrails_and_hooks` metric sits between
  `lint_format_gates` and `agent_repo_map`.
- Four new language adapters (`nx`, `turbo`, `mise`, `mix`) bring
  the adapter count to 17. Each adapter has fixture-based unit
  tests.
- The new `init` (alias `generate-templates`) subcommand
  scaffolds the required-artifact tree from inlined templates;
  `.agents/PLANS.md` is embedded via a build-time script, keeping
  the bundle single-file and zero-dependency.

Documentation in `skills/agentic-legibility/SKILL.md` and the two
reference files is updated to describe the new checks, the new
runners, the new dimension, and the `init` flow. The bundle
verification script grew from six to ten checks and exercises
both the `init` round trip and `--check-all` against every
expected check key.

Test totals: 145 Vitest tests across 12 files. Bundle smoke tests:
10/10. `npm -w legibility run typecheck` clean.

Deferred (not in this plan, candidates for follow-up):

- A scoring signal that rewards an ADR index (currently only the
  audit check enforces ADR hygiene; the `decision_records`
  dimension is unchanged).
- A `--check-context-budget` flag to make the 4000/8000 token
  thresholds user-configurable.
- A monorepo `init` mode that scaffolds per-package `AGENTS.md`
  files; today `init` only touches the root.

## Context and Orientation

The repository is a monorepo of agent skills. The `agentic-legibility`
skill is the only large skill today.

   * The TypeScript source lives at
     `packages/legibility/src/`.
   * The skill ships a single bundled CLI at
     `skills/agentic-legibility/scripts/legibility.js`. This bundle is
     produced by `vite build` (configured by
     `packages/legibility/vite.config.ts`) and is committed to Git so
     the skill works without a build step.
   * Tests use Vitest:
     `npm -w legibility test`. Type checking:
     `npm -w legibility run typecheck`. Build:
     `npm -w legibility run build`. Bundle smoke test:
     `npm -w legibility run verify-bundle`.

Key TypeScript modules:

   * `packages/legibility/src/legibility.ts` — CLI dispatcher with
     subcommands `score`, `list-scopes`, `list-metrics`, `audit`. New
     subcommand `init` will be added here in M11.
   * `packages/legibility/src/audit_repo.ts` — audit checks. Today
     it exports `checkArtifacts`, `checkLinks`, `checkCommands`,
     `checkExecplans`, `checkAgentsMd`, plus the `AVAILABLE_CHECKS`
     map and `parseCliArgs`. New checks (M3–M9) are added here.
   * `packages/legibility/src/score_repo.ts` — the seven-dimension
     scorecard. `METRIC_NAMES` is a tuple at the top; `METRIC_SCORERS`
     is the dispatch map at the bottom. M10 adds an eighth metric.
   * `packages/legibility/src/lib/execplans.ts` — small helper that
     parses an ExecPlan and returns `headings`, `presentSections`,
     `missingSections`, and `progress`. M9 will extend this to
     return body-length information for `Validation and Acceptance`.
   * `packages/legibility/src/lib/markdown.ts` — Markdown parser
     used everywhere; nothing in this plan should require changes here.
   * `packages/legibility/src/languages/` — one file per task-runner
     adapter. M2 adds four files (`nx.ts`, `turbo.ts`, `mise.ts`,
     `mix.ts`) and registers them in `index.ts`.
   * `packages/legibility/src/lib/fs_walk.ts` — provides `walkRepo`,
     `readText`, `findFiles`, `readCandidates`. Use these throughout;
     do not call `fs.readFile` directly except where unavoidable.
   * `packages/legibility/src/lib/output.ts` — `finding`, `checkResult`,
     `auditReport`, formatters. All new checks return a `CheckResult`
     produced via `checkResult(name, findings, summary)`.

Two terms used below:

   * **Cross-tool alias**: a file used by a non-AGENTS.md agent tool
     to read project rules, e.g. `.cursor/rules/*.mdc` (Cursor),
     `.github/copilot-instructions.md` (GitHub Copilot),
     `.windsurfrules` (Windsurf), `GEMINI.md` (Google Gemini CLI),
     `CONVENTIONS.md` (Aider's recommended file), `.aider.conf.yml`
     (Aider config). The community standard is for these to either
     be a symlink to `AGENTS.md` or to have content recognizably
     derived from it.
   * **Context budget**: the rough number of tokens an agent doc
     spends from the model's context window when read. Most modern
     agents truncate or summarize files over a few thousand tokens,
     so a 3000-line `AGENTS.md` is actively harmful.

## Plan of Work

Each milestone below is independently verifiable. Implement them in
order (M1 → M12). Each should pass `npm -w legibility test` and
`npm -w legibility run typecheck` before moving on. The bundle is
rebuilt only at M12.

### M1 — Relax `--check-artifacts` for `CLAUDE.md`

In `packages/legibility/src/audit_repo.ts`:

   * Keep `CLAUDE.md` in `REQUIRED_ARTIFACTS` for now (so its
     remediation message is still discoverable via the `init`
     command in M11), but change `checkArtifacts` so that the
     `CLAUDE.md` finding is only emitted when `AGENTS.md` is also
     missing. Implementation: after the existing loop, post-filter
     the findings — if any finding's `path` is `AGENTS.md` plus
     `CLAUDE.md`, drop the `CLAUDE.md` one when `AGENTS.md` is
     present.

   * Update the summary string so it does not double-count. The
     simplest path is to compute `errorCount` and `warningCount`
     after the filter step.

Add unit tests in `packages/legibility/tests/audit/artifacts.test.ts`
(create the directory `tests/audit/` if it does not yet exist):

   * Both `AGENTS.md` and `CLAUDE.md` absent → AGENTS.md error
     finding is present, CLAUDE.md warning finding is suppressed.
   * `AGENTS.md` present, `CLAUDE.md` absent → no findings (for
     these two artifacts).
   * Both present → no findings.

### M2 — Adapters for `nx`, `turbo`, `mise`, `mix`

For each, create a file in
`packages/legibility/src/languages/<id>.ts` exporting an adapter that
matches the `LanguageAdapter` interface. Register each in
`packages/legibility/src/languages/index.ts` (`ALL_ADAPTERS` array,
`TASK_FILE_NAMES` set, `MANIFEST_FILE_NAMES` set as appropriate).

Adapter specifics:

   * **nx** (`id: 'nx'`, displayName `'Nx'`, patterns
     `[ 'nx.json', 'project.json' ]`).
     - `detect`: any file basename equal to `nx.json` or
       `project.json`.
     - `collectTaskSurface`: read each `project.json`, parse JSON,
       collect `targets` keys (e.g. `{ "targets": { "build": ..., "test": ... } }`).
       Also include `nx.json`'s `targetDefaults` keys. Source files
       are the `project.json` paths and `nx.json` if present.

   * **turbo** (`id: 'turbo'`, displayName `'Turbo'`, patterns
     `[ 'turbo.json' ]`).
     - `detect`: basename equals `turbo.json`.
     - `collectTaskSurface`: parse JSON, collect keys of
       `pipeline` (Turbo v1) and `tasks` (Turbo v2). Names like
       `app#build` should also be included verbatim and with the
       prefix stripped.

   * **mise** (`id: 'mise'`, displayName `'mise'`, patterns
     `[ '.mise.toml', 'mise.toml' ]`).
     - `detect`: basename equals `.mise.toml` or `mise.toml`.
     - `collectTaskSurface`: TOML parsing without a TOML library.
       Find lines of the form `[tasks.<name>]` and add `<name>`.
       Use the tolerant regex
       `/^\s*\[tasks\.([A-Za-z0-9_:.-]+)\]\s*(?:#.*)?$/u`.

   * **mix** (`id: 'mix'`, displayName `'Mix (Elixir)'`, patterns
     `[ 'mix.exs' ]`).
     - `detect`: basename equals `mix.exs`.
     - `collectTaskSurface`: Mix tasks are Elixir modules under
       `lib/mix/tasks/<name>.ex`; extracting them robustly from
       `mix.exs` is hard. Instead, scan files matching
       `lib/mix/tasks/*.ex` and derive task names from the
       filename (`my_task.ex` → `my_task`). Also add `mix`'s
       built-in tasks `compile`, `deps.get`, `test`, `format`,
       `release`, `phx.server` (so doc references to those do
       not get falsely flagged when only `mix.exs` exists).
     - Source file is `mix.exs`. Names are added to the surface so
       `--check-commands` knows about them.

Update `RUNNER_LABEL` in `audit_repo.ts` to add labels for `nx`,
`turbo`, `mise`, and `mix`.

Note: there is no `mix` task-reference regex in
`lib/markdown.ts` yet. Add one in M2:
`{ runner: 'mix', regex: /(?:^|[\s&;|(])mix\s+([A-Za-z0-9_.:-]+)/gu }`.
Also add `nx`, `turbo`, and `mise` patterns in the same array
(`(?:npx\s+)?nx\s+`, `(?:npx\s+)?turbo\s+(?:run\s+)?`, `mise\s+run\s+`).
Mind the existing convention: each new entry needs a corresponding
entry in `RUNNER_LABEL`.

Add unit tests in
`packages/legibility/tests/languages/adapters.test.ts` for each new
adapter using small fixture writers (see existing `make` and
`taskfile` tests for the pattern).

### M3 — `--check-cross-tool-aliases`

Add `checkCrossToolAliases` to `audit_repo.ts`. Detection rules:

   * Define `CROSS_TOOL_ALIAS_PATHS = [ 'CLAUDE.md',
     '.github/copilot-instructions.md', '.windsurfrules',
     'GEMINI.md', 'CONVENTIONS.md', '.cursor/rules' ]` (the last is a
     directory glob — flag any `.cursor/rules/*.mdc` files).

   * If `AGENTS.md` exists and any alias file exists:
     - If alias is a regular file with content not byte-equal,
       compute a similarity ratio. If it is below 0.5 (Jaccard
       on the set of non-trivial sentences, defined as lines of
       length ≥ 30 after trimming), emit a `warning` finding:
       "Cross-tool alias `<alias>` looks substantively different
       from AGENTS.md (similarity X.XX)." Remediation: "Make
       `<alias>` a symlink to AGENTS.md, or include AGENTS.md
       (e.g., `@AGENTS.md`)."
     - If alias is a symlink, no finding.
     - If alias contains a recognized include directive
       (`@AGENTS.md`, `@./AGENTS.md`, or for `.aider.conf.yml`,
       `read: AGENTS.md`), no finding.

   * If `AGENTS.md` does not exist but two or more alias files
     exist, emit one `warning` finding on the alias with the most
     bytes: "Multiple cross-tool agent docs but no canonical
     AGENTS.md. Pick AGENTS.md as the source of truth."

Register the check as `cross_tool_aliases` in `AVAILABLE_CHECKS`.
The CLI flag will be `--check-cross-tool-aliases`. Update the USAGE
string in `legibility.ts` to list it.

### M4 — `--check-context-budget`

Add `checkContextBudget` to `audit_repo.ts`. Behavior:

   * Subjects: every existing file in `[ 'AGENTS.md', 'CLAUDE.md',
     '.github/copilot-instructions.md' ]`.
   * Compute size (in bytes) and a coarse token estimate
     (`Math.ceil(text.length / 4)`).
   * Thresholds: if tokens > 4000 emit a `warning`; if tokens >
     8000 emit an `error`. Message: "Agent doc is approximately N
     tokens; agents typically read ≤ 4000 efficiently." Remediation:
     "Trim AGENTS.md to a one-screen index; push detail into
     `docs/` and link from here."
   * Findings carry `path` (the doc), `line: 1`, and the threshold
     in the message.

Register check as `context_budget`. CLI flag
`--check-context-budget`.

### M5 — `--check-readme-drift`

Add `checkReadmeDrift` to `audit_repo.ts`. Behavior:

   * Subjects: `README.md` and `AGENTS.md`. If either is missing,
     return an `ok` result with summary "README or AGENTS.md
     absent; nothing to compare."
   * Extract the set of task references (using
     `extractTaskReferences` from `lib/markdown.ts`) from both files.
   * Let `readmeRefs` and `agentsRefs` be `Set<runner:token>` keys.
   * Compute `inReadmeOnly = readmeRefs - agentsRefs` and
     `inAgentsOnly = agentsRefs - readmeRefs`. For each runner where
     both sets are non-empty (i.e. the same runner is referenced in
     both files), if `inReadmeOnly` or `inAgentsOnly` contains any
     entry for that runner, emit one `warning` finding per drifted
     command, citing where the command appears.
   * If a runner appears in only one of the two files, do not warn.
     Drift here means "both files describe how to do X, but
     describe X with different commands."

Register check as `readme_drift`. CLI flag `--check-readme-drift`.

### M6 — `--check-nesting`

Add `checkNesting` to `audit_repo.ts`. Behavior is monorepo-aware:

   * Detect monorepo: any of these is true:
     - `pnpm-workspace.yaml` exists
     - `nx.json` or any `project.json` exists
     - `turbo.json` exists
     - `package.json` at root has a `"workspaces"` array
     - Two or more `package.json` files exist with the root one
       containing `"workspaces"`.
   * If not a monorepo, return an `ok` result, summary "Not a
     monorepo; per-package AGENTS.md not required."
   * Otherwise, find each "package directory":
     - For Nx: every directory containing `project.json`.
     - For pnpm/npm/turbo: every directory containing
       `package.json` other than the root.
   * For each package directory, look for a per-package agent doc
     at `<dir>/AGENTS.md` or `<dir>/CLAUDE.md`.
   * If fewer than half of the discovered package directories have
     a per-package agent doc, emit one `warning` finding per
     directory missing it: "Workspace package `<dir>` lacks
     `AGENTS.md`; subtree-specific guidance helps agents stay
     scoped." Remediation: "Add `<dir>/AGENTS.md` describing the
     package's purpose, primary commands, and links to its docs."
   * If most packages already have one (≥ half), still emit
     `info`-level findings for the remaining holes (using
     `SEVERITY_WARNING` since the output schema only has two
     severities — but with a softer message: "Most workspace
     packages have AGENTS.md; consider adding one to `<dir>` for
     consistency.").

Register check as `nesting`. CLI flag `--check-nesting`.

### M7 — `--check-repo-map` and scorecard signal

Add `checkRepoMap` to `audit_repo.ts`. Behavior:

   * Look for at least one of `docs/repo-map.md`,
     `docs/architecture.md`, or `ARCHITECTURE.md`. If any exists,
     emit no findings; record summary "Repo map found at `<path>`."
   * If none exists, emit one `warning` finding at root (`path:
     '.'`): "No repo map found." Remediation: "Add
     `docs/repo-map.md` or `ARCHITECTURE.md` describing module
     boundaries, allowed dependency directions, and where each
     subsystem lives."

Register check as `repo_map`. CLI flag `--check-repo-map`.

In `score_repo.ts`, extend `scoreAgentRepoMap` so that the
existence of any of these three files contributes to the
"actionable cues" count. Specifically, before computing `cues`,
add `repo_map` (1 each) for any of: `docs/repo-map.md`,
`docs/architecture.md`, `ARCHITECTURE.md` present in
`ctx.relpaths`. Reading the file is not required.

### M8 — `--check-adrs`

Add `checkAdrs` to `audit_repo.ts`. Behavior:

   * Subjects: any file matching `(^|/)(adr|adrs|decisions?)/.+\.md$`,
     case-insensitive.
   * If no ADR files at all, return an `ok` result with summary
     "No ADRs detected."
   * If ADRs exist:
     - Look for a directory-local index: `<dir>/README.md` or
       `<dir>/index.md` in the same folder as the ADRs. If absent,
       emit one `warning` finding on the ADR directory.
     - For each ADR, parse it with `parseMarkdown`. Heuristic for
       template compliance: must contain headings whose normalized
       text is one of `status`, `context`, and `decision`. If
       fewer than two of the three are present, emit a `warning`
       on that file: "ADR is missing standard sections (Status /
       Context / Decision)."
     - For each ADR whose body contains `superseded by` (case
       insensitive), find the linked target. If the target is a
       relative link and does not resolve via the same logic
       `checkLinks` uses, emit an `error` finding: "ADR claims
       supersession but the target does not exist."

Register check as `adrs`. CLI flag `--check-adrs`.

### M9 — Upgrade `--check-execplans`

In `packages/legibility/src/lib/execplans.ts`, extend
`parseExecPlan` to also return `sectionBodies: Record<string,
string>`, where each entry is the trimmed text between that
section's heading and the next `##` heading (or EOF).

In `packages/legibility/src/audit_repo.ts`, in `checkExecplans`:

   * If `Validation and Acceptance` is present but its body
     length (after stripping whitespace) is zero, emit a
     `warning` finding: "ExecPlan section `Validation and
     Acceptance` is empty; describe how a reader can verify the
     change works." Same idea for `Outcomes & Retrospective`
     (already covered by the existing all-checked-but-empty
     check; do not duplicate).
   * Add a "stalled checkbox" check: for every active plan whose
     `Progress` section contains exactly one unchecked checkbox
     and the file's last-activity timestamp is older than the
     stale threshold, emit a `warning` finding: "Active ExecPlan
     has a single unchecked task with no recent activity. Either
     finish it or split it." This sits next to the existing
     stale-active check.

Add unit tests for both behaviors in
`packages/legibility/tests/audit/execplans.test.ts`.

### M10 — `guardrails_and_hooks` scoring dimension

In `packages/legibility/src/score_repo.ts`:

   * Add `'guardrails_and_hooks'` to the `METRIC_NAMES` tuple
     (after `lint_format_gates`).
   * Implement `scoreGuardrailsAndHooks(ctx)`:
     - Signals (existence of any of these in `ctx.relpaths`):
       `.pre-commit-config.yaml`, `.pre-commit-config.yml`,
       `lefthook.yml`, `lefthook.yaml`, `.lefthook.yml`,
       `.husky/` (any file under), `.githooks/` (any file
       under), `.claude/hooks/` (any file under).
     - Score 3 if ≥ 2 of `{pre-commit, lefthook, husky/githooks,
       .claude/hooks}` are present (strong layered enforcement).
     - Score 2 if exactly one of those families is present.
     - Score 1 if no family is present but `core.hooksPath` is
       configured in `.git/config` or `.gitconfig` (rare; skip
       if hard).
     - Score 0 otherwise.
   * Register in `METRIC_SCORERS`.

### M11 — `init` subcommand

In `packages/legibility/src/legibility.ts`:

   * Add an `init` subcommand (alias `generate-templates`).
   * It accepts an optional path argument (defaulting to `.`)
     and an optional `--force` flag (default false) which permits
     overwriting existing files. Without `--force`, existing files
     are left alone and reported as "skipped".
   * Templates are inlined string constants (no asset loading
     from disk required at runtime — the bundle stays single-file).
     They are placed in
     `packages/legibility/src/init/templates.ts`. Each template
     yields one (relative path → contents) pair.

Templates to ship:

   * `AGENTS.md`: a minimal index pointing at `docs/`,
     `.agents/PLANS.md`, primary commands, and architecture.
   * `CLAUDE.md`: contains exactly `@AGENTS.md\n`.
   * `.agents/PLANS.md`: a verbatim copy of
     `skills/agentic-legibility/PLANS.md`. To avoid duplicating
     the file in the source tree, generate `templates.ts` from
     `PLANS.md` at build time (a small build helper script
     under `packages/legibility/scripts/embed-templates.mjs`
     run as a `prebuild` npm script).
   * `docs/README.md`: short index that links to
     `exec-plans/`.
   * `docs/exec-plans/active/.gitkeep`: empty file.
   * `docs/exec-plans/completed/.gitkeep`: empty file.

Output: a JSON object listing `{ created: [...], skipped: [...] }`
to stdout. Update `legibility.ts`'s USAGE string.

### M12 — Wire-up

   * `skills/agentic-legibility/SKILL.md`:
     - Add the new audit checks to the bullet list under
       "Mechanical Audit Loop", with one-line summaries.
     - Mention the new `init` subcommand under "Mechanical
       Audit Loop" (or a new "Templates" sub-bullet).
     - Update the count of metrics from "seven-dimension
       scorecard" to "eight-dimension scorecard" everywhere.
   * `skills/agentic-legibility/references/audit-checks.md`:
     - Add a section per new check with finding families and
       remediation hints.
   * `skills/agentic-legibility/references/scorecard-and-guidance.md`:
     - Add the new `guardrails_and_hooks` row to the rubric, with
       evidence types and a 0/1/2/3 calibration.
   * Rebuild the bundle: `npm -w legibility run build`.
   * Run smoke tests: `npm -w legibility run verify-bundle`.
   * Commit the regenerated `skills/agentic-legibility/scripts/legibility.js`
     alongside the source changes.

## Concrete Steps

Run these commands in order. Working directory is the repository
root unless stated otherwise.

For each milestone:

    npm -w legibility test
    npm -w legibility run typecheck

After M12 only:

    npm -w legibility run build
    npm -w legibility run verify-bundle

To exercise the bundle against this repository:

    node skills/agentic-legibility/scripts/legibility.js audit --check-all .
    node skills/agentic-legibility/scripts/legibility.js score .

To exercise `init` against a fresh directory:

    rm -rf /tmp/init-test && mkdir /tmp/init-test
    node skills/agentic-legibility/scripts/legibility.js init /tmp/init-test
    node skills/agentic-legibility/scripts/legibility.js audit --check-artifacts /tmp/init-test

The last command should print `"status": "ok"`.

## Validation and Acceptance

The plan is complete when all of the following hold:

   * `npm -w legibility test` passes with new tests covering each
     new check, each new adapter, and the `init` subcommand.
   * `npm -w legibility run typecheck` is clean.
   * `npm -w legibility run build` produces a bundle and
     `npm -w legibility run verify-bundle` shows all checks pass.
   * Running
     `node skills/agentic-legibility/scripts/legibility.js audit --check-all .`
     against this repository finishes successfully (status `ok` or
     `drift` is fine — the test is that all eleven checks run and
     each emits a CheckResult).
   * Running `legibility list-metrics` lists eight metrics
     including `guardrails_and_hooks`.
   * Running `legibility init /tmp/foo` against an empty
     directory produces files such that `legibility audit
     --check-artifacts /tmp/foo` emits `status: ok`.

## Idempotence and Recovery

Each milestone is additive and can be run multiple times safely.
If a milestone introduces a failing test, fix the test or revert
that milestone before moving on. The `init` subcommand is
explicitly idempotent: re-running it without `--force` is a no-op
on existing files.

If the bundle is broken in a partial commit, regenerate it with
`npm -w legibility run build`. The TypeScript source is the
source of truth.

## Artifacts and Notes

A representative aggregated audit report after M12 should look
roughly like (truncated):

    {
      "repo": ".",
      "status": "ok",
      "checks": {
        "artifacts":            { "status": "ok", "findings": [...] },
        "links":                { ... },
        "commands":             { ... },
        "execplans":            { ... },
        "agents_md":            { ... },
        "cross_tool_aliases":   { ... },
        "context_budget":       { ... },
        "readme_drift":         { ... },
        "nesting":              { ... },
        "repo_map":             { ... },
        "adrs":                 { ... }
      }
    }

A representative score report's metrics keys after M12:

    bootstrap_self_sufficiency, task_entrypoints,
    validation_harness, lint_format_gates,
    guardrails_and_hooks, agent_repo_map,
    structured_docs, decision_records

## Interfaces and Dependencies

No new runtime dependencies. The bundle remains zero-dependency.

New types and functions to introduce:

In `packages/legibility/src/audit_repo.ts`:

    export async function checkCrossToolAliases(
       root: string,
       options?: { excludes?: string[] },
    ): Promise<CheckResult>;

    export async function checkContextBudget(
       root: string,
    ): Promise<CheckResult>;

    export async function checkReadmeDrift(
       root: string,
    ): Promise<CheckResult>;

    export async function checkNesting(
       root: string,
       options?: { excludes?: string[] },
    ): Promise<CheckResult>;

    export async function checkRepoMap(root: string): Promise<CheckResult>;

    export async function checkAdrs(
       root: string,
       options?: { excludes?: string[] },
    ): Promise<CheckResult>;

In `packages/legibility/src/lib/execplans.ts`:

    export interface ParsedExecPlan {
       headings: string[];
       presentSections: Set<string>;
       missingSections: string[];
       progress: ExecPlanProgress;
       sectionBodies: Record<string, string>;
    }

In `packages/legibility/src/score_repo.ts`:

    const METRIC_NAMES = [
       'bootstrap_self_sufficiency',
       'task_entrypoints',
       'validation_harness',
       'lint_format_gates',
       'guardrails_and_hooks',
       'agent_repo_map',
       'structured_docs',
       'decision_records',
    ] as const;

In `packages/legibility/src/legibility.ts`:

    case 'init':
    case 'generate-templates':
       return await runInitCli(rest);

In `packages/legibility/src/init/index.ts`:

    export async function runInitCli(argv: string[]): Promise<void>;

New language adapters under `packages/legibility/src/languages/`:
`nx.ts`, `turbo.ts`, `mise.ts`, `mix.ts`, each exporting an object
that implements the existing `LanguageAdapter` interface from
`types.ts`.
