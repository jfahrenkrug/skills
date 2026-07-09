#!/usr/bin/env node
// Smoke-test the generated bundle by running a few sanity checks.
// Run via: npm -w legibility run verify-bundle
// Or: node packages/legibility/scripts/verify-bundle.mjs

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

const BUNDLE_PATH = resolve(__dirname, '../../../skills/agentic-legibility/scripts/legibility.js');

async function run(args) {
   const { stdout, stderr } = await execFileAsync(process.execPath, [ BUNDLE_PATH, ...args ]);
   return { stdout, stderr };
}

async function verify() {
   let passed = 0;
   let failed = 0;

   function ok(label) {
      process.stdout.write(`  ✓ ${label}\n`);
      passed += 1;
   }

   function fail(label, detail) {
      process.stderr.write(`  ✗ ${label}: ${detail}\n`);
      failed += 1;
   }

   // Check banner
   const content = await readFile(BUNDLE_PATH, 'utf8');
   if (content.startsWith('#!/usr/bin/env node')) {
      ok('bundle has shebang');
   } else {
      fail('bundle has shebang', 'missing #!/usr/bin/env node at start');
   }

   if (content.includes('// GENERATED FILE')) {
      ok('bundle has generated-file banner');
   } else {
      fail('bundle has generated-file banner', 'missing GENERATED FILE marker');
   }

   // Subcommand: help
   try {
      const { stdout } = await run([ '--help' ]);
      if (stdout.includes('legibility <subcommand>')) {
         ok('--help shows usage');
      } else {
         fail('--help shows usage', `got: ${stdout.slice(0, 80)}`);
      }
   } catch (err) {
      fail('--help', err.message);
   }

   // Subcommand: list-metrics
   try {
      const { stdout } = await run([ 'list-metrics' ]);
      if (stdout.includes('bootstrap_self_sufficiency')) {
         ok('list-metrics returns metric names');
      } else {
         fail('list-metrics returns metric names', `got: ${stdout.slice(0, 80)}`);
      }
   } catch (err) {
      fail('list-metrics', err.message);
   }

   // Subcommand: score (runs on the repo itself)
   try {
      const repoRoot = resolve(__dirname, '../../..');
      const { stdout } = await run([ 'score', repoRoot ]);
      const parsed = JSON.parse(stdout);
      if (typeof parsed.score === 'number' && Array.isArray(parsed.quick_wins)) {
         ok('score produces valid JSON report');
      } else {
         fail('score produces valid JSON report', 'missing .score or .quick_wins');
      }
   } catch (err) {
      fail('score', err.message);
   }

   // Subcommand: audit --check-artifacts
   try {
      const repoRoot = resolve(__dirname, '../../..');
      const result = await execFileAsync(process.execPath, [ BUNDLE_PATH, 'audit', '--check-artifacts', repoRoot ]).catch((e) => e);
      const stdout = result.stdout ?? '';
      const parsed = JSON.parse(stdout);
      if (parsed.check === 'artifacts' && typeof parsed.status === 'string') {
         ok('audit --check-artifacts produces valid CheckResult JSON');
      } else {
         fail('audit --check-artifacts', `missing .check or .status`);
      }
   } catch (err) {
      fail('audit --check-artifacts', err.message);
   }

   // Subcommand: init
   try {
      const tmp = await mkdtemp(join(tmpdir(), 'al-bundle-init-'));
      try {
         const { stdout } = await run([ 'init', tmp ]);
         const parsed = JSON.parse(stdout);
         if (Array.isArray(parsed.created) && parsed.created.includes('AGENTS.md')) {
            ok('init creates AGENTS.md');
         } else {
            fail('init creates AGENTS.md', `got: ${stdout.slice(0, 120)}`);
         }
         await access(join(tmp, '.agents/PLANS.md'));
         ok('init creates .agents/PLANS.md');

         const auditResult = await execFileAsync(process.execPath, [ BUNDLE_PATH, 'audit', '--check-artifacts', tmp ]).catch((e) => e);
         const auditOut = auditResult.stdout ?? '';
         const auditParsed = JSON.parse(auditOut);
         if (auditParsed.status === 'ok') {
            ok('init output passes --check-artifacts');
         } else {
            fail('init output passes --check-artifacts', `status=${auditParsed.status}`);
         }
      } finally {
         await rm(tmp, { recursive: true, force: true });
      }
   } catch (err) {
      fail('init', err.message);
   }

   // Smoke-test new audit checks via --check-all on the repo
   try {
      const repoRoot = resolve(__dirname, '../../..');
      const result = await execFileAsync(process.execPath, [ BUNDLE_PATH, 'audit', '--check-all', repoRoot ]).catch((e) => e);
      const stdout = result.stdout ?? '';
      const parsed = JSON.parse(stdout);
      const expected = [
         'artifacts', 'links', 'commands', 'execplans', 'agents_md',
         'cross_tool_aliases', 'context_budget', 'readme_drift',
         'nesting', 'repo_map', 'adrs',
      ];
      const missing = expected.filter((k) => !parsed.checks || !(k in parsed.checks));
      if (missing.length === 0) {
         ok('audit --check-all runs every check');
      } else {
         fail('audit --check-all runs every check', `missing: ${missing.join(', ')}`);
      }
   } catch (err) {
      fail('audit --check-all', err.message);
   }

   process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
   if (failed > 0) process.exitCode = 1;
}

await verify();
