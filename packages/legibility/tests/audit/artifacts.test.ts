import { describe, it, expect, afterEach } from 'vitest';
import { checkArtifacts } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile, mkdir } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-artifacts-');
   return lastRoot;
}

describe('checkArtifacts CLAUDE.md relaxation', () => {
   it('suppresses CLAUDE.md warning when AGENTS.md is present', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n');
      await writeFile(root, '.agents/PLANS.md', '# plans\n');
      await mkdir(root, 'docs/exec-plans/active');
      await mkdir(root, 'docs/exec-plans/completed');

      const result = await checkArtifacts(root);
      const claudeFinding = result.findings.find((f) => f.path === 'CLAUDE.md');
      expect(claudeFinding).toBeUndefined();
      expect(result.status).toBe('ok');
   });

   it('flags AGENTS.md (error) but not CLAUDE.md when both are absent (CLAUDE.md is suppressed only when AGENTS.md exists)', async () => {
      const root = await makeRepo();
      await writeFile(root, '.agents/PLANS.md', '# plans\n');
      await mkdir(root, 'docs/exec-plans/active');
      await mkdir(root, 'docs/exec-plans/completed');

      const result = await checkArtifacts(root);
      const agents = result.findings.find((f) => f.path === 'AGENTS.md');
      const claude = result.findings.find((f) => f.path === 'CLAUDE.md');
      expect(agents?.severity).toBe('error');
      expect(claude?.severity).toBe('warning');
   });

   it('emits no AGENTS.md/CLAUDE.md findings when both are present', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n');
      await writeFile(root, 'CLAUDE.md', '@AGENTS.md\n');
      await writeFile(root, '.agents/PLANS.md', '# plans\n');
      await mkdir(root, 'docs/exec-plans/active');
      await mkdir(root, 'docs/exec-plans/completed');

      const result = await checkArtifacts(root);
      expect(result.findings.find((f) => f.path === 'AGENTS.md')).toBeUndefined();
      expect(result.findings.find((f) => f.path === 'CLAUDE.md')).toBeUndefined();
   });
});
