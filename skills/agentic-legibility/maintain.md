# Maintenance

Use this workflow when the repository already has legibility infrastructure and the goal is to keep it current, improve scores, or garden docs as the code evolves.

## When to Maintain

Legibility artifacts drift as code changes. Trigger a maintenance pass when:

- a major feature lands or a module is added, renamed, or removed
- a new subproject is added to a monorepo (see [monorepo.md](monorepo.md))
- the scoring script shows a dimension has dropped
- an agent session reveals a gap — it could not find what it needed or followed stale guidance
- decision records or ExecPlans have not been updated in a while
- a periodic maintenance cycle fires (see [Scheduled Maintenance](#scheduled-maintenance) below)

## Maintenance Workflow

1. **Run the aggregate audit.**
   Run `node <skill-dir>/scripts/legibility.js audit --check-all /path/to/repo --format markdown` and treat the findings — each with a `path`, `message`, and `remediation` — as the starting to-do list. Error-severity findings (missing artifacts, broken paths in agent docs) are blockers; warnings (broken anchors, orphan docs, unresolved task references, stale ExecPlans) are drift to clear.

2. **Re-score the repository.**
   Run `legibility score` and compare against the last known baseline. Focus on dimensions that dropped or stayed low.

3. **Work the findings.** For each category the audit surfaced:
   - **artifacts** — restore the missing file or directory, or if it was intentionally removed, document why.
   - **links** — fix the target, update the link, or delete the stale reference. For orphan docs, link from an index or remove the file.
   - **commands** — align the doc with the task surface: either add the task to the task runner or rename the reference.
   - **execplans** — complete the missing section, resume the stale plan, fill in Outcomes & Retrospective, or move the plan to `completed/`.
   - **agents_md** — update or remove the broken path / command in `AGENTS.md` or `CLAUDE.md`.

4. **Update the root agent map for new work.**
   The audit covers drift against current state, not additions. Add pointers to new modules, commands, or docs that have appeared since the last pass.

5. **Close out completed ExecPlans.**
   Move finished plans from `docs/exec-plans/active/` to `docs/exec-plans/completed/`. Verify that `Outcomes & Retrospective` is filled in. Update `docs/exec-plans/README.md`.

6. **Review and update decision records.**
   Check whether any recent decisions are missing ADRs. Mark superseded decisions and add links to their replacements.

7. **Update architecture docs.**
   If modules were added, renamed, or restructured, update the architecture map. Verify that documented dependency directions still match reality. Strengthen mechanical enforcement where gaps appeared.

8. **Tighten mechanical enforcement.**
   Review recent agent sessions or PR feedback for recurring mistakes. Apply the steering loop: update docs to prevent the mistake, then add a lint rule or structural test to catch it mechanically. See the [Mechanical Enforcement](setup.md#mechanical-enforcement) section in the setup guide.

9. **Re-run the audit and re-score.**
   Run `legibility audit --check-all` again to confirm the findings list has shrunk. Run `legibility score` and record the before/after delta in a commit message or decision record so trends are visible.

## Doc Gardening Checks

Most drift categories are covered mechanically by `legibility audit --check-all`:

- **Stale or orphaned docs** — `--check-links` finds files under `docs/` that are not reachable from any index, plus index entries pointing to files that no longer exist.
- **Broken cross-links** — `--check-links` resolves every relative Markdown link and heading anchor.
- **Docs referencing removed commands** — `--check-commands` and `--check-agents-md` surface task-runner references that no longer resolve.

What the audit does *not* cover (still requires manual inspection):

- New modules or packages with no entry in the architecture map.
- New task entrypoints not reflected in `AGENTS.md` or onboarding docs.
- Recent ADRs missing from the decisions index.
- Prose that is technically correct but semantically stale — e.g. architecture descriptions that have drifted from the code.

Run the audit first; spend manual review budget on the gaps the audit cannot see.

## ExecPlan Lifecycle

Active plans require ongoing attention:

- Update `Progress` with timestamped checkboxes at every stopping point.
- Record direction changes in the `Decision Log`, not just in commit messages.
- Document unexpected findings in `Surprises & Discoveries` with evidence.
- When a plan is complete, fill in `Outcomes & Retrospective`, move it to `docs/exec-plans/completed/`, and update indexes.

Stale active plans — those with no progress updates for an extended period — should be reviewed. Either resume the work, update the plan to reflect current reality, or archive it with a note explaining why it was paused.

## Scheduled Maintenance

Set up recurring maintenance so legibility does not degrade silently between manual passes.

### Periodic Re-Scoring and Re-Auditing

Schedule both `legibility score` and `legibility audit --check-all` to run on a regular cadence — weekly for active repositories, monthly for stable ones. Compare score output against the previous run and flag any dimension that dropped. Compare audit output against a clean baseline (stored in the repo or in CI artifacts) and flag any new findings.

This can be done through:

- A CI job that runs the scorer on a schedule and posts results to a PR or issue.
- A cron-triggered agent task that runs the scorer and opens a PR with fixes for any quick wins.
- A pre-commit or pre-push hook that runs a fast subset of checks locally.

### Doc Freshness Checks

A single scheduled `legibility audit --check-all` covers the main drift signals:

- Markdown links pointing to deleted files (`--check-links`).
- `AGENTS.md` / `CLAUDE.md` referencing paths or commands that no longer exist (`--check-agents-md`).
- Docs referencing task-runner commands not in the task surface (`--check-commands`).
- Active ExecPlans with no activity in the last 30 days (`--check-execplans`, configurable via `--stale-threshold-days`).

Wire the command into CI and surface `status: drift` as a failing check or a warning comment on PRs.

### Automated Doc Gardening

For repositories with enough docs that manual gardening does not scale, schedule an agent task that:

1. Runs `legibility score` and `legibility audit --check-all` and identifies gaps and findings.
2. Uses each finding's `remediation` field as the concrete fix to apply.
3. Opens a PR with targeted fixes — updated indexes, removed dead links, new entries for undocumented modules.
4. Includes the before/after score delta and the audit finding-count delta in the PR description.

Keep automated fixes conservative. The agent should fix mechanical issues like broken links and missing index entries. Substantive changes — rewriting architecture docs, adding new decision records — should be flagged for human review rather than auto-merged.

### The Steering Loop in Maintenance

Maintenance is not just fixing what broke. It is an opportunity to strengthen the feedback cycle:

1. **Review agent sessions.** Look at recent agent transcripts or PR feedback for patterns — what questions did agents struggle with, what docs did they miss, what mistakes recurred?
2. **Strengthen feedforward controls.** Update AGENTS.md, onboarding docs, or architecture maps to address the gaps agents encountered.
3. **Strengthen feedback controls.** Add lint rules, structural tests, or CI checks for recurring mistakes. Every repeated mistake is a missing mechanical check.
4. **Measure the effect.** Re-score after changes and compare. Track whether the same issues recur in subsequent agent sessions.

The goal is a tightening spiral: each maintenance pass makes the repo slightly harder to misuse and slightly easier to navigate, reducing the need for the next maintenance pass.
