import { afterEach, describe, expect, it } from 'vitest';
import { checkLinks } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile, mkdir } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-links-');
   return lastRoot;
}

describe('checkLinks', () => {
   it('accepts links to directories', async () => {
      const root = await makeRepo();
      await mkdir(root, 'docs/exec-plans');
      await writeFile(root, 'docs/guide.md', '# Guide\n');
      await writeFile(root, 'README.md', '# P\n\nSee [the docs](docs/) and [plans](docs/exec-plans/).\n');
      const result = await checkLinks(root);
      expect(result.findings.filter((f) => f.message.startsWith('Broken link'))).toEqual([]);
   });

   it('maps directory links to index docs for orphan detection', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/README.md', '# Docs\n\nSee [components](architecture/components/).\n');
      await writeFile(root, 'docs/architecture/components/README.md', '# Components\n');

      const result = await checkLinks(root);

      expect(result.findings.filter((f) => f.message.startsWith('Orphaned'))).toEqual([]);
   });

   it('checks anchors on directory links that resolve to index docs', async () => {
      const root = await makeRepo();
      await writeFile(root, 'docs/README.md', '# Docs\n\nSee [components](architecture/components/#overview).\n');
      await writeFile(root, 'docs/architecture/components/README.md', '# Components\n');

      const result = await checkLinks(root);
      const brokenAnchors = result.findings.filter((f) => f.message.startsWith('Broken anchor'));

      expect(brokenAnchors).toHaveLength(1);
      expect(brokenAnchors[0].message).toContain('docs/architecture/components/README.md');
   });

   it('still flags links to missing files as errors', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# P\n\nSee [gone](docs/missing.md).\n');
      const result = await checkLinks(root);
      const broken = result.findings.filter((f) => f.message.startsWith('Broken link'));
      expect(broken).toHaveLength(1);
      expect(broken[0].severity).toBe('error');
   });
});
