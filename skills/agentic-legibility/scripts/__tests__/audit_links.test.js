import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLinks } from '../audit_repo.js';
import {
   cleanup,
   makeFixtureRoot,
   mkdir,
   runNode,
   writeFile,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.resolve(__dirname, '..', 'audit_repo.js');

async function makeLinkedRepo() {
   const root = await makeFixtureRoot('al-links-clean-');
   await writeFile(root, 'README.md', [
      '# Root',
      '',
      'See [agents](AGENTS.md) and [docs](docs/README.md).',
   ].join('\n'));
   await writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [overview](docs/overview.md#section-one).',
   ].join('\n'));
   await writeFile(root, 'docs/README.md', [
      '# Docs',
      '',
      '- [Overview](overview.md)',
   ].join('\n'));
   await writeFile(root, 'docs/overview.md', [
      '# Overview',
      '',
      '## Section One',
      '',
      'Content.',
   ].join('\n'));
   return root;
}

describe('audit_repo: --check-links', () => {
   describe('checkLinks (unit)', () => {
      it('reports ok on a fully-linked repo', async () => {
         const root = await makeLinkedRepo();
         try {
            const result = await checkLinks(root);
            assert.equal(result.check, 'links');
            assert.equal(result.status, 'ok');
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('flags broken file links as errors', async () => {
         const root = await makeFixtureRoot('al-links-broken-');
         try {
            await writeFile(root, 'README.md', 'See [missing](missing.md).');
            const result = await checkLinks(root);
            assert.equal(result.status, 'drift');
            const broken = result.findings.find((f) => f.message.startsWith('Broken link'));
            assert.ok(broken, 'expected broken-link finding');
            assert.equal(broken.severity, 'error');
            assert.equal(broken.path, 'README.md');
            assert.equal(broken.line, 1);
         } finally {
            await cleanup(root);
         }
      });

      it('flags broken anchors as warnings', async () => {
         const root = await makeFixtureRoot('al-links-anchor-');
         try {
            await writeFile(root, 'README.md', 'See [there](docs/page.md#missing).');
            await writeFile(root, 'docs/page.md', [
               '# Page',
               '',
               '## Real Heading',
            ].join('\n'));
            const result = await checkLinks(root);
            const anchorFinding = result.findings.find((f) => f.message.startsWith('Broken anchor'));
            assert.ok(anchorFinding, 'expected broken-anchor finding');
            assert.equal(anchorFinding.severity, 'warning');
            assert.equal(anchorFinding.path, 'README.md');
            assert.ok(anchorFinding.message.includes('#missing'));
         } finally {
            await cleanup(root);
         }
      });

      it('resolves reference-style links and flags unresolved ones', async () => {
         const root = await makeFixtureRoot('al-links-ref-');
         try {
            await writeFile(root, 'README.md', [
               'See [docs][intro] and [missing][nope].',
               '',
               '[intro]: docs/intro.md',
            ].join('\n'));
            await writeFile(root, 'docs/intro.md', '# Intro');
            const result = await checkLinks(root);
            const unresolved = result.findings.find((f) => f.message.startsWith('Unresolved reference'));
            assert.ok(unresolved, 'expected unresolved-reference finding');
            assert.equal(unresolved.severity, 'warning');
            assert.ok(!result.findings.some((f) => f.message.startsWith('Broken link')),
               'valid reference link should not produce a broken-link finding');
         } finally {
            await cleanup(root);
         }
      });

      it('flags orphan docs unreachable from any index', async () => {
         const root = await makeFixtureRoot('al-links-orphan-');
         try {
            await writeFile(root, 'README.md', '# Root\n\nSee [docs](docs/README.md).');
            await writeFile(root, 'docs/README.md', '# Docs\n');
            await writeFile(root, 'docs/orphan.md', '# Orphan not linked from anywhere.');
            const result = await checkLinks(root);
            const orphan = result.findings.find((f) => f.path === 'docs/orphan.md');
            assert.ok(orphan, 'expected orphan finding');
            assert.equal(orphan.severity, 'warning');
            assert.match(orphan.message, /Orphaned/u);
            assert.equal(result.status, 'ok',
               'orphans are warnings only — status should stay ok when there are no errors');
         } finally {
            await cleanup(root);
         }
      });

      it('does not flag docs reachable only via transitive links', async () => {
         const root = await makeFixtureRoot('al-links-transitive-');
         try {
            await writeFile(root, 'README.md', 'See [docs](docs/README.md).');
            await writeFile(root, 'docs/README.md', '- [inner](inner/deep.md)');
            await writeFile(root, 'docs/inner/deep.md', '# Deep');
            const result = await checkLinks(root);
            const orphanFindings = result.findings.filter((f) => f.message.startsWith('Orphaned'));
            assert.equal(orphanFindings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('ignores external links (http, mailto)', async () => {
         const root = await makeFixtureRoot('al-links-external-');
         try {
            await writeFile(root, 'README.md', [
               '[web](https://example.com)',
               '[mail](mailto:a@b.com)',
            ].join('\n'));
            const result = await checkLinks(root);
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('ignores links inside fenced code blocks', async () => {
         const root = await makeFixtureRoot('al-links-fenced-');
         try {
            await writeFile(root, 'README.md', [
               '# Root',
               '',
               '```',
               '[fake](does-not-exist.md)',
               '```',
            ].join('\n'));
            const result = await checkLinks(root);
            assert.equal(result.findings.length, 0);
         } finally {
            await cleanup(root);
         }
      });

      it('recognizes subdirectory READMEs under docs/ as entry points', async () => {
         const root = await makeFixtureRoot('al-links-subindex-');
         try {
            await writeFile(root, 'README.md', '# Root');
            await writeFile(root, 'docs/README.md', 'See [guides](guides/README.md).');
            await writeFile(root, 'docs/guides/README.md', '- [a](a.md)');
            await writeFile(root, 'docs/guides/a.md', '# A');
            const result = await checkLinks(root);
            const orphans = result.findings.filter((f) => f.message.startsWith('Orphaned'));
            assert.equal(orphans.length, 0);
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('CLI integration', () => {
      it('exits 0 on a clean repo', async () => {
         const root = await makeLinkedRepo();
         try {
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-links', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.check, 'links');
            assert.equal(parsed.status, 'ok');
         } finally {
            await cleanup(root);
         }
      });

      it('exits 1 and lists broken links when there is drift', async () => {
         const root = await makeFixtureRoot('al-links-cli-drift-');
         try {
            await writeFile(root, 'README.md', 'See [gone](gone.md).');
            const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-links', root ]);
            assert.equal(status, 1);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.status, 'drift');
            assert.ok(parsed.findings.some((f) => f.message.startsWith('Broken link')));
         } finally {
            await cleanup(root);
         }
      });

      it('renders markdown output with --format markdown', async () => {
         const root = await makeFixtureRoot('al-links-cli-md-');
         try {
            await writeFile(root, 'README.md', 'See [gone](gone.md).');
            const { status, stdout } = await runNode(
               AUDIT_SCRIPT,
               [ '--check-links', '--format', 'markdown', root ],
            );
            assert.equal(status, 1);
            assert.match(stdout, /^# Check: links/u);
            assert.match(stdout, /gone\.md/u);
         } finally {
            await cleanup(root);
         }
      });
   });
});
