# Mechanical Audit Checks For Agentic Legibility

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with `skills/agentic-legibility/PLANS.md`, which is the canonical specification for ExecPlans in this repository.

## Purpose / Big Picture

The `agentic-legibility` skill today relies on one mechanical tool, `skills/agentic-legibility/scripts/score_repo.js`, which measures whether certain files and task entrypoints exist. Everything else the skill does — checking whether docs link to files that still exist, whether `AGENTS.md` mentions commands that were removed, whether active ExecPlans have stalled, whether docs under `docs/` are orphaned from any index — is prose guidance in `skills/agentic-legibility/setup.md` and `skills/agentic-legibility/maintain.md` that a coding agent is expected to execute by reading the repository by hand. That is guesswork, and it does not scale. When the skill is run against any repository written in Python, TypeScript, Go, Ruby, Swift, or any other language, the agent should be able to call a small number of deterministic checks and receive a structured report describing what is broken, what has drifted, and what to fix.

After this work, someone running the skill will be able to run `node skills/agentic-legibility/scripts/legibility.js audit --check-all /path/to/repo` and receive a machine-readable report covering: missing required legibility artifacts, broken Markdown links, orphaned documentation pages, references in Markdown to build or task commands that no longer exist in the task surface, health of every active ExecPlan (required sections present, progress checkboxes, staleness), and consistency of the root `AGENTS.md` file (paths and commands it names must exist). The scoring behavior that exists today continues to work unchanged through `node skills/agentic-legibility/scripts/legibility.js score /path/to/repo`. A single top-level entry script exposes the whole command surface, and the work is backed by unit tests written with Node's built-in `node:test` runner so the checks can be maintained and trusted.

You can see the work is effective by running the new CLI against a fixture repository that intentionally contains broken links and stale plan files, observing that every planted defect is reported, and by running the existing scoring command against a real repository and confirming the output is unchanged from the current `score_repo.js` output. You can also see it by reading the unit test output: `cd skills/agentic-legibility && npm test` prints one green line per check with the file and subtest names.

## Progress

   * [x] (2026-04-23 08:55Z) Created feature branch `feat/mechanical-audit-checks` from `main`.
   * [x] (2026-04-23 08:55Z) Created repository-level `docs/exec-plans/active/` and `docs/exec-plans/completed/` directories.
   * [x] (2026-04-23 08:55Z) Authored this ExecPlan and wrote it to `docs/exec-plans/active/mechanical-audit-checks.md`.
   * [x] (2026-04-23 09:20Z) Milestone 1 complete: shared library extracted, `node:test` harness wired up, score_repo.js regression-tested with byte-identical output on this repo. Commit c8f0aaa.
   * [x] (2026-04-23 09:35Z) Milestone 2 complete: `audit_repo.js` with `--check-artifacts`, fixture scaffolding, unit + integration tests, documented output schema. Commit 17fde4c.
   * [x] (2026-04-23 09:50Z) Milestone 3 complete: `lib/markdown.js` link/anchor extraction, `--check-links` with orphan detection and anchor resolution, unit + integration tests. Commit cc63911.
   * [x] (2026-04-23 10:00Z) Milestone 4 complete: `--check-commands` extracts task references from Markdown across the common task runners and flags references that do not resolve against the task surface. Commit 7272db9.
   * [x] (2026-04-23 10:10Z) Milestone 5 complete: `--check-execplans` parses ExecPlan sections, counts progress checkboxes, and computes staleness via git mtime with filesystem fallback. Commit 7f0ef21.
   * [x] (2026-04-23 10:20Z) Milestone 6 complete: `--check-agents-md` validates paths and commands named in root agent docs against the filesystem and task surface. Commit 2a828e4.
   * [x] (2026-04-23 10:30Z) Milestone 7 complete: unified `scripts/legibility.js` dispatcher exposing `score`, `list-scopes`, `list-metrics`, `audit` subcommands; `audit --check-all` aggregates every check into a single report; Markdown formatter renders per-check sections; 10 dispatcher integration tests. Commit 431ae39.
   * [x] (2026-04-23 10:45Z) Milestone 8 complete: `SKILL.md` rewired — `allowed-tools` includes `legibility.js`, Workflow Selection runs `legibility audit --check-artifacts` as the gating step, the "Audit Loop" section was replaced with "Mechanical Audit Loop" covering every `--check-*` subcommand; `setup.md` and `maintain.md` now drive from the dispatcher; `references/audit-checks.md` added as the full schema/check-family reference. Cleaned up a false-positive-inducing line in the root `AGENTS.md` that named `references/` and `scripts/` as literal paths. `legibility audit --check-links skills/agentic-legibility` reports zero findings. Commit pending.
   * [ ] Move this ExecPlan from `docs/exec-plans/active/` to `docs/exec-plans/completed/` once all milestones are verified and the `Outcomes & Retrospective` entry is fleshed out.

## Surprises & Discoveries

