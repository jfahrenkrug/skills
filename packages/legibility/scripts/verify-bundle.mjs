#!/usr/bin/env node
// Smoke-test the generated bundle by running a few sanity checks.
// Run via: npm -w legibility run verify-bundle
// Or: node packages/legibility/scripts/verify-bundle.mjs

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
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

   process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
   if (failed > 0) process.exitCode = 1;
}

await verify();
