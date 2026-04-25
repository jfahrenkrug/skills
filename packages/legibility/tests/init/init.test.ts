import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runInit } from '../../src/init/index.js';
import { checkArtifacts } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRoot(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-init-');
   return lastRoot;
}

describe('runInit', () => {
   it('creates the full required-artifact tree in an empty directory', async () => {
      const root = await makeRoot();
      const result = await runInit(root);

      expect(result.created.sort()).toEqual([
         '.agents/PLANS.md',
         'AGENTS.md',
         'CLAUDE.md',
         'docs/README.md',
         'docs/exec-plans/active/.gitkeep',
         'docs/exec-plans/completed/.gitkeep',
      ].sort());
      expect(result.skipped).toEqual([]);

      for (const rel of result.created) {
         await expect(fs.access(path.join(root, rel))).resolves.toBeUndefined();
      }
   });

   it('produces artifacts that pass --check-artifacts', async () => {
      const root = await makeRoot();
      await runInit(root);
      const audit = await checkArtifacts(root);
      expect(audit.status).toBe('ok');
      expect(audit.findings).toEqual([]);
   });

   it('skips existing files without --force', async () => {
      const root = await makeRoot();
      await writeFile(root, 'AGENTS.md', '# pre-existing\n');
      const result = await runInit(root);
      expect(result.skipped).toContain('AGENTS.md');
      expect(result.created).not.toContain('AGENTS.md');
      const after = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
      expect(after).toBe('# pre-existing\n');
   });

   it('overwrites existing files when force is set', async () => {
      const root = await makeRoot();
      await writeFile(root, 'AGENTS.md', '# pre-existing\n');
      const result = await runInit(root, { force: true });
      expect(result.created).toContain('AGENTS.md');
      const after = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
      expect(after).not.toBe('# pre-existing\n');
      expect(after).toContain('# Agents');
   });

   it('writes CLAUDE.md as an @AGENTS.md include', async () => {
      const root = await makeRoot();
      await runInit(root);
      const claude = await fs.readFile(path.join(root, 'CLAUDE.md'), 'utf8');
      expect(claude).toBe('@AGENTS.md\n');
   });

   it('embeds the PLANS.md template at .agents/PLANS.md', async () => {
      const root = await makeRoot();
      await runInit(root);
      const plans = await fs.readFile(path.join(root, '.agents/PLANS.md'), 'utf8');
      expect(plans).toContain('ExecPlan');
      expect(plans.length).toBeGreaterThan(1000);
   });

   it('is idempotent: re-running without force is a no-op', async () => {
      const root = await makeRoot();
      const first = await runInit(root);
      expect(first.skipped).toEqual([]);
      const second = await runInit(root);
      expect(second.created).toEqual([]);
      expect(second.skipped.sort()).toEqual(first.created.sort());
   });
});
