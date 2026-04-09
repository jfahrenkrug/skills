# Initial Setup

Use this workflow when a repository has little or no legibility infrastructure. The goal is to audit what exists and create the minimum set of artifacts that let a fresh agent work without tribal knowledge.

If the repository is a monorepo with multiple projects or packages, see [monorepo.md](monorepo.md) for guidance on root vs. subproject agent docs, cross-project architecture, and scoped scoring.

## Workflow

1. **Audit the current repo-visible guidance.**
   Inspect the root `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/`, task entrypoints, validation commands, and any existing decision records. Run the scoring script if available to establish a baseline.

2. **Establish a small stable entrypoint.**
   Keep root `AGENTS.md` under roughly 100 lines. Use it to route agents to the right files, commands, and constraints.

3. **Create progressive disclosure.**
   Organize `docs/` into short orientation files at each level. Each top-level doc should tell the reader where to go next rather than trying to contain everything.

4. **Make planning first-class.**
   Copy `PLANS.md` from this skill's directory verbatim to `.agents/PLANS.md` and use checked-in plans for complex work. Treat plans as living documents with progress, discoveries, decisions, and outcomes.

5. **Make bootstrap and validation self-serve.**
   Expose canonical commands for setup, run, test, lint, build, and check. Prefer stable repo entrypoints over ad-hoc command sequences.

