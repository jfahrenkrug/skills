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
});
