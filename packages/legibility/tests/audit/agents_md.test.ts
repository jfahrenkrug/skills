import { afterEach, describe, expect, it } from 'vitest';
import { checkAgentsMd } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-agents-md-');
   return lastRoot;
}

describe('checkAgentsMd', () => {
   it('does not flag `origin/main` as a broken path — it is a git ref, not a file', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nBranch off `origin/main` before starting work.\n');
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toEqual([]);
   });

   it('does not flag `HEAD` or `HEAD~1` as broken paths', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nCompare against `HEAD` and `HEAD~1` before rebasing.\n');
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toEqual([]);
   });

   it('does not flag fully-qualified `refs/…` names as broken paths', async () => {
      const root = await makeRepo();
      await writeFile(
         root,
         'AGENTS.md',
         '# Agents\n\nPush to `refs/heads/main` and tag `refs/tags/v1`.\n',
      );
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toEqual([]);
   });

   it('does not flag refs outside the common namespaces', async () => {
      const root = await makeRepo();
      await writeFile(
         root,
         'AGENTS.md',
         '# Agents\n\nFetch `refs/pull/42/head` and inspect `refs/stash`.\n',
      );
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toEqual([]);
   });

   it('still flags a missing path whose first segment merely looks ref-ish', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nSee `references/missing.md` for details.\n');
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toHaveLength(1);
   });

   it('still flags a genuinely missing repo path mentioned in backticks', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nSee `docs/missing.md` for details.\n');
      const result = await checkAgentsMd(root);
      const brokenPaths = result.findings.filter((f) => f.message.includes('does not exist'));
      expect(brokenPaths).toHaveLength(1);
      expect(brokenPaths[0].message).toContain('docs/missing.md');
   });

   it('still flags broken markdown links', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nSee [gone](docs/missing.md).\n');
      const result = await checkAgentsMd(root);
      const broken = result.findings.filter((f) => f.message.startsWith('Agent doc links'));
      expect(broken).toHaveLength(1);
   });
});
