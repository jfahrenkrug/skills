import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAgentsMd } from '../audit_repo.js';
import { extractInlineCodeSpans } from '../lib/markdown.js';
import {
   cleanup,
   makeFixtureRoot,
   runNode,
   writeFile,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.resolve(__dirname, '..', 'audit_repo.js');

describe('markdown: extractInlineCodeSpans', () => {
   it('returns inline spans only, skipping fenced blocks', () => {
      const md = [
         'See `scripts/foo.sh` and `bin/tool`.',
         '',
         '```',
         '`not-a-span-line`',
         '```',
         'After: `lib/bar.js`.',
      ].join('\n');
      const spans = extractInlineCodeSpans(md);
      assert.deepEqual(
         spans.map((s) => s.content),
         [ 'scripts/foo.sh', 'bin/tool', 'lib/bar.js' ],
      );
   });
});

describe('audit_repo: --check-agents-md', () => {
   describe('checkAgentsMd (unit)', () => {
      it('returns ok when no agent docs exist', async () => {
         const root = await makeFixtureRoot('al-ag-none-');
         try {
            const result = await checkAgentsMd(root);
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
            assert.match(result.summary, /No agent docs/u);
         } finally {
            await cleanup(root);
         }
      });

      it('flags Markdown links in AGENTS.md to missing files', async () => {
         const root = await makeFixtureRoot('al-ag-link-');
         try {
            await writeFile(root, 'AGENTS.md', 'See [guide](docs/missing.md).');
            const result = await checkAgentsMd(root);
            const f = result.findings[0];
            assert.equal(result.status, 'drift');
            assert.equal(f.severity, 'error');
            assert.match(f.message, /does not exist/u);
         } finally {
            await cleanup(root);
         }
      });

      it('flags inline code paths in AGENTS.md that do not exist', async () => {
         const root = await makeFixtureRoot('al-ag-inline-');
         try {
            await writeFile(root, 'AGENTS.md', [
               '# Agents',
               '',
               'The bootstrap script lives at `scripts/bootstrap.sh`.',
            ].join('\n'));
            const result = await checkAgentsMd(root);
            const f = result.findings.find((x) => /bootstrap/u.test(x.message));
            assert.ok(f);
            assert.equal(f.severity, 'error');
            assert.equal(f.path, 'AGENTS.md');
         } finally {
            await cleanup(root);
         }
      });

      it('does not flag inline code that is not path-like', async () => {
         const root = await makeFixtureRoot('al-ag-nonpath-');
         try {
            await writeFile(root, 'AGENTS.md', [
               '# Agents',
               '',
               'Use `process.env.NODE_ENV` and `Array.isArray`, not magic strings.',
            ].join('\n'));
            const result = await checkAgentsMd(root);
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('flags task references in agent docs that are not in the task surface', async () => {
         const root = await makeFixtureRoot('al-ag-task-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({
               name: 'x',
               scripts: { build: 'tsc' },
            }));
            await writeFile(root, 'AGENTS.md', 'Run `npm run deploy` to publish.');
            const result = await checkAgentsMd(root);
            const f = result.findings.find((x) => /deploy/u.test(x.message));
            assert.ok(f, 'expected finding for missing deploy task');
            assert.equal(f.severity, 'error');
         } finally {
            await cleanup(root);
         }
      });

      it('returns ok when every reference resolves', async () => {
         const root = await makeFixtureRoot('al-ag-ok-');
         try {
            await writeFile(root, 'package.json', JSON.stringify({
               name: 'x',
               scripts: { build: 'tsc', test: 'node --test' },
            }));
            await writeFile(root, 'docs/overview.md', '# Overview');
            await writeFile(root, 'scripts/start.sh', '#!/bin/sh\n');
            await writeFile(root, 'AGENTS.md', [
               '# Agents',
               '',
               'See [overview](docs/overview.md).',
               '',
               'The startup script is `scripts/start.sh`.',
               '',
               'Run `npm run build` before shipping.',
            ].join('\n'));
            const result = await checkAgentsMd(root);
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('checks CLAUDE.md as well as AGENTS.md', async () => {
         const root = await makeFixtureRoot('al-ag-claude-');
         try {
            await writeFile(root, 'CLAUDE.md', 'See `scripts/gone.sh` for details.');
            const result = await checkAgentsMd(root);
            const f = result.findings.find((x) => x.path === 'CLAUDE.md');
            assert.ok(f);
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('CLI integration', () => {
      it('exits 0 when every reference resolves', async () => {
         const root = await makeFixtureRoot('al-ag-cli-ok-');
         try {
            await writeFile(root, 'AGENTS.md', '# Agents\n\nNo references.\n');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-agents-md', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.check, 'agents_md');
            assert.equal(parsed.status, 'ok');
         } finally {
            await cleanup(root);
         }
      });

      it('exits 1 when agent doc references are broken', async () => {
         const root = await makeFixtureRoot('al-ag-cli-broken-');
         try {
            await writeFile(root, 'AGENTS.md', 'Path is `scripts/missing.sh`.');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-agents-md', root ]);
            assert.equal(status, 1);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.status, 'drift');
         } finally {
            await cleanup(root);
         }
      });
   });
});
