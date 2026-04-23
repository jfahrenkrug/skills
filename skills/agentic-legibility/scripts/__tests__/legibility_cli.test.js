import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
   cleanup,
   makeFullyLegibleRepo,
   makeFixtureRoot,
   runNode,
   writeFile,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGIBILITY_SCRIPT = path.resolve(__dirname, '..', 'legibility.js');

describe('legibility.js dispatcher', () => {
   it('prints usage when called with no arguments', async () => {
      const { status, stdout } = await runNode(LEGIBILITY_SCRIPT, []);
      assert.equal(status, 0);
      assert.match(stdout, /Usage: legibility/u);
      assert.match(stdout, /score/u);
      assert.match(stdout, /audit/u);
   });

   it('exits 2 on an unknown subcommand', async () => {
      const { status, stderr } = await runNode(LEGIBILITY_SCRIPT, [ 'wat' ]);
      assert.equal(status, 2);
      assert.match(stderr, /Unknown subcommand/u);
   });

   describe('score subcommand', () => {
      it('forwards to score_repo.js and returns the scorecard JSON', async () => {
         const root = await makeFullyLegibleRepo();
         try {
            const { status, stdout } = await runNode(LEGIBILITY_SCRIPT, [ 'score', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.ok(parsed.scorecard || parsed.metrics || parsed.score, 'expected scorecard payload');
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('list-metrics subcommand', () => {
      it('prints a non-empty list of metric names', async () => {
         const { status, stdout } = await runNode(LEGIBILITY_SCRIPT, [ 'list-metrics' ]);
         assert.equal(status, 0);
         const lines = stdout.trim().split('\n').filter(Boolean);
         assert.ok(lines.length > 0);
         assert.ok(lines.every((line) => /^[a-z_]+$/u.test(line)));
      });
   });

   describe('list-scopes subcommand', () => {
      it('prints a JSON array of detected scopes', async () => {
         const root = await makeFullyLegibleRepo();
         try {
            const { status, stdout } = await runNode(LEGIBILITY_SCRIPT, [ 'list-scopes', root ]);
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.ok(Array.isArray(parsed));
         } finally {
            await cleanup(root);
         }
      });
   });

   describe('audit subcommand', () => {
      it('runs a single check and emits a single-check JSON', async () => {
         const root = await makeFullyLegibleRepo();
         try {
            const { status, stdout } = await runNode(
               LEGIBILITY_SCRIPT,
               [ 'audit', '--check-artifacts', root ],
            );
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.check, 'artifacts');
            assert.equal(parsed.status, 'ok');
         } finally {
            await cleanup(root);
         }
      });

      it('runs --check-all and emits an aggregate report with every check', async () => {
         const root = await makeFullyLegibleRepo();
         try {
            const { status, stdout } = await runNode(
               LEGIBILITY_SCRIPT,
               [ 'audit', '--check-all', root ],
            );
            assert.equal(status, 0);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.status, 'ok');
            assert.ok(parsed.checks);
            for (const name of [ 'artifacts', 'links', 'commands', 'execplans', 'agents_md' ]) {
               assert.ok(parsed.checks[name], `missing aggregate check ${name}`);
               assert.ok([ 'ok', 'drift' ].includes(parsed.checks[name].status));
            }
         } finally {
            await cleanup(root);
         }
      });

      it('aggregate status becomes drift when any check reports an error', async () => {
         const root = await makeFixtureRoot('al-legibility-drift-');
         try {
            await writeFile(root, 'README.md', 'Broken [link](nope.md).');
            const { status, stdout } = await runNode(
               LEGIBILITY_SCRIPT,
               [ 'audit', '--check-all', root ],
            );
            assert.equal(status, 1);
            const parsed = JSON.parse(stdout);
            assert.equal(parsed.status, 'drift');
         } finally {
            await cleanup(root);
         }
      });

      it('renders markdown for the aggregate report', async () => {
         const root = await makeFullyLegibleRepo();
         try {
            const { status, stdout } = await runNode(
               LEGIBILITY_SCRIPT,
               [ 'audit', '--check-all', '--format', 'markdown', root ],
            );
            assert.equal(status, 0);
            assert.match(stdout, /^# Agentic Legibility Audit/u);
            for (const name of [ 'artifacts', 'links', 'commands', 'execplans', 'agents_md' ]) {
               assert.match(stdout, new RegExp(`## ${name}`, 'u'));
            }
         } finally {
            await cleanup(root);
         }
      });

      it('exits 2 on invalid audit flags', async () => {
         const { status } = await runNode(LEGIBILITY_SCRIPT, [ 'audit', '--gibberish' ]);
         assert.equal(status, 2);
      });
   });
});
