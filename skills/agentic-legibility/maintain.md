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

1. **Re-score the repository.**
   Run the scoring script and compare against the last known baseline. Focus on dimensions that dropped or stayed low.

2. **Update the root agent map.**
   Check that `AGENTS.md` still routes correctly. Remove references to deleted files or commands. Add pointers to new modules, commands, or docs that have appeared since the last pass.

3. **Refresh the docs tree.**
   Walk `docs/` and verify that indexes link to files that still exist and that new docs are indexed. Check cross-links between docs for broken references.

4. **Close out completed ExecPlans.**
   Move finished plans from `docs/exec-plans/active/` to `docs/exec-plans/completed/`. Verify that `Outcomes & Retrospective` is filled in. Update `docs/exec-plans/README.md`.

5. **Review and update decision records.**
   Check whether any recent decisions are missing ADRs. Mark superseded decisions and add links to their replacements.

6. **Update architecture docs.**
   If modules were added, renamed, or restructured, update the architecture map. Verify that documented dependency directions still match reality. Strengthen mechanical enforcement where gaps appeared.

7. **Tighten mechanical enforcement.**
   Review recent agent sessions or PR feedback for recurring mistakes. Apply the steering loop: update docs to prevent the mistake, then add a lint rule or structural test to catch it mechanically. See the [Mechanical Enforcement](setup.md#mechanical-enforcement) section in the setup guide.

8. **Re-score and record the delta.**
   Run the scoring script again to confirm improvements. Record the before/after scores in a commit message or decision record so trends are visible.

## Doc Gardening Checks

Run these checks to find docs that have drifted from the code:

### Stale or Orphaned Docs

- Files in `docs/` not linked from any index.
- Index entries that point to files that no longer exist.
- Docs referencing commands, functions, or file paths that have been renamed or removed.

### Missing Coverage

- New modules or packages with no entry in the architecture map.
- New task entrypoints not reflected in `AGENTS.md` or onboarding docs.
- Recent ADRs missing from the decisions index.

### Cross-Link Integrity

- Relative Markdown links that resolve to missing files.
- Links to anchors or headings that no longer exist in the target file.

Prefer automating these checks with a repo-local script or lint rule. A simple script that extracts Markdown links and verifies targets exist can catch most drift before it accumulates.

## ExecPlan Lifecycle

Active plans require ongoing attention:

- Update `Progress` with timestamped checkboxes at every stopping point.
- Record direction changes in the `Decision Log`, not just in commit messages.
- Document unexpected findings in `Surprises & Discoveries` with evidence.
- When a plan is complete, fill in `Outcomes & Retrospective`, move it to `docs/exec-plans/completed/`, and update indexes.

Stale active plans — those with no progress updates for an extended period — should be reviewed. Either resume the work, update the plan to reflect current reality, or archive it with a note explaining why it was paused.

## Scheduled Maintenance

Set up recurring maintenance so legibility does not degrade silently between manual passes.

### Periodic Re-Scoring

Schedule the scoring script to run on a regular cadence — weekly for active repositories, monthly for stable ones. Compare the output against the previous run and flag any dimension that dropped.

This can be done through:

- A CI job that runs the scorer on a schedule and posts results to a PR or issue.
- A cron-triggered agent task that runs the scorer and opens a PR with fixes for any quick wins.
- A pre-commit or pre-push hook that runs a fast subset of checks locally.

### Doc Freshness Checks

Add a scheduled job that checks for common drift signals:

- Markdown links pointing to deleted files.
- Index files that have not been updated since new docs were added.
- `AGENTS.md` referencing commands that no longer exist in the task runner.
- Active ExecPlans with no progress updates in the last 30 days.

### Automated Doc Gardening

For repositories with enough docs that manual gardening does not scale, schedule an agent task that:

1. Runs the scoring script and identifies gaps.
2. Scans for broken links, orphaned docs, and stale indexes.
3. Opens a PR with targeted fixes — updated indexes, removed dead links, new entries for undocumented modules.
4. Includes the before/after score delta in the PR description.

Keep automated fixes conservative. The agent should fix mechanical issues like broken links and missing index entries. Substantive changes — rewriting architecture docs, adding new decision records — should be flagged for human review rather than auto-merged.

### The Steering Loop in Maintenance

Maintenance is not just fixing what broke. It is an opportunity to strengthen the feedback cycle:

1. **Review agent sessions.** Look at recent agent transcripts or PR feedback for patterns — what questions did agents struggle with, what docs did they miss, what mistakes recurred?
2. **Strengthen feedforward controls.** Update AGENTS.md, onboarding docs, or architecture maps to address the gaps agents encountered.
3. **Strengthen feedback controls.** Add lint rules, structural tests, or CI checks for recurring mistakes. Every repeated mistake is a missing mechanical check.
4. **Measure the effect.** Re-score after changes and compare. Track whether the same issues recur in subsequent agent sessions.

The goal is a tightening spiral: each maintenance pass makes the repo slightly harder to misuse and slightly easier to navigate, reducing the need for the next maintenance pass.