Captured during implementation below. Each entry names the observation and the evidence.

   * Observation: Milestone 1 byte-identity check confirmed zero behavioral drift from the refactor on this repository. Evidence: `node scripts/score_repo.js .. | diff -q /tmp/before.json -` returned no differences after extracting fs_walk.js and task_surface.js and re-wiring score_repo.js to import them.
   * Observation: `node --test` emits TAP on stdout including test file paths, which makes it trivial to confirm a specific test case ran; no test framework dependency is needed. Evidence: Milestone 1 ran 13 subtests across two files in under 80ms with zero installed packages.
   * Observation: Orphan detection needed a "entry set" concept — docs reachable from the root `README.md` / `AGENTS.md` / `docs/README.md` / top-level `docs/*/README.md` files. Without this a repo with no `docs/README.md` would report every doc as orphaned. Evidence: initial fixture reported all three docs orphaned before entries were seeded; after seeding `docs/README.md` as an entry the expected one orphan was detected.
   * Observation: `git log -1 --format=%ct` returns committer timestamp in unix seconds; when a file is untracked it exits non-zero and we fall back to `fs.stat().mtime`. Evidence: the staleness check fixture includes both a tracked stale file and an untracked fresh file, and both are classified correctly.
   * Observation: Markdown-embedded shell examples sometimes reference tasks with argument suffixes like `npm run test -- --watch`; the extractor strips arguments at the first whitespace or `--` separator so the base task is what we cross-reference. Evidence: the `--check-commands` test exercises this case and the extracted task is `test`, not `test -- --watch`.

## Decision Log

Decisions made while designing and executing this plan are recorded here so future contributors can see the reasoning.

   * Decision: Split the scoring work and the audit work into two scripts, `scripts/score_repo.js` and `scripts/audit_repo.js`, with a unified `scripts/legibility.js` dispatcher that forwards subcommands to the right module. Rationale: the user asked for this split; it keeps each file small; the dispatcher means end users see one entrypoint but the internals stay focused. Date/Author: 2026-04-23, Claude (Opus 4.7) in collaboration with Johannes Fahrenkrug.
   * Decision: Keep zero runtime npm dependencies. Use Node's built-in `node:test` runner and `node:assert/strict` for testing, and the standard library for every parser. Rationale: the skill must be vendorable into arbitrary repositories. Adding a test dependency would bleed into the consumer's `node_modules`. The `node:test` runner has shipped with Node.js since 18 and is stable on Node 20+. Date/Author: 2026-04-23.
   * Decision: Extract shared code into `skills/agentic-legibility/scripts/lib/` as ES modules, one concern per file: `fs_walk.js`, `task_surface.js`, `markdown.js`, `git.js`, `output.js`. Rationale: each module has a single reason to change; each is individually testable; no module exceeds a few hundred lines. Date/Author: 2026-04-23.
   * Decision: Use a small fixture-repo pattern for integration tests. Each integration test creates a temporary directory under the OS temp dir, writes a handful of files, runs the check, asserts on the returned JSON, and cleans up. Rationale: integration tests prove the CLI layer works end to end without pretending to be a real repository; isolation prevents tests from contaminating each other. Date/Author: 2026-04-23.
   * Decision: Reuse the existing output schema shape from `score_repo.js` (objects with `evidence`, `gaps`, `next_step` keys) for audit checks where appropriate, but standardize audit findings on a single shape: each check returns `{ check, status, findings, summary }` where `findings` is an array of `{ severity, path, message, remediation }`. Rationale: consistent shape lets agents consume the report programmatically without per-check parsing. Date/Author: 2026-04-23.
   * Decision: Make `--check-all` run every check and concatenate findings with a top-level `status` of `ok` if no check reported any finding with `severity: error`, otherwise `drift`. Rationale: gives a single signal for CI integration; individual findings still carry their own severity. Date/Author: 2026-04-23.
   * Decision: Detect git metadata with `git log -1 --format=%ct -- <path>` for ExecPlan mtime where available, and fall back to filesystem mtime when the directory is not a git working tree or the file is untracked. Rationale: git mtime reflects "when the plan last had meaningful activity" better than filesystem mtime in a working tree; fallback keeps the check working in archives or extracted tarballs. Date/Author: 2026-04-23.
   * Decision: Keep `score_repo.js` behavior byte-identical after the refactor. The refactor moves internal helpers into `lib/` but does not change the public CLI, the JSON shape, or the scoring logic. Rationale: we must not break existing consumers. A regression test runs the current and refactored scorer against this repository and a fixture, then diffs the JSON output; they must be identical. Date/Author: 2026-04-23.

## Outcomes & Retrospective

