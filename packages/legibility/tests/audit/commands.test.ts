import { afterEach, describe, expect, it } from 'vitest';
import { checkCommands } from '../../src/audit_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from '../helpers/make_fixture.js';

let lastRoot: string | undefined;

afterEach(async () => {
   await cleanup(lastRoot);
   lastRoot = undefined;
});

async function makeRepo(): Promise<string> {
   lastRoot = await makeFixtureRoot('al-commands-');
   return lastRoot;
}

describe('checkCommands', () => {
   it('reports missing package.json scripts referenced through npm run', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `npm run typo`.\n');
      await writeFile(root, 'package.json', JSON.stringify({
         scripts: {
            build: 'tsc',
         },
      }));

      const result = await checkCommands(root);

      expect(result.status).toBe('ok');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe('warning');
      expect(result.findings[0].message).toContain('`typo`');
      expect(result.findings[0].message).toContain('npm/pnpm/yarn/bun');
   });

   it('does not report standard Maven, Composer, or Gradle commands as missing tasks', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nUse `mvn test`, `composer install`, and `./gradlew build`. Run `composer qa` too.\n');
      await writeFile(root, 'pom.xml', '<project></project>\n');
      await writeFile(root, 'composer.json', JSON.stringify({ scripts: { qa: 'phpunit' } }));
      await writeFile(root, 'build.gradle', 'tasks.register("releaseDocs") {}\n');

      const result = await checkCommands(root);

      expect(result.status).toBe('ok');
      expect(result.findings).toHaveLength(0);
   });

   it('reports missing Composer scripts referenced through shorthand', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `composer qa`.\n');
      await writeFile(root, 'composer.json', JSON.stringify({ scripts: { lint: 'phpcs' } }));

      const result = await checkCommands(root);

      expect(result.status).toBe('ok');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe('warning');
      expect(result.findings[0].message).toContain('`qa`');
      expect(result.findings[0].message).toContain('Composer');
   });

   it('reports missing explicit Composer scripts whose names collide with built-ins', async () => {
      const root = await makeRepo();
      await writeFile(root, 'README.md', '# Project\n\nRun `composer run audit` and `composer run-script install`.\n');
      await writeFile(root, 'composer.json', JSON.stringify({ scripts: { lint: 'phpcs' } }));

      const result = await checkCommands(root);

      expect(result.status).toBe('ok');
      expect(result.findings).toHaveLength(2);
      expect(result.findings.map((finding) => finding.message)).toEqual([
         expect.stringContaining('`audit`'),
         expect.stringContaining('`install`'),
      ]);
   });
});
