import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkCommands } from '../audit_repo.js';
import { extractCodeSnippets, extractTaskReferences } from '../lib/markdown.js';
import {
   cleanup,
   makeFixtureRoot,
   runNode,
   writeFile,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.resolve(__dirname, '..', 'audit_repo.js');

describe('markdown: extractCodeSnippets', () => {
   it('returns fenced-block lines and inline-code spans', () => {
      const md = [
         'Top text with `inline code` span.',
         '',
         '```',
         'fenced line one',
         'fenced line two',
         '```',
         'After fence with `another` span.',
      ].join('\n');
      const snippets = extractCodeSnippets(md);
      const rendered = snippets.map((s) => ({ text: s.snippet, line: s.line }));
      assert.deepEqual(rendered, [
         { text: 'inline code', line: 1 },
         { text: 'fenced line one', line: 4 },
         { text: 'fenced line two', line: 5 },
         { text: 'another', line: 7 },
      ]);
   });
});

describe('markdown: extractTaskReferences', () => {
   it('extracts `npm run X` and `pnpm run X`', () => {
      const md = [
         '```',
         'npm run build',
         'pnpm run test',
         '```',
      ].join('\n');
      const refs = extractTaskReferences(md);
      assert.deepEqual(
         refs.map((r) => ({ runner: r.runner, token: r.token })).sort((a, b) => a.token.localeCompare(b.token)),
         [ { runner: 'npm', token: 'build' }, { runner: 'npm', token: 'test' } ],
      );
   });

   it('strips trailing `-- --watch` style arguments from the captured token', () => {
      const md = '```\nnpm run test -- --watch\n```';
      const refs = extractTaskReferences(md);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].token, 'test');
   });

   it('ignores `npm install` (not a run subcommand)', () => {
      const md = '```\nnpm install\npnpm add lodash\n```';
      const refs = extractTaskReferences(md);
      assert.equal(refs.length, 0);
   });

   it('extracts make, just, and task references', () => {
      const md = '```\nmake deploy\njust lint\ntask release\n```';
      const refs = extractTaskReferences(md);
      const asPairs = refs.map((r) => `${r.runner}:${r.token}`).sort();
      assert.deepEqual(asPairs, [ 'just:lint', 'make:deploy', 'task:release' ]);
   });

   it('skips make conventional built-ins like `clean`', () => {
      const md = '```\nmake clean\nmake deploy\n```';
      const refs = extractTaskReferences(md);
      assert.deepEqual(refs.map((r) => r.token), [ 'deploy' ]);
   });

   it('skips cargo built-in subcommands', () => {
      const md = '```\ncargo test\ncargo build\ncargo myalias\n```';
      const refs = extractTaskReferences(md);
      assert.deepEqual(refs.map((r) => r.token), [ 'myalias' ]);
   });

   it('extracts from inline code spans', () => {
      const md = 'Run `npm run typecheck` before committing.';
      const refs = extractTaskReferences(md);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].token, 'typecheck');
   });

   it('does not extract references from prose outside code', () => {
      const md = 'The text mentions npm run something but not in code.';
      const refs = extractTaskReferences(md);
      assert.equal(refs.length, 0);
   });

   it('skips placeholder tokens like `X`, `NAME`, or `TARGET`', () => {
      const md = 'Run `npm run X`, `make TARGET`, or `just NAME` as templates.';
      const refs = extractTaskReferences(md);
      assert.equal(refs.length, 0);
   });
});

describe('audit_repo: --check-commands', () => {
   describe('checkCommands (unit)', () => {
      it('reports ok when every doc reference resolves', async () => {
         const root = await makeFixtureRoot('al-cmd-ok-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({
               name: 'x',
               scripts: { build: 'tsc', test: 'node --test' },
            }));
            await writeFile(root, 'README.md', [
               'Run `npm run build` and `npm run test`.',
            ].join('\n'));
            const result = await checkCommands(root);
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('flags npm scripts referenced in docs but missing from package.json', async () => {
         const root = await makeFixtureRoot('al-cmd-missing-npm-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
            await writeFile(root, 'README.md', 'Run `npm run deploy` to ship.');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 1);
            const f = result.findings[0];
            assert.equal(f.severity, 'warning');
            assert.equal(f.path, 'README.md');
            assert.match(f.message, /deploy/u);
         } finally {
            await cleanup(root);
         }
      });

      it('flags make targets referenced in docs but missing from the Makefile', async () => {
         const root = await makeFixtureRoot('al-cmd-missing-make-');
         try {
            await writeFile(root, 'Makefile', 'build:\n\techo building\n');
            await writeFile(root, 'README.md', '```\nmake deploy\n```');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 1);
            assert.match(result.findings[0].message, /make task `deploy`/u);
         } finally {
            await cleanup(root);
         }
      });

      it('flags just recipes mentioned in docs but not defined in the justfile', async () => {
         const root = await makeFixtureRoot('al-cmd-missing-just-');
         try {
            await writeFile(root, 'justfile', 'build:\n    echo ok\n');
            await writeFile(root, 'docs/guide.md', '```\njust release\n```');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 1);
            assert.match(result.findings[0].message, /just task `release`/u);
         } finally {
            await cleanup(root);
         }
      });

      it('flags cargo aliases mentioned in docs but not defined in .cargo/config.toml', async () => {
         const root = await makeFixtureRoot('al-cmd-missing-cargo-');
         try {
            await writeFile(root, 'Cargo.toml', '[package]\nname = "x"\nversion = "0.1.0"\n');
            await writeFile(root, '.cargo/config.toml', '[alias]\nxtask = "run --bin xtask"\n');
            await writeFile(root, 'README.md', '```\ncargo mytask\n```');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 1);
            assert.match(result.findings[0].message, /cargo task `mytask`/u);
         } finally {
            await cleanup(root);
         }
      });

      it('allows cargo built-in subcommands without flagging them', async () => {
         const root = await makeFixtureRoot('al-cmd-cargo-builtin-');
         try {
            await writeFile(root, 'Cargo.toml', '[package]\nname = "x"\nversion = "0.1.0"\n');
            await writeFile(root, 'README.md', '```\ncargo test\ncargo build --release\n```');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('resolves references stripped of trailing arguments', async () => {
         const root = await makeFixtureRoot('al-cmd-args-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));
            await writeFile(root, 'README.md', '```\nnpm run test -- --watch\n```');
            const result = await checkCommands(root);
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('CLI integration', () => {
      it('exits 0 when every doc task reference resolves', async () => {
         const root = await makeFixtureRoot('al-cmd-cli-ok-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
            await writeFile(root, 'README.md', '`npm run build`');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-commands', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.check, 'commands');
            assert.equal(parsed.status, 'ok');
         } finally {
            await cleanup(root);
         }
      });

      it('prints warnings but exits 0 when only warnings are present', async () => {
         const root = await makeFixtureRoot('al-cmd-cli-warn-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
            await writeFile(root, 'README.md', '`npm run deploy`');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-commands', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.status, 'ok');
            assert.equal(parsed.findings.length, 1);
            assert.equal(parsed.findings[0].severity, 'warning');
         } finally {
            await cleanup(root);
         }
      });
   });
});