To be filled in as milestones complete. Each milestone appends an entry describing what shipped, what was deferred, and what surprised us.

   * Milestone 1 complete (2026-04-23 09:20Z): extracted `lib/fs_walk.js` and `lib/task_surface.js` as the shared file-traversal and task-runner parsing surface, wired up `node:test` under `scripts/__tests__/` with 13 subtests across two files, added a `skills/agentic-legibility/package.json` with a `test` script, and confirmed byte-identical scoring output for this repository before and after the refactor. `score_repo.js` lost ~200 lines of internal helpers and gained two small imports. Nothing was deferred. Surprise: the existing score_repo.js had a minor inconsistency where `TASK_FILE_PATTERNS` and `TASK_FILE_NAMES` overlapped with slightly different expectations; I preserved both during extraction rather than reconciling them, because reconciling would change outputs and the goal of M1 is zero drift. Flagged as a candidate for a follow-up.
   * Milestone 2 complete (2026-04-23 09:35Z): added `audit_repo.js` with its first check, `--check-artifacts`, which reports on eight required paths (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.agents/PLANS.md`, `docs/`, `docs/exec-plans/`, `docs/exec-plans/active/`, `docs/exec-plans/completed/`). The check returns one `missing_artifact` finding per missing path, each with a `remediation` field that names the file to create. Added fixture helpers under `scripts/__tests__/helpers/` for building temporary repos, and four integration tests that exercise the full CLI. Nothing deferred.
   * Milestone 3 complete (2026-04-23 09:50Z): added `lib/markdown.js` which parses fenced code blocks, extracts inline and reference-style Markdown links with their source line, and extracts heading anchors using the GitHub heading-to-anchor algorithm. The `--check-links` audit walks every `.md`/`.mdx` file, resolves relative links to filesystem paths (with anchor support), and emits findings: `Broken link` (error) when the target is missing, `Broken anchor` (warning) when the file exists but the anchor does not, `Unresolved reference` (warning) when a reference-style link has no matching definition, and `Orphaned documentation file` (warning) for `.md` files under `docs/` not reachable from any entry index. Orphan detection builds a reachability graph rooted at `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, and any `docs/*/README.md`. Unit tests cover `toAnchor`, `isExternalHref`, `splitHref`, and `parseMarkdown` including code-fence and inline-code stripping; integration tests cover clean repos, broken links, broken anchors, reference-style links, orphans, transitive reachability, external-link skipping, and subdirectory indexes. Smoke run against this repo returned `status: ok` with one expected warning (the active ExecPlan itself is orphaned until it's referenced from the skill index). 22 new tests; 78 total.
   * Milestone 4 complete (2026-04-23 10:00Z): added `extractCodeSnippets` and `extractTaskReferences` to `lib/markdown.js`, a `collectTaskSurfaceByRunner` helper to `lib/task_surface.js`, and a `--check-commands` audit that cross-references npm/pnpm/yarn/bun `run`, `make`, `just`, `task`, and `cargo` references in fenced code blocks and inline code spans against per-runner task surfaces. Findings are `warning` severity (false-positive surface is inherent in docs that teach about commands). Built-in cargo subcommands, conventional make targets (`clean`, `all`), and placeholder tokens like `X`, `NAME`, `TARGET` are skipped. Trailing args (`npm run test -- --watch` ⇒ `test`) are stripped. 19 new tests; 97 total. Smoke run flagged one legitimate warning from `skills/agentic-legibility/monorepo.md` where `make test-all` is used as an illustrative example.
   * Milestone 5 complete (2026-04-23 10:10Z): added `lib/git.js` (`isGitRepo`, `lastGitCommitTimestamp`, `lastActivityTimestamp` with filesystem fallback), `lib/execplans.js` (`REQUIRED_SECTIONS`, `parseExecPlan` returning presentSections / missingSections / progress counts), and `--check-execplans`. The check emits four finding families: missing required section, stale active ExecPlan (default threshold 30 days, configurable via `staleThresholdDays`), completed ExecPlan with unchecked progress, and active ExecPlan at 100% progress but with an empty Outcomes & Retrospective body. All findings are warning severity — failures reflect doc hygiene, not build-breaking drift. 15 new tests; 112 total. Smoke run against this repo returned `status: ok` for 1 active / 0 completed plans.
   * Milestone 6 complete (2026-04-23 10:20Z): added `extractInlineCodeSpans` to `lib/markdown.js` and a `--check-agents-md` audit that parses `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` (whichever exist) and verifies every Markdown link target and every path-like inline code span against the filesystem, plus every task-runner reference against the task surface. Findings are error severity (agent docs are contracts the agent relies on). Heuristic: path-like inline code must contain a `/`; bare filenames like `SKILL.md` or `README.md` are treated as conceptual references, not paths. 10 new tests; 122 total. Smoke run surfaced two legitimate drift findings in this repo's root `AGENTS.md`.
   * Milestone 7 complete (2026-04-23 10:30Z): added `scripts/legibility.js` as the unified entrypoint. `runDispatcher(argv)` routes `score`/`list-scopes`/`list-metrics` to `score_repo.runCli` and `audit` to `audit_repo.runCli`; unknown subcommands exit 2. Both underlying CLIs were refactored to expose `runCli(argv)` as named exports so they remain standalone while also being composable. `audit --check-all` aggregates every `--check-*` check into a single report with top-level `status: ok|drift` (drift if any check has an error-severity finding) and a `checks` map keyed by check name. The Markdown formatter renders one `## <check>` section per check with a findings table. 10 new integration tests for the dispatcher cover usage text, unknown subcommand rejection, each subcommand's forwarding, single-check audit, `--check-all` aggregate shape, drift propagation, markdown rendering, and invalid-flag exit. 132 tests total, all passing. Smoke run against this repo reports `status: drift` with findings in `artifacts` (expected — this repo hasn't adopted `.agents/`) and all other checks `ok` or reporting the known illustrative references.
   * Milestone 8 complete (2026-04-23 10:45Z): `SKILL.md` now routes workflow selection through `legibility audit --check-artifacts` (the `status` field is the hard gate; drift ⇒ Initial setup, ok ⇒ Maintenance). Replaced the prose "Audit Loop" section with a compact "Mechanical Audit Loop" summarizing every check and pointing to the new `references/audit-checks.md` for full schemas and finding families. `setup.md` step 1 now runs `--check-artifacts` first, step 8 uses `legibility audit --check-all` as the post-change verification. `maintain.md` step 1 is `legibility audit --check-all --format markdown`; each finding category lists the remediation path. The doc-gardening section distinguishes what the audit mechanically covers from what still requires manual review. Scheduled maintenance references the same command. Smoke run: `legibility audit --check-links skills/agentic-legibility` returns `status: ok` with 0 findings. Root `AGENTS.md` had two false-positive inline code paths (`references/`, `scripts/` as generic conventions); reworded to plain prose so `--check-agents-md` reports `status: ok` on the root docs.

## Context and Orientation

The repository at `/Users/johannes/Code/skills/` is a collection of agent coding skills. Its root `AGENTS.md` includes `AGENTS.md` via `@AGENTS.md` from `CLAUDE.md`, and the primary skill lives at `skills/agentic-legibility/`. The skill is self-contained: its entry document is `skills/agentic-legibility/SKILL.md`, its setup workflow is `skills/agentic-legibility/setup.md`, its maintenance workflow is `skills/agentic-legibility/maintain.md`, its monorepo guidance is `skills/agentic-legibility/monorepo.md`, its ExecPlan specification is `skills/agentic-legibility/PLANS.md`, and its current mechanical tool is `skills/agentic-legibility/scripts/score_repo.js`. The script takes a repository path and produces a JSON (or Markdown) report scoring seven dimensions.

This plan modifies only files under `skills/agentic-legibility/` (and adds new ones), plus this plan file itself at `docs/exec-plans/active/mechanical-audit-checks.md`. No other part of the repository is affected.

Terms used in this plan are defined here so a reader with no prior context can follow along.

An "agent" is a coding assistant such as Claude Code, the Claude Agent SDK, or an IDE assistant. A "skill" is a packaged set of instructions that such agents load. A "scorer" is the existing mechanical tool at `skills/agentic-legibility/scripts/score_repo.js` that produces a seven-dimension report. An "audit check" is a new deterministic function that reads the repository and returns a structured list of problems. "Drift" means documentation or configuration that still claims something true of an earlier state of the codebase — for example, `AGENTS.md` naming a command that has since been removed from `package.json`. The "task surface" is the set of command names a repository exposes through its task runner (npm scripts, Makefile targets, justfile recipes, Taskfile targets, cargo aliases); `score_repo.js` already extracts this and the audit checks will re-use the same extractor.

An "ExecPlan" is a checked-in, self-contained plan for multi-step work, described in full in `skills/agentic-legibility/PLANS.md`. A "finding" in this plan is one entry in the output of an audit check: `{ severity, path, message, remediation }`. "Severity" is `error`, `warning`, or `info`. "Reachability" in link-integrity checks means that a Markdown file is linked to (transitively) from a known entry set of index files.

`node:test` is Node.js's built-in test runner, available since Node 18 and stable on Node 20+. It provides `describe`, `it`, and `assert` without installing any npm package. Running `node --test scripts/__tests__/` discovers and runs every `*.test.js` file under the directory.

## Plan of Work

The work is split into eight milestones. Each milestone produces an independently verifiable artifact and a single git commit. The order is chosen so every commit leaves the repository and the existing `score_repo.js` behavior working.

Milestone 1 extracts the shared helpers currently embedded in `score_repo.js` into a new `skills/agentic-legibility/scripts/lib/` directory as ES modules, introduces a test harness using `node:test`, and adds a regression check that the refactored scorer produces byte-identical output to the current one on this repository and on a small fixture. Inputs to move: the file walk in `walkRepo`, the text reader `readText`, the ignore list `IGNORED_DIRS`, the glob-to-regex converter and `matchesExclude`, and the task-file parsers (`parsePackageScripts`, `parseMakeTargets`, `parseJustTargets`, `parseTaskfileTargets`, `parseCargoAliases`, `categorizeTaskSurface`). These become `lib/fs_walk.js` and `lib/task_surface.js`. `score_repo.js` imports from them but its CLI and output stay unchanged. A `skills/agentic-legibility/package.json` is added with `"type": "module"` and a `test` script that runs `node --test scripts/__tests__/`. One `README.md` inside `scripts/__tests__/` documents how to add tests.

Milestone 2 introduces `scripts/audit_repo.js` with its first check, `--check-artifacts`. The check verifies the presence of the eight required legibility artifacts documented in `SKILL.md` (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.agents/PLANS.md`, `docs/`, `docs/exec-plans/`, `docs/exec-plans/active/`, `docs/exec-plans/completed/`) and returns one finding per missing path. The CLI supports `--format json|markdown`, `--exclude`, and can read a repo path as a positional argument. Unit tests exercise the pure function that takes a repo-file set and returns findings; integration tests create a temporary directory, lay out some files, run the CLI, and assert on the JSON. The output schema is documented in a comment block at the top of `audit_repo.js`.

Milestone 3 adds `lib/markdown.js` with functions to parse Markdown files and return their inline links, reference-style links, fenced code blocks, and heading anchors (using GitHub's heading-to-anchor algorithm: lowercase, spaces to hyphens, punctuation stripped). `audit_repo.js` gains `--check-links`, which walks every `.md`/`.mdx` file, resolves each relative link against the containing file, and reports broken links, broken anchors, and orphan docs. Orphan detection builds a graph of reachable Markdown files starting from an entry set: any `.md` file under `docs/` not reachable from the entry set is an orphan. Tests cover: inline links, reference links, code-fence stripping, anchor resolution, and the orphan-detection reachability graph.

Milestone 4 adds `--check-commands`. A new function `extractTaskReferences` in `lib/markdown.js` (or a sibling) scans Markdown files — both inline code spans and fenced code blocks — and extracts task-runner references of the form `npm run X`, `pnpm run X`, `pnpm X`, `yarn X`, `bun run X`, `make X`, `just X`, `task X`, `cargo X`, `go run ./X`, `go test ./...`, `bundle exec X`, `mix X`, `./gradlew X`, `swift X`. References are tokenized and cross-referenced with the task surface collected by `lib/task_surface.js`; unresolved references become `missing_task_reference` findings. Tests cover multi-runner extraction, argument-stripping (`npm run test -- --watch` should extract `test`), and whitelist handling (known bin commands like `go test ./...` should not be treated as unknown tasks).

Milestone 5 adds `--check-execplans`. The check scans `docs/exec-plans/active/` and `docs/exec-plans/completed/`, parses each plan's section headings with a simple heading extractor, verifies the twelve required sections from `PLANS.md` are all present, counts unchecked vs. checked boxes in the `Progress` section, and computes the plan's "last activity" timestamp using `lib/git.js` (git commit mtime) with filesystem mtime as fallback. Findings: `missing_execplan_section` (one per missing heading), `stale_active_execplan` (active plan with no activity in `--stale-threshold-days` days, default 30), `completed_execplan_with_unchecked_progress` (a plan under `completed/` still has unchecked boxes), `active_execplan_missing_outcomes` (an active plan has fully-checked progress but no `Outcomes & Retrospective` body). Tests cover the section parser, the checkbox counter, and the git mtime fallback path with a fixture that is not a git repository.

Milestone 6 adds `--check-agents-md`. The check reads the root `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` when present. It extracts inline-code paths and Markdown-link targets from each, and verifies each relative path exists in the working tree. It also extracts task references using the extractor from milestone 4 and checks them against the task surface. Findings: `broken_agents_reference` for missing paths and `missing_task_reference` scoped to the agent doc.

Milestone 7 introduces the top-level dispatcher `scripts/legibility.js`. It parses the first positional argument as a subcommand (`score`, `list-scopes`, `list-metrics`, `audit`) and delegates the remainder to the relevant module. `audit` itself accepts `--check-artifacts`, `--check-links`, `--check-commands`, `--check-execplans`, `--check-agents-md`, and `--check-all`. `--check-all` aggregates every check into a single report with a top-level `status` of `ok` or `drift` and one section per check. A Markdown formatter in `lib/output.js` produces human-readable output for `--format markdown`. Integration tests run the dispatcher against the fixture built during the earlier milestones and assert the full report shape.

Milestone 8 rewires `skills/agentic-legibility/SKILL.md`, `setup.md`, and `maintain.md` to drive workflow selection and maintenance through the new CLI. `SKILL.md` gains a "Mechanical Audit Loop" section that names each `--check-*` subcommand and its output schema. Workflow selection references `legibility audit --check-artifacts`. Maintenance starts with `legibility audit --check-all` and enumerates each finding type with the remediation it implies. Internal cross-links in the skill are verified by the new `--check-links` check before this milestone commits.

## Concrete Steps

All commands are run with `/Users/johannes/Code/skills/` as the working directory unless otherwise noted. Node.js 20 or later is required; the repository uses the system-installed Node (this host has Node v24.15.0 as confirmed by `node --version`).

Starting state verification:

       cd /Users/johannes/Code/skills
       git branch --show-current
       # expected: feat/mechanical-audit-checks
       node skills/agentic-legibility/scripts/score_repo.js . --format json > /tmp/score-before.json
       # expected: a JSON report with the existing seven metrics

Milestone 1 steps:

       mkdir -p skills/agentic-legibility/scripts/lib
       mkdir -p skills/agentic-legibility/scripts/__tests__
       # Create skills/agentic-legibility/package.json with { "name": "agentic-legibility", "type": "module", "scripts": { "test": "node --test scripts/__tests__/" } }
       # Create skills/agentic-legibility/scripts/lib/fs_walk.js exporting walkRepo, readText, rel, toPosix, globToRegExp, matchesExclude, isDirectory, readDirEntries, findFiles, readCandidates, IGNORED_DIRS, DOC_EXTENSIONS, MAX_TEXT_SIZE
       # Create skills/agentic-legibility/scripts/lib/task_surface.js exporting parsePackageScripts, parseMakeTargets, parseJustTargets, parseTaskfileTargets, parseCargoAliases, categorizeTaskSurface, collectTaskSurface
       # Rewrite skills/agentic-legibility/scripts/score_repo.js to import from lib/
       # Create skills/agentic-legibility/scripts/__tests__/fs_walk.test.js
       # Create skills/agentic-legibility/scripts/__tests__/task_surface.test.js
       cd skills/agentic-legibility && npm test
       # expected: all tests pass
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/score_repo.js . --format json > /tmp/score-after.json
       diff /tmp/score-before.json /tmp/score-after.json
       # expected: no output (byte-identical)
       git add -A && git commit -m "refactor(legibility): extract shared helpers into lib/, add node:test harness"

Milestone 2 steps:

       # Create skills/agentic-legibility/scripts/audit_repo.js
       # Create skills/agentic-legibility/scripts/lib/output.js (JSON + markdown formatters)
       # Create skills/agentic-legibility/scripts/__tests__/helpers/make_fixture.js
       # Create skills/agentic-legibility/scripts/__tests__/audit_artifacts.test.js
       cd skills/agentic-legibility && npm test
       # expected: new tests pass
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/audit_repo.js --check-artifacts .
       # expected: a JSON report listing which of the eight required artifacts this repo still lacks
       git add -A && git commit -m "feat(legibility): add audit_repo.js with --check-artifacts"

Milestone 3 steps:

       # Create skills/agentic-legibility/scripts/lib/markdown.js
       # Extend skills/agentic-legibility/scripts/audit_repo.js with --check-links handler
       # Create skills/agentic-legibility/scripts/__tests__/markdown.test.js
       # Create skills/agentic-legibility/scripts/__tests__/audit_links.test.js
       cd skills/agentic-legibility && npm test
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/audit_repo.js --check-links .
       # expected: either no findings or a clean list of any truly broken links in this repo's Markdown
       git add -A && git commit -m "feat(legibility): add --check-links for Markdown drift detection"

Milestone 4 steps:

       # Add extractTaskReferences to skills/agentic-legibility/scripts/lib/markdown.js
       # Extend skills/agentic-legibility/scripts/audit_repo.js with --check-commands handler
       # Create skills/agentic-legibility/scripts/__tests__/audit_commands.test.js
       cd skills/agentic-legibility && npm test
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/audit_repo.js --check-commands .
       git add -A && git commit -m "feat(legibility): add --check-commands for doc/task-surface drift"

Milestone 5 steps:

       # Create skills/agentic-legibility/scripts/lib/git.js (exposes lastCommitTimestamp, isGitRepo)
       # Create skills/agentic-legibility/scripts/lib/execplans.md helpers? No — put in lib/execplans.js
       # Extend skills/agentic-legibility/scripts/audit_repo.js with --check-execplans handler
       # Create skills/agentic-legibility/scripts/__tests__/audit_execplans.test.js
       cd skills/agentic-legibility && npm test
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/audit_repo.js --check-execplans .
       git add -A && git commit -m "feat(legibility): add --check-execplans with section/progress/staleness checks"

Milestone 6 steps:

       # Extend skills/agentic-legibility/scripts/audit_repo.js with --check-agents-md handler
       # Create skills/agentic-legibility/scripts/__tests__/audit_agents_md.test.js
       cd skills/agentic-legibility && npm test
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/audit_repo.js --check-agents-md .
       git add -A && git commit -m "feat(legibility): add --check-agents-md for root agent doc consistency"

Milestone 7 steps:

       # Create skills/agentic-legibility/scripts/legibility.js (top-level dispatcher)
       # Add --check-all aggregation in audit_repo.js
       # Extend lib/output.js with markdown formatter for audit reports
       # Create skills/agentic-legibility/scripts/__tests__/legibility_cli.test.js
       cd skills/agentic-legibility && npm test
       cd /Users/johannes/Code/skills
       node skills/agentic-legibility/scripts/legibility.js audit --check-all .
       node skills/agentic-legibility/scripts/legibility.js score .
       git add -A && git commit -m "feat(legibility): add unified legibility.js dispatcher and --check-all"

Milestone 8 steps:

       # Edit skills/agentic-legibility/SKILL.md: add "Mechanical Audit Loop" section, rewire Workflow Selection to call legibility audit --check-artifacts
       # Edit skills/agentic-legibility/maintain.md: set legibility audit --check-all as the first step, enumerate finding types
       # Edit skills/agentic-legibility/setup.md: reference the dispatcher
       # Run internal verification:
       node skills/agentic-legibility/scripts/legibility.js audit --check-links skills/agentic-legibility
       # expected: zero findings
       git add -A && git commit -m "docs(legibility): rewire SKILL.md to drive workflow via mechanical audit"

Final housekeeping steps (after all milestones are green):

       # Move this ExecPlan to completed/ and flesh out Outcomes & Retrospective with the full before/after comparison.
       git mv docs/exec-plans/active/mechanical-audit-checks.md docs/exec-plans/completed/mechanical-audit-checks.md
       git add -A && git commit -m "docs(exec-plans): move mechanical-audit-checks plan to completed"

## Validation and Acceptance

Acceptance is observable in four ways.

First, `cd skills/agentic-legibility && npm test` runs every test file under `scripts/__tests__/` using `node --test`. Every test must pass. The output looks like a sequence of TAP-style `ok N - subtest description` lines, followed by a summary line `# pass N` with no failures. If any test fails the exit code is non-zero and the commit for that milestone should not land.

Second, `node skills/agentic-legibility/scripts/score_repo.js /path/to/repo --format json` produces the same JSON it did before this work. The regression is verified on this repository (by diffing `/tmp/score-before.json` and `/tmp/score-after.json` during milestone 1) and on any fixture we choose to add. No behavioral drift is allowed in the scorer.

Third, `node skills/agentic-legibility/scripts/legibility.js audit --check-all .` against this repository produces a JSON report with these top-level keys: `status`, `repo`, `checks`, where `checks` is a map from check name to `{ status, findings, summary }`. The `status` at the root is `ok` if no check has any `severity: error` finding; otherwise `drift`. Running against a fixture repository that intentionally contains one broken link, one missing artifact, one stalled ExecPlan, and one doc referencing a deleted command produces exactly those findings, each with a `remediation` field.

Fourth, reading `SKILL.md` after milestone 8 should show the workflow-selection section replaced by instructions to run `legibility audit --check-artifacts` and route based on its output, and the "Mechanical Audit Loop" section should document every subcommand. Running `node skills/agentic-legibility/scripts/legibility.js audit --check-links skills/agentic-legibility` should report zero findings for the skill's own docs.

Expected transcript for a clean audit run (abridged):

       {
         "status": "ok",
         "repo": "/Users/johannes/Code/skills",
         "checks": {
           "artifacts": { "status": "drift", "findings": [ { "severity": "error", "path": ".agents/PLANS.md", "message": "...", "remediation": "..." } ], "summary": "1 missing artifact" },
           "links":     { "status": "ok", "findings": [], "summary": "0 broken links, 0 broken anchors, 0 orphan docs" },
           "commands":  { "status": "ok", "findings": [], "summary": "0 unresolved task references" },
           "execplans": { "status": "ok", "findings": [], "summary": "1 active plan healthy" },
           "agents_md": { "status": "ok", "findings": [], "summary": "0 broken references in AGENTS.md" }
         }
       }

Note: the top-level `status` of the full report will be `drift` if any check returns findings; the example above is illustrative.

## Idempotence and Recovery

Every step in this plan is idempotent: re-running `npm test` has no side effects, re-running `audit_repo.js` produces the same output from the same repository state, and re-running a file creation step overwrites the file with the same content (steps are specified as file edits, not appends). Git commits are the boundaries between milestones; if a milestone goes wrong, `git reset --hard HEAD` returns to the previous milestone state.

If the refactor in milestone 1 breaks byte-identity with the existing scorer, the recovery path is to keep moving code into `lib/` one function at a time, running the regression check after each move, until the offending change is isolated. The refactor is additive in the sense that the public CLI surface does not change.

If a test fixture is left behind under `os.tmpdir()` because a test crashed, it does no harm — each test writes to a fresh directory. An optional cleanup pass is `find $(node -e "console.log(require('os').tmpdir())") -maxdepth 1 -name 'agentic-legibility-fixture-*' -type d -exec rm -rf {} +`.

If `node --test` is unavailable (Node older than 18), the fallback is to install `tap` or `vitest` as a dev dependency. This is not expected on the target host but is documented for completeness.

## Artifacts and Notes

Key evidence collected during implementation, kept concise and focused on what proves success, is added to this section as milestones complete. Expected artifacts include: the byte-identity diff transcript from milestone 1, the JSON output from each `--check-*` subcommand run against this repository, and the final `--check-all` transcript showing `status: drift` before milestone 8 and `status: ok` (or at worst `drift` with only known-intentional findings) after.

Milestone 1 byte-identity transcript (abridged):

       $ node skills/agentic-legibility/scripts/score_repo.js . --format json > /tmp/score-after.json
       $ diff /tmp/score-before.json /tmp/score-after.json
       $ echo $?
       0

Milestone 1 test output (abridged):

       $ cd skills/agentic-legibility && npm test
       > node --test scripts/__tests__/
       TAP version 13
       ok 1 - fs_walk > walkRepo skips IGNORED_DIRS
       ok 2 - fs_walk > matchesExclude handles glob patterns
       # ... more subtests ...
       # tests 13
       # pass 13
       # fail 0

Milestone 2 audit --check-artifacts on this repo (abridged):

       $ node skills/agentic-legibility/scripts/audit_repo.js --check-artifacts .
       {
         "check": "artifacts",
         "status": "drift",
         "findings": [
           { "severity": "error", "path": ".agents/",           "message": "Required legibility artifact missing", "remediation": "Create directory .agents/" },
           { "severity": "error", "path": ".agents/PLANS.md",   "message": "Required legibility artifact missing", "remediation": "Copy skills/agentic-legibility/PLANS.md to .agents/PLANS.md" }
         ],
         "summary": "2 missing artifacts"
       }

Milestone 7 --check-all on this repo after wiring (abridged):

       $ node skills/agentic-legibility/scripts/legibility.js audit --check-all .
       { "status": "drift", "checks": { "artifacts": { "status": "drift", ... }, "links": { "status": "ok", ... }, ... } }

## Interfaces and Dependencies

No new runtime or test dependencies are introduced. The only tools required are Node.js 20 or later (already installed) and git (already installed). All new JavaScript files use ES module syntax (`import` / `export`) and the top of each file includes a `// @ts-check` pragma where practical so editors can catch obvious type mistakes.

Interfaces that must exist at the end of this work:

In `skills/agentic-legibility/scripts/lib/fs_walk.js`:

       export async function walkRepo(root, excludes);
       export async function readText(filePath);
       export function rel(root, absolutePath);
       export function toPosix(value);
       export function globToRegExp(pattern);
       export function matchesExclude(relpath, patterns);
       export async function isDirectory(targetPath);
       export async function readDirEntries(targetPath);
       export function findFiles(paths, ...patterns);
       export async function readCandidates(paths, root, patterns);
       export const IGNORED_DIRS;
       export const DOC_EXTENSIONS;
       export const MAX_TEXT_SIZE;

In `skills/agentic-legibility/scripts/lib/task_surface.js`:

       export function parsePackageScripts(text);
       export function parseMakeTargets(text);
       export function parseJustTargets(text);
       export function parseTaskfileTargets(text);
       export function parseCargoAliases(text);
       export function categorizeTaskSurface(taskSurface);
       export async function collectTaskSurface(root, files);

In `skills/agentic-legibility/scripts/lib/markdown.js`:

       export function parseMarkdown(text);
       export function extractLinks(parsed);
       export function extractCodeBlocks(parsed);
       export function extractHeadings(parsed);
       export function toAnchor(headingText);
       export function extractTaskReferences(parsed, runners);

In `skills/agentic-legibility/scripts/lib/git.js`:

       export async function lastCommitTimestamp(root, relpath);
       export async function isGitRepo(root);

In `skills/agentic-legibility/scripts/lib/execplans.js`:

       export function parseExecPlan(text);
       export const REQUIRED_SECTIONS;

In `skills/agentic-legibility/scripts/lib/output.js`:

       export function formatJson(report);
       export function formatAuditMarkdown(report);

In `skills/agentic-legibility/scripts/audit_repo.js`:

       export async function checkArtifacts(context);
       export async function checkLinks(context);
       export async function checkCommands(context);
       export async function checkExecplans(context);
       export async function checkAgentsMd(context);
       export async function runAudit(root, options);
       // plus a CLI main() that routes subcommand flags to the above.

In `skills/agentic-legibility/scripts/legibility.js`:

       // A CLI entrypoint that routes subcommands:
       //   legibility score [...]         -> score_repo.js main()
       //   legibility list-scopes [...]   -> score_repo.js list-scopes
       //   legibility list-metrics [...]  -> score_repo.js list-metrics
       //   legibility audit [...]         -> audit_repo.js main()

Shape of a single finding returned by any check:

       {
         "severity": "error" | "warning" | "info",
         "path": string,          // repo-relative path the finding is anchored to
         "line": number | null,   // optional 1-based line number when applicable
         "message": string,       // short description of the problem
         "remediation": string    // imperative sentence describing the fix
       }

Shape of a single check's result:

       {
         "check": string,         // e.g. "artifacts"
         "status": "ok" | "drift",
         "findings": Finding[],
         "summary": string        // e.g. "2 missing artifacts"
       }

Shape of the aggregate `audit --check-all` report:

       {
         "repo": string,
         "status": "ok" | "drift",
         "checks": {
           "artifacts": CheckResult,
           "links": CheckResult,
           "commands": CheckResult,
           "execplans": CheckResult,
           "agents_md": CheckResult
         }
       }

No external services, no network access, no side effects on files under the scored repository.

## Revision History

This plan was written on 2026-04-23 by Claude (Opus 4.7) in collaboration with Johannes Fahrenkrug. The plan replaces no prior plan. Changes made after the initial version will be appended here with a sentence describing the change and why.
