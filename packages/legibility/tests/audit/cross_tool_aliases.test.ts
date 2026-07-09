import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkCrossToolAliases } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-cross-tool-');
   return lastRoot;
}

describe('checkCrossToolAliases', () => {
   it('emits no findings when no AGENTS.md and no aliases exist', async () => {
      const root = await makeRepo();
      const result = await checkCrossToolAliases(root);
      expect(result.findings.length).toBe(0);
      expect(result.status).toBe('ok');
   });

   it('warns when CLAUDE.md drifts substantively from AGENTS.md', async () => {
      const root = await makeRepo();
      const agentsBody = Array.from({ length: 6 }, (_v, i) => {
         return `Section ${i}: this paragraph describes how setup works in this project.`;
      }).join('\n');
      await writeFile(root, 'AGENTS.md', `# Agents\n\n${agentsBody}\n`);
      await writeFile(root, 'CLAUDE.md', '# Different\n\nThe build command is `npm run build` and tests run with `npm test`.\n');
      const result = await checkCrossToolAliases(root);
      const finding = result.findings.find((f) => f.path === 'CLAUDE.md');
      expect(finding?.severity).toBe('warning');
   });

   it('does not warn when alias has @AGENTS.md include directive', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nA repo-wide agent guide.\n');
      await writeFile(root, 'CLAUDE.md', '@AGENTS.md\n');
      const result = await checkCrossToolAliases(root);
      expect(result.findings.length).toBe(0);
   });

   it('does not warn when alias is a symlink to AGENTS.md', async () => {
      const root = await makeRepo();
      await writeFile(root, 'AGENTS.md', '# Agents\n\nA repo-wide agent guide.\n');
      await fs.symlink('AGENTS.md', path.join(root, 'CLAUDE.md'));
      const result = await checkCrossToolAliases(root);
      expect(result.findings.length).toBe(0);
   });

   it('warns when no AGENTS.md but multiple aliases exist', async () => {
      const root = await makeRepo();
      await writeFile(root, 'CLAUDE.md', '# Claude rules\n\nSomething different\n');
      await writeFile(root, 'GEMINI.md', '# Gemini rules\n\nSomething else\n');
      const result = await checkCrossToolAliases(root);
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].severity).toBe('warning');
   });
});
