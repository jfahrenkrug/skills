import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkArtifacts, runAudit, REQUIRED_ARTIFACTS, parseCliArgs } from '../audit_repo.js';
import {
   cleanup,
   makeBareRepo,
   makeFullyLegibleRepo,
   runNode,
} from './helpers/make_fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.resolve(__dirname, '..', 'audit_repo.js');

describe('audit_repo: --check-artifacts', () => {
   describe('checkArtifacts (unit)', () => {
      let legibleRoot;
      let bareRoot;

      before(async () => {
         legibleRoot = await makeFullyLegibleRepo();
         bareRoot = await makeBareRepo();
      });

      after(async () => {
         await cleanup(legibleRoot);
         await cleanup(bareRoot);
      });

      it('reports ok on a fully legible repo', async () => {
         const result = await checkArtifacts(legibleRoot);
         assert.equal(result.check, 'artifacts');
         assert.equal(result.status, 'ok');
         assert.equal(result.findings.length, 0);
         assert.match(result.summary, /All required legibility artifacts are present/u);
      });

      it('reports drift on a bare repo and lists every required artifact', async () => {
         const result = await checkArtifacts(bareRoot);
         assert.equal(result.status, 'drift');
         const reportedPaths = result.findings.map((f) => f.path).sort();
         const expected = REQUIRED_ARTIFACTS.map((a) => a.path).sort();
         assert.deepEqual(reportedPaths, expected);
      });

      it('attaches severity and remediation to every finding', async () => {
         const result = await checkArtifacts(bareRoot);
         for (const item of result.findings) {
            assert.ok([ 'error', 'warning', 'info' ].includes(item.severity));
            assert.ok(item.remediation.length > 0);
            assert.match(item.message, /Required legibility artifact missing/u);
         }
      });

      it('differentiates missing files from missing directories', async () => {
         const result = await checkArtifacts(bareRoot);
         const agentsMdFinding = result.findings.find((f) => f.path === 'AGENTS.md');
         const agentsDirFinding = result.findings.find((f) => f.path === '.agents');
         assert.match(agentsMdFinding.message, /file/u);
         assert.match(agentsDirFinding.message, /dir/u);
      });
   });

   describe('runAudit aggregation', () => {
      let legibleRoot;

      before(async () => {
         legibleRoot = await makeFullyLegibleRepo();
      });

      after(async () => {
         await cleanup(legibleRoot);
      });

      it('aggregates check results into an audit report', async () => {
         const report = await runAudit(legibleRoot, [ 'artifacts' ]);
         assert.equal(report.status, 'ok');
         assert.equal(report.checks.artifacts.status, 'ok');
      });
   });

   describe('parseCliArgs', () => {
      it('requires at least one check flag or --check-all', () => {
         assert.throws(() => parseCliArgs([ '.' ]), /Specify at least one check flag/u);
      });

      it('accepts --check-artifacts', () => {
         const args = parseCliArgs([ '--check-artifacts', '.' ]);
         assert.deepEqual(args.checks, [ 'artifacts' ]);
         assert.equal(args.runAll, false);
      });

      it('accepts --check-all', () => {
         const args = parseCliArgs([ '--check-all', '.' ]);
         assert.equal(args.runAll, true);
      });

      it('rejects unknown options', () => {
         assert.throws(() => parseCliArgs([ '--gibberish' ]), /Unknown option/u);
      });

      it('rejects --format values other than json or markdown', () => {
         assert.throws(() => parseCliArgs([ '--check-artifacts', '--format', 'xml' ]), /--format/u);
      });
   });

   describe('CLI integration', () => {
      let bareRoot;
      let legibleRoot;

      before(async () => {
         bareRoot = await makeBareRepo();
         legibleRoot = await makeFullyLegibleRepo();
      });

      after(async () => {
         await cleanup(bareRoot);
         await cleanup(legibleRoot);
      });

      it('exits 0 and emits single-check JSON on a legible repo', async () => {
         const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-artifacts', legibleRoot ]);
         assert.equal(status, 0);
         const parsed = JSON.parse(stdout);
         assert.equal(parsed.check, 'artifacts');
         assert.equal(parsed.status, 'ok');
      });

      it('exits 1 and lists missing artifacts on a bare repo', async () => {
         const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-artifacts', bareRoot ]);
         assert.equal(status, 1);
         const parsed = JSON.parse(stdout);
         assert.equal(parsed.status, 'drift');
         assert.ok(parsed.findings.some((f) => f.path === 'AGENTS.md'));
      });

      it('renders markdown with --format markdown', async () => {
         const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-artifacts', '--format', 'markdown', bareRoot ]);
         assert.equal(status, 1);
         assert.match(stdout, /^# Check: artifacts/u);
         assert.match(stdout, /AGENTS\.md/u);
      });

      it('emits aggregate audit report shape when --check-all is used', async () => {
         const { status, stdout } = await runNode(AUDIT_SCRIPT, [ '--check-all', legibleRoot ]);
         assert.equal(status, 0);
         const parsed = JSON.parse(stdout);
         assert.equal(parsed.status, 'ok');
         assert.equal(typeof parsed.checks, 'object');
         assert.equal(parsed.checks.artifacts.status, 'ok');
      });

      it('exits 2 on invalid CLI usage', async () => {
         const { status } = await runNode(AUDIT_SCRIPT, [ '--gibberish' ]);
         assert.equal(status, 2);
      });
   });
});
