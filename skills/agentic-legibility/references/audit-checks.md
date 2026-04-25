# Mechanical Audit Checks

The `legibility.js` dispatcher exposes deterministic, language-agnostic audit checks that read the repository and return structured findings. This document is the reference for each check: what it verifies, what findings it produces, and the remediation each finding implies.

## Invocation

All checks are run through the top-level dispatcher:

```
node scripts/legibility.js audit --check-<name> /path/to/repo
node scripts/legibility.js audit --check-all /path/to/repo
node scripts/legibility.js audit --check-all --format markdown /path/to/repo
```

Paths are relative to the skill directory; the agent resolves them automatically.

Exit codes:

- `0` — every check returned `status: ok`.
- `1` — at least one check reported drift (an error-severity finding).
- `2` — invalid CLI usage or unknown subcommand.

## Output Schema

A single check returns:

```
{
  "check": "<name>",
  "status": "ok" | "drift",
  "findings": Finding[],
  "summary": "<short sentence>"
}
```

`--check-all` wraps every check in an aggregate report:

```
{
  "repo": "<absolute path>",
  "status": "ok" | "drift",
  "checks": { "<name>": CheckResult, ... }
}
```

Each finding has the shape:

```
{
  "severity": "error" | "warning" | "info",
  "path": "<repo-relative path>",
  "line": <1-based line number or null>,
  "message": "<short description>",
  "remediation": "<imperative sentence naming the fix>"
}
```

Top-level `status` is `ok` only if no check returned any error-severity finding. Warnings do not cause drift but still surface as findings.

## Checks

### `--check-artifacts`

Verifies the eight required legibility artifacts exist:

- `AGENTS.md` (file)
- `CLAUDE.md` (file)
- `.agents/` (directory)
- `.agents/PLANS.md` (file)
- `docs/` (directory)
- `docs/exec-plans/` (directory)
- `docs/exec-plans/active/` (directory)
- `docs/exec-plans/completed/` (directory)

All findings are error severity. This check is the hard gate for workflow selection: any drift means the repository needs **Initial setup**; `status: ok` means **Maintenance**.

The community standard is `AGENTS.md` as the canonical agent doc; `CLAUDE.md` (and `.cursor/rules/*.mdc`, `GEMINI.md`, etc.) are aliases that should include or symlink to `AGENTS.md`. So the `CLAUDE.md` finding is suppressed when `AGENTS.md` is present — the warning is only useful as a remediation prompt when neither file exists at all.

### `--check-links`

Walks every `.md` and `.mdx` file and resolves inline and reference-style Markdown links.

Findings:

