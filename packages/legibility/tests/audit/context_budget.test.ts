import { describe, it, expect, afterEach } from 'vitest';
import { checkContextBudget } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-budget-');
   return lastRoot;
}

describe('checkContextBudget', () => {
   it('reports ok for a small AGENTS.md', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nA short index.\n');
      const result = await checkContextBudget(root);
      expect(result.findings.length).toBe(0);
      expect(result.status).toBe('ok');
   });

   it('warns when AGENTS.md exceeds 4000 tokens', async () => {
      const root = await makeRepo();
      const big = 'a '.repeat(9000);
      await writeFile(root, 'AGENTS.md', big);
      const result = await checkContextBudget(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe('warning');
   });

   it('errors when AGENTS.md exceeds 8000 tokens', async () => {
      const root = await makeRepo();
      const huge = 'a '.repeat(20000);
      await writeFile(root, 'AGENTS.md', huge);
      const result = await checkContextBudget(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe('error');
   });

   it('returns ok when no agent docs exist', async () => {
      const root = await makeRepo();
      const result = await checkContextBudget(root);
      expect(result.findings.length).toBe(0);
   });

   it('errors on docs larger than the readText cap instead of skipping them', async () => {
      const root = await makeRepo();
      // 300KB exceeds MAX_TEXT_SIZE (250KB), so readText returns '' — the
      // check must fall back to the on-disk size, not report ok.
      await writeFile(root, 'AGENTS.md', 'a '.repeat(150_000));
      const result = await checkContextBudget(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe('error');
   });
});
