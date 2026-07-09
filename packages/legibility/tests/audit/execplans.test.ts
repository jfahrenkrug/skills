import { describe, it, expect, afterEach } from 'vitest';
import { checkExecplans } from '../../src/audit_repo.js';
import { parseExecPlan } from '../../src/lib/execplans.js';
import { cleanup, makeFixtureRoot, writeFile, mkdir } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-execplans-');
   return lastRoot;
}

describe('parseExecPlan sectionBodies', () => {
   it('extracts the body of each ## heading', () => {
      const text = '# Title\n\n## Validation and Acceptance\n\nRun the tests.\n\n## Idempotence and Recovery\n\nSafe to retry.\n';
      const parsed = parseExecPlan(text);
      expect(parsed.sectionBodies['Validation and Acceptance']).toContain('Run the tests.');
      expect(parsed.sectionBodies['Idempotence and Recovery']).toContain('Safe to retry.');
   });

   it('returns empty body when section heading has no content', () => {
      const text = '# T\n\n## Validation and Acceptance\n\n## Decision Log\n';
      const parsed = parseExecPlan(text);
      expect(parsed.sectionBodies['Validation and Acceptance']).toBe('');
   });

   it('ignores checkboxes and ## lines inside fenced code blocks', () => {
      const text = [
         '# T',
         '',
         '## Progress',
         '',
         '* [x] real item',
         '',
         '## Validation and Acceptance',
         '',
         'Run the tests. The plan skeleton looks like:',
         '',
         '```md',
         '* [ ] quoted incomplete step',
         '## Validation and Acceptance',
         '```',
         '',
         '## Decision Log',
         '',
      ].join('\n');
      const parsed = parseExecPlan(text);
      expect(parsed.progress).toEqual({ total: 1, done: 1, remaining: 0 });
      expect(parsed.sectionBodies['Validation and Acceptance']).toContain('Run the tests.');
   });

   it('keys section bodies by the canonical name for case-variant headings', () => {
      const text = '# T\n\n## outcomes & retrospective\n\nShipped it.\n';
      const parsed = parseExecPlan(text);
      expect(parsed.sectionBodies['Outcomes & Retrospective']).toContain('Shipped it.');
   });
});

describe('checkExecplans validation body', () => {
   it('warns when Validation and Acceptance section is empty', async () => {
      const root = await makeRepo();
      await mkdir(root, 'docs/exec-plans/completed');
      await writeFile(root, 'docs/exec-plans/active/a.md', [
         '# A',
         '',
         '## Purpose / Big Picture',
         '',
         'Why.',
         '',
         '## Progress',
         '',
         '   * [ ] do thing',
         '',
         '## Surprises & Discoveries',
         '',
         '## Decision Log',
         '',
         '## Outcomes & Retrospective',
         '',
         '## Context and Orientation',
         '',
         '## Plan of Work',
         '',
         '## Concrete Steps',
         '',
         '## Validation and Acceptance',
         '',
         '## Idempotence and Recovery',
         '',
         '## Artifacts and Notes',
         '',
         '## Interfaces and Dependencies',
         '',
      ].join('\n'));
      const result = await checkExecplans(root);
      expect(result.findings.some((f) => f.message.includes('Validation and Acceptance') && f.message.includes('empty'))).toBe(true);
   });

   it('does not count fenced skeleton checkboxes against a completed plan', async () => {
      const root = await makeRepo();
      await mkdir(root, 'docs/exec-plans/active');
      await writeFile(root, 'docs/exec-plans/completed/done.md', [
         '# Done',
         '',
         '## Progress',
         '',
         '* [x] shipped everything',
         '',
         'The template we followed:',
         '',
         '```md',
         '* [ ] example incomplete step',
         '```',
         '',
      ].join('\n'));
      const result = await checkExecplans(root);
      expect(result.findings.some((f) => f.message.includes('unchecked progress'))).toBe(false);
   });

   it('accepts a custom staleness threshold via options', async () => {
      const root = await makeRepo();
      await mkdir(root, 'docs/exec-plans/completed');
      await writeFile(root, 'docs/exec-plans/active/a.md', '# A\n\n## Progress\n\n* [x] done\n');
      // Not a git repo and freshly written, so nothing is stale regardless.
      const result = await checkExecplans(root, { staleThresholdDays: 1 });
      expect(result.findings.some((f) => f.message.includes('no activity'))).toBe(false);
   });
});
