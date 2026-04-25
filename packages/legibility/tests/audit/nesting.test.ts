import { describe, it, expect, afterEach } from 'vitest';
import { checkNesting } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-nesting-');
   return lastRoot;
}

describe('checkNesting', () => {
   it('reports ok when not a monorepo', async () => {
      const root = await makeRepo();
      await writeFile(root, 'package.json', JSON.stringify({ name: 'single' }));
      const result = await checkNesting(root);
      expect(result.findings.length).toBe(0);
      expect(result.summary).toMatch(/not a monorepo/i);
   });

   it('flags missing per-package AGENTS.md in pnpm workspace', async () => {
      const root = await makeRepo();
      await writeFile(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
      await writeFile(root, 'package.json', JSON.stringify({ name: 'root' }));
      await writeFile(root, 'packages/foo/package.json', JSON.stringify({ name: 'foo' }));
      await writeFile(root, 'packages/bar/package.json', JSON.stringify({ name: 'bar' }));
      const result = await checkNesting(root);
      expect(result.findings.length).toBe(2);
   });

   it('does not flag when each package has AGENTS.md', async () => {
      const root = await makeRepo();
      await writeFile(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
      await writeFile(root, 'package.json', JSON.stringify({ name: 'root' }));
      await writeFile(root, 'packages/foo/package.json', JSON.stringify({ name: 'foo' }));
      await writeFile(root, 'packages/foo/AGENTS.md', '# foo agents\n');
      await writeFile(root, 'packages/bar/package.json', JSON.stringify({ name: 'bar' }));
      await writeFile(root, 'packages/bar/CLAUDE.md', '@AGENTS.md\n');
      const result = await checkNesting(root);
      expect(result.findings.length).toBe(0);
   });

   it('detects Nx monorepo via project.json files', async () => {
      const root = await makeRepo();
      await writeFile(root, 'nx.json', '{}');
      await writeFile(root, 'apps/app1/project.json', '{}');
      await writeFile(root, 'apps/app2/project.json', '{}');
      const result = await checkNesting(root);
      expect(result.findings.length).toBe(2);
   });

   it('softens message when most packages have AGENTS.md', async () => {
      const root = await makeRepo();
      await writeFile(root, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
      await writeFile(root, 'package.json', JSON.stringify({ name: 'root' }));
      await writeFile(root, 'packages/a/package.json', '{}');
      await writeFile(root, 'packages/a/AGENTS.md', '# a\n');
      await writeFile(root, 'packages/b/package.json', '{}');
      await writeFile(root, 'packages/b/AGENTS.md', '# b\n');
      await writeFile(root, 'packages/c/package.json', '{}');
      const result = await checkNesting(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].message).toMatch(/Most workspace packages/);
   });
});
