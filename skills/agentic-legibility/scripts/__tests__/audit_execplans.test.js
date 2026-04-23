import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REQUIRED_SECTIONS, parseExecPlan } from '../lib/execplans.js';
import { lastActivityTimestamp, isGitRepo } from '../lib/git.js';
import { checkExecplans } from '../audit_repo.js';
import {
   cleanup,
   makeFixtureRoot,
   runNode,
   writeFile,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.resolve(__dirname, '..', 'audit_repo.js');

function fullyLegiblePlanText() {
   return [
      '# Sample Plan',
      '',
      ...REQUIRED_SECTIONS.flatMap((section) => [ `## ${section}`, '', 'Body text.', '' ]),
   ].join('\n');
}

describe('lib/execplans: parseExecPlan', () => {
   it('detects every required section when present', () => {
      const parsed = parseExecPlan(fullyLegiblePlanText());
      assert.equal(parsed.missingSections.length, 0);
      for (const section of REQUIRED_SECTIONS) {
         assert.ok(parsed.presentSections.has(section), `missing ${section}`);
      }
   });

   it('lists missing sections in PLANS.md casing', () => {
      const md = [
         '# Incomplete',
         '',
         '## Progress',
         '',
         '## Decision Log',
      ].join('\n');
      const parsed = parseExecPlan(md);
      assert.ok(parsed.missingSections.includes('Outcomes & Retrospective'));
      assert.ok(parsed.missingSections.includes('Purpose / Big Picture'));
      assert.ok(!parsed.missingSections.includes('Progress'));
   });

   it('counts total / done / remaining progress checkboxes', () => {
      const md = [
         '# Plan',
         '',
         '## Progress',
         '',
         '   * [x] Done one.',
         '   * [x] Done two.',
         '   * [ ] Still pending.',
         '   - [ ] Another pending.',
      ].join('\n');
      const parsed = parseExecPlan(md);
      assert.deepEqual(parsed.progress, { total: 4, done: 2, remaining: 2 });
   });

   it('normalizes heading whitespace and case when matching sections', () => {
      const md = [
         '# Plan',
         '',
         '##  purpose / big picture ',
         '',
         '## PROGRESS',
      ].join('\n');
      const parsed = parseExecPlan(md);
      assert.ok(parsed.presentSections.has('Purpose / Big Picture'));
      assert.ok(parsed.presentSections.has('Progress'));
   });
});

describe('lib/git: lastActivityTimestamp', () => {
   it('falls back to filesystem mtime when the root is not a git repo', async () => {
      const root = await makeFixtureRoot('al-git-fallback-');
      try {
         await writeFile(root, 'plan.md', 'hello');
         assert.equal(await isGitRepo(root), false);
         const ts = await lastActivityTimestamp(root, 'plan.md');
         assert.equal(typeof ts, 'number');
         assert.ok(ts > 0);
      } finally {
         await cleanup(root);
      }
   });

   it('returns null for files that do not exist', async () => {
      const root = await makeFixtureRoot('al-git-missing-');
      try {
         const ts = await lastActivityTimestamp(root, 'does-not-exist.md');
         assert.equal(ts, null);
      } finally {
         await cleanup(root);
      }
   });
});

describe('audit_repo: --check-execplans', () => {
   describe('checkExecplans (unit)', () => {
      it('reports ok when a plan has every required section and is fresh', async () => {
         const root = await makeFixtureRoot('al-ep-ok-');
         try {
            await writeFile(root, 'docs/exec-plans/active/good.md', fullyLegiblePlanText());
            const result = await checkExecplans(root);
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('reports ok when no plans exist', async () => {
         const root = await makeFixtureRoot('al-ep-empty-');
         try {
            const result = await checkExecplans(root);
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('flags missing required sections on an active plan', async () => {
         const root = await makeFixtureRoot('al-ep-missing-');
         try {
            await writeFile(root, 'docs/exec-plans/active/bare.md', [
               '# Bare',
               '',
               '## Progress',
               '',
               '   * [ ] todo.',
            ].join('\n'));
            const result = await checkExecplans(root);
            const missingOutcomes = result.findings.find((f) => /Outcomes & Retrospective/u.test(f.message));
            assert.ok(missingOutcomes, 'expected a missing-section finding for Outcomes & Retrospective');
            assert.equal(missingOutcomes.severity, 'warning');
         } finally {
            await cleanup(root);
         }
      });

      it('flags stale active plans using filesystem mtime', async () => {
         const root = await makeFixtureRoot('al-ep-stale-');
         try {
            const relpath = 'docs/exec-plans/active/stale.md';
            await writeFile(root, relpath, fullyLegiblePlanText());
            const abs = path.join(root, relpath);
            const oldTime = new Date(Date.now() - 60 * 86400 * 1000);
            await fs.utimes(abs, oldTime, oldTime);
            const result = await checkExecplans(root, { staleThresholdDays: 30 });
            const stale = result.findings.find((f) => /no activity/u.test(f.message));
            assert.ok(stale, 'expected staleness finding');
            assert.equal(stale.severity, 'warning');
         } finally {
            await cleanup(root);
         }
      });

      it('does not flag fresh active plans', async () => {
         const root = await makeFixtureRoot('al-ep-fresh-');
         try {
            await writeFile(root, 'docs/exec-plans/active/fresh.md', fullyLegiblePlanText());
            const result = await checkExecplans(root, { staleThresholdDays: 30 });
            const stale = result.findings.find((f) => /no activity/u.test(f.message));
            assert.equal(stale, undefined);
         } finally {
            await cleanup(root);
         }
      });

      it('flags completed plans that still have unchecked progress', async () => {
         const root = await makeFixtureRoot('al-ep-completed-unchecked-');
         try {
            const body = [
               '# Done? Plan',
               '',
               ...REQUIRED_SECTIONS.flatMap((s) => [ `## ${s}`, '', 'body', '' ]),
               '## Extra section',
               '',
               '   * [x] finished.',
               '   * [ ] still open.',
            ].join('\n');
            await writeFile(root, 'docs/exec-plans/completed/half.md', body);
            const result = await checkExecplans(root);
            const unchecked = result.findings.find((f) => /unchecked/u.test(f.message));
            assert.ok(unchecked);
            assert.equal(unchecked.severity, 'warning');
         } finally {
            await cleanup(root);
         }
      });

      it('flags active plans whose progress is 100% but Outcomes section is empty', async () => {
         const root = await makeFixtureRoot('al-ep-done-no-outcome-');
         try {
            const sections = REQUIRED_SECTIONS.map((s) => {
               if (s === 'Outcomes & Retrospective') {
                  return `## ${s}\n`;
               }
               if (s === 'Progress') {
                  return `## ${s}\n\n   * [x] all done.\n`;
               }
               return `## ${s}\n\nbody\n`;
            });
            const body = [ '# Plan', '', ...sections ].join('\n');
            await writeFile(root, 'docs/exec-plans/active/done.md', body);
            const result = await checkExecplans(root);
            const noOutcomes = result.findings.find((f) => /Outcomes & Retrospective body/u.test(f.message));
            assert.ok(noOutcomes);
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('CLI integration', () => {
      it('returns ok and summary when every plan is healthy', async () => {
         const root = await makeFixtureRoot('al-ep-cli-ok-');
         try {
            await writeFile(root, 'docs/exec-plans/active/good.md', fullyLegiblePlanText());
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-execplans', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.check, 'execplans');
            assert.equal(parsed.status, 'ok');
            assert.match(parsed.summary, /1 active/u);
         } finally {
            await cleanup(root);
         }
      });

      it('surfaces missing-section findings on the CLI', async () => {
         const root = await makeFixtureRoot('al-ep-cli-missing-');
         try {
            await writeFile(root, 'docs/exec-plans/active/bare.md', '# Bare\n\n## Progress\n');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-execplans', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.ok(parsed.findings.length > 0);
            assert.ok(parsed.findings.every((f) => f.severity === 'warning'));
         } finally {
            await cleanup(root);
         }
      });
   });
});
