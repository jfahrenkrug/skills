import { describe, it, expect, afterEach } from 'vitest';
import { checkAdrs } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-adrs-');
   return lastRoot;
}

describe('checkAdrs', () => {
   it('reports ok when no ADRs exist', async () => {
      const root = await makeRepo();
      const result = await checkAdrs(root);
      expect(result.findings.length).toBe(0);
   });

   it('warns when ADR directory has no index', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/adr/0001-use-typescript.md', '# 0001\n\n## Status\n\n## Context\n\n## Decision\n');
      const result = await checkAdrs(root);
      expect(result.findings.some((f) => f.message.includes('no index'))).toBe(true);
   });

   it('warns when ADR is missing standard sections', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/adr/README.md', '# ADR index\n');
      await writeFile(root, 'docs/adr/0001-incomplete.md', '# 0001\n\nNo headings here, just a paragraph.\n');
      const result = await checkAdrs(root);
      expect(result.findings.some((f) => f.message.includes('standard sections'))).toBe(true);
   });

   it('errors on broken supersession link', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/adr/README.md', '# ADR index\n');
      await writeFile(
         root,
         'docs/adr/0001-old.md',
         '# 0001\n\n## Status\n\nSuperseded by [0002](0002-new.md)\n\n## Context\n\n## Decision\n',
      );
      const result = await checkAdrs(root);
      expect(result.findings.some((f) => f.severity === 'error' && f.message.includes('supersession'))).toBe(true);
   });

   it('passes for well-formed ADR with valid supersession link', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/adr/README.md', '# ADR index\n');
      await writeFile(
         root,
         'docs/adr/0001-old.md',
         '# 0001\n\n## Status\n\nSuperseded by [0002](0002-new.md)\n\n## Context\n\n## Decision\n',
      );
      await writeFile(
         root,
         'docs/adr/0002-new.md',
         '# 0002\n\n## Status\n\nAccepted\n\n## Context\n\n## Decision\n',
      );
      const result = await checkAdrs(root);
      const errors = result.findings.filter((f) => f.severity === 'error');
      expect(errors.length).toBe(0);
   });
});