6. **Make architecture legible and enforceable.**
   Document module boundaries and dependency direction, then add or point to mechanical enforcement where it exists. See the [Mechanical Enforcement](#mechanical-enforcement) section below for concrete guidance.

7. **Record decisions in version control.**
   Create a consistent place for ADRs or equivalent records with enough structure that an agent can follow why the system looks the way it does.

8. **Add an audit loop.**
   Run `scripts/score_repo.js` so legibility can be measured from repo-visible evidence before and after improvements.

## Required Artifacts

### Root Agent Map

Create or tighten:

- `AGENTS.md`
- `CLAUDE.md` pointing to `AGENTS.md` via the `@AGENTS.md` include convention when the repo targets Claude Code

`AGENTS.md` should cover only the essentials:

- repo purpose in 1-2 sentences
- where architecture docs live
- where onboarding/bootstrap docs live
- where ExecPlans live
- canonical validation commands
- available repo-local skills or agent helpers
- hard constraints worth surfacing at the root

Do not turn `AGENTS.md` into an encyclopedia.

### ExecPlans

When vendoring this skill into a repository, copy `PLANS.md` from this skill's directory to `.agents/PLANS.md` as-is. Store active plans under a discoverable path such as `docs/exec-plans/active/`.

Every ExecPlan should be self-contained and include:

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

Treat the plan as a living document. Update progress with timestamps. Record changes in direction and unexpected findings while the work is happening.

For usage notes and section expectations, see [references/execplans.md](references/execplans.md).

### Migrating Existing ExecPlans

If the repository already has ExecPlans in non-standard locations, migrate them into the `docs/exec-plans/` structure:

1. **Find existing plans.** Look for ExecPlan-style documents in common locations:
   - `.agent/` or `.agents/` (with or without trailing `s`)
   - Scattered under `docs/` without a dedicated subdirectory
   - Inside project management or design directories

2. **Classify each plan as active or completed.** A plan is active if its `Progress` section has unchecked items or it lacks an `Outcomes & Retrospective` entry. Everything else is completed.

3. **Create the target structure first.**
   - Create `docs/exec-plans/active/`
   - Create `docs/exec-plans/completed/`
   - Create `docs/exec-plans/README.md` indexing all plans with a one-line description of each.

4. **Move plans into the target structure.**
   - Active plans go to `docs/exec-plans/active/`
   - Completed plans go to `docs/exec-plans/completed/`
   - Preserve useful filenames, but normalize vague names like `plan.md` into something specific such as `auth-session-hardening.md`.
   - If an old location contains a whole directory of plans, move each plan into `active/` or `completed/` individually rather than keeping the old directory shape under `docs/exec-plans/`.

5. **Update internal references.** Search the repo for links pointing to the old plan locations and update them to the new paths. Check `AGENTS.md`, `README.md`, other docs, and code comments.

6. **Clean up empty source directories.** After moving all plans out of their original locations, remove any directories that are now empty:
   - Delete empty legacy plan folders such as `plans/`, `exec-plans/`, `.agent/plans/`, or ad-hoc docs subfolders that only existed to hold the old plans.
   - If a parent directory still has non-plan content, keep it and remove only the empty migrated subfolders.

### Migrating `.agent` to `.agents`

Some repositories use `.agent` (singular) instead of the more common `.agents` (plural). Standardize on `.agents`:

1. **Create `.agents/` if it does not exist.**

2. **Move all contents from `.agent/` to `.agents/`.** Preserve the directory structure inside. If `.agents/` already has files, merge carefully — do not overwrite newer files with older ones.

3. **Copy `PLANS.md` from this skill's directory to `.agents/PLANS.md`** if it does not already exist there.

4. **Update all references.** Search the repo for `.agent/` (with and without leading dot, with and without trailing slash) and update to `.agents/`. Common locations:
   - `AGENTS.md` and `CLAUDE.md`
   - `docs/` indexes
   - CI/CD configuration files
   - `.gitignore` entries
   - Script paths

5. **Move plan documents into `docs/exec-plans/` as part of the rename.**
   - If `.agent/` contains ExecPlans, do not leave them under `.agents/`.
   - Classify them as active or completed and move them into `docs/exec-plans/active/` or `docs/exec-plans/completed/`.
   - Keep `.agents/` for agent-facing infrastructure such as `PLANS.md`, local skills, prompts, and helper metadata.

6. **Remove the empty `.agent/` directory and any empty child directories** once everything has been moved and all references updated.

7. **Verify.** Confirm both naming and plan-location migration are complete:
   - Search for stale `.agent/` references and update or remove them.
   - Search for plan documents outside `docs/exec-plans/active/` and `docs/exec-plans/completed/` and either migrate them or document why they are intentionally different.
   - Exclude `.git/` from these searches.

### Progressive Docs Tree

Prefer a docs layout with short index files and stable routing, for example:

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/onboarding/README.md`
- `docs/exec-plans/README.md`
- `docs/decisions/README.md`

Each index should answer:

- what lives here
- when to read it
- what file to open next for a given question

Keep top-level indexes short. Push depth into leaf docs only when needed.

When the repository is large enough to justify it, add deeper docs for:

- product or design intent
- reliability or security constraints
- generated reference material such as schemas
- technical-debt tracking
- quality or maturity assessments by domain or layer

Keep these indexed from `docs/` rather than surfacing them all at the root.

### Architecture Map

Document:

- major domains or packages
- entrypoints
- ownership or responsibility boundaries when known
- allowed dependency direction
- cross-cutting interfaces such as providers, adapters, or shared services

If the repo already enforces boundaries with linters or structural tests, point to them directly. If not, state the intended rules clearly enough that enforcement can be added later.

Prefer documenting boundaries in a way that can be checked mechanically. Good examples include import-direction rules, layer constraints, schema-at-the-boundary rules, file-size limits, and naming conventions.

### Bootstrap and Task Entrypoints

Expose canonical repo-visible commands for:

- setup/bootstrap
- dev/run
- test/check
- lint/format
- build

Prefer task runners or package scripts over prose-only instructions. If the setup requires external services or environment variables, document the minimum viable path in `docs/onboarding/README.md`.

### Validation Harness

Make ordinary validation obvious and cheap:

- unit/integration/e2e entrypoints when they exist
- smoke-test or sanity-check commands
- fixture or seed-data setup where required
- expected outputs or acceptance signals for important workflows

Phrase validation as observable behavior, not only as "run tests."

### Decision Records

Add a dedicated location such as `docs/decisions/` for ADRs or equivalent records.

Each decision record should include at least:

- context
- decision
- consequences
- status

Add supersession links when a decision is replaced.

### Diagnostics and Observability

When the repository has a running system, document how an agent can inspect it:

- logs
- metrics
- traces
- screenshots or browser automation paths
- reproducible failure demonstrations

If the repo has no local observability path, record that gap explicitly and add a milestone rather than inventing unsupported capabilities.

If the product has a UI, prefer documenting how an agent can drive and inspect it through repo-local browser tooling or skills. If the product has operational signals, document how an agent can query or inspect them locally.

## Mechanical Enforcement

Documentation tells agents what to do. Mechanical enforcement makes it hard to do the wrong thing. When an agent keeps making the same mistake, the fix is a lint rule or structural test, not more prose.

### The Steering Loop

Improving legibility is a continuous feedback cycle with two sides:

- **Feedforward controls** — guides, docs, AGENTS.md, and ExecPlans that tell agents what to do before they start.
- **Feedback controls** — linters, structural tests, and CI checks that catch mistakes after they happen.

When the same issue appears more than once, strengthen both sides: update the docs so agents avoid the mistake, and add a mechanical check so the mistake is caught automatically if it recurs.

### Custom Lint Rules

Custom lint rules are one of the highest-leverage legibility improvements. They encode team conventions as static checks that agents can self-correct against during execution.

Concrete workflow for adding a custom rule:

1. Identify a recurring pattern the team wants to prevent — duplicate helpers in the wrong location, imports crossing a layer boundary, direct database access outside the repository layer, etc.
2. Write a lint rule that flags the violation. The coding agent itself can write the rule and its tests.
3. Make the error message a remediation instruction. Instead of "disallowed import", write "imports from `ui/` into `repo/` are not allowed — move shared types to `types/` instead." Agents use these messages to self-correct.
4. Add the rule with tests and enable it in CI.

Good candidates for custom rules:

- **Import direction** — enforce that dependencies flow in one direction (e.g., `types -> config -> repo -> service -> runtime -> ui`).
- **File placement** — prevent helpers or utilities from being created outside approved locations.
- **Naming conventions** — enforce prefixes, suffixes, or patterns for specific module types.
- **Schema-at-the-boundary** — require that data crossing module boundaries passes through a validation layer.
- **No direct infrastructure access** — force database, cache, or API calls through designated wrapper modules.

Tools by ecosystem:

- JavaScript/TypeScript: ESLint custom rules, `eslint-plugin-import` for import restrictions
- Python: Ruff custom rules, `import-linter` for layer enforcement
- Go: `go vet` analyzers, `depguard`
- Rust: `clippy` lints, custom `cargo` checks
- General: Semgrep rules work across languages for pattern-based checks

### Structural Tests

When lint rules are not enough, write tests that verify architectural invariants:

- A test that scans the module graph and asserts no disallowed dependency edges exist.
- A test that checks every public API endpoint has a corresponding integration test file.
- A test that verifies no file in `docs/` is orphaned from the index.

These tests run alongside the normal test suite and fail the build when architectural rules are violated.

### Remediation-Oriented Error Messages

Every mechanical check — lint rule, structural test, or CI gate — should tell the agent how to fix the problem, not just that a problem exists. Compare:

- Bad: `Error: layer violation detected`
- Good: `Error: service/auth.ts imports from ui/components — move shared types to types/auth.ts and import from there instead`

The error message is documentation that appears exactly when the agent needs it.

## Milestone Pattern

When asked to improve a repo, convert gaps into concrete milestones with acceptance criteria. Good milestones are mechanical and verifiable, for example:

- add a concise root `AGENTS.md` that routes to onboarding, architecture, and plans
- copy `PLANS.md` from this skill's directory to `.agents/PLANS.md` and create a first active ExecPlan
- add `docs/README.md` plus short indexes for architecture, onboarding, exec-plans, and decisions
- document canonical `setup`, `test`, `lint`, and `build` commands
- add a first custom lint rule or structural test enforcing a stated architectural boundary
- add ADR templates or initial decision records
- vendor a scoring or auditing skill under `.agents/skills/`

Each milestone should say what files will exist, what behavior becomes possible, and how to verify completion.
