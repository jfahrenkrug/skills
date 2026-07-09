import { describe, it, expect, afterEach } from 'vitest';
import { checkReadmeDrift } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-readme-drift-');
   return lastRoot;
}

describe('checkReadmeDrift', () => {
   it('reports ok when README.md is missing', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nRun `npm run build`.\n');
      const result = await checkReadmeDrift(root);
      expect(result.findings.length).toBe(0);
   });

   it('flags drift when README and AGENTS describe different npm tasks', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `npm run build` to build.\n');
      await writeFile(root, 'AGENTS.md', '# Agents\n\nRun `npm run dist` to build.\n');
      const result = await checkReadmeDrift(root);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      expect(result.findings.some((f) => f.path === 'README.md')).toBe(true);
      expect(result.findings.some((f) => f.path === 'AGENTS.md')).toBe(true);
   });

   it('does not flag when same npm tasks appear in both', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `npm run build` and `npm run test`.\n');
      await writeFile(root, 'AGENTS.md', '# Agents\n\nUse `npm run build` and `npm run test`.\n');
      const result = await checkReadmeDrift(root);
      expect(result.findings.length).toBe(0);
   });

   it('does not flag when only one file mentions a runner', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `npm run build`.\n');
      await writeFile(root, 'AGENTS.md', '# Agents\n\nNo task references at all.\n');
      const result = await checkReadmeDrift(root);
      expect(result.findings.length).toBe(0);
   });
});