- **Broken link** (error) — the target file does not exist.
- **Broken anchor** (warning) — the target file exists but the `#anchor` does not match any heading in that file (using the GitHub heading-to-anchor algorithm).
- **Unresolved reference** (warning) — a reference-style link (`[text][key]`) has no matching `[key]: url` definition.
- **Orphaned documentation file** (warning) — a `.md` file under `docs/` is not reachable from any entry index (`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, or any `docs/*/README.md`).

Fix broken links and anchors immediately. For orphans, either link the file from an index or delete it.

### `--check-commands`

Extracts task-runner references from fenced code blocks and inline code spans in Markdown, then cross-references them against the detected task surface.

Recognized runners: `npm run`, `pnpm run`, `pnpm`, `yarn`, `bun run`, `make`, `just`, `task`, `cargo`, `nx`, `turbo`, `mise run`, `mix`.

All findings are warning severity — the false-positive surface is inherent in docs that teach about commands. Placeholder tokens like `X`, `NAME`, `TARGET`, conventional `make` targets (`clean`, `all`), and built-in `cargo` subcommands are skipped. Trailing arguments are stripped (`npm run test -- --watch` ⇒ `test`).

The remediation either defines the task in the corresponding task file or edits the doc to name an existing task.

### `--check-execplans`

Parses each plan under `docs/exec-plans/active/` and `docs/exec-plans/completed/` and verifies ExecPlan hygiene per `PLANS.md`.

Findings (all warning severity):

- **Missing required section** — the plan is missing one of the twelve required sections from `PLANS.md`.
- **Stale active ExecPlan** — an active plan has had no git activity (or filesystem mtime, if not a git repository) for more than the stale threshold (default 30 days).
- **Completed ExecPlan with unchecked progress** — a plan under `completed/` still has unchecked boxes in its Progress section.
- **Active ExecPlan at 100% missing Outcomes** — an active plan's Progress is fully checked but its Outcomes & Retrospective section is empty.
- **Empty Validation and Acceptance section** — the heading is present but the body has no content. A plan should describe how a reader can verify the change works.

The staleness threshold is configurable via `--stale-threshold-days`.

### `--check-agents-md`

Reads the root `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` when present and verifies that every path and command they name still exists.

Findings (error severity — agent docs are contracts the agent relies on):

- **Broken path reference** — a path-like inline code span (contains `/`) or Markdown-link target does not exist in the working tree. Bare filenames like `SKILL.md` are treated as conceptual references, not paths, and are skipped.
- **Broken task reference** — a task-runner reference does not resolve against the task surface.

Remediation is either restoring the missing path / task or editing the agent doc to match reality.

### `--check-cross-tool-aliases`

Detects drift between `AGENTS.md` and tool-specific aliases that other AI coding agents read by convention: `CLAUDE.md`, `.github/copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`, `CONVENTIONS.md`, and any `.cursor/rules/*.mdc`.

Findings:

- **Cross-tool alias diverges from AGENTS.md** (warning) — the alias is a regular file whose Jaccard similarity (over non-trivial sentences, defined as lines ≥ 30 characters) against `AGENTS.md` is below 0.5. Symlinks and files containing a recognized include directive (`@AGENTS.md`, `@./AGENTS.md`, or `read: AGENTS.md` for `.aider.conf.yml`) are skipped.
- **No canonical AGENTS.md, multiple aliases present** (warning) — `AGENTS.md` is missing but two or more alias files exist. The finding is attached to the longest alias.

Remediation: make the alias a symlink to `AGENTS.md`, or replace its body with `@AGENTS.md`. Either form keeps every tool reading the same source of truth.

### `--check-context-budget`

Estimates the token cost of `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` and warns when an agent doc is so long it will degrade the agent's working context.

Token estimate: `Math.ceil(text.length / 4)` (a coarse but conservative heuristic).

Findings:

- **Agent doc exceeds context budget** (warning at > 4000 tokens, error at > 8000 tokens) — message includes the approximate token count and the threshold crossed.

Remediation: trim the doc to a one-screen index and push detail into `docs/`, then link from the index.

### `--check-readme-drift`

Compares the task-runner references in `README.md` and `AGENTS.md`. The check only fires when both files reference the *same runner*: that is the case where they describe the same workflow with different commands.

Findings (warning severity):

- **Command appears only in README.md** — a runner mentioned in both files has a token in `README.md` not present in `AGENTS.md`.
- **Command appears only in AGENTS.md** — symmetric finding.

If a runner appears in only one file, no finding is emitted (the two files are simply describing different things).

Remediation: pick one canonical command path per task and use the same name in both files.

### `--check-nesting`

In monorepos, rewards per-package `AGENTS.md` files at workspace boundaries.

Monorepo detection: any of `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, root `package.json` containing a `workspaces` array, or any `project.json` file.

Package directory discovery: every directory containing `project.json` (Nx) or a non-root `package.json` (pnpm/npm/turbo).

Findings (warning severity):

- **Workspace package lacks AGENTS.md** — when fewer than half the discovered package directories carry a per-package agent doc.
- **Most workspace packages have AGENTS.md; consider adding one to `<dir>` for consistency** — softer message when ≥ half the packages already comply.

If the repo is not a monorepo, the check returns `ok` with summary "Not a monorepo; per-package AGENTS.md not required."

### `--check-repo-map`

Looks for at least one of `docs/repo-map.md`, `docs/architecture.md`, or `ARCHITECTURE.md`. If any is present, the check returns `ok`. Otherwise it emits a single warning at the repo root with remediation: "Add `docs/repo-map.md` or `ARCHITECTURE.md` describing module boundaries, allowed dependency directions, and where each subsystem lives."

This check pairs with the `agent_repo_map` scoring dimension, which also rewards the existence of any of these three files.

### `--check-adrs`

Validates Architecture Decision Records under any directory matching `(adr|adrs|decisions?)/.+\.md` (case-insensitive).

Findings:

- **ADR directory has no index** (warning) — no `README.md` or `index.md` next to the ADR files.
- **ADR is missing standard sections** (warning) — fewer than two of `Status`, `Context`, `Decision` are present as headings.
- **ADR claims supersession but the target does not exist** (error) — the body says "superseded by" with a relative link that does not resolve.

If no ADR files exist at all, the check returns `ok` with summary "No ADRs detected."

## Relationship to Scoring

The scorecard (`legibility score`) measures whether legibility infrastructure *exists and routes correctly*. The audit checks verify that the infrastructure *is still consistent with the rest of the repository*. Both are complementary:

- A repo can have a high score and still have drift (e.g., `AGENTS.md` referencing a deleted module).
- A repo can pass every audit check and still score poorly (e.g., artifacts exist but routing is confused).

Run both during maintenance. The scorecard tells you where to invest; the audit tells you what to repair.
