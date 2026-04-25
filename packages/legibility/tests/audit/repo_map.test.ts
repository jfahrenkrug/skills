import { describe, it, expect, afterEach } from 'vitest';
import { checkRepoMap } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-repomap-');
   return lastRoot;
}

describe('checkRepoMap', () => {
   it('warns when no repo map exists', async () => {
      const root = await makeRepo();
      const result = await checkRepoMap(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe('warning');
   });

   it('passes when docs/repo-map.md exists', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/repo-map.md', '# Repo map\n');
      const result = await checkRepoMap(root);
      expect(result.findings.length).toBe(0);
   });

   it('passes when ARCHITECTURE.md exists', async () => {
      const root = await makeRepo();
      await writeFile(root, 'ARCHITECTURE.md', '# Architecture\n');
      const result = await checkRepoMap(root);
      expect(result.findings.length).toBe(0);
   });
});
